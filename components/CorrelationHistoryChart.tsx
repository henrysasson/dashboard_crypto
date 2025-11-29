import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CorrelationPoint } from '../types';

interface Props {
  data: CorrelationPoint[];
}

const CorrelationHistoryChart: React.FC<Props> = ({ data }) => {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#94a3b8', fontSize: 10 }} 
            minTickGap={30}
          />
          <YAxis 
            tick={{ fill: '#94a3b8', fontSize: 10 }} 
            domain={['auto', 'auto']} // usually 0 to 1
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
          />
          <Legend />
          <Line type="monotone" dataKey="corr10" name="10 Days" stroke="#ef4444" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="corr30" name="30 Days" stroke="#f59e0b" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="corr60" name="60 Days" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="corr90" name="90 Days" stroke="#10b981" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CorrelationHistoryChart;