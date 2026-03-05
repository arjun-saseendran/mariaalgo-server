import mongoose from 'mongoose';

const tradePerformanceSchema = new mongoose.Schema({
  strategy: { type: String, default: 'TRAFFIC_LIGHT', enum: ['TRAFFIC_LIGHT', 'IRON_CONDOR'] },
  index: { type: String, required: true },
  exitReason: { type: String, enum: ['STOP_LOSS_HIT', 'ATM_MANUAL_HANDOFF', 'PROFIT_TARGET', 'MANUAL_CLOSE'] },
  realizedPnL: { type: Number, required: true },
  notes: { type: String }
}, { timestamps: true });

// Use shared 'tradeperformances' collection — strategy field differentiates records
const TrafficTradePerformance = mongoose.models.TradePerformance ||
  mongoose.model('TradePerformance', tradePerformanceSchema);

export default TrafficTradePerformance;
