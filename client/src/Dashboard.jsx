import { useState, useEffect } from "react";
import { Activity, Shield, History, TrendingUp, AlertCircle, Layers } from "lucide-react";
import io from "socket.io-client";
import OptionChain from "./OptionChain";
import logo from "./assets/logo.png";

const socket = io("https://api.mariaalgo.online"); // Connect to your live backend

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("system");
  const [trafficData, setTrafficData] = useState({ signal: "WAITING", livePnL: "0.00" });
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState({ condor: "LIVE", traffic: "LIVE" });

  // 1. Fetch Traffic Light Status & Trade History
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [statusRes, historyRes] = await Promise.all([
          fetch("https://api.mariaalgo.online/api/traffic/status"),
          fetch("https://api.mariaalgo.online/api/history")
        ]);
        setTrafficData(await statusRes.json());
        setHistory(await historyRes.json());
      } catch (err) {
        console.error("Dashboard sync error:", err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Polling for state updates
    return () => clearInterval(interval);
  }, []);

  // 2. Listen for Live Market Ticks
  useEffect(() => {
    socket.on("market_tick", (data) => {
      // Update P&L locally for smooth UI between polls
      setTrafficData(prev => ({ ...prev, currentPrice: data.price }));
    });
    return () => socket.off("market_tick");
  }, []);

  if (activeTab === "options") {
    return <OptionChain onClose={() => setActiveTab("system")} />;
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 p-6 font-sans">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center overflow-hidden">
            <img src={logo} alt="mariaAlgo Logo" className="w-7 h-7 object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            MARIA <span className="text-emerald-500">ALGO</span> 
            <span className="text-emerald-500 text-sm font-normal ml-2">v4.0 (Live)</span>
          </h1>
        </div>
        <div className="flex gap-4">
          <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/50`}>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Condor: {status.condor}
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/50`}>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Traffic: {status.traffic}
          </div>
        </div>
      </div>

      {/* SYSTEM STATUS PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2 bg-[#0a0a0c] border border-gray-800 rounded-2xl p-8 flex flex-col items-center justify-center relative shadow-xl min-h-[300px]">
          <div className="absolute top-4 right-6 text-[10px] text-gray-500 uppercase font-bold tracking-widest">Traffic Light</div>
          <div className="text-center">
            <h2 className={`text-7xl font-black tracking-tighter mb-2 ${trafficData.signal === "ACTIVE" ? "text-emerald-500" : "text-gray-200"}`}>
              {trafficData.signal}
            </h2>
            <div className="flex items-center justify-center gap-4 text-gray-500 uppercase text-[10px] font-bold tracking-widest">
              <span>Last Entry: <span className="text-gray-300">₹{trafficData.entryPrice || "0.00"}</span></span>
              <div className="w-1 h-1 bg-gray-700 rounded-full" />
              <span>Live P&L: <span className={parseFloat(trafficData.livePnL) >= 0 ? "text-emerald-500" : "text-red-500"}>₹{trafficData.livePnL || "0.00"}</span></span>
            </div>
          </div>
        </div>
        
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 flex flex-col justify-between">
          <TrendingUp className="text-emerald-500" size={18} />
          <p className="text-sm text-gray-400 leading-relaxed">Active Scan: NIFTY 3-Min. Monitoring Iron Condor spreads via BSE Sensex and NSE Nifty indices.</p>
          <div className="text-xs font-bold text-emerald-500">Kite API Verified</div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-8 border-b border-gray-800 mb-8 px-4">
        <button onClick={() => setActiveTab("system")} className={`pb-4 text-[11px] font-black uppercase tracking-widest ${activeTab === "system" ? "text-emerald-500" : "text-gray-500"}`}>
          <Activity size={14} className="inline mr-2" /> System History
        </button>
        <button onClick={() => setActiveTab("options")} className={`pb-4 text-[11px] font-black uppercase tracking-widest ${activeTab === "options" ? "text-blue-500" : "text-gray-500"}`}>
          <Layers size={14} className="inline mr-2" /> Strategy Builder
        </button>
      </div>

      {/* HISTORY TABLE */}
      <div className="bg-[#0a0a0c] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase text-gray-500 bg-[#0d0d0f] border-b border-gray-800">
              <th className="px-6 py-3">Strategy</th>
              <th className="px-6 py-3">Symbol</th>
              <th className="px-6 py-3">Reason</th>
              <th className="px-6 py-3 text-right">Net P&L</th>
            </tr>
          </thead>
          <tbody>
            {history.map((trade, i) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                <td className="px-6 py-4 text-[10px] font-bold">{trade.strategy}</td>
                <td className="px-6 py-4 text-xs font-mono text-gray-400">{trade.symbol}</td>
                <td className="px-6 py-4 text-[10px] italic text-gray-500">{trade.exitReason}</td>
                <td className={`px-6 py-4 text-right font-bold font-mono ${trade.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  ₹{trade.pnl.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;