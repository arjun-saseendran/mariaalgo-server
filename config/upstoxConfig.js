import pkg from 'upstox-js-sdk';
const { ApiClient, MarketQuoteApi, OrderApi, PortfolioApi, OptionsApi } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// =============================
// 🔐 INIT UPSTOX
// =============================
const defaultClient = ApiClient.instance;
const oauth2 = defaultClient.authentications['OAUTH2'];

let _accessToken = null;

// Load token from .env on startup
const token = process.env.UPSTOX_ACCESS_TOKEN;
if (token) {
  oauth2.accessToken = token;
  _accessToken = token;
  console.log("✅ Upstox Access Token Loaded");
} else {
  console.warn("⚠️ UPSTOX_ACCESS_TOKEN missing in .env. Waiting for auto login.");
}

// =============================
// 🔑 DYNAMIC TOKEN SETTER
// Saves to .env so it persists across restarts (same as kiteConfig)
// =============================
export const setUpstoxAccessToken = (token) => {
  _accessToken = token;
  oauth2.accessToken = token;
  process.env.UPSTOX_ACCESS_TOKEN = token;

  // Persist to .env file
  const envPath = path.resolve(process.cwd(), ".env");
  let envData = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  const key = "UPSTOX_ACCESS_TOKEN";
  const regex = new RegExp(`^${key}=.*`, "m");
  const newLine = `${key}="${token}"`;

  envData = regex.test(envData)
    ? envData.replace(regex, newLine)
    : envData + (envData.endsWith("\n") ? "" : "\n") + newLine + "\n";

  fs.writeFileSync(envPath, envData, "utf8");
  console.log("✅ Upstox Access Token dynamically updated.");
};

// =============================
// 🏭 GET API INSTANCES
// =============================
export const getUpstoxMarketApi    = () => new MarketQuoteApi();
export const getUpstoxOrderApi     = () => new OrderApi();
export const getUpstoxPortfolioApi = () => new PortfolioApi();

// =============================
// 📈 GET QUOTES
// Upstox uses instrument_key format: NSE_EQ|INE002A01018
// For options: NSE_FO|xxx
// =============================
export const getQuotes = async (instrumentKeys) => {
  try {
    const api = getUpstoxMarketApi();
    const keysArray = Array.isArray(instrumentKeys)
      ? instrumentKeys
      : instrumentKeys.split(',');

    const response = await api.getFullMarketQuote(keysArray, process.env.UPSTOX_API_VERSION || "2.0");

    if (response && response.status === "success") {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error("❌ Upstox Quotes Error:", error.message);
    return null;
  }
};

// =============================
// 💹 GET LTP (Light quote — faster)
// Uses Upstox v3 /market-quote/ltp REST endpoint directly because
// the upstox-js-sdk MarketQuoteApi.getLtp() method was removed in newer SDK versions.
// =============================
export const getLTP = async (instrumentKeys) => {
  try {
    const token = process.env.UPSTOX_ACCESS_TOKEN;
    if (!token) throw new Error('UPSTOX_ACCESS_TOKEN not set');

    const keysArray = Array.isArray(instrumentKeys)
      ? instrumentKeys
      : instrumentKeys.split(',');

    // v3 LTP endpoint: GET /v2/market-quote/ltp?instrument_key=KEY1,KEY2,...
    // (Upstox v2 REST for quotes is still live — only the WS feed moved to v3)
    const params = new URLSearchParams({ instrument_key: keysArray.join(',') });
    const res = await fetch(
      `https://api.upstox.com/v2/market-quote/ltp?${params}`,
      {
        method:  'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept':        'application/json',
          'Api-Version':   '2.0',
        },
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Upstox LTP HTTP ${res.status}: ${errBody}`);
    }

    const json = await res.json();

    if (json?.status === 'success') {
      // Response shape: { status, data: { "NSE_INDEX|Nifty 50": { last_price: ... } } }
      return json.data;
    }
    return null;
  } catch (error) {
    console.error("❌ Upstox LTP Error:", error.message);
    return null;
  }
};

// =============================
// 📅 GET LAST CLOSE PRICE (works after market close)
// Uses historical candle daily endpoint — returns yesterday's close for the index.
// GET /v2/historical-candle/{key}/day/{toDate}/{fromDate}
// =============================
export const getLastClose = async (instrumentKey) => {
  try {
    const token = process.env.UPSTOX_ACCESS_TOKEN;
    if (!token) throw new Error('UPSTOX_ACCESS_TOKEN not set');

    // Use last 5 days window to handle weekends/holidays
    const to   = new Date(); to.setDate(to.getDate() + 1);
    const from = new Date(); from.setDate(from.getDate() - 5);
    const fmt  = d => d.toISOString().split('T')[0];

    // Encode the pipe in the instrument key for URL safety
    const encodedKey = instrumentKey.replace('|', '%7C');
    const url = `https://api.upstox.com/v2/historical-candle/${encodedKey}/day/${fmt(to)}/${fmt(from)}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept':        'application/json',
        'Api-Version':   '2.0',
      },
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Upstox Historical HTTP ${res.status}: ${errBody}`);
    }

    const json = await res.json();
    // Candle format: [timestamp, open, high, low, close, volume, oi]
    // First candle is most recent
    const candles = json?.data?.candles;
    if (candles && candles.length > 0) {
      return candles[0][4]; // close price
    }
    return null;
  } catch (error) {
    console.error('❌ Upstox Last Close Error:', error.message);
    return null;
  }
};

// =============================
// 📊 GET PUT/CALL OPTION CHAIN  ← works live AND after market close (returns last session data)
// Single call — returns full chain with LTP + OI + Volume for all strikes.
// GET /v2/option/chain?instrument_key=NSE_INDEX|Nifty 50&expiry_date=YYYY-MM-DD
// =============================
export const getPCOptionChain = async (instrumentKey, expiryDate) => {
  try {
    const token = process.env.UPSTOX_ACCESS_TOKEN;
    if (!token) throw new Error('UPSTOX_ACCESS_TOKEN not set');

    const params = new URLSearchParams({
      instrument_key: instrumentKey,
      expiry_date:    expiryDate,
    });

    const res = await fetch(
      `https://api.upstox.com/v2/option/chain?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept':        'application/json',
          'Api-Version':   '2.0',
        },
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Upstox PC Option Chain HTTP ${res.status}: ${errBody}`);
    }

    const json = await res.json();
    if (json?.status === 'success') return json.data;
    return null;
  } catch (error) {
    console.error('❌ Upstox PC Option Chain Error:', error.message);
    return null;
  }
};

// =============================
// 📊 GET OPTION GREEKS (v3) — fallback with OI + volume per instrument key
// GET /v3/market-quote/option-greek?instrument_key=KEY1,KEY2,...  (max 50/call)
// =============================
export const getOptionGreeks = async (instrumentKeys) => {
  try {
    const token = process.env.UPSTOX_ACCESS_TOKEN;
    if (!token) throw new Error('UPSTOX_ACCESS_TOKEN not set');

    const keysArray = Array.isArray(instrumentKeys) ? instrumentKeys : instrumentKeys.split(',');
    const results   = {};

    for (let i = 0; i < keysArray.length; i += 50) {
      const batch  = keysArray.slice(i, i + 50);
      const params = new URLSearchParams({ instrument_key: batch.join(',') });

      const res = await fetch(
        `https://api.upstox.com/v3/market-quote/option-greek?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept':        'application/json',
            'Api-Version':   '2.0',
          },
        }
      );

      if (!res.ok) continue; // skip failed batches, don't abort everything

      const json = await res.json();
      if (json?.status === 'success' && json.data) {
        for (const [k, v] of Object.entries(json.data)) {
          results[k.replace(':', '|')] = v;
        }
      }
    }

    return Object.keys(results).length > 0 ? results : null;
  } catch (error) {
    console.error('❌ Upstox Option Greeks Error:', error.message);
    return null;
  }
};

