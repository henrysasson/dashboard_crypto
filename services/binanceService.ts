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
  BreadthData,
  BreadthPoint,
  TARGET_ASSETS 
} from '../types';
import { 
  calculatePercentile, 
  calculateExponentialVol, 
  calculateZScore, 
  calculateCorrelation,
  calculateStdDev,
  calculateMedian,
  calculateMean,
  calculateEMA
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
    // Increased limit to 1000 to cover 500 days history + 100 days lookback buffer
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
export const getDashboardData = async () => {
  // Clear caches for new refresh
  klineCache = {};
  fundingCache = {};

  // 1. Fetch Klines (1000 days to cover 500d history + lookback)
  const klinePromises = TARGET_ASSETS.map(asset => fetchKlines(asset, '1d', 1000));
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

  // -- E. Factors --
  const factorData = processFactorMetrics(validAssets, klinesMap, fundingMap);

  // -- F. Breadth --
  const breadthData = processBreadthMetrics(validAssets, klinesMap);

  return {
    funding: fundingMetrics,
    volatility: volMetrics,
    volume: volMonitorMetrics,
    correlation: correlationData,
    factors: factorData,
    breadth: breadthData
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
  const btcKlines = map['BTC'];
  if (!btcKlines) return { matrix: { assets: [], matrix: [] }, history: [] };

  const btcReturns = btcKlines.slice(1).map(k => ({
    date: new Date(k.closeTime).toISOString().split('T')[0],
    ret: Math.log(parseFloat(k.close) / parseFloat(btcKlines[btcKlines.indexOf(k)-1].close))
  }));

  const last30Dates = btcReturns.slice(-30).map(d => d.date);
  
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

  const historyPoints: CorrelationPoint[] = [];
  const alts = matrixAssets.filter(a => a !== 'BTC');
  const daysToGraph = 90;

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
  // Volume universes logic
  const volumeMap: { symbol: string, vol: number }[] = [];
  assets.forEach(asset => {
    const klines = klinesMap[asset];
    if (!klines || klines.length < 30) return;
    const last30 = klines.slice(-30);
    const finVol = last30.reduce((acc, k) => acc + (parseFloat(k.close) * parseFloat(k.volume)), 0);
    volumeMap.push({ symbol: asset, vol: finVol });
  });
  volumeMap.sort((a, b) => b.vol - a.vol);
  
  const top25 = volumeMap.slice(0, 25).map(v => v.symbol);
  const bottom25 = volumeMap.slice(-25).map(v => v.symbol); 
  const cleanBottom25 = bottom25.filter(s => !top25.includes(s));

  // --- Signal Functions ---
  
  const getReturnSignal = (symbol: string, days: number): number | null => {
    const klines = klinesMap[symbol];
    if (!klines || klines.length < days + 1) return null;
    
    const slice = klines.slice(- (days + 1));
    const startPrice = parseFloat(slice[0].close);
    const endPrice = parseFloat(slice[slice.length - 1].close);
    const cumRet = (endPrice - startPrice) / startPrice;
    
    const rets = [];
    for(let i=1; i<slice.length; i++) {
      const p0 = parseFloat(slice[i-1].close);
      const p1 = parseFloat(slice[i].close);
      rets.push((p1 - p0) / p0);
    }
    const std = calculateStdDev(rets);
    return std === 0 ? 0 : cumRet / std;
  };

  const getCarrySignal = (symbol: string, days: number): number | null => {
    const rates = fundingMap[symbol];
    if (!rates || rates.length === 0) return null;
    const now = Date.now();
    const ms = days * 24 * 60 * 60 * 1000;
    const slice = rates.filter(r => (now - r.fundingTime) <= ms);
    if (slice.length < 3) return null; 
    const vals = slice.map(r => parseFloat(r.fundingRate));
    const mean = calculateMean(vals);
    const std = calculateStdDev(vals);
    return std === 0 ? 0 : mean / std;
  };

  // Trend Following: signal = 4 * (price - mean_price) / range_price
  // Smoothed by EMA(x/4)
  const getTrendScore = (symbol: string, days: number): number | null => {
    const klines = klinesMap[symbol];
    if (!klines || klines.length < days + 50) return null; // Need buffer for EMA warmup
    
    const smoothPeriod = Math.max(2, Math.floor(days / 4));
    
    // We need to calculate a series of raw signals to apply EMA
    // Let's calculate raw signal for the last 'days' periods to get a decent EMA
    const lookbackForEma = days * 2; 
    const signalSeries: number[] = [];

    // Calculate signal for t-lookback to t
    const totalKlines = klines.length;
    
    for (let i = 0; i < lookbackForEma; i++) {
      const cursor = totalKlines - lookbackForEma + i; // Current index
      // Window for max/min is [cursor - days + 1, cursor]
      const windowStart = cursor - days + 1;
      
      if (windowStart < 0) continue;

      const window = klines.slice(windowStart, cursor + 1);
      const prices = window.map(k => parseFloat(k.close));
      const currentPrice = prices[prices.length - 1];
      
      let max = -Infinity, min = Infinity;
      prices.forEach(p => {
        if(p > max) max = p;
        if(p < min) min = p;
      });
      
      const range = max - min;
      const mean = (max + min) / 2;
      
      let sig = 0;
      if (range > 0) {
        sig = 4 * (currentPrice - mean) / range;
      }
      signalSeries.push(sig);
    }

    if (signalSeries.length === 0) return 0;
    return calculateEMA(signalSeries, smoothPeriod);
  };


  const periods = [5, 10, 20];
  const trendPeriods = [5, 10, 20, 40];

  const calculateFactorScores = (
    universe: string[], 
    periods: number[],
    signalFn: (sym: string, d: number) => number | null,
    scoreFn: (signal: number, median: number) => number
  ): FactorMetric[] => {
    const periodSignals: Record<number, {val: number, sym: string}[]> = {};
    
    periods.forEach(p => {
      periodSignals[p] = [];
      universe.forEach(sym => {
        const s = signalFn(sym, p);
        if (s !== null) periodSignals[p].push({ val: s, sym });
      });
    });

    const medians: Record<number, number> = {};
    periods.forEach(p => {
      medians[p] = calculateMedian(periodSignals[p].map(i => i.val));
    });

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
      if (validCount > 0) results.push({ symbol: sym, score: sumScores / validCount });
    });
    
    return results.sort((a, b) => b.score - a.score);
  };

  const momentum = calculateFactorScores(top25, periods, getReturnSignal, (sig, med) => sig - med);
  const meanReversion = calculateFactorScores(cleanBottom25, periods, getReturnSignal, (sig, med) => -(sig - med));
  const carry = calculateFactorScores(assets, periods, getCarrySignal, (sig, med) => -(sig - med));
  
  // Trend Following (All assets, 5/10/20/40 days)
  // Logic: Score is just the signal (smoothed). Prompt doesn't specify subtracting median for Trend.
  // Standard Trend factors are usually directional, so we just take the smoothed signal.
  const trendFollowing = calculateFactorScores(assets, trendPeriods, getTrendScore, (sig, med) => sig);

  return { trendFollowing, momentum, meanReversion, carry };
};

