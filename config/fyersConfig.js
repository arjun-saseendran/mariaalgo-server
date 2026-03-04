import { fyersModel } from "fyers-api-v3";
import fs from "fs";
import path from "path";
import "dotenv/config";

// 🛡️ Safety check for Environment Variables
if (!process.env.FYERS_APP_ID || !process.env.FYERS_REDIRECT_URI) {
  console.error("❌ FYERS Config Error: Missing FYERS_APP_ID or FYERS_REDIRECT_URI in .env");
  process.exit(1);
}

// Ensure logs directory exists for the SDK
const logDir = path.resolve("./logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

/**
 * ✅ FYERS V3 INITIALIZATION
 * The new SDK does not require the log path in the constructor like V2 did.
 * We create a single shared instance for the entire application.
 */
const fyers = new fyersModel();

fyers.setAppId(process.env.FYERS_APP_ID);
fyers.setRedirectUrl(process.env.FYERS_REDIRECT_URI);

// Load the existing Access Token if available
if (process.env.FYERS_ACCESS_TOKEN) {
  fyers.setAccessToken(process.env.FYERS_ACCESS_TOKEN);
  console.log("✅ Fyers Access Token loaded from .env");
}

/**
 * 📡 GLOBAL HELPER: Fetch Quotes (V3 Compliant)
 * This replaces the broken 'get_quotes' calls.
 * @param {Array} symbolsArray - e.g. ["NSE:NIFTY50-INDEX", "NSE:SBIN-EQ"]
 */
export const getQuotes = async (symbolsArray) => {
  try {
    if (!symbolsArray || symbolsArray.length === 0) return null;

    // ✅ FIXED: V3 expects { symbols: "SYM1,SYM2" }
    const response = await fyers.quotes({
      symbols: symbolsArray.join(',')
    });

    if (response && response.s === "ok") {
      return response.d; // 'd' contains the array of quote objects
    } else {
      console.warn("⚠️ Fyers Quote Warning:", response.errmsg || "Unknown Error");
      return null;
    }
  } catch (err) {
    console.error("❌ Fyers V3 Quote Error:", err.message);
    return null;
  }
};

/**
 * 🔑 TOKEN HANDLER
 * Updates the instance and the environment variable for both strategies.
 */
export const setFyersAccessToken = (token) => {
  fyers.setAccessToken(token);
  process.env.FYERS_ACCESS_TOKEN = token;
  console.log("✅ Fyers Access Token set — both strategies ready.");
};

export default fyers;