import express from 'express';
import { getLTP, getPCOptionChain, getOptionGreeks } from '../config/upstoxConfig.js';
import {
  getUpstoxIndexSymbol,
  buildUpstoxOptionSymbol,
  getNextWeeklyExpiry,
} from '../services/upstoxSymbolMapper.js';

const router = express.Router();

// ── Market hours check (IST) ──────────────────────────────────────────────────
const isMarketOpen = () => {
  const now  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day  = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  return day >= 1 && day <= 5 && mins >= (9 * 60 + 15) && mins < (15 * 60 + 30);
};

// ── Empty chain skeleton for closed market ───────────────────────────────────
const buildEmptyChain = (atmStrike, step, strikeRange) => {
  const chain = [];
  for (let i = -strikeRange; i <= strikeRange; i++) {
    const strike = atmStrike + i * step;
    const empty  = { ltp: 0, chp: 0, oi: '0L', oiRaw: 0, vol: '0K' };
    chain.push({ strike, isATM: strike === atmStrike, ce: { ...empty }, pe: { ...empty } });
  }
  return chain;
};

router.get('/chain', async (req, res) => {
  const symbol      = (req.query.symbol || 'NIFTY').toUpperCase();
  const strikeRange = parseInt(req.query.strikes || '20');
  const step        = (symbol === 'SENSEX' || symbol === 'BANKEX') ? 100 : 50;
  const indexKey    = getUpstoxIndexSymbol(symbol);

  try {
    // ── 1. Expiry ───────────────────────────────────────────────────────────
    const expiryDate  = getNextWeeklyExpiry(symbol);
    const expiryLabel = expiryDate.toLocaleDateString('en-IN', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
    const expiryStr = expiryDate.toISOString().split('T')[0];  // "YYYY-MM-DD"

    // ── 2. Spot price ───────────────────────────────────────────────────────
    const spotQuote = await getLTP([indexKey]);

    if (!spotQuote || !spotQuote[indexKey]) {
      if (!isMarketOpen()) {
        const defaultAtm = symbol === 'SENSEX' ? 75000 : symbol === 'BANKNIFTY' ? 50000 : 23000;
        console.log(`⚠️ Market closed — returning empty skeleton for ${symbol}`);
        return res.json({
          spotPrice: null, atmStrike: defaultAtm, expiry: expiryLabel,
          marketClosed: true, chain: buildEmptyChain(defaultAtm, step, strikeRange),
        });
      }
      return res.status(500).json({ error: 'Failed to fetch spot price from Upstox' });
    }

    const spotPrice = spotQuote[indexKey].last_price;
    const atmStrike = Math.round(spotPrice / step) * step;

    // Build strike list
    const strikes = [];
    for (let i = -strikeRange; i <= strikeRange; i++) strikes.push(atmStrike + i * step);

    // ── PATH A: PUT/CALL OPTION CHAIN API ───────────────────────────────────
    // Best: single call returns full chain with LTP + OI + Volume for all strikes
    // GET /v2/option/chain?instrument_key=NSE_INDEX|Nifty 50&expiry_date=YYYY-MM-DD
    let formattedChain = null;

    const pcChain = await getPCOptionChain(indexKey, expiryStr);

    if (pcChain && Array.isArray(pcChain) && pcChain.length > 0) {
      console.log(`✅ Option chain via PC chain API: ${pcChain.length} total strikes`);

      const chainMap = {};
      pcChain.forEach(row => { chainMap[row.strike_price] = row; });

      formattedChain = strikes.map(strike => {
        const row    = chainMap[strike];
        const ceRaw  = row?.call_options?.market_data || {};
        const peRaw  = row?.put_options?.market_data  || {};
        const ceOi   = ceRaw.oi   || 0;
        const peOi   = peRaw.oi   || 0;
        return {
          strike, isATM: strike === atmStrike,
          ce: {
            ltp:   ceRaw.ltp        ?? 0,
            chp:   ceRaw.net_change ?? 0,
            oi:    ceOi ? (ceOi / 100000).toFixed(1) + 'L' : '0L',
            oiRaw: ceOi,
            vol:   ceRaw.volume ? (ceRaw.volume / 1000).toFixed(1) + 'K' : '0K',
          },
          pe: {
            ltp:   peRaw.ltp        ?? 0,
            chp:   peRaw.net_change ?? 0,
            oi:    peOi ? (peOi / 100000).toFixed(1) + 'L' : '0L',
            oiRaw: peOi,
            vol:   peRaw.volume ? (peRaw.volume / 1000).toFixed(1) + 'K' : '0K',
          },
        };
      });
    }

    // ── PATH B: OPTION GREEKS API (v3) ──────────────────────────────────────
    // Fallback: batch fetch per instrument key — returns ltp + oi + volume
    // GET /v3/market-quote/option-greek?instrument_key=KEY1,KEY2,...  (max 50/call)
    if (!formattedChain) {
      console.log('📡 PC chain failed — trying option-greek batch...');

      const instruments = [];
      strikes.forEach(strike => {
        instruments.push(buildUpstoxOptionSymbol(symbol, strike, 'CE'));
        instruments.push(buildUpstoxOptionSymbol(symbol, strike, 'PE'));
      });

      const greeks = await getOptionGreeks(instruments);

      if (greeks) {
        console.log(`✅ Option chain via option-greek: ${Object.keys(greeks).length} instruments`);
        formattedChain = strikes.map(strike => {
          const ceKey  = buildUpstoxOptionSymbol(symbol, strike, 'CE');
          const peKey  = buildUpstoxOptionSymbol(symbol, strike, 'PE');
          const ceData = greeks[ceKey] || {};
          const peData = greeks[peKey] || {};
          const ceOi   = ceData.oi || 0;
          const peOi   = peData.oi || 0;
          return {
            strike, isATM: strike === atmStrike,
            ce: {
              ltp:   ceData.last_price ?? 0,
              chp:   ceData.cp ? ((ceData.last_price - ceData.cp) / ceData.cp * 100) : 0,
              oi:    ceOi ? (ceOi / 100000).toFixed(1) + 'L' : '0L',
              oiRaw: ceOi,
              vol:   ceData.volume ? (ceData.volume / 1000).toFixed(1) + 'K' : '0K',
            },
            pe: {
              ltp:   peData.last_price ?? 0,
              chp:   peData.cp ? ((peData.last_price - peData.cp) / peData.cp * 100) : 0,
              oi:    peOi ? (peOi / 100000).toFixed(1) + 'L' : '0L',
              oiRaw: peOi,
              vol:   peData.volume ? (peData.volume / 1000).toFixed(1) + 'K' : '0K',
            },
          };
        });
      }
    }

    // ── PATH C: LTP ONLY (last resort — no OI/volume) ───────────────────────
    if (!formattedChain) {
      console.log('📡 option-greek failed — falling back to LTP only (no OI)...');

      const instruments = [];
      strikes.forEach(strike => {
        instruments.push(buildUpstoxOptionSymbol(symbol, strike, 'CE'));
        instruments.push(buildUpstoxOptionSymbol(symbol, strike, 'PE'));
      });

      const quotes = await getLTP(instruments);
      if (!quotes) {
        return res.status(500).json({ error: 'All Upstox market data endpoints failed' });
      }

      console.log(`✅ Option chain via LTP only: ${Object.keys(quotes).length} instruments`);
      formattedChain = strikes.map(strike => {
        const ceKey  = buildUpstoxOptionSymbol(symbol, strike, 'CE');
        const peKey  = buildUpstoxOptionSymbol(symbol, strike, 'PE');
        const ceData = quotes[ceKey] || {};
        const peData = quotes[peKey] || {};
        return {
          strike, isATM: strike === atmStrike,
          ce: { ltp: ceData.last_price ?? 0, chp: 0, oi: '—', oiRaw: 0, vol: '—' },
          pe: { ltp: peData.last_price ?? 0, chp: 0, oi: '—', oiRaw: 0, vol: '—' },
        };
      });
    }

    res.json({ spotPrice, atmStrike, expiry: expiryLabel, chain: formattedChain });

  } catch (error) {
    console.error('❌ Option Chain Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch option chain' });
  }
});

export default router;