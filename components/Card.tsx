import React from 'react';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  accent?: string;
  sub?: string;
  right?: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ title, children, accent = "#6366f1", sub, right, className = "" }) => {
  return (
    <div className={`bg-slate-900 rounded-[14px] px-6 py-5 border border-slate-800 relative overflow-hidden ${className}`}>
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} />
      {(title || right) && (
        <div className={`flex justify-between items-center ${sub ? 'mb-1' : 'mb-[14px]'}`}>
          {title && (
            <h3 className="m-0 text-[13px] font-bold text-slate-400 uppercase tracking-widest">
              {title}
            </h3>
          )}
          {right}
        </div>
      )}
      {sub && <div className="text-[11px] text-slate-500 mb-[14px]">{sub}</div>}
      {children}
    </div>
  );
};