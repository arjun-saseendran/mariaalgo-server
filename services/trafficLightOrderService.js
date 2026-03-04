import { fyers } from "../config/fyersConfig.js";
import { sendTrafficAlert } from "../services/telegramService.js";

export const placeOrder = async ({ symbol, qty, side }) => {
  const sideLabel = side === 1 ? "BUY" : "SELL";
  const isLive = process.env.LIVE_TRADING === "true";

  if (!isLive) {
    console.log(`\n📝 [PAPER] ${sideLabel} ${qty} ${symbol}`);
    return { s: "ok" };
  }

  try {
    const response = await fyers.place_order({
      symbol:      symbol,
      qty:         Math.floor(qty),
      type:        2, // Market
      side:        side,
      productType: "INTRADAY",
      validity:    "DAY",
    });

    if (response.s === "ok") {
      console.log(`✅ Order Placed: ${response.id}`);
      await sendTrafficAlert(
        `✅ <b>Order Placed</b>\n` +
        `Side: ${sideLabel}\n` +
        `Symbol: ${symbol}\n` +
        `Qty: ${Math.floor(qty)}\n` +
        `Order ID: ${response.id}`
      );
    } else {
      console.error(`❌ Order Rejected: ${response.message}`);
      await sendTrafficAlert(
        `🚨 <b>Order Rejected</b>\n` +
        `Side: ${sideLabel}\n` +
        `Symbol: ${symbol}\n` +
        `Reason: ${response.message}\n` +
        `⚠️ Manual intervention required!`
      );
    }

    return response;

  } catch (err) {
    console.error("❌ Execution API Error:", err.message);
    await sendTrafficAlert(
      `🚨 <b>Order Execution Failed</b>\n` +
      `Side: ${sideLabel}\n` +
      `Symbol: ${symbol}\n` +
      `Error: ${err.message}\n` +
      `⚠️ Check position immediately!`
    );
    return { s: "error" };
  }
};