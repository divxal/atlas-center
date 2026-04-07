import { useEffect, useRef } from "react";
import "../styles/SliderControl.css";

interface Props {
  value: number;
  onChange: (v: number) => void;
  icon: string;
  label: string;
  suffix?: string;
}

export function SliderControl({ value, onChange, icon, label, suffix = "%" }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.setProperty("--val", `${value}%`);
    }
  }, [value]);

  return (
    <div className="slider-control">
      <div className="slider-header">
        <span className="slider-icon">{icon}</span>
        <span className="slider-label">{label}</span>
        <span className="slider-value">{value}{suffix}</span>
      </div>
      <input
        ref={ref}
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-input"
        style={{ "--val": `${value}%` } as React.CSSProperties}
      />
    </div>
  );
}
