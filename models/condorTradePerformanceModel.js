import mongoose from 'mongoose';
import { getCondorDB } from '../config/db.js';

const schema = new mongoose.Schema({
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

export const getCondorTradePerformanceModel = () => {
  const conn = getCondorDB();
  return conn.models.CondorTradePerformance || conn.model('CondorTradePerformance', schema);
};