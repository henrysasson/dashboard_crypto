import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { FundingMetric } from '../types';

interface Props {
  data: FundingMetric[];
}

const FundingRateChart: React.FC<Props> = ({ data }) => {
  // Sort by percentile descending
  const sortedData = [...data].sort((a, b) => b.percentile - a.percentile);

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sortedData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
          <XAxis 
            dataKey="symbol" 
            tick={{ fill: '#94a3b8', fontSize: 10 }} 
            interval={0}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis 
            tick={{ fill: '#94a3b8', fontSize: 10 }} 
            domain={[0, 100]} 
            label={{ value: 'Percentile', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
            cursor={{fill: '#334155', opacity: 0.2}}
            formatter={(value: number, name: string, props: any) => {
              if (name === 'percentile') return [`${value.toFixed(1)}th`, 'Percentile'];
              return [value, name];
            }}
            labelFormatter={(label) => {
              const item = sortedData.find(i => i.symbol === label);
              return `${label} (APY: ${(parseFloat(item?.currentRate?.toString() || '0') * 100).toFixed(2)}%)`;
            }}
          />
          <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="3 3" />
          <ReferenceLine y={50} stroke="#64748b" strokeDasharray="3 3" />
          <Bar dataKey="percentile" radius={[4, 4, 0, 0]}>
            {sortedData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.percentile > 90 ? '#ef4444' : entry.percentile > 75 ? '#f59e0b' : '#3b82f6'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default FundingRateChart;