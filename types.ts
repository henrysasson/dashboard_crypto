export interface AssetData {
  symbol: string;
  price: number;
}

export interface Kline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

export interface FundingRate {
  symbol: string;
  fundingRate: string;
  fundingTime: number;
}

export interface FundingMetric {
  symbol: string;
  currentRate: number;
  percentile: number; // 0-100
}

export interface VolatilityMetric {
  symbol: string;
  currentVol: number; // Annualized or period vol
  percentile: number; // Rank amongst last 180 days
}

export interface VolumeMetric {
  symbol: string;
  zScore: number;
  changeStatus: 'INCREASE' | 'DECREASE' | 'NEUTRAL';
  last7DayAvg: number;
  last90DayAvg: number;
}

export interface CorrelationMatrix {
  assets: string[];
  matrix: number[][]; // [i][j] is correlation between assets[i] and assets[j]
}

export interface CorrelationPoint {
  date: string; // ISO date
  corr10: number;
  corr30: number;
  corr60: number;
  corr90: number;
}

export interface FactorMetric {
  symbol: string;
  score: number; // The calculated factor score
}

export interface FactorData {
  momentum: FactorMetric[];
  meanReversion: FactorMetric[];
  carry: FactorMetric[];
}

export enum TimeFrame {
  D1 = '1d',
  H1 = '1h',
}

export const TARGET_ASSETS = [
  "BTC", "ETH", "SOL", "ADA", "AVAX", "DOT", "LINK", "NEAR", "XLM", 
  "APT", "SUI", "AAVE", "CRO", "XRP", "HBAR", "MNT", "TON", "WLFI", 
  "ZEC", "BNB", "ENA", "UNI", "TRX", "DOGE", "HYPE", "TAO", "ASTER", 
  "ICP", "PEPE", "ONDO", "ARB", "TRUMP", "PUMP", "VIRTUAL", "PENDLE", 
  "JUP", "RENDER", "MORPHO", "PENGU", "BONK", "ALGO", "XMR", "WLD", 
  "ATOM", "SHIB", "SKY", "TIA", "SEI", "SPX6900", "AERO"
];