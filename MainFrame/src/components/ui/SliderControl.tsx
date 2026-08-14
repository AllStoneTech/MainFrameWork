import type { ReactElement } from "react";
interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accentClassName?: string;
  onChange: (value: number) => void;
}

/**
 * Labeled range input with a value readout, wrapping the raw
 * `<input type="range">` styling previously inlined on the System Health
 * page (battery limit, fan curve, etc).
 */
export function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  accentClassName = "accent-primary",
  onChange,
}: SliderControlProps): ReactElement {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm text-gray-400">{label}</label>
        <span className="text-sm font-mono text-white">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-3 rounded-full appearance-none cursor-pointer border border-white/5 bg-[#111] hover:border-primary/30 transition-colors ${accentClassName}`}
      />
    </div>
  );
}
