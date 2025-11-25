import React from 'react';

interface Props {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const DashboardCard: React.FC<Props> = ({ title, description, children, className = "" }) => {
  return (
    <div className={`bg-slate-950 border border-slate-800 rounded-lg shadow-lg overflow-hidden flex flex-col ${className}`}>
      <div className="p-4 border-b border-slate-800 bg-slate-900/50">
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
      </div>
      <div className="p-4 flex-1 min-h-0 relative">
        {children}
      </div>
    </div>
  );
};

export default DashboardCard;