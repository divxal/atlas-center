import { StatCard } from "./StatCard";
import { WireframeGlobe } from "./WireframeGlobe";
import "../styles/NetworkPanel.css";

interface NetStats { rx_mb_s: number; tx_mb_s: number; rx_total_mb: number; tx_total_mb: number }
interface NetConn  { remote_ip: string; port: number; lat: number; lng: number }

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, label, value }: { data: number[]; label: string; value: string }) {
  const max = Math.max(...data, 0.01);
  const W = 200; const H = 44;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * (H - 2) - 1;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="sparkline-wrap">
      <div className="sparkline-header">
        <span className="sparkline-label">{label}</span>
        <span className="sparkline-value">{value}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="sparkline-svg">
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,${H} ${pts} ${W},${H}`}
          fill={`url(#grad-${label})`}
        />
        <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ── Globo 3D ──────────────────────────────────────────────────────────────────

// ── Panel completo ────────────────────────────────────────────────────────────

interface Props {
  stats: NetStats | null;
  rxHistory: number[];
  txHistory: number[];
  connections: NetConn[];
}

export function NetworkPanel({ stats, rxHistory, txHistory, connections }: Props) {
  const fmt = (v: number) => v < 1 ? `${(v * 1024).toFixed(0)} KB/s` : `${v.toFixed(2)} MB/s`;

  return (
    <div className="net-panel">
      <div className="net-graphs">
        <StatCard label="Red · Wi-Fi">
          <Sparkline data={rxHistory} label="BAJADA" value={fmt(stats?.rx_mb_s ?? 0)} />
          <Sparkline data={txHistory} label="SUBIDA" value={fmt(stats?.tx_mb_s ?? 0)} />
          <div className="net-totals">
            <span>RX {stats?.rx_total_mb.toFixed(0) ?? "—"} MB</span>
            <span>TX {stats?.tx_total_mb.toFixed(0) ?? "—"} MB</span>
          </div>
        </StatCard>

        <StatCard label={`Conexiones · ${connections.length}`}>
          <div className="conn-list">
            {connections.slice(0, 8).map((c, i) => (
              <div key={i} className="conn-row">
                <span className="conn-dot" />
                <span className="conn-ip">{c.remote_ip}</span>
                <span className="conn-port">:{c.port}</span>
              </div>
            ))}
            {connections.length === 0 && <span className="no-conn">Sin conexiones externas</span>}
          </div>
        </StatCard>
      </div>

      <div className="globe-wrap">
        <WireframeGlobe connections={connections} />
      </div>
    </div>
  );
}
