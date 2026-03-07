/**
 * upstoxLiveData.js
 *
 * Upstox WebSocket live feed — used ONLY for Iron Condor price updates.
 * Traffic Light strategy keeps using fyersLiveData.js (Fyers socket) unchanged.
 *
 * Architecture:
 *   fyersLiveData.js  → NIFTY spot tick → Traffic Light engine (unchanged)
 *   upstoxLiveData.js → NIFTY/SENSEX spot + IC option legs → Iron Condor engine
 *
 * Why Upstox for Iron Condor?
 *   Fyers quote API couldn't reliably return full option chain data.
 *   Upstox WebSocket gives proper streaming for index spot + option legs.
 *
 * Symbol format used internally for condorPrices cache:
 *   Upstox instrument key format: "NSE_INDEX|Nifty 50", "NSE_FO|NIFTY10MAR202522500CE"
 *   These keys are what Upstox sends back in tick messages.
 *
 * Iron Condor engine (monitorCondorLevels) calls:
 *   condorPrices[kiteToUpstoxSymbol(sym, idx)]  — must match this key format exactly.
 */

import pkg from 'upstox-js-sdk';
const { ApiClient } = pkg;
import { getIO } from '../config/socket.js';
import {
  updateCondorPrice,
  monitorCondorLevels,
} from '../Engines/ironCondorEngine.js';
import getActiveTradeModel from '../models/ironCondorActiveTradeModel.js';
import {
  kiteToUpstoxSymbol,
  getUpstoxIndexSymbol,
} from './upstoxSymbolMapper.js';

// ── Upstox websocket instance (kept for dynamic re-subscription) ────────────
let _upstoxWs     = null;
let _subscribedKeys = new Set();

// ── Upstox WebSocket feed type ───────────────────────────────────────────────
// "full"  = full market depth + greeks (slower)
// "ltpc"  = LTP + close only (fastest, enough for SL monitoring)
const FEED_TYPE = 'ltpc';

// ── Index spot keys ──────────────────────────────────────────────────────────
const NIFTY_SPOT  = 'NSE_INDEX|Nifty 50';
const SENSEX_SPOT = 'BSE_INDEX|SENSEX';

/**
 * Dynamically add a new symbol to the live subscription.
 * Called from ironCondorEngine after new positions are detected.
 *
 * @param {string} upstoxKey  e.g. "NSE_FO|NIFTY10MAR202522500CE"
 */
export const subscribeCondorSymbol = (upstoxKey) => {
  if (!upstoxKey || _subscribedKeys.has(upstoxKey)) return;
  if (!_upstoxWs) {
    console.warn('⚠️ Upstox WS not ready yet — symbol queued:', upstoxKey);
    return;
  }
  _subscribedKeys.add(upstoxKey);
  _sendSubscription([...Array.from(_subscribedKeys)]);
  console.log(`📡 Upstox: subscribed to ${upstoxKey}`);
};

// ── Internal: send subscription message ─────────────────────────────────────
const _sendSubscription = (keys) => {
  if (!_upstoxWs || !keys.length) return;
  const msg = {
    guid:   'condor-sub',
    method: 'sub',
    data:   {
      mode:             FEED_TYPE,
      instrumentKeys:   keys,
    },
  };
  _upstoxWs.send(JSON.stringify(msg));
};

/**
 * Parse an Upstox WebSocket tick message.
 *
 * Upstox sends binary protobuf (not JSON). The upstox-js-sdk v2.x does NOT
 * auto-decode — we receive a raw Buffer/ArrayBuffer on the ws.onmessage event.
 * We must decode it using the SDK's MarketDataFeed protobuf decoder.
 *
 * Feed structure after decode:
 *   {
 *     feeds: {
 *       "NSE_INDEX|Nifty 50": { ltpc: { ltp: 24450.55, ... } },
 *       "NSE_FO|NIFTY10MAR202522500CE": { ltpc: { ltp: 223.90 } }
 *     }
 *   }
 *
 * Returns array of { key, price } objects.
 */
let _proto = null; // cached protobuf root — loaded once

