/**
 * Utility to translate between Zerodha (Kite) and Upstox symbols.
 *
 * Kite format:  NIFTY2531222500CE  (no exchange prefix)
 * Upstox format: NSE_FO|optionInstrumentKey  (uses instrument_key from Upstox master CSV)
 *
 * Upstox instrument keys for options follow this pattern:
 *   NSE_FO|NIFTY{DDMMMYYYY}{STRIKE}{CE/PE}
 *   Example: NSE_FO|NIFTY25MAR202522500CE
 *
 * For index spot:
 *   NSE_INDEX|Nifty 50
 *   BSE_INDEX|SENSEX
 */

// Month name map for Upstox option symbol format
const UPSTOX_MONTH_NAME = {
  1:  'JAN', 2:  'FEB', 3:  'MAR', 4:  'APR',
  5:  'MAY', 6:  'JUN', 7:  'JUL', 8:  'AUG',
  9:  'SEP', 10: 'OCT', 11: 'NOV', 12: 'DEC'
};

/**
 * Get next weekly expiry date
 * NIFTY expires every Tuesday (day=2)
 * SENSEX expires every Thursday (day=4)
 */
export const getNextWeeklyExpiry = (index = 'NIFTY') => {
  const targetDay = (index === 'SENSEX' || index === 'BANKEX') ? 4 : 2;
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  const day = ist.getDay();
  const daysUntilExpiry = (targetDay - day + 7) % 7;

  const expiry = new Date(ist);
  expiry.setDate(ist.getDate() + daysUntilExpiry);

  return expiry;
};

/**
 * Build Upstox option instrument key from index/strike/type
 * Format: NSE_FO|NIFTY25MAR202522500CE
 */
export const buildUpstoxOptionSymbol = (index, strike, type) => {
  const expiry = getNextWeeklyExpiry(index);

  const dd   = String(expiry.getDate()).padStart(2, '0');
  const mon  = UPSTOX_MONTH_NAME[expiry.getMonth() + 1];
  const yyyy = expiry.getFullYear();

  const exchange = (index === 'SENSEX' || index === 'BANKEX') ? 'BSE_FO' : 'NSE_FO';

  return `${exchange}|${index}${dd}${mon}${yyyy}${strike}${type}`;
};

/**
 * Convert Kite option symbol to Upstox instrument key
 *
 * Kite:   NIFTY2531222500CE
 * Upstox: NSE_FO|NIFTY25MAR202522500CE
 *
 * Kite format breakdown:
 *   NIFTY  = index name
 *   25     = year (2025)
 *   3      = month code (Fyers style: 1-9, O, N, D)
 *   12     = day
 *   22500  = strike
 *   CE/PE  = type
 *
 * NOTE: Kite uses a different date format than Fyers.
 * Kite monthly format: NIFTY25MAR22500CE (for monthly expiry)
 * Kite weekly format:  NIFTY2531222500CE (YYMDD)
 */
export const kiteToUpstoxSymbol = (kiteSymbol, index = 'NIFTY') => {
  if (!kiteSymbol) return null;

  const exchange = (index === 'SENSEX' || index === 'BANKEX') ? 'BSE_FO' : 'NSE_FO';

  // Try monthly format first: NIFTY25MAR22500CE
  const monthlyMatch = kiteSymbol.match(
    /^([A-Z]+)(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d+)(CE|PE)$/i
  );
  if (monthlyMatch) {
    const [, name, yy, mon, strike, type] = monthlyMatch;
    // Upstox monthly: NSE_FO|NIFTY27MAR202522500CE
    // Need full year — assume 2000+yy
    const yyyy = `20${yy}`;
    // Upstox uses last Thursday of month for monthly, keep same mon name
    return `${exchange}|${name.toUpperCase()}${mon.toUpperCase()}${yyyy}${strike}${type.toUpperCase()}`;
  }

  // Weekly format: NIFTY2531222500CE → YY=25, M=3(March), DD=12, strike=22500
  const weeklyMatch = kiteSymbol.match(
    /^([A-Z]+)(\d{2})(\d{1,2})(\d{2})(\d+)(CE|PE)$/i
  );
  if (weeklyMatch) {
    const [, name, yy, m, dd, strike, type] = weeklyMatch;
    const monthNum = parseInt(m);
    const mon = UPSTOX_MONTH_NAME[monthNum];
    if (!mon) return null;
    const yyyy = `20${yy}`;
    const ddPadded = dd.padStart(2, '0');
    return `${exchange}|${name.toUpperCase()}${ddPadded}${mon}${yyyy}${strike}${type.toUpperCase()}`;
  }

  // Fallback: just prefix with exchange (for already-formatted symbols)
  return `${exchange}|${kiteSymbol}`;
};

/**
 * Convert Upstox instrument key back to Kite symbol (strips exchange prefix)
 */
export const upstoxToKiteSymbol = (upstoxKey) => {
  if (!upstoxKey) return null;
  const parts = upstoxKey.split('|');
  return parts.length > 1 ? parts[1] : parts[0];
};

/**
 * Returns the Upstox index spot instrument key
 */
export const getUpstoxIndexSymbol = (index) => {
  if (index === 'SENSEX') return 'BSE_INDEX|SENSEX';
  if (index === 'BANKEX')  return 'BSE_INDEX|BANKEX';
  if (index === 'BANKNIFTY') return 'NSE_INDEX|Nifty Bank';
  return 'NSE_INDEX|Nifty 50';
};

/**
 * Build Upstox instrument key for equity
 * Example: SBIN → NSE_EQ|INE062A01020
 * NOTE: Equity needs ISIN — use this only if you have the ISIN.
 * For options/futures, use kiteToUpstoxSymbol above.
 */
export const buildUpstoxEquityKey = (exchange, isin) => {
  const ex = exchange?.toUpperCase() === 'BSE' ? 'BSE_EQ' : 'NSE_EQ';
  return `${ex}|${isin}`;
};