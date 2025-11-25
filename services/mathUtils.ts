/**
 * Calculates the Pearson correlation coefficient between two arrays of numbers.
 */
export const calculateCorrelation = (x: number[], y: number[]): number => {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
};

/**
 * Calculates percentile of a value within a dataset.
 * For Funding Rate: we compare absolute values.
 */
export const calculatePercentile = (data: number[], value: number, absolute: boolean = false): number => {
  if (data.length === 0) return 0;
  
  const processedData = absolute ? data.map(Math.abs) : [...data];
  const processedValue = absolute ? Math.abs(value) : value;

  processedData.sort((a, b) => a - b);
  
  // Find index where value fits
  let index = processedData.findIndex(v => v >= processedValue);
  if (index === -1) index = processedData.length;

  return (index / processedData.length) * 100;
};

/**
 * Standard Deviation
 */
export const calculateStdDev = (data: number[]): number => {
  if (data.length === 0) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
  return Math.sqrt(variance);
};

/**
 * Weighted Standard Deviation using Exponential Weights
 * Weights decay as we go back in time.
 */
export const calculateExponentialVol = (returns: number[], windowSize: number): number => {
  // We need at least windowSize elements
  if (returns.length < windowSize) return 0;

  // Slice the last 'windowSize' elements
  const windowReturns = returns.slice(-windowSize);
  
  // Create weights: w_t = alpha * (1-alpha)^t 
  // Or simpler normalized exponential weights
  const weights: number[] = [];
  const decay = 0.94; // Standard RiskMetrics decay, or arbitrary based on "exponential weights" request
  let weightSum = 0;

  for (let i = 0; i < windowSize; i++) {
    const w = Math.pow(decay, i); // i=0 is most recent
    weights.push(w);
    weightSum += w;
  }
  
  // Normalize weights so they sum to 1
  const normWeights = weights.map(w => w / weightSum);
  // Reverse to match array order (if array is [oldest ... newest], we want newest to have highest weight)
  // Actually, let's process windowReturns as [newest ... oldest] for the loop or adjust index.
  // Assuming windowReturns is [oldest ... newest].
  // We want the last element (newest) to have weight Math.pow(decay, 0).
  
  const mean = windowReturns.reduce((acc, val) => acc + val, 0) / windowSize; // Simple mean for centering, or weighted mean.
  // Often Vol is calculated assuming mean return is 0 for short horizons, but let's use weighted variance formula around simple mean.
  
  let weightedVariance = 0;
  // Iterate from end (newest) to start
  for (let i = 0; i < windowSize; i++) {
    const val = windowReturns[windowSize - 1 - i]; // Newest first
    const w = normWeights[i]; // Highest weight first
    weightedVariance += w * Math.pow(val - mean, 2);
  }

  return Math.sqrt(weightedVariance);
};

/**
 * Z-Score
 */
export const calculateZScore = (value: number, history: number[]): number => {
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const std = calculateStdDev(history);
  if (std === 0) return 0;
  return (value - mean) / std;
};

/**
 * Calculate Median of an array
 */
export const calculateMedian = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

/**
 * Calculate simple mean
 */
export const calculateMean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};
