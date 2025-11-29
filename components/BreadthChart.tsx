import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { BreadthPoint } from '../types';

interface Props {
  data: BreadthPoint[];
  type: 'SMA' | 'RHL';
}

const BreadthChart: React.FC<Props> = ({ data, type }) => {
  
  const getBands = () => {
    switch (type) {
      case 'SMA': return [20, 40, 60, 80];
      case 'RHL': return [30, 40, 60, 70];
    }
  };

  const bands = getBands();

  const formatDate = (dateStr: string) => {
    try {
      // Input is usually YYYY-MM-DD
      const date = new Date(dateStr);
      // Return MM/DD to save space
      return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 30, bottom: 25, left: 0 }}>
          <XAxis 
            dataKey="date" 
            tickFormatter={formatDate}
            tick={{ fill: '#94a3b8', fontSize: 10 }} 
            minTickGap={30}
            height={40}
          />
          <YAxis 
            tick={{ fill: '#94a3b8', fontSize: 10 }} 
            domain={[0, 100]}
            width={30}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
            formatter={(val: number) => val.toFixed(2)}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend verticalAlign="top" height={36} />
          
          {bands.map((y) => (
             <ReferenceLine key={y} y={y} stroke="#475569" strokeDasharray="3 3" strokeOpacity={0.5} />
          ))}

          {/* Ordered 20 -> 50 -> 100 so the Legend follows this sequence */}
          <Line type="monotone" dataKey="val20" name="20 Days" stroke="#ef4444" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="val50" name="50 Days" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="val100" name="100 Days" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BreadthChart;