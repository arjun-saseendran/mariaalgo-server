#!/bin/bash
cd /root/mariaalgo-server
echo "🚀 Starting Maria Algo server at 8:30 AM..."
pm2 start server.js --name maria-algo
