import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  strategy: { type: String, default: 'IRON_CONDOR', enum: ['TRAFFIC_LIGHT', 'IRON_CONDOR'] },
  index: { type: String, required: true },
  activeTradeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ActiveTrade',
    default: null
  },
  exitReason: { 
    type: String, 
    enum: ['STOP_LOSS_HIT', 'ATM_MANUAL_HANDOFF', 'PROFIT_TARGET', 'MANUAL_CLOSE'] 
  },
  realizedPnL: { type: Number, required: true },
  notes: { type: String }
}, { timestamps: true });

// Use the same 'tradeperformances' collection — strategy field differentiates records
export const getCondorTradePerformanceModel = () => {
  return mongoose.models.TradePerformance ||
    mongoose.model('TradePerformance', schema);
};
