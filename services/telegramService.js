import axios from 'axios';

/**
 * Sends a formatted HTML message to Telegram.
 * 
 * Each strategy has its own chat ID in .env:
 *   TELEGRAM_BOT_TOKEN       — single bot used for all alerts
 *   TRAFFIC_TELEGRAM_CHAT_ID — Traffic Light strategy channel
 *   CONDOR_TELEGRAM_CHAT_ID  — Iron Condor strategy channel
 * 
 * Falls back to TELEGRAM_CHAT_ID if strategy-specific ID is missing.
 */
const sendAlert = async (message, chatId) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token || !chatId) {
        console.error("⚠️ Telegram Alert Failed: Missing BOT_TOKEN or CHAT_ID in .env");
        return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        console.log("📤 Telegram notification sent.");
    } catch (error) {
        if (error.response) {
            console.error(`❌ Telegram API Error: ${error.response.data.description}`);
        } else {
            console.error(`❌ Telegram Network Error: ${error.message}`);
        }
    }
};

/**
 * 🚦 Traffic Light Strategy alerts
 * Uses TRAFFIC_TELEGRAM_CHAT_ID → falls back to TELEGRAM_CHAT_ID
 */
export const sendTrafficAlert = async (message) => {
    const chatId =  process.env.TELEGRAM_CHAT_ID;
    await sendAlert(message, chatId);
};

/**
 * 🦅 Iron Condor Strategy alerts
 * Uses CONDOR_TELEGRAM_CHAT_ID → falls back to TELEGRAM_CHAT_ID
 */
export const sendCondorAlert = async (message) => {
    const chatId =  process.env.TELEGRAM_CHAT_ID;
    await sendAlert(message, chatId);
};

/**
 * Generic alert — uses TELEGRAM_CHAT_ID (for server startup etc.)
 * Kept for backward compatibility with any existing calls.
 */
export const sendTelegramAlert = async (message) => {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    await sendAlert(message, chatId);
};