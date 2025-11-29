import React from 'react';
import { VolumeMetric } from '../types';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface Props {
  data: VolumeMetric[];
}

const VolumeMonitor: React.FC<Props> = ({ data }) => {
  // Sort by absolute Z-score to show most significant moves first
  const sortedData = [...data].sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  const formatVol = (val: number) => {
    if (val > 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val > 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toFixed(0);
  };

  return (
    <div className="overflow-y-auto max-h-[400px]">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-900 text-xs text-slate-400 uppercase sticky top-0">
          <tr>
            <th className="p-3">Asset</th>
            <th className="p-3">Status</th>
            <th className="p-3 text-right">Z-Score</th>
            <th className="p-3 text-right">7d Avg Vol</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {sortedData.map((item) => {
            let statusColor = 'text-slate-400';
            let Icon = Minus;
            
            if (item.changeStatus === 'INCREASE') {
              statusColor = 'text-green-400';
              Icon = ArrowUpRight;
            } else if (item.changeStatus === 'DECREASE') {
              statusColor = 'text-red-400';
              Icon = ArrowDownRight;
            }

            return (
              <tr key={item.symbol} className="hover:bg-slate-900/50 transition-colors">
                <td className="p-3 font-medium text-slate-200">{item.symbol}</td>
                <td className="p-3">
                  <div className={`flex items-center gap-1 text-sm ${statusColor}`}>
                    <Icon size={16} />
                    <span>{item.changeStatus}</span>
                  </div>
                </td>
                <td className={`p-3 text-right font-mono text-sm ${Math.abs(item.zScore) > 2 ? 'font-bold' : ''}`}>
                  {item.zScore.toFixed(2)}
                </td>
                <td className="p-3 text-right text-sm text-slate-400">
                  {formatVol(item.last7DayAvg)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default VolumeMonitor;