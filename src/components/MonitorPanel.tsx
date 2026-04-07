import { StatCard } from "./StatCard";
import "../styles/MonitorPanel.css";

interface ExtTemps { nvme_c: number; ram_c: number; wifi_c: number }
interface DiskStats { used_gb: number; total_gb: number; percent: number; read_mb_s: number; write_mb_s: number }

function TempBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value > 80 ? "rgba(255,255,255,0.9)" : value > 60 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)";
  return (
    <div className="temp-row">
      <span className="temp-label">{label}</span>
      <div className="temp-bar-track">
        <div className="temp-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="temp-value">{value.toFixed(0)}°C</span>
    </div>
  );
}

export function ExtTempsPanel({ temps }: { temps: ExtTemps | null }) {
  return (
    <StatCard label="Temperaturas">
      <div className="temp-list">
        <TempBar label="NVMe"    value={temps?.nvme_c ?? 0} max={84} />
        <TempBar label="RAM"     value={temps?.ram_c  ?? 0} max={85} />
        <TempBar label="Wi-Fi"   value={temps?.wifi_c ?? 0} max={80} />
      </div>
    </StatCard>
  );
}

export function DiskPanel({ disk }: { disk: DiskStats | null }) {
  const pct = disk?.percent ?? 0;
  return (
    <StatCard label="Almacenamiento · NVMe 1TB">
      <div className="disk-ring-row">
        <svg width={80} height={80} viewBox="0 0 80 80">
          <circle cx={40} cy={40} r={32} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={7} />
          <circle
            cx={40} cy={40} r={32}
            fill="none"
            stroke="#ffffff"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 32}`}
            strokeDashoffset={`${2 * Math.PI * 32 * (1 - pct / 100)}`}
            transform="rotate(-90 40 40)"
          />
          <text x={40} y={44} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={600} fontFamily="Inter,sans-serif">
            {pct.toFixed(0)}%
          </text>
        </svg>
        <div className="disk-details">
          <div className="stat-detail"><span>Usado</span><strong>{disk?.used_gb.toFixed(0) ?? "—"} GB</strong></div>
          <div className="stat-detail"><span>Total</span><strong>{disk?.total_gb.toFixed(0) ?? "—"} GB</strong></div>
          <div className="stat-detail"><span>Lectura</span><strong>{disk?.read_mb_s.toFixed(1) ?? "—"} MB/s</strong></div>
          <div className="stat-detail"><span>Escritura</span><strong>{disk?.write_mb_s.toFixed(1) ?? "—"} MB/s</strong></div>
        </div>
      </div>
    </StatCard>
  );
}