const processBreadthMetrics = (assets: string[], klinesMap: Record<string, Kline[]>): BreadthData => {
  // We need to analyze the last 500 days.
  // First, find common dates (anchored by BTC)
  const btcKlines = klinesMap['BTC'];
  if (!btcKlines || btcKlines.length < 600) {
     return { aboveSma: [], rangePosition: [] }; 
  }

  const analysisHistory = 500;
  // Use closeTime to align
  const timeline = btcKlines.slice(-analysisHistory).map(k => k.closeTime);
  
  const aboveSma: BreadthPoint[] = [];
  const rangePosition: BreadthPoint[] = [];

  const periods = [20, 50, 100];
  
  // Pre-process assets to easier access
  // Map<Asset, Map<Time, {close, index}>>
  const assetData: Record<string, { close: number, time: number }[]> = {};
  assets.forEach(asset => {
    if (klinesMap[asset]) {
      assetData[asset] = klinesMap[asset].map(k => ({
        close: parseFloat(k.close),
        time: k.closeTime
      }));
    }
  });

  timeline.forEach(time => {
    const dateStr = new Date(time).toISOString().split('T')[0];
    
    // Accumulators for this specific date
    const countsAboveSma = { 20: 0, 50: 0, 100: 0 };
    const sumsRangePos = { 20: 0, 50: 0, 100: 0 };
    const countsValid = { 20: 0, 50: 0, 100: 0 }; // Denominator for each metric may vary if history insufficient
    
    // For this 'time', check each asset
    assets.forEach(asset => {
      const history = assetData[asset];
      if (!history) return;
      
      const idx = history.findIndex(h => h.time === time);
      if (idx === -1) return;

      const currentPrice = history[idx].close;

      periods.forEach(p => {
        if (idx < p) return; // Not enough history

        // 1. SMA
        const windowSlice = history.slice(idx - p + 1, idx + 1);
        const sum = windowSlice.reduce((a, b) => a + b.close, 0);
        const sma = sum / p;
        
        if (currentPrice > sma) countsAboveSma[p as 20|50|100]++;
        
        // 2. Range Position
        let max = -Infinity, min = Infinity;
        windowSlice.forEach(k => {
          if (k.close > max) max = k.close;
          if (k.close < min) min = k.close;
        });

        // RHL = max(price - min, 0) / (max - min)
        if (max > min) {
          const rhl = Math.max(currentPrice - min, 0) / (max - min);
          sumsRangePos[p as 20|50|100] += rhl;
          countsValid[p as 20|50|100]++;
        }
      });
    });

    // Compute Aggregates for date
    const activeCount = { 20: 0, 50: 0, 100: 0 };
    assets.forEach(a => {
      const h = assetData[a];
      if (h) {
         const idx = h.findIndex(x => x.time === time);
         if (idx >= 20) activeCount[20]++;
         if (idx >= 50) activeCount[50]++;
         if (idx >= 100) activeCount[100]++;
      }
    });

    const getPct = (val: number, p: 20|50|100) => activeCount[p] > 0 ? (val / activeCount[p]) * 100 : 0;
    const getAvg = (val: number, p: 20|50|100) => countsValid[p] > 0 ? (val / countsValid[p]) * 100 : 0; // 0-100 scale

    aboveSma.push({
      date: dateStr,
      val20: getPct(countsAboveSma[20], 20),
      val50: getPct(countsAboveSma[50], 50),
      val100: getPct(countsAboveSma[100], 100),
    });

    rangePosition.push({
      date: dateStr,
      val20: getAvg(sumsRangePos[20], 20),
      val50: getAvg(sumsRangePos[50], 50),
      val100: getAvg(sumsRangePos[100], 100),
    });
  });

  return { aboveSma, rangePosition };
};