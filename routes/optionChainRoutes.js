import express from 'express';
import { getLTP, getOptionChain } from '../config/upstoxConfig.js';
import {
  getUpstoxIndexSymbol,
  buildUpstoxOptionSymbol,
  getNextWeeklyExpiry,
} from '../services/upstoxSymbolMapper.js';

const router = express.Router();

router.get('/chain', async (req, res) => {
  const symbol      = (req.query.symbol || 'NIFTY').toUpperCase();
  const strikeRange = parseInt(req.query.strikes || '20');

  try {
    // ── 1. Expiry date ──────────────────────────────────────────────────────
    const expiryDate  = getNextWeeklyExpiry(symbol);
    const expiryLabel = expiryDate.toLocaleDateString('en-IN', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
    // Upstox getOptionChain expects "YYYY-MM-DD"
    const expiryStr = expiryDate.toISOString().split('T')[0];

    // ── 2. Spot price via Upstox LTP ────────────────────────────────────────
    const indexKey  = getUpstoxIndexSymbol(symbol);
    const spotQuote = await getLTP([indexKey]);

    if (!spotQuote || !spotQuote[indexKey]) {
      return res.status(500).json({ error: 'Failed to fetch spot price from Upstox' });
    }

    const spotPrice = spotQuote[indexKey].last_price;

    // ── 3. ATM strike ───────────────────────────────────────────────────────
    const step      = (symbol === 'SENSEX' || symbol === 'BANKEX') ? 100 : 50;
    const atmStrike = Math.round(spotPrice / step) * step;

    // ── 4. Try Upstox Option Chain API first (full chain, best data) ────────
    //    Returns all strikes for the expiry in one call — no need to batch
    let chainFromApi = null;
    try {
      // Upstox instrumentKey for index: "NSE_INDEX|Nifty 50"
      chainFromApi = await getOptionChain(indexKey, expiryStr);
    } catch (apiErr) {
      console.warn('⚠️ Upstox Option Chain API failed, falling back to LTP batch:', apiErr.message);
    }

    let formattedChain;

    if (chainFromApi && Array.isArray(chainFromApi) && chainFromApi.length > 0) {
      // ── PATH A: Full option chain from Upstox API ─────────────────────────
      // Response shape per element:
      // { strike_price, call_options: { market_data: { ltp, oi, volume, net_change } },
      //                 put_options:  { market_data: { ... } } }

      // Filter to our desired strike range and build the chain
      const chainMap = {};
      chainFromApi.forEach(row => {
        const s = row.strike_price;
        chainMap[s] = row;
      });

      const strikes = [];
      for (let i = -strikeRange; i <= strikeRange; i++) {
        strikes.push(atmStrike + i * step);
      }

      formattedChain = strikes.map(strike => {
        const row   = chainMap[strike];
        const ceRaw = row?.call_options?.market_data || {};
        const peRaw = row?.put_options?.market_data  || {};

        const ceOiRaw = ceRaw.oi   || 0;
        const peOiRaw = peRaw.oi   || 0;

        return {
          strike,
          isATM: strike === atmStrike,
          ce: {
            ltp:   ceRaw.ltp        ?? 0,
            chp:   ceRaw.net_change ?? 0,          // % change
            oi:    ceOiRaw ? (ceOiRaw / 100000).toFixed(1) + 'L' : '0L',
            oiRaw: ceOiRaw,                         // raw number for OI bar scaling
            vol:   ceRaw.volume ? (ceRaw.volume / 1000).toFixed(1) + 'K' : '0K',
          },
          pe: {
            ltp:   peRaw.ltp        ?? 0,
            chp:   peRaw.net_change ?? 0,
            oi:    peOiRaw ? (peOiRaw / 100000).toFixed(1) + 'L' : '0L',
            oiRaw: peOiRaw,
            vol:   peRaw.volume ? (peRaw.volume / 1000).toFixed(1) + 'K' : '0K',
          },
        };
      });

      console.log(`✅ Option chain via Upstox API: ${formattedChain.length} strikes`);

    } else {
      // ── PATH B: Fallback — fetch LTP for each strike via getLTP batch ─────
      // Same approach as before but using Upstox instrument keys (correct symbols)
      console.log('📡 Fetching option chain via Upstox LTP batch...');

      const strikes = [];
      for (let i = -strikeRange; i <= strikeRange; i++) {
        strikes.push(atmStrike + i * step);
      }

      // Build Upstox instrument keys for all strikes
      const instruments = [];
      strikes.forEach(strike => {
        instruments.push(buildUpstoxOptionSymbol(symbol, strike, 'CE'));
        instruments.push(buildUpstoxOptionSymbol(symbol, strike, 'PE'));
      });

      console.log('📡 Sample Upstox symbols:', instruments.slice(0, 4));

      // Upstox getLTP accepts up to 500 keys at once — safe for 40 strikes
      const quotes = await getLTP(instruments);

      if (!quotes) {
        return res.status(500).json({ error: 'Failed to fetch option quotes from Upstox' });
      }

      // getLTP response: { 'NSE_FO|NIFTY10MAR202522500CE': { last_price: 223.9, ... }, ... }
      formattedChain = strikes.map(strike => {
        const ceKey = buildUpstoxOptionSymbol(symbol, strike, 'CE');
        const peKey = buildUpstoxOptionSymbol(symbol, strike, 'PE');

        const ceData = quotes[ceKey] || {};
        const peData = quotes[peKey] || {};

        const ceOiRaw = ceData.oi || 0;
        const peOiRaw = peData.oi || 0;

        return {
          strike,
          isATM: strike === atmStrike,
          ce: {
            ltp:   ceData.last_price ?? 0,
            chp:   ceData.net_change ?? 0,
            oi:    ceOiRaw ? (ceOiRaw / 100000).toFixed(1) + 'L' : '0L',
            oiRaw: ceOiRaw,
            vol:   ceData.volume ? (ceData.volume / 1000).toFixed(1) + 'K' : '0K',
          },
          pe: {
            ltp:   peData.last_price ?? 0,
            chp:   peData.net_change ?? 0,
            oi:    peOiRaw ? (peOiRaw / 100000).toFixed(1) + 'L' : '0L',
            oiRaw: peOiRaw,
            vol:   peData.volume ? (peData.volume / 1000).toFixed(1) + 'K' : '0K',
          },
        };
      });

      console.log(`✅ Option chain via Upstox LTP batch: ${formattedChain.length} strikes`);
    }

    res.json({
      spotPrice,
      atmStrike,
      expiry: expiryLabel,
      chain:  formattedChain,
    });

  } catch (error) {
    console.error('❌ Option Chain Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch option chain' });
  }
});

export default router;