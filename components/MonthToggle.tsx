import React from 'react';
import { MONTHS } from '../constants';

interface MonthToggleProps {
  active: number[];
  onChange: (index: number) => void;
  focusMonths: number[];
  onFocusToggle: (index: number) => void;
}

export const MonthToggle: React.FC<MonthToggleProps> = ({ active, onChange, focusMonths, onFocusToggle }) => {
  return (
    <div className="grid grid-cols-12 gap-[3px]">
      {MONTHS.map((m, i) => {
        const isActive = !!active[i];
        const isFocus = focusMonths.includes(i);
        return (
          <div key={i} className="text-center">
            <button
              onClick={() => onChange(i)}
              className={`w-full py-[6px] border-2 rounded-md text-[11px] font-semibold transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                  : 'border-slate-700 bg-transparent text-slate-600'
              }`}
            >
              {m}
            </button>
            {isActive && (
              <button
                onClick={() => onFocusToggle(i)}
                className={`mt-[3px] w-full py-[3px] border-none rounded-[4px] text-[9px] font-bold cursor-pointer transition-all duration-200 ${
                  isFocus
                    ? 'bg-amber-500 text-black'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {isFocus ? "★ Pico" : "Pico?"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};