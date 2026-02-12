import React from 'react';
import { MONTHS } from '../constants';

export const ValidationBadge: React.FC<{ total: number; target?: number }> = ({ total, target = 100 }) => {
  const ok = Math.abs(total - target) < 0.5;
  return (
    <div className={`px-[14px] py-[7px] rounded-md text-center font-semibold text-[12px] ${ok ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
      Total: {total}% {ok ? "✓" : `✗ Deve somar ${target}%`}
    </div>
  );
};

export const SparkBar: React.FC<{ values: number[]; color?: string; h?: number }> = ({ values, color = "#6366f1", h = 32 }) => {
  const mx = Math.max(...values, 0.001);
  return (
    <div className="flex items-end gap-[2px]" style={{ height: h }}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-[2px] transition-[height] duration-300 ease-out"
          style={{
            background: color,
            height: `${Math.max((v / mx) * 100, 3)}%`,
            opacity: 0.6 + 0.4 * (v / mx)
          }}
        />
      ))}
    </div>
  );
};

interface HeatMapProps {
  data: number[][];
  labels: string[];
  totals?: number[];
}

export const HeatMap: React.FC<HeatMapProps> = ({ data, labels, totals }) => {
  if (!data || !data.length) return null;
  const allV = data.flat().filter(v => v > 0);
  const mx = Math.max(...allV, 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-[11px]">
        <thead>
          <tr>
            <th className="text-left py-1 px-2 text-slate-500 font-medium min-w-[120px]">Cluster</th>
            {MONTHS.map(m => <th key={m} className="py-1 px-1 text-slate-500 font-medium w-[42px]">{m}</th>)}
            <th className="py-1 px-2 text-slate-400 font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const t = row.reduce((a, b) => a + b, 0);
            return (
              <tr key={i}>
                <td className="py-1 px-2 font-semibold text-slate-200">{labels[i]}</td>
                {row.map((v, j) => {
                  const int = v / mx;
                  return (
                    <td key={j} className="py-[5px] px-1 text-center font-semibold rounded-[4px]"
                      style={{
                        background: v > 0 ? `rgba(99,102,241,${0.12 + int * 0.6})` : "transparent",
                        color: v > 0 ? (int > 0.5 ? "#fff" : "#c7d2fe") : "#334155"
                      }}>
                      {v > 0 ? Math.round(v) : "–"}
                    </td>
                  );
                })}
                <td className="py-1 px-2 text-center font-extrabold text-indigo-300">{Math.round(t)}</td>
              </tr>
            );
          })}
          {totals && (
            <tr className="border-t-2 border-slate-700">
              <td className="py-[6px] px-2 font-bold text-slate-400">TOTAL</td>
              {totals.map((t, i) => (
                <td key={i} className="py-[5px] px-1 text-center font-extrabold text-indigo-500 bg-indigo-500/10 rounded-[4px]">{Math.round(t)}</td>
              ))}
              <td className="py-1 px-2 text-center font-black text-indigo-500 text-[13px]">
                {Math.round(totals.reduce((a, b) => a + b, 0))}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};