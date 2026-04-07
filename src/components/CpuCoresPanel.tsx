import { StatCard } from "./StatCard";
import "../styles/CpuCores.css";

interface CoreInfo { id: number; freq_mhz: number; max_mhz: number }

export function CpuCoresPanel({ cores }: { cores: CoreInfo[] }) {
  return (
    <StatCard label="Cores CPU · i7-13650HX">
      <div className="cores-grid">
        {cores.map((c) => {
          const pct = c.max_mhz > 0 ? (c.freq_mhz / c.max_mhz) * 100 : 0;
          const ghz = (c.freq_mhz / 1000).toFixed(2);
          return (
            <div key={c.id} className="core-item">
              <span className="core-id">C{c.id}</span>
              <div className="core-bar-track">
                <div className="core-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="core-freq">{ghz}</span>
            </div>
          );
        })}
      </div>
    </StatCard>
  );
}
