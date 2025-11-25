import React, { useEffect, useState } from 'react';
import { 
  getFundingMetrics, 
  getVolatilityMetrics, 
  getVolumeMetrics,
  getCorrelationData
} from './services/binanceService';
import { 
  FundingMetric, 
  VolatilityMetric, 
  VolumeMetric, 
  CorrelationMatrix as MatrixType,
  CorrelationPoint 
} from './types';
import DashboardCard from './components/DashboardCard';
import FundingRateChart from './components/FundingRateChart';
import VolatilityGauge from './components/VolatilityGauge';
import CorrelationMatrix from './components/CorrelationMatrix';
import CorrelationHistoryChart from './components/CorrelationHistoryChart';
import VolumeMonitor from './components/VolumeMonitor';
import { Activity, RefreshCw, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [fundingData, setFundingData] = useState<FundingMetric[]>([]);
  const [volatilityData, setVolatilityData] = useState<VolatilityMetric[]>([]);
  const [volumeData, setVolumeData] = useState<VolumeMetric[]>([]);
  const [correlationMatrix, setCorrelationMatrix] = useState<MatrixType | null>(null);
  const [correlationHistory, setCorrelationHistory] = useState<CorrelationPoint[]>([]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Execute concurrently
      const [funding, vol, volm, corr] = await Promise.all([
        getFundingMetrics(),
        getVolatilityMetrics(),
        getVolumeMetrics(),
        getCorrelationData()
      ]);

      setFundingData(funding);
      setVolatilityData(vol);
      setVolumeData(volm);
      setCorrelationMatrix(corr.matrix);
      setCorrelationHistory(corr.history);
      
    } catch (e: any) {
      console.error(e);
      setError("Failed to fetch data from Binance. Please try again later or check your connection.");
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
          <p className="text-slate-400 mt-1 text-sm">Real-time behavior analytics for top crypto assets</p>
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
          
          {/* Row 1: Funding Rates (Full Width on Mobile/Tablet, 2 cols on Large) */}
          <DashboardCard 
            title="Annualized Funding Rate Percentiles" 
            description="Absolute annualized funding rate rank over last 90 days. Higher = More Extreme."
            className="col-span-1 md:col-span-2 xl:col-span-2 h-[400px]"
          >
            <FundingRateChart data={fundingData} />
          </DashboardCard>

          {/* Row 1: Volume Monitor (Side panel) */}
          <DashboardCard 
            title="Volume Anomalies" 
            description="7-day volume Z-Score vs 90-day baseline."
            className="col-span-1 h-[400px]"
          >
            <VolumeMonitor data={volumeData} />
          </DashboardCard>

          {/* Row 2: Volatility Regime (Full Width) */}
          <DashboardCard 
            title="Volatility Regime" 
            description="Current volatility rank (21-period EWMA) vs 180-day history."
            className="col-span-1 md:col-span-2 xl:col-span-3 min-h-[250px]"
          >
            <VolatilityGauge data={volatilityData} />
          </DashboardCard>

          {/* Row 3: Correlations */}
          <DashboardCard 
            title="BTC vs Alts Correlation History" 
            description="Rolling correlation between BTC and average Altcoin returns."
            className="col-span-1 md:col-span-2 xl:col-span-3 h-[400px]"
          >
            <CorrelationHistoryChart data={correlationHistory} />
          </DashboardCard>

          <DashboardCard 
            title="30-Day Correlation Matrix" 
            description="Correlation coefficients of daily returns."
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
          <p className="text-slate-300 animate-pulse">Fetching & Processing Market Data...</p>
          <p className="text-slate-500 text-sm mt-2">This involves heavy calculations for 180 days of history.</p>
        </div>
      )}
    </div>
  );
};

export default App;