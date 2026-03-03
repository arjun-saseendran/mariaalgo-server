import React, { useState, useEffect } from "react";
import { Layers, Loader2, Trash2, ShoppingCart, ArrowLeft } from "lucide-react";

// Helper to parse Open Interest strings like "1.2L" or "50K" into numbers
const parseOI = (val) => {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const str = val.toString().toUpperCase();
  let num = parseFloat(str.replace(/[^0-9.]/g, ""));
  if (str.includes("L")) num *= 100000;
  else if (str.includes("K")) num *= 1000;
  else if (str.includes("M")) num *= 1000000;
  return isNaN(num) ? 0 : num;
};

const ActionablePriceCell = ({
  typeCEPE,
  strike,
  price,
  onAddLeg,
  selectedLegs,
}) => {
  const [lots, setLots] = useState(1);

  const isBought = selectedLegs.some(
    (leg) =>
      leg.strike === strike &&
      leg.optionType === typeCEPE &&
      leg.type === "BUY",
  );
  const isSold = selectedLegs.some(
    (leg) =>
      leg.strike === strike &&
      leg.optionType === typeCEPE &&
      leg.type === "SELL",
  );

  return (
    <div
      className={`flex items-center gap-2 lg:gap-4 w-full ${typeCEPE === "CE" ? "justify-end" : "justify-start"}`}
    >
      {typeCEPE === "CE" && (
        <div className="flex items-center gap-1 lg:gap-2">
          <div className="hidden lg:flex items-center bg-[#0d0d0f] border border-gray-700 rounded-md h-9 shadow-inner">
            <button
              onClick={() => setLots(Math.max(1, lots - 1))}
              className="px-3 text-gray-400 hover:text-white hover:bg-gray-700 h-full flex items-center transition-colors text-lg font-bold"
            >
              -
            </button>
            <input
              type="number"
              value={lots}
              onChange={(e) =>
                setLots(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-8 bg-transparent text-center text-sm font-black text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => setLots(lots + 1)}
              className="px-3 text-gray-400 hover:text-white hover:bg-gray-700 h-full flex items-center transition-colors text-lg font-bold"
            >
              +
            </button>
          </div>
          <button
            onClick={() => onAddLeg("BUY", strike, typeCEPE, price, lots)}
            className={`px-2 lg:px-4 py-1.5 lg:py-2 text-xs font-black tracking-widest rounded-md transition-all cursor-pointer border ${isBought ? "bg-blue-500 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.6)]" : "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500 hover:text-white"}`}
          >
            B
          </button>
          <button
            onClick={() => onAddLeg("SELL", strike, typeCEPE, price, lots)}
            className={`px-2 lg:px-4 py-1.5 lg:py-2 text-xs font-black tracking-widest rounded-md transition-all cursor-pointer border ${isSold ? "bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.6)]" : "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500 hover:text-white"}`}
          >
            S
          </button>
        </div>
      )}

      <span
        className={`font-mono text-sm lg:text-base font-black min-w-[50px] lg:min-w-[60px] text-center transition-colors ${isBought || isSold ? "text-white" : "text-gray-200"}`}
      >
        {price?.toFixed(2) || "0.00"}
      </span>

      {typeCEPE === "PE" && (
        <div className="flex items-center gap-1 lg:gap-2">
          <button
            onClick={() => onAddLeg("BUY", strike, typeCEPE, price, lots)}
            className={`px-2 lg:px-4 py-1.5 lg:py-2 text-xs font-black tracking-widest rounded-md transition-all cursor-pointer border ${isBought ? "bg-blue-500 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.6)]" : "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500 hover:text-white"}`}
          >
            B
          </button>
          <button
            onClick={() => onAddLeg("SELL", strike, typeCEPE, price, lots)}
            className={`px-2 lg:px-4 py-1.5 lg:py-2 text-xs font-black tracking-widest rounded-md transition-all cursor-pointer border ${isSold ? "bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.6)]" : "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500 hover:text-white"}`}
          >
            S
          </button>
          <div className="hidden lg:flex items-center bg-[#0d0d0f] border border-gray-700 rounded-md h-9 shadow-inner">
            <button
              onClick={() => setLots(Math.max(1, lots - 1))}
              className="px-3 text-gray-400 hover:text-white hover:bg-gray-700 h-full flex items-center transition-colors text-lg font-bold"
            >
              -
            </button>
            <input
              type="number"
              value={lots}
              onChange={(e) =>
                setLots(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-8 bg-transparent text-center text-sm font-black text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => setLots(lots + 1)}
              className="px-3 text-gray-400 hover:text-white hover:bg-gray-700 h-full flex items-center transition-colors text-lg font-bold"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const OptionChain = ({ onClose }) => {
  const [symbol, setSymbol] = useState("NIFTY");
  const [expiry, setExpiry] = useState("26MAR"); // Default expiry matching your current cycle

  const [chainData, setChainData] = useState([]);
  const [spotPrice, setSpotPrice] = useState(0);
  const [atmStrike, setAtmStrike] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedLegs, setSelectedLegs] = useState([]);

  // Fetch Live Option Chain from your Express Backend
  useEffect(() => {
    const fetchLiveChain = async () => {
      try {
        const response = await fetch(
          `https://api.mariaalgo.online/api/options/chain?symbol=${symbol}&expiry=${expiry}`,
        );
        if (!response.ok) throw new Error("Network response was not ok");

        const data = await response.json();
        if (data.chain) {
          setSpotPrice(data.spotPrice);
          setAtmStrike(data.atmStrike);
          setChainData(data.chain);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to fetch option chain:", err);
        setError("Failed to sync with API. Check server connectivity.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLiveChain();
    const intervalId = setInterval(fetchLiveChain, 5000); // Sync every 5 seconds
    return () => clearInterval(intervalId);
  }, [symbol, expiry]);

  const maxCallOI = Math.max(...chainData.map((row) => parseOI(row.ce?.oi)), 1);
  const maxPutOI = Math.max(...chainData.map((row) => parseOI(row.pe?.oi)), 1);

  const handleAddLeg = (type, strike, typeCEPE, price, lotMultiplier) => {
    if (!price || price === 0) return;
    
    // Dynamic Lot Sizes: NIFTY = 65, SENSEX = 10
    const lotSize = symbol === "NIFTY" ? 65 : 10;

    const existingLegIndex = selectedLegs.findIndex(
      (leg) =>
        leg.strike === strike &&
        leg.optionType === typeCEPE &&
        leg.type === type,
    );

    if (existingLegIndex >= 0) {
      removeLeg(selectedLegs[existingLegIndex].id);
      return;
    }

    const newLeg = {
      id: Math.random().toString(36).substr(2, 9),
      symbol: `${symbol} ${strike} ${typeCEPE}`,
      type: type,
      strike: strike,
      optionType: typeCEPE,
      price: price,
      lotSize: lotSize,
      qty: lotSize * lotMultiplier,
    };
    setSelectedLegs([...selectedLegs, newLeg]);
  };

  const removeLeg = (id) => {
    setSelectedLegs(selectedLegs.filter((leg) => leg.id !== id));
  };

  const updateQuantity = (id, change) => {
    setSelectedLegs(
      selectedLegs.map((leg) => {
        if (leg.id === id) {
          const newQty = leg.qty + change;
          if (newQty < leg.lotSize) return leg;
          return { ...leg, qty: newQty };
        }
        return leg;
      }),
    );
  };

  const totalCashAmount = selectedLegs.reduce((acc, leg) => {
    const val = leg.price * leg.qty;
    return leg.type === "SELL" ? acc + val : acc - val;
  }, 0);

  const baseLotSize = symbol === "NIFTY" ? 65 : 10;
  const netPremiumPoints = totalCashAmount / baseLotSize;

  return (
    <div className="h-screen bg-black text-gray-100 p-4 lg:p-6 font-sans flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300 overflow-hidden">
      {/* HEADER */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4 lg:gap-6">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors uppercase tracking-widest text-[10px] lg:text-xs font-bold bg-gray-900 hover:bg-gray-800 px-3 py-2 rounded-lg"
          >
            <ArrowLeft size={16} />{" "}
            <span className="hidden sm:inline">Back to Dashboard</span>
          </button>
          <h1 className="text-lg lg:text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Layers className="text-blue-500" /> Strategy Builder
          </h1>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* OPTION CHAIN TABLE */}
        <div className="w-full lg:w-[70%] bg-[#0a0a0c] border border-gray-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
          <div className="px-4 lg:px-6 py-4 border-b border-gray-800 flex flex-col md:flex-row justify-between items-center bg-[#0d0d0f] gap-4 shrink-0">
            <div className="flex items-center gap-2 lg:gap-4 w-full md:w-auto">
              <div className="flex bg-black border border-gray-800 rounded-lg p-1">
                {["NIFTY", "SENSEX"].map((sym) => (
                  <button
                    key={sym}
                    onClick={() => {
                      setSymbol(sym);
                      setIsLoading(true);
                      setSelectedLegs([]); // Clear basket on index change
                    }}
                    className={`px-4 lg:px-6 py-2 rounded-md text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all ${symbol === sym ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-gray-300"}`}
                  >
                    {sym}
                  </button>
                ))}
              </div>
              <select
                value={expiry}
                onChange={(e) => {
                  setExpiry(e.target.value);
                  setIsLoading(true);
                }}
                className="bg-black border border-gray-800 text-gray-300 text-xs lg:text-sm font-mono rounded-lg px-3 py-2 outline-none focus:border-blue-500/50"
              >
                <option value="26MAR">26 MAR</option>
                <option value="02APR">02 APR</option>
                <option value="09APR">09 APR</option>
              </select>
            </div>

            <div className="text-[10px] lg:text-xs text-gray-500 uppercase font-bold tracking-widest flex items-center gap-3 bg-black/50 px-4 py-2 rounded-xl border border-gray-800">
              Spot:
              {isLoading ? (
                <Loader2 size={16} className="animate-spin text-gray-500" />
              ) : (
                <span className="text-emerald-500 text-base lg:text-lg font-black font-mono">
                  {spotPrice?.toFixed(2) || "0.00"}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="sticky top-0 z-20 shadow-2xl">
                <tr className="text-[9px] lg:text-[10px] uppercase tracking-widest text-gray-400 bg-[#0d0d0f] border-b border-gray-800">
                  <th className="px-2 lg:px-6 py-3 border-r border-gray-800 text-center text-red-400 bg-[#120a0b]" colSpan="3">Calls (CE)</th>
                  <th className="px-2 lg:px-6 py-3 border-r border-gray-800 text-center text-gray-200 bg-[#111113]">Strike</th>
                  <th className="px-2 lg:px-6 py-3 text-center text-emerald-400 bg-[#0a110e]" colSpan="3">Puts (PE)</th>
                </tr>
                <tr className="text-[8px] lg:text-[9px] uppercase tracking-tighter text-gray-500 bg-[#0a0a0c] border-b border-gray-800">
                  <th className="px-2 lg:px-4 py-2 text-center">OI</th>
                  <th className="hidden md:table-cell px-2 lg:px-4 py-2 text-center">Vol</th>
                  <th className="px-2 lg:px-4 py-2 text-right border-r border-gray-800">LTP</th>
                  <th className="px-2 lg:px-4 py-2 text-center border-r border-gray-800 text-gray-400">Price</th>
                  <th className="px-2 lg:px-4 py-2 text-left">LTP</th>
                  <th className="hidden md:table-cell px-2 lg:px-4 py-2 text-center">Vol</th>
                  <th className="px-2 lg:px-4 py-2 text-center">OI</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && chainData.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-24 text-center text-gray-500 font-mono text-xs uppercase tracking-widest">
                      <Loader2 size={32} className="animate-spin text-blue-500 mx-auto mb-4" />
                      Syncing Live Chain...
                    </td>
                  </tr>
                ) : (
                  chainData.map((row, i) => {
                    const isATM = row.strike === atmStrike;
                    const ceOIWidth = Math.min((parseOI(row.ce.oi) / maxCallOI) * 95, 95);
                    const peOIWidth = Math.min((parseOI(row.pe.oi) / maxPutOI) * 95, 95);

                    return (
                      <tr key={i} className={`border-b border-gray-800/50 transition-colors ${isATM ? "bg-blue-500/10" : "hover:bg-white/[0.03]"}`}>
                        <td className="px-2 lg:px-4 py-3 text-center font-mono text-xs relative">
                          <div className="absolute right-0 top-1 bottom-1 bg-red-500/20 -z-10 rounded-l" style={{ width: `${ceOIWidth}%` }} />
                          {row.ce.oi}
                        </td>
                        <td className="hidden md:table-cell px-2 lg:px-4 py-3 text-center font-mono text-xs text-gray-500">{row.ce.vol}</td>
                        <td className="px-2 lg:px-4 py-3 border-r border-gray-800">
                          <ActionablePriceCell typeCEPE="CE" strike={row.strike} price={row.ce.ltp} onAddLeg={handleAddLeg} selectedLegs={selectedLegs} />
                        </td>
                        <td className="px-2 lg:px-4 py-3 text-center font-mono text-sm lg:text-lg font-black border-r border-gray-800 bg-black/20">
                          <span className={isATM ? "text-blue-400" : "text-gray-200"}>{row.strike}</span>
                        </td>
                        <td className="px-2 lg:px-4 py-3 text-left">
                          <ActionablePriceCell typeCEPE="PE" strike={row.strike} price={row.pe.ltp} onAddLeg={handleAddLeg} selectedLegs={selectedLegs} />
                        </td>
                        <td className="hidden md:table-cell px-2 lg:px-4 py-3 text-center font-mono text-xs text-gray-500">{row.pe.vol}</td>
                        <td className="px-2 lg:px-4 py-3 text-center font-mono text-xs relative">
                          <div className="absolute left-0 top-1 bottom-1 bg-emerald-500/20 -z-10 rounded-r" style={{ width: `${peOIWidth}%` }} />
                          {row.pe.oi}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* BASKET PANE */}
        <div className="w-full lg:w-[30%] flex flex-col h-[300px] lg:h-auto">
          {selectedLegs.length === 0 ? (
            <div className="bg-[#0a0a0c] border border-gray-800 border-dashed rounded-2xl flex-1 flex flex-col items-center justify-center text-gray-600">
              <ShoppingCart size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-bold uppercase tracking-widest">Basket Empty</p>
            </div>
          ) : (
            <div className="bg-[#0d0d0f] border border-blue-500/30 rounded-2xl shadow-xl flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-right-4">
              <div className="px-4 py-4 border-b border-gray-800 bg-black/40">
                <div className="text-blue-400 uppercase text-xs font-black tracking-widest">Basket ({selectedLegs.length})</div>
              </div>

              <div className="p-4 grid grid-cols-2 gap-4 bg-black/60 border-b border-gray-800">
                <div className="bg-black p-3 rounded-xl border border-gray-800">
                  <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">Net Premium</div>
                  <div className={`font-mono font-black text-lg ${netPremiumPoints >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {netPremiumPoints >= 0 ? "+" : "-"}{Math.abs(netPremiumPoints).toFixed(2)}
                  </div>
                </div>
                <div className="bg-black p-3 rounded-xl border border-gray-800">
                  <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">Total {totalCashAmount >= 0 ? "Credit" : "Debit"}</div>
                  <div className={`font-mono font-black text-lg ${totalCashAmount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    ₹{Math.abs(totalCashAmount).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3">
                {selectedLegs.map((leg) => {
                  const legLotCount = leg.qty / leg.lotSize;
                  const legPremiumPoints = leg.price * legLotCount;
                  return (
                    <div key={leg.id} className="bg-black border border-gray-800 rounded-xl p-3 flex flex-col gap-3 hover:border-gray-700 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 flex items-center justify-center rounded text-[10px] font-black ${leg.type === "BUY" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"}`}>
                            {leg.type.charAt(0)}
                          </div>
                          <div className="font-mono text-sm font-bold text-gray-200">{leg.symbol}</div>
                        </div>
                        <button onClick={() => removeLeg(leg.id)} className="text-gray-600 hover:text-red-500"><Trash2 size={16} /></button>
                      </div>
                      <div className="flex items-center justify-between border-t border-gray-800/50 pt-3">
                        <div className="flex items-center gap-2 bg-[#0a0a0c] border border-gray-800 rounded-lg p-1">
                          <button onClick={() => updateQuantity(leg.id, -leg.lotSize)} className="w-6 h-6 flex items-center justify-center rounded bg-gray-900 text-gray-400 hover:text-white font-bold">-</button>
                          <span className="font-mono text-xs font-black w-8 text-center">{legLotCount} L</span>
                          <button onClick={() => updateQuantity(leg.id, leg.lotSize)} className="w-6 h-6 flex items-center justify-center rounded bg-gray-900 text-gray-400 hover:text-white font-bold">+</button>
                        </div>
                        <div className={`font-mono text-sm font-black ${leg.type === "SELL" ? "text-emerald-400" : "text-red-400"}`}>
                          {leg.type === "SELL" ? "+" : "-"}{legPremiumPoints.toFixed(2)} pts
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border-t border-gray-800 bg-black/50">
                <button className="w-full bg-blue-500 text-black py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-400 transition-colors shadow-lg">
                  Execute Strategy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OptionChain;