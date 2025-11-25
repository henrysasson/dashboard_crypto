import { 
  Kline, 
  FundingRate, 
  FundingMetric, 
  VolatilityMetric, 
  VolumeMetric,
  CorrelationMatrix,
  CorrelationPoint,
  FactorData,
  FactorMetric,
  TARGET_ASSETS 
} from '../types';
import { 
  calculatePercentile, 
  calculateExponentialVol, 
  calculateZScore, 
  calculateCorrelation,
  calculateStdDev,
  calculateMedian,
  calculateMean
} from './mathUtils';

const BINANCE_API_BASE = 'https://api.binance.com';
const BINANCE_FAPI_BASE = 'https://fapi.binance.com';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// --- Data Caching to prevent Rate Limiting ---
let klineCache: Record<string, Kline[]> = {};
let fundingCache: Record<string, FundingRate[]> = {};

const fetchJson = async (url: string) => {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
    throw new Error('Direct fetch failed');
  } catch (error) {
    try {
      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Proxy fetch failed`);
      return await res.json();
    } catch (proxyError) {
      console.warn(`Failed to fetch ${url} via proxy`);
      throw proxyError;
    }
  }
};

const fetchKlines = async (symbol: string, interval: string, limit: number): Promise<Kline[]> => {
  // Check cache first if requesting same data
  const key = `${symbol}-${interval}-${limit}`;
  if (klineCache[key]) return klineCache[key];

  try {
    const pair = `${symbol}USDT`;
    // For Volatility (180d) and Volume (90d), we need ~200-300 candles.
    const data = await fetchJson(`${BINANCE_API_BASE}/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`);
    
    if (!Array.isArray(data)) return [];

    const klines = data.map((d: any[]) => ({
      openTime: d[0],
      open: d[1],
      high: d[2],
      low: d[3],
      close: d[4],
      volume: d[5],
      closeTime: d[6]
    }));

    klineCache[key] = klines;
    return klines;
  } catch (error) {
    // console.warn(`Could not fetch klines for ${symbol}`);
    return [];
  }
};

const fetchFundingRates = async (symbol: string): Promise<FundingRate[]> => {
  if (fundingCache[symbol]) return fundingCache[symbol];

  try {
    const pair = `${symbol}USDT`;
    const data = await fetchJson(`${BINANCE_FAPI_BASE}/fapi/v1/fundingRate?symbol=${pair}&limit=500`);
    
    if (!Array.isArray(data)) return [];

    const rates = data.map((d: any) => ({
      symbol: d.symbol,
      fundingRate: d.fundingRate,
      fundingTime: d.fundingTime
    }));
    
    fundingCache[symbol] = rates;
    return rates;
  } catch (error) {
    // console.warn(`Could not fetch funding for ${symbol}`);
    return [];
  }
};

// --- Main Aggregation Function ---
// Fetches all necessary data once and distributes to calculators
export const getDashboardData = async () => {
  // Clear caches for new refresh
  klineCache = {};
  fundingCache = {};

  // 1. Fetch Klines (300 days for Volatility/Correlation) for all assets
  // We use 300 to cover 180d history + buffer
  const klinePromises = TARGET_ASSETS.map(asset => fetchKlines(asset, '1d', 300));
  const klinesResults = await Promise.all(klinePromises);
  const klinesMap: Record<string, Kline[]> = {};
  TARGET_ASSETS.forEach((asset, i) => {
    if (klinesResults[i].length > 0) {
      klinesMap[asset] = klinesResults[i];
    }
  });

  // 2. Fetch Funding Rates (for all assets)
  const fundingPromises = TARGET_ASSETS.map(asset => fetchFundingRates(asset));
  const fundingResults = await Promise.all(fundingPromises);
  const fundingMap: Record<string, FundingRate[]> = {};
  TARGET_ASSETS.forEach((asset, i) => {
    if (fundingResults[i].length > 0) {
      fundingMap[asset] = fundingResults[i];
    }
  });

  // 3. Process Metrics
  const validAssets = Object.keys(klinesMap);
  
  // -- A. Funding Percentiles --
  const fundingMetrics = processFundingMetrics(validAssets, fundingMap);

  // -- B. Volatility --
  const volMetrics = processVolatilityMetrics(validAssets, klinesMap);

  // -- C. Volume --
  const volMonitorMetrics = processVolumeMetrics(validAssets, klinesMap);

  // -- D. Correlations --
  const correlationData = processCorrelationData(validAssets, klinesMap);

  // -- E. Factors (New) --
  const factorData = processFactorMetrics(validAssets, klinesMap, fundingMap);

  return {
    funding: fundingMetrics,
    volatility: volMetrics,
    volume: volMonitorMetrics,
    correlation: correlationData,
    factors: factorData
  };
};

// --- Processors ---

const processFundingMetrics = (assets: string[], map: Record<string, FundingRate[]>): FundingMetric[] => {
  return assets.map(asset => {
    const rates = map[asset];
    if (!rates || rates.length === 0) return null;

    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const recentRates = rates.filter(r => (now - r.fundingTime) <= ninetyDaysMs);
    if (recentRates.length === 0) return null;

    // Annualized
    const values = recentRates.map(r => parseFloat(r.fundingRate) * 3 * 365);
    const currentRate = values[values.length - 1];
    const percentile = calculatePercentile(values, currentRate, true);

    return { symbol: asset, currentRate, percentile };
  }).filter((r): r is FundingMetric => r !== null);
};

const processVolatilityMetrics = (assets: string[], map: Record<string, Kline[]>): VolatilityMetric[] => {
  return assets.map(asset => {
    const klines = map[asset];
    if (!klines || klines.length < 50) return null;

    const closes = klines.map(k => parseFloat(k.close));
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));

    const window = 21;
    const historyDays = 180;
    const volHistory: number[] = [];

    if (returns.length < window) return null;

    for (let i = 0; i < historyDays; i++) {
      const endIndex = returns.length - i;
      const startIndex = endIndex - window;
      if (startIndex < 0) break;
      const windowReturns = returns.slice(startIndex, endIndex);
      const vol = calculateExponentialVol(windowReturns, window);
      volHistory.push(vol);
    }

    if (volHistory.length === 0) return null;
    const currentVol = volHistory[0];
    const percentile = calculatePercentile(volHistory, currentVol, false);

    return { symbol: asset, currentVol, percentile };
  }).filter((r): r is VolatilityMetric => r !== null);
};

const processVolumeMetrics = (assets: string[], map: Record<string, Kline[]>): VolumeMetric[] => {
  return assets.map(asset => {
    const klines = map[asset];
    if (!klines || klines.length < 90) return null;
    
    const volumes = klines.slice(-90).map(k => parseFloat(k.volume));
    const last7 = volumes.slice(-7);
    const avg7 = last7.reduce((a, b) => a + b, 0) / 7;
    const avg90 = volumes.reduce((a, b) => a + b, 0) / 90;
    const zScore = calculateZScore(avg7, volumes);

    return {
      symbol: asset,
      zScore,
      changeStatus: zScore > 1 ? 'INCREASE' : zScore < -1 ? 'DECREASE' : 'NEUTRAL',
      last7DayAvg: avg7,
      last90DayAvg: avg90
    };
  }).filter((r): r is VolumeMetric => r !== null);
};

const processCorrelationData = (assets: string[], map: Record<string, Kline[]>) => {
  // Logic identical to previous, just using map
  // Find common dates using BTC as anchor
  const btcKlines = map['BTC'];
  if (!btcKlines) return { matrix: { assets: [], matrix: [] }, history: [] };

  const btcReturns = btcKlines.slice(1).map(k => ({
    date: new Date(k.closeTime).toISOString().split('T')[0],
    ret: Math.log(parseFloat(k.close) / parseFloat(btcKlines[btcKlines.indexOf(k)-1].close))
  }));

  const last30Dates = btcReturns.slice(-30).map(d => d.date);
  
  // Align
  const alignedReturns: Record<string, number[]> = {};
  assets.forEach(asset => {
    const klines = map[asset];
    const assetRet: Record<string, number> = {};
    for(let i=1; i<klines.length; i++) {
      const dt = new Date(klines[i].closeTime).toISOString().split('T')[0];
      const r = Math.log(parseFloat(klines[i].close) / parseFloat(klines[i-1].close));
      assetRet[dt] = r;
    }
    
    const aligned: number[] = [];
    let isValid = true;
    last30Dates.forEach(date => {
      if (assetRet[date] !== undefined) aligned.push(assetRet[date]);
      else isValid = false;
    });
    if (isValid) alignedReturns[asset] = aligned;
  });

  // Matrix
  const matrixAssets = Object.keys(alignedReturns);
  const matrix: number[][] = [];
  for(let i=0; i<matrixAssets.length; i++) {
    const row: number[] = [];
    for(let j=0; j<matrixAssets.length; j++) {
      if (i===j) row.push(1);
      else row.push(calculateCorrelation(alignedReturns[matrixAssets[i]], alignedReturns[matrixAssets[j]]));
    }
    matrix.push(row);
  }

  // History (BTC vs Avg Alts) - 10 day window
  const historyPoints: CorrelationPoint[] = [];
  const alts = matrixAssets.filter(a => a !== 'BTC');
  const daysToGraph = 90;

  // Pre-process all returns for fast lookup
  const allAssetReturns: Record<string, Record<string, number>> = {};
  matrixAssets.forEach(asset => {
    const klines = map[asset];
    const rMap: Record<string, number> = {};
    for(let i=1; i<klines.length; i++) {
      const dt = new Date(klines[i].closeTime).toISOString().split('T')[0];
      rMap[dt] = Math.log(parseFloat(klines[i].close) / parseFloat(klines[i-1].close));
    }
    allAssetReturns[asset] = rMap;
  });

  const analysisDates = btcReturns.map(d => d.date);

  for (let i = 0; i < daysToGraph; i++) {
    const targetIdx = analysisDates.length - 1 - i;
    if (targetIdx < 90) break;
    const date = analysisDates[targetIdx];
    
    // Avg Alt Return history up to this date
    // We need windows of 10, 30, 60, 90 ending at targetIdx
    const calcRolling = (window: number) => {
      const sliceDates = analysisDates.slice(targetIdx - window + 1, targetIdx + 1);
      const btcSlice = sliceDates.map(d => allAssetReturns['BTC'][d] || 0);
      const altSlice = sliceDates.map(d => {
        let sum = 0, cnt = 0;
        alts.forEach(a => {
           if (allAssetReturns[a][d] !== undefined) { sum += allAssetReturns[a][d]; cnt++; }
        });
        return cnt > 0 ? sum/cnt : 0;
      });
      return calculateCorrelation(btcSlice, altSlice);
    };

    historyPoints.unshift({
      date,
      corr10: calcRolling(10), 
      corr30: calcRolling(30),
      corr60: calcRolling(60),
      corr90: calcRolling(90)
    });
  }

  return { matrix: { assets: matrixAssets, matrix }, history: historyPoints };
};

const processFactorMetrics = (assets: string[], klinesMap: Record<string, Kline[]>, fundingMap: Record<string, FundingRate[]>): FactorData => {
  // 1. Calculate Financial Volume for last 30 days to define Universes
  const volumeMap: { symbol: string, vol: number }[] = [];
  
  assets.forEach(asset => {
    const klines = klinesMap[asset];
    if (!klines || klines.length < 30) return;
    
    // Sum of (Close * Volume) for last 30 days
    const last30 = klines.slice(-30);
    const finVol = last30.reduce((acc, k) => acc + (parseFloat(k.close) * parseFloat(k.volume)), 0);
    volumeMap.push({ symbol: asset, vol: finVol });
  });

  // Sort Descending
  volumeMap.sort((a, b) => b.vol - a.vol);
  
  // Define Universes
  const top25 = volumeMap.slice(0, 25).map(v => v.symbol);
  // Bottom 25: Take the last 25 from the sorted list. 
  // If total < 50, there might be overlap if we strictly took top 25 and bottom 25 of a set of 30.
  // Prompt: "considere apenas o top 25 ativos com menos volume... Não deve haver intersecção".
  // Strategy: Take Top 25. Remove them. Take next 25 (or remaining) as Bottom.
  const remaining = volumeMap.filter(v => !top25.includes(v.symbol));
  // Sort remaining ascending (lowest volume) to easily pick "bottom 25" ? 
  // Actually "Top 25 ativos com menos volume" = Bottom 25 of the whole list.
  // We just take the tail of the big list.
  const bottom25 = volumeMap.slice(-25).map(v => v.symbol); 
  // Ensure no intersection (if list < 50)
  const cleanBottom25 = bottom25.filter(s => !top25.includes(s));

  // --- Helpers for Signals ---
  
  // Momentum/MeanRev Signal: (Cum Return x days) / (StdDev Daily Returns x days)
  const getReturnSignal = (symbol: string, days: number): number | null => {
    const klines = klinesMap[symbol];
    if (!klines || klines.length < days + 1) return null;
    
    const slice = klines.slice(- (days + 1));
    const startPrice = parseFloat(slice[0].close);
    const endPrice = parseFloat(slice[slice.length - 1].close);
    
    // Cumulative Return
    const cumRet = (endPrice - startPrice) / startPrice;
    
    // Daily Returns for Std
    const rets = [];
    for(let i=1; i<slice.length; i++) {
      const p0 = parseFloat(slice[i-1].close);
      const p1 = parseFloat(slice[i].close);
      rets.push((p1 - p0) / p0);
    }
    const std = calculateStdDev(rets);
    
    if (std === 0) return 0;
    return cumRet / std;
  };

  // Carry Signal: (Avg Funding x days) / (Std Funding x days)
  const getCarrySignal = (symbol: string, days: number): number | null => {
    const rates = fundingMap[symbol];
    if (!rates || rates.length === 0) return null;
    
    const now = Date.now();
    const ms = days * 24 * 60 * 60 * 1000;
    const slice = rates.filter(r => (now - r.fundingTime) <= ms);
    
    if (slice.length < 3) return null; // Need some data
    
    const vals = slice.map(r => parseFloat(r.fundingRate));
    const mean = calculateMean(vals);
    const std = calculateStdDev(vals);
    
    if (std === 0) return 0;
    return mean / std;
  };

  // --- Calculate Scores ---
  const periods = [5, 10, 20];

  const calculateFactorScores = (
    universe: string[], 
    signalFn: (sym: string, d: number) => number | null,
    scoreFn: (signal: number, median: number) => number
  ): FactorMetric[] => {
    // 1. Calculate all signals for all periods for the universe
    // struct: signals[period][symbol] = value
    const periodSignals: Record<number, {val: number, sym: string}[]> = {};
    
    periods.forEach(p => {
      periodSignals[p] = [];
      universe.forEach(sym => {
        const s = signalFn(sym, p);
        if (s !== null) periodSignals[p].push({ val: s, sym });
      });
    });

    // 2. Calculate Medians per period
    const medians: Record<number, number> = {};
    periods.forEach(p => {
      medians[p] = calculateMedian(periodSignals[p].map(i => i.val));
    });

    // 3. Calculate Scores per asset per period, then average
    const results: FactorMetric[] = [];
    
    universe.forEach(sym => {
      let sumScores = 0;
      let validCount = 0;
      
      periods.forEach(p => {
        const item = periodSignals[p].find(i => i.sym === sym);
        if (item) {
          const score = scoreFn(item.val, medians[p]);
          sumScores += score;
          validCount++;
        }
      });
      
      if (validCount > 0) {
        results.push({ symbol: sym, score: sumScores / validCount });
      }
    });
    
    return results.sort((a, b) => b.score - a.score);
  };

  // 1. Momentum (Top 25)
  // Score = Signal - Median
  const momentum = calculateFactorScores(top25, getReturnSignal, (sig, med) => sig - med);

  // 2. Mean Reversion (Bottom 25)
  // Score = - (Signal - Median)
  const meanReversion = calculateFactorScores(cleanBottom25, getReturnSignal, (sig, med) => -(sig - med));

  // 3. Carry (All Assets)
  // Score = - (Signal - Median)
  const carry = calculateFactorScores(assets, getCarrySignal, (sig, med) => -(sig - med));

  return { momentum, meanReversion, carry };
};
