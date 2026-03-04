import mongoose from 'mongoose';

const tradePerformanceSchema = new mongoose.Schema({
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

export default mongoose.models.CondorTradePerformance || 
  mongoose.model('CondorTradePerformance', tradePerformanceSchema);