// =============================
// 📊 GET OPTION CHAIN (SDK legacy — kept for reference)
// =============================
export const getOptionChain = async (instrumentKey, expiryDate) => {
  try {
    const api = new OptionsApi();
    const response = await api.getOptionContracts(instrumentKey, expiryDate);
    if (response && response.status === 'success') return response.data;
    return null;
  } catch (error) {
    console.error('❌ Upstox Option Chain Error:', error.message);
    return null;
  }
};

// =============================
// 🛒 PLACE ORDER
// =============================
export const placeOrder = async (orderData) => {
  try {
    const api = getUpstoxOrderApi();

    const body = new UpstoxClient.PlaceOrderRequest(
      orderData.qty,                          // quantity
      orderData.product  || "I",              // I=Intraday, D=Delivery, CO, OCO
      orderData.validity || "DAY",            // DAY or IOC
      orderData.price    || 0,                // 0 for market
      orderData.tag      || "mariaalgo",
      orderData.instrumentToken,              // e.g. NSE_FO|xxxxx
      orderData.orderType || "MARKET",        // MARKET, LIMIT, SL, SL-M
      orderData.side,                         // BUY or SELL
      orderData.disclosedQty || 0,
      orderData.triggerPrice || 0,
      orderData.isAmo || false
    );

    const response = await api.placeOrder(body, process.env.UPSTOX_API_VERSION || "2.0");

    if (response && response.status === "success") {
      console.log(`✅ Upstox Order Placed: ${response.data.order_id}`);
    } else {
      console.error(`❌ Upstox Order Rejected:`, response);
    }

    return response;
  } catch (error) {
    console.error("❌ Upstox Order Error:", error.message);
    throw error;
  }
};

// =============================
// ❌ CANCEL ORDER
// =============================
export const cancelOrder = async (orderId) => {
  try {
    const api = getUpstoxOrderApi();
    const response = await api.cancelOrder(orderId, process.env.UPSTOX_API_VERSION || "2.0");
    return response;
  } catch (error) {
    console.error("❌ Upstox Cancel Order Error:", error.message);
    throw error;
  }
};

// =============================
// 📋 GET POSITIONS
// =============================
export const getPositions = async () => {
  try {
    const api = getUpstoxPortfolioApi();
    const response = await api.getPositions(process.env.UPSTOX_API_VERSION || "2.0");
    if (response && response.status === "success") {
      return response.data;
    }
    return [];
  } catch (error) {
    console.error("❌ Upstox Positions Error:", error.message);
    return [];
  }
};

// =============================
// 📦 GET HOLDINGS
// =============================
export const getHoldings = async () => {
  try {
    const api = getUpstoxPortfolioApi();
    const response = await api.getHoldings(process.env.UPSTOX_API_VERSION || "2.0");
    if (response && response.status === "success") {
      return response.data;
    }
    return [];
  } catch (error) {
    console.error("❌ Upstox Holdings Error:", error.message);
    return [];
  }
};

// Export raw client for advanced use
export { defaultClient };