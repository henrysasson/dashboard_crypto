import { 
  Kline, 
  FundingRate, 
  FundingMetric, 
  VolatilityMetric, 
  VolumeMetric,
  CorrelationMatrix,
  CorrelationPoint,
  TARGET_ASSETS 
} from '../types';
import { 
  calculatePercentile, 
  calculateExponentialVol, 
  calculateZScore, 
  calculateCorrelation 
} from './mathUtils';

const BINANCE_API_BASE = 'https://api.binance.com';
const BINANCE_FAPI_BASE = 'https://fapi.binance.com';

// Use a public CORS proxy as fallback for web deployments
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// Helper to fetch JSON with robust error handling and CORS fallback
const fetchJson = async (url: string) => {
  try {
    // 1. Try direct fetch first (works in some local envs or backends)
    const res = await fetch(url);
    if (res.ok) {
      return await res.json();
    }
    throw new Error('Direct fetch failed');
  } catch (error) {
    // 2. If direct fetch fails (likely CORS), try via Proxy
    // console.log(`Direct fetch failed for ${url}, trying proxy...`);
    try {
      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Proxy fetch failed: ${res.statusText}`);
      return await res.json();
    } catch (proxyError) {
      console.warn(`Failed to fetch ${url} via proxy`, proxyError);
      throw proxyError;
    }
  }
};

/**
 * Fetches historical Klines (Candles)
 * Used for Volatility, Correlation, Volume.
 * Limit 1000 is max.
 */
const fetchKlines = async (symbol: string, interval: string, limit: number): Promise<Kline[]> => {
  try {
    // USDT pair
    const pair = `${symbol}USDT`;
    const data = await fetchJson(`${BINANCE_API_BASE}/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`);
    
    // Check if data is valid array
    if (!Array.isArray(data)) return [];

    return data.map((d: any[]) => ({
      openTime: d[0],
      open: d[1],
      high: d[2],
      low: d[3],
      close: d[4],
      volume: d[5],
      closeTime: d[6]
    }));
  } catch (error) {
    console.warn(`Could not fetch klines for ${symbol}`, error);
    return [];
  }
};

/**
 * Fetches Funding Rate History
 * Limit 1000 is max. Funding is usually every 8h.
 * 90 days * 3 times/day = 270 points. Safe within limit.
 */
const fetchFundingRates = async (symbol: string): Promise<FundingRate[]> => {
  try {
    const pair = `${symbol}USDT`;
    const data = await fetchJson(`${BINANCE_FAPI_BASE}/fapi/v1/fundingRate?symbol=${pair}&limit=500`);
    
    if (!Array.isArray(data)) return [];

    return data.map((d: any) => ({
      symbol: d.symbol,
      fundingRate: d.fundingRate,
      fundingTime: d.fundingTime
    }));
  } catch (error) {
    console.warn(`Could not fetch funding for ${symbol}`, error);
    return [];
  }
};

/**
 * 1. Funding Rate Percentile (Last 90 days)
 * UPDATED: Annualized Funding Rate (Rate * 3 * 365)
 */
export const getFundingMetrics = async (): Promise<FundingMetric[]> => {
  // Parallel fetch (limited batching ideally, but 20 is okay for browser usually)
  const promises = TARGET_ASSETS.map(async (asset) => {
    const rates = await fetchFundingRates(asset);
    if (rates.length === 0) return null;

    // Filter last 90 days
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const recentRates = rates.filter(r => (now - r.fundingTime) <= ninetyDaysMs);

    if (recentRates.length === 0) return null;

    // Convert to Annualized Rate: Rate * 3 (8h periods per day) * 365
    const values = recentRates.map(r => parseFloat(r.fundingRate) * 3 * 365);
    const currentRate = values[values.length - 1]; // Last one
    const percentile = calculatePercentile(values, currentRate, true); // Absolute percentile

    return {
      symbol: asset,
      currentRate,
      percentile
    };
  });

  const results = await Promise.all(promises);
  return results.filter((r): r is FundingMetric => r !== null);
};

/**
 * 2. Volatility Regime
 * 180 days history. Rolling window 21.
 * We need 180 + 21 = ~201 days of data.
 */
export const getVolatilityMetrics = async (): Promise<VolatilityMetric[]> => {
  const promises = TARGET_ASSETS.map(async (asset) => {
    // Fetch Daily candles
    const klines = await fetchKlines(asset, '1d', 300); // Fetch extra to be safe
    if (klines.length < 50) return null;

    const closes = klines.map(k => parseFloat(k.close));
    // Calculate returns: ln(Pt / Pt-1)
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }

    // We need to build a history of volatilities for the last 180 days.
    // Each point in history requires the previous 21 days of returns.
    const window = 21;
    const historyDays = 180;
    const volHistory: number[] = [];

    // Ensure we have enough data
    if (returns.length < window) return null;

    // Calculate volatility for each day in the lookback period
    // We go backwards from the most recent day
    for (let i = 0; i < historyDays; i++) {
      const endIndex = returns.length - i; // Current day considered
      const startIndex = endIndex - window;
      
      if (startIndex < 0) break;

      const windowReturns = returns.slice(startIndex, endIndex);
      const vol = calculateExponentialVol(windowReturns, window);
      volHistory.push(vol);
    }

    if (volHistory.length === 0) return null;

    const currentVol = volHistory[0]; // Most recent
    // Compare currentVol against the volHistory
    const percentile = calculatePercentile(volHistory, currentVol, false);

    return {
      symbol: asset,
      currentVol,
      percentile
    };
  });

  const results = await Promise.all(promises);
  return results.filter((r): r is VolatilityMetric => r !== null);
};

/**
 * 4. Volume Monitor
 * Last 90 days reference.
 * Compare last 7 days avg to 90 days.
 */
export const getVolumeMetrics = async (): Promise<VolumeMetric[]> => {
  const promises = TARGET_ASSETS.map(async (asset) => {
    const klines = await fetchKlines(asset, '1d', 100);
    if (klines.length < 90) return null;

    // Get volumes (last 90 days)
    const volumes = klines.slice(-90).map(k => parseFloat(k.volume));
    
    // Last 7 days
    const last7 = volumes.slice(-7);
    const avg7 = last7.reduce((a, b) => a + b, 0) / 7;

    // Full 90 days stats
    const avg90 = volumes.reduce((a, b) => a + b, 0) / 90;
    const zScore = calculateZScore(avg7, volumes);

    return {
      symbol: asset,
      zScore,
      changeStatus: zScore > 1 ? 'INCREASE' : zScore < -1 ? 'DECREASE' : 'NEUTRAL',
      last7DayAvg: avg7,
      last90DayAvg: avg90
    };
  });

  const results = await Promise.all(promises);
  return results.filter((r): r is VolumeMetric => r !== null);
};

/**
 * 3. Correlations
 * a) Matrix (last 30 days)
 * b) History (BTC vs Avg Alts) 10, 30, 60, 90 windows (180 removed)
 */
export const getCorrelationData = async (): Promise<{ matrix: CorrelationMatrix, history: CorrelationPoint[] }> => {
  // 1. Fetch all data first (need synchronized dates roughly)
  // We fetch 200 days to cover the max windows + calculation buffer
  const assetDataMap: Record<string, { date: string, ret: number }[]> = {};

  // For correlation, we need precise date alignment. 
  // Let's assume daily candles close at same time.
  const fetchPromises = TARGET_ASSETS.map(async (asset) => {
    const klines = await fetchKlines(asset, '1d', 250);
    if (klines.length < 180) return;

    const returns = [];
    for (let i = 1; i < klines.length; i++) {
      const r = Math.log(parseFloat(klines[i].close) / parseFloat(klines[i-1].close));
      // Store date as simple YYYY-MM-DD for alignment key
      const date = new Date(klines[i].closeTime).toISOString().split('T')[0];
      returns.push({ date, ret: r });
    }
    assetDataMap[asset] = returns;
  });

  await Promise.all(fetchPromises);

  // --- A. Matrix (Last 30 days) ---
  // Find common dates for last 30 days
  const validAssets = Object.keys(assetDataMap);
  const matrix: number[][] = [];
  
  // We need to align data. Let's get the last 30 dates from BTC (as anchor)
  const btcData = assetDataMap['BTC'];
  if (!btcData) return { matrix: { assets: [], matrix: [] }, history: [] };

  const last30Dates = btcData.slice(-30).map(d => d.date);

  // Build aligned return arrays
  const alignedReturns: Record<string, number[]> = {};
  
  validAssets.forEach(asset => {
    const assetReturns = assetDataMap[asset];
    const aligned: number[] = [];
    let isValid = true;
    
    last30Dates.forEach(date => {
      const point = assetReturns.find(p => p.date === date);
      if (point) aligned.push(point.ret);
      else isValid = false;
    });

    if (isValid) alignedReturns[asset] = aligned;
  });

  const matrixAssets = Object.keys(alignedReturns);
  
  for (let i = 0; i < matrixAssets.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < matrixAssets.length; j++) {
      if (i === j) row.push(1);
      else {
        row.push(calculateCorrelation(alignedReturns[matrixAssets[i]], alignedReturns[matrixAssets[j]]));
      }
    }
    matrix.push(row);
  }

  // --- B. History (BTC vs Avg Alts) ---
  // Iterate back 90 days for graph points. For each day, calculate corr over window 10, 30, 60, 90.
  const historyPoints: CorrelationPoint[] = [];
  const alts = matrixAssets.filter(a => a !== 'BTC');
  
  // We need the full aligned history now
  const analysisDates = btcData.map(d => d.date);
  
  // Pre-calculate Average Alt Return for every day
  const avgAltReturns: { date: string, ret: number }[] = [];
  
  analysisDates.forEach(date => {
    let sum = 0;
    let count = 0;
    alts.forEach(alt => {
      const item = assetDataMap[alt]?.find(d => d.date === date);
      if (item) {
        sum += item.ret;
        count++;
      }
    });
    if (count > 0) {
      avgAltReturns.push({ date, ret: sum / count });
    }
  });

  // Now perform rolling correlations
  // Windows: 10, 30, 60, 90
  
  const btcReturnsFull = btcData; // {date, ret}

  // We graph the last 90 days of history
  const daysToGraph = 90;
  
  for (let i = 0; i < daysToGraph; i++) {
    const targetIndex = avgAltReturns.length - 1 - i;
    // We need at least 90 days of history prior to this point to calculate corr90
    if (targetIndex < 90) break; 

    const targetDate = avgAltReturns[targetIndex].date;

    const calcRolling = (window: number) => {
      // slice end is exclusive, so +1
      // slice start is index - window + 1
      const sliceAlts = avgAltReturns.slice(targetIndex - window + 1, targetIndex + 1);
      const sliceBtc = [];
      
      // Align BTC slice
      for (let k = 0; k < sliceAlts.length; k++) {
         const b = btcReturnsFull.find(x => x.date === sliceAlts[k].date);
         if (b) sliceBtc.push(b.ret);
         else sliceBtc.push(0); 
      }
      
      return calculateCorrelation(sliceBtc, sliceAlts.map(x => x.ret));
    };

    historyPoints.unshift({
      date: targetDate,
      corr10: calcRolling(10), // Changed from 180 to 10
      corr30: calcRolling(30),
      corr60: calcRolling(60),
      corr90: calcRolling(90),
    });
  }

  return {
    matrix: { assets: matrixAssets, matrix },
    history: historyPoints
  };
};