import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { FactorMetric } from '../types';

interface Props {
  data: FactorMetric[];
  title?: string;
}

const FactorBarChart: React.FC<Props> = ({ data }) => {
  // Show top 10 positive and top 10 negative? Or just list all?
  // Dashboard space is limited. Let's show top 10 and bottom 10 or just top 15 significant.
  // Actually, horizontal scroll is okay if list is long, but let's stick to showing the whole list if possible, or limit to top 20.
  // Let's sort by score and show all, scrollable.
  
  const sorted = [...data].sort((a, b) => b.score - a.score);
  
  // Determine height based on count
  const height = Math.max(300, sorted.length * 25);

  return (
    <div className="w-full h-full overflow-y-auto pr-2">
      <div style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            layout="vertical" 
            data={sorted} 
            margin={{ top: 5, right: 30, bottom: 5, left: 40 }}
          >
            <XAxis type="number" hide />
            <YAxis 
              dataKey="symbol" 
              type="category" 
              width={40} 
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              interval={0}
            />
            <Tooltip 
              cursor={{fill: '#334155', opacity: 0.1}}
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
              formatter={(value: number) => [value.toFixed(4), 'Score']}
            />
            <ReferenceLine x={0} stroke="#475569" />
            <Bar dataKey="score" barSize={15}>
              {sorted.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.score >= 0 ? '#3b82f6' : '#ef4444'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FactorBarChart;
