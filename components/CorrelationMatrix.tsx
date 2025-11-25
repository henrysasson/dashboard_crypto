import React from 'react';
import { CorrelationMatrix as MatrixType } from '../types';

interface Props {
  data: MatrixType;
}

const CorrelationMatrix: React.FC<Props> = ({ data }) => {
  if (!data.assets.length) return <div>No data available</div>;

  // We might have too many assets for a full grid on small screens.
  // Let's make it scrollable.
  
  const getColor = (val: number) => {
    // 1 -> Blue/White
    // 0 -> Transparent/Slate
    // -1 -> Red
    // Simplified for crypto (usually positive correlation):
    // 0.8-1.0: High (Bright Blue)
    // 0.5-0.8: Med (Blue)
    // < 0.5: Low (Dark)
    
    if (val === 1) return 'bg-blue-500 text-white';
    if (val > 0.8) return 'bg-blue-600 text-blue-50';
    if (val > 0.6) return 'bg-blue-800/80 text-blue-200';
    if (val > 0.4) return 'bg-blue-900/50 text-slate-400';
    if (val < 0) return 'bg-red-900/30 text-red-300';
    return 'bg-slate-900 text-slate-600';
  };

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-20 bg-slate-950 p-2 border-b border-slate-800"></th>
            {data.assets.map(asset => (
              <th key={asset} className="sticky top-0 z-10 bg-slate-950 p-2 border-b border-slate-800 min-w-[40px]">
                {asset}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.assets.map((rowAsset, i) => (
            <tr key={rowAsset}>
              <td className="sticky left-0 z-10 bg-slate-950 p-2 font-bold border-r border-slate-800">
                {rowAsset}
              </td>
              {data.matrix[i].map((val, j) => (
                <td 
                  key={`${rowAsset}-${j}`} 
                  className={`text-center p-1 border border-slate-800/50 ${getColor(val)}`}
                  title={`${rowAsset} vs ${data.assets[j]}: ${val.toFixed(2)}`}
                >
                  {val.toFixed(1)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CorrelationMatrix;