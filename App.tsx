import React, { useEffect, useState } from 'react';
import { 
  getDashboardData
} from './services/binanceService';
import { 
  FundingMetric, 
  VolatilityMetric, 
  VolumeMetric, 
  CorrelationMatrix as MatrixType,
  CorrelationPoint,
  FactorData
} from './types';
import DashboardCard from './components/DashboardCard';
import FundingRateChart from './components/FundingRateChart';
import VolatilityGauge from './components/VolatilityGauge';
import CorrelationMatrix from './components/CorrelationMatrix';
import CorrelationHistoryChart from './components/CorrelationHistoryChart';
import VolumeMonitor from './components/VolumeMonitor';
import FactorBarChart from './components/FactorBarChart';
import { Activity, RefreshCw, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [fundingData, setFundingData] = useState<FundingMetric[]>([]);
  const [volatilityData, setVolatilityData] = useState<VolatilityMetric[]>([]);
  const [volumeData, setVolumeData] = useState<VolumeMetric[]>([]);
  const [correlationMatrix, setCorrelationMatrix] = useState<MatrixType | null>(null);
  const [correlationHistory, setCorrelationHistory] = useState<CorrelationPoint[]>([]);
  const [factorData, setFactorData] = useState<FactorData | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardData();

      setFundingData(data.funding);
      setVolatilityData(data.volatility);
      setVolumeData(data.volume);
      setCorrelationMatrix(data.correlation.matrix);
      setCorrelationHistory(data.correlation.history);
      setFactorData(data.factors);
      
    } catch (e: any) {
      console.error(e);
      setError("Failed to fetch data from Binance. Some assets may be invalid or rate limit reached.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-3">
            <Activity className="text-blue-500" />
            CryptoQuant Monitor
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Real-time behavior analytics & Multi-Factor Scores</p>
        </div>
        <button 
          onClick={fetchData} 
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-md transition-all disabled:opacity-50 text-sm font-medium border border-slate-700"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Analyzing...' : 'Refresh Data'}
        </button>
      </header>

      {/* Error Message */}
      {error && (
        <div className="mb-8 p-4 bg-red-900/20 border border-red-800 rounded-lg flex items-center gap-3 text-red-300">
          <AlertCircle />
          <p>{error}</p>
        </div>
      )}

      {/* Grid Layout */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          
          {/* Row 1: Factor Scores (New) */}
          <DashboardCard 
            title="Momentum" 
            description="Top 25 Liquidity. High = Uptrend."
            className="col-span-1 h-[400px]"
          >
            {factorData && <FactorBarChart data={factorData.momentum} />}
          </DashboardCard>

          <DashboardCard 
            title="Mean Reversion" 
            description="Bottom 25 Liquidity. High = Reversal Buy."
            className="col-span-1 h-[400px]"
          >
            {factorData && <FactorBarChart data={factorData.meanReversion} />}
          </DashboardCard>

          <DashboardCard 
            title="Carry" 
            description="Cross-Sectional Carry. High = Favorable Long."
            className="col-span-1 h-[400px]"
          >
            {factorData && <FactorBarChart data={factorData.carry} />}
          </DashboardCard>


          {/* Row 2: Funding Rates & Volume */}
          <DashboardCard 
            title="Annualized Funding Rate Percentiles" 
            description="Absolute annualized funding rate rank (90d)."
            className="col-span-1 md:col-span-2 xl:col-span-2 h-[400px]"
          >
            <FundingRateChart data={fundingData} />
          </DashboardCard>

          <DashboardCard 
            title="Volume Anomalies" 
            description="7-day volume Z-Score vs 90-day baseline."
            className="col-span-1 h-[400px]"
          >
            <VolumeMonitor data={volumeData} />
          </DashboardCard>

          {/* Row 3: Volatility */}
          <DashboardCard 
            title="Volatility Regime" 
            description="Current Volatility (21d EWMA) Rank vs 180d History."
            className="col-span-1 md:col-span-2 xl:col-span-3 min-h-[250px]"
          >
            <VolatilityGauge data={volatilityData} />
          </DashboardCard>

          {/* Row 4: Correlations */}
          <DashboardCard 
            title="BTC vs Alts Correlation History" 
            description="Rolling correlation (BTC vs Avg Alts)."
            className="col-span-1 md:col-span-2 xl:col-span-3 h-[400px]"
          >
            <CorrelationHistoryChart data={correlationHistory} />
          </DashboardCard>

          <DashboardCard 
            title="30-Day Correlation Matrix" 
            description="Pairwise correlation of daily returns."
            className="col-span-1 md:col-span-2 xl:col-span-3 h-[500px]"
          >
            {correlationMatrix && <CorrelationMatrix data={correlationMatrix} />}
          </DashboardCard>

        </div>
      )}

      {/* Loading State Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-slate-300 animate-pulse">Processing Market Data...</p>
          <p className="text-slate-500 text-sm mt-2">Analyzing 300 days of history for {factorData ? '50+' : 'selected'} assets.</p>
        </div>
      )}
    </div>
  );
};

export default App;