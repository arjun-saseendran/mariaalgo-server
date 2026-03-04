#!/bin/bash
cd /root/mariaalgo-server

echo "🔐 Running all broker logins at 8:00 AM..."

node fyersAutoLogin.js && echo "✅ Fyers done" || echo "❌ Fyers failed"
node kiteAutoLogin.js  && echo "✅ Kite done"  || echo "❌ Kite failed"
node upstoxAutoLogin.js && echo "✅ Upstox done" || echo "❌ Upstox failed"

echo "✅ All logins complete."
