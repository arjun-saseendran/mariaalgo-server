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
// =============================
export const getLTP = async (instrumentKeys) => {
  try {
    const api = getUpstoxMarketApi();
    const keysArray = Array.isArray(instrumentKeys)
      ? instrumentKeys
      : instrumentKeys.split(',');

    const response = await api.getLtp(keysArray, process.env.UPSTOX_API_VERSION || "2.0");

    if (response && response.status === "success") {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error("❌ Upstox LTP Error:", error.message);
    return null;
  }
};

// =============================
// 📊 GET OPTION CHAIN
// =============================
export const getOptionChain = async (instrumentKey, expiryDate) => {
  try {
    const api = new OptionsApi();
    // expiryDate format: "2026-03-06"
    const response = await api.getOptionContracts(instrumentKey, expiryDate);
    if (response && response.status === "success") {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error("❌ Upstox Option Chain Error:", error.message);
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