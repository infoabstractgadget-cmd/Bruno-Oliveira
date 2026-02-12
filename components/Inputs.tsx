import React from 'react';

interface NumProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  w?: number | string;
}

export const NumInput: React.FC<NumProps> = ({ value, onChange, min = 0, max, step = 1, suffix = "", w = "72px" }) => {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: w }}
        className="px-2 py-[7px] bg-slate-800 border border-slate-700 rounded-md text-slate-200 text-[13px] text-right outline-none focus:border-indigo-500 transition-colors"
      />
      {suffix && <span className="text-slate-500 text-[11px]">{suffix}</span>}
    </div>
  );
};

function fmtE(n: number) { return (n || 0).toLocaleString("pt-PT") + " €" }

interface SliderProps {
  value: number;
  onChange: (val: number) => void;
  color?: string;
  label: string;
  sub?: string;
  amount?: number;
}

export const Slider: React.FC<SliderProps> = ({ value, onChange, color = "#6366f1", label, sub, amount }) => {
  return (
    <div className="mb-[14px]">
      <div className="flex justify-between items-baseline mb-1">
        <div>
          <span className="text-[13px] font-semibold" style={{ color }}>{label}</span>
          {sub && <span className="text-[11px] text-slate-500 ml-2">{sub}</span>}
        </div>
        <div className="flex items-baseline gap-2">
          {amount !== undefined && <span className="text-[11px] text-slate-500">{fmtE(amount)}</span>}
          <span className="text-[14px] font-bold text-slate-200">{value}%</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: color }}
      />
    </div>
  );
};