const parseTick = async (rawMsg) => {
  try {
    // rawMsg is a Buffer (binary protobuf from Upstox)
    // If it's a string it's a control/heartbeat message — skip
    if (typeof rawMsg === 'string') return [];

    // Lazy-load the protobuf decoder from upstox-js-sdk
    if (!_proto) {
      try {
        const protobuf = (await import('protobufjs')).default;
        // upstox-js-sdk v2.x ships the proto file at:
        const { createRequire } = await import('module');
        const req = createRequire(import.meta.url);
        // Try to find the proto file bundled with the SDK
        const protoPath = req.resolve('upstox-js-sdk').replace('index.js', '')
          .replace('src/', '') + 'MarketDataFeed.proto';
        _proto = await protobuf.load(protoPath).catch(() => null);
      } catch (_) {
        _proto = null;
      }
    }

    if (_proto) {
      // Decode using protobuf
      const FeedResponse = _proto.lookupType('com.upstox.marketdatafeeder.rpc.proto.FeedResponse');
      const buf = rawMsg instanceof ArrayBuffer ? Buffer.from(rawMsg) : rawMsg;
      const decoded = FeedResponse.decode(buf);
      const data = FeedResponse.toObject(decoded, { longs: Number, defaults: true });

      if (!data?.feeds) return [];
      return Object.entries(data.feeds)
        .map(([key, feed]) => {
          const price = feed?.ltpc?.ltp ?? null;
          return price != null ? { key, price } : null;
        })
        .filter(Boolean);
    }

    // Fallback: try JSON parse (for text frames / test environments)
    const text = rawMsg.toString('utf8');
    const data = JSON.parse(text);
    if (!data?.feeds) return [];
    return Object.entries(data.feeds)
      .map(([key, feed]) => {
        const price = feed?.ltpc?.ltp ?? feed?.ff?.marketFF?.ltpc?.ltp ?? null;
        return price != null ? { key, price } : null;
      })
      .filter(Boolean);

  } catch (err) {
    // Silently ignore decode errors (heartbeat frames, etc.)
    return [];
  }
};

/**
 * Init the Upstox live data socket for Iron Condor.
 * Called once from server startup (after DB is connected).
 */
export const initUpstoxLiveData = async () => {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ Upstox Live Data: UPSTOX_ACCESS_TOKEN missing in .env');
    return;
  }

  const io = getIO();
  const ActiveTrade = getActiveTradeModel();

  console.log('🔌 Connecting to Upstox Live Data Socket...');

  // ── Build initial subscription list ────────────────────────────────────────
  let initialKeys = [NIFTY_SPOT, SENSEX_SPOT];

  try {
    const activeTrade = await ActiveTrade.findOne({ status: 'ACTIVE' });
    if (activeTrade) {
      const idx = activeTrade.index;
      const legSymbols = [
        activeTrade.symbols.callSell,
        activeTrade.symbols.callBuy,
        activeTrade.symbols.putSell,
        activeTrade.symbols.putBuy,
      ]
        .filter(Boolean)
        .map(kite => kiteToUpstoxSymbol(kite, idx))
        .filter(Boolean);

      initialKeys = [...new Set([...initialKeys, getUpstoxIndexSymbol(idx), ...legSymbols])];
    }
  } catch (err) {
    console.error('❌ Upstox: could not load active trade for subscription:', err.message);
  }

  initialKeys.forEach(k => _subscribedKeys.add(k));

  // ── Connect via Upstox v3 REST auth + native WebSocket ────────────────────
  // The upstox-js-sdk v2.x WebsocketApi still calls the deprecated v2 endpoint.
  // Fix: call the v3 authorize endpoint directly via fetch, then open the WSS URL.
  try {
    const authRes = await fetch(
      'https://api.upstox.com/v3/feed/market-data-feed/authorize',
      {
        method:  'GET',
        headers: {
          'Authorization':     `Bearer ${token}`,
          'Accept':            'application/json',
          'Api-Version':       '2.0',
        },
      }
    );

    if (!authRes.ok) {
      const errBody = await authRes.text();
      console.error(`❌ Upstox WS auth failed (${authRes.status}):`, errBody);
      return;
    }

    const authData = await authRes.json();
    const wsUrl = authData?.data?.authorizedRedirectUri;

    if (!wsUrl) {
      console.error('❌ Upstox WS: no authorizedRedirectUri in auth response', authData);
      return;
    }

    // Use native WebSocket (Node 18+ has it globally, else fall back to 'ws')
    const WS = globalThis.WebSocket || (await import('ws')).default;
    const ws = new WS(wsUrl);
    _upstoxWs = ws;

    ws.onopen = () => {
      console.log(`✅ Upstox Live Data Connected! Subscribing ${initialKeys.length} symbols.`);
      _sendSubscription(Array.from(_subscribedKeys));
    };

    ws.onmessage = async (event) => {
      const ticks = await parseTick(event.data);

      for (const { key, price } of ticks) {
        // Update the Iron Condor price cache (key is Upstox instrument key)
        updateCondorPrice(key, price);

        // Emit market tick to dashboard for NIFTY spot
        if (key === NIFTY_SPOT && io) {
          io.emit('market_tick', { price, timestamp: Date.now() });
        }
      }

      // Run Iron Condor SL/decay monitor on every tick batch
      if (ticks.length > 0) {
        await monitorCondorLevels();
      }
    };

    ws.onerror = (err) => {
      console.error('❌ Upstox Live Data Error:', err.message || err);
    };

    ws.onclose = () => {
      console.warn('⚠️ Upstox Live Data Closed. Reconnecting in 5s...');
      _upstoxWs = null;
      setTimeout(() => initUpstoxLiveData(), 5000);
    };

  } catch (err) {
    console.error('❌ Upstox WS connection error:', err.message);
    setTimeout(() => initUpstoxLiveData(), 5000);
  }
};