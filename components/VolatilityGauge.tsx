import React from 'react';
import { VolatilityMetric } from '../types';

interface Props {
  data: VolatilityMetric[];
}

const VolatilityGauge: React.FC<Props> = ({ data }) => {
  // Sort by percentile
  const sortedData = [...data].sort((a, b) => b.percentile - a.percentile);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto pr-2">
      {sortedData.map((item) => {
        const p = item.percentile;
        let colorClass = 'bg-blue-500';
        let textClass = 'text-blue-400';
        
        if (p > 90) { colorClass = 'bg-red-500'; textClass = 'text-red-400'; }
        else if (p > 70) { colorClass = 'bg-orange-500'; textClass = 'text-orange-400'; }
        else if (p < 20) { colorClass = 'bg-green-500'; textClass = 'text-green-400'; }

        return (
          <div key={item.symbol} className="bg-slate-900 border border-slate-800 rounded p-3 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-sm">{item.symbol}</span>
              <span className={`text-xs font-mono ${textClass}`}>{p.toFixed(0)}%</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full ${colorClass} transition-all duration-500`} 
                style={{ width: `${p}%` }}
              ></div>
            </div>
            
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span>Low Vol</span>
              <span>High Vol</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default VolatilityGauge;