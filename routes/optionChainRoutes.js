import express from 'express';
import { getQuotes } from '../config/fyersConfig.js';
import { getFyersIndexSymbol, buildFyersOptionSymbol, getNextWeeklyExpiry } from '../services/symbolMapper.js';

const router = express.Router();

router.get('/chain', async (req, res) => {
  const symbol = req.query.symbol || 'NIFTY';
  const strikeRange = parseInt(req.query.strikes || '20'); // default 20 strikes each side

  try {
    // 1️⃣ Get expiry info for response metadata
    const expiryDate = getNextWeeklyExpiry(symbol);
    const expiryLabel = expiryDate.toDateString();

    // 2️⃣ Fetch Spot Price
    const indexSymbol = getFyersIndexSymbol(symbol);
    const spotData = await getQuotes([indexSymbol]);

    if (!spotData || spotData.length === 0) {
      return res.status(500).json({ error: "Failed to fetch Spot Price" });
    }

    const spotPrice = spotData[0].v.lp;

    // 3️⃣ Calculate ATM Strike
    const step = (symbol === 'SENSEX' || symbol === 'BANKEX') ? 100 : 50;
    const atmStrike = Math.round(spotPrice / step) * step;

    // 4️⃣ Generate Strikes (configurable range from ATM)
    const strikes = [];
    for (let i = -strikeRange; i <= strikeRange; i++) {
      strikes.push(atmStrike + i * step);
    }

    // 5️⃣ Build Fyers option symbols using correct weekly format
    // Format: NSE:NIFTY{YY}{M}{DD}{STRIKE}{CE/PE}
    const instruments = [];
    strikes.forEach(strike => {
      instruments.push(buildFyersOptionSymbol(symbol, strike, 'CE'));
      instruments.push(buildFyersOptionSymbol(symbol, strike, 'PE'));
    });

    console.log("📡 Sample symbols:", instruments.slice(0, 4));

    // 6️⃣ Fetch all option quotes in one call
    const quotes = await getQuotes(instruments);

    if (!quotes) {
      return res.status(500).json({ error: "Failed to fetch Options Quotes" });
    }

    // 7️⃣ Format for React UI
    const formattedChain = strikes.map(strike => {
      const ceSym = buildFyersOptionSymbol(symbol, strike, 'CE');
      const peSym = buildFyersOptionSymbol(symbol, strike, 'PE');

      const ceData = quotes.find(q => q.n === ceSym)?.v || {};
      const peData = quotes.find(q => q.n === peSym)?.v || {};

      return {
        strike,
        isATM: strike === atmStrike,
        ce: {
          ltp:    ceData.lp  ?? 0,
          oi:     ceData.oi  ? (ceData.oi  / 100000).toFixed(1) + 'L' : '0L',
          vol:    ceData.volume ? (ceData.volume / 1000).toFixed(1) + 'K' : '0K',
          chp:    ceData.chp ?? 0,
        },
        pe: {
          ltp:    peData.lp  ?? 0,
          oi:     peData.oi  ? (peData.oi  / 100000).toFixed(1) + 'L' : '0L',
          vol:    peData.volume ? (peData.volume / 1000).toFixed(1) + 'K' : '0K',
          chp:    peData.chp ?? 0,
        }
      };
    });

    res.json({
      spotPrice,
      atmStrike,
      expiry: expiryLabel,
      chain: formattedChain
    });

  } catch (error) {
    console.error("❌ Option Chain Error:", error.message);
    res.status(500).json({ error: "Failed to fetch from Fyers API" });
  }
});

export default router;