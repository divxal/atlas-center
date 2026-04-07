import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StatCard } from "./StatCard";
import { ArcGauge } from "./ArcGauge";
import { SliderControl } from "./SliderControl";
import { CpuCoresPanel } from "./CpuCoresPanel";
import { ExtTempsPanel, DiskPanel } from "./MonitorPanel";
import { NetworkPanel } from "./NetworkPanel";
import { TabNav, Tab } from "./TabNav";
import { FacePanel } from "./FacePanel";
import "../styles/Dashboard.css";

interface CpuStats    { usage: number; temp: number }
interface RamStats    { used_gb: number; total_gb: number; percent: number; speed_mt: number }
interface GpuStats    { temp: number; power_w: number; gpu_util: number; vram_used_mb: number; vram_total_mb: number }
interface VolumeInfo  { percent: number; muted: boolean }
interface BrightnessInfo { percent: number }
interface KeyboardLeds   { capslock: boolean; numlock: boolean; scrolllock: boolean }
interface CoreInfo    { id: number; freq_mhz: number; max_mhz: number }
interface ExtTemps    { nvme_c: number; ram_c: number; wifi_c: number }
interface DiskStats   { used_gb: number; total_gb: number; percent: number; read_mb_s: number; write_mb_s: number }
interface NetStats    { rx_mb_s: number; tx_mb_s: number; rx_total_mb: number; tx_total_mb: number }
interface NetConn     { remote_ip: string; port: number; lat: number; lng: number }

const HISTORY_LEN = 60;

export function Dashboard() {
  const [tab, setTab]         = useState<Tab>("sys");
  const [cpu, setCpu]         = useState<CpuStats | null>(null);
  const [ram, setRam]         = useState<RamStats | null>(null);
  const [gpu, setGpu]         = useState<GpuStats | null>(null);
  const [vol, setVol]         = useState<VolumeInfo | null>(null);
  const [bright, setBright]   = useState<BrightnessInfo | null>(null);
  const [leds, setLeds]       = useState<KeyboardLeds | null>(null);
  const [cores, setCores]     = useState<CoreInfo[]>([]);
  const [temps, setTemps]     = useState<ExtTemps | null>(null);
  const [disk, setDisk]       = useState<DiskStats | null>(null);
  const [net, setNet]         = useState<NetStats | null>(null);
  const [conns, setConns]     = useState<NetConn[]>([]);
  const [rxHist, setRxHist]   = useState<number[]>(Array(HISTORY_LEN).fill(0));
  const [txHist, setTxHist]   = useState<number[]>(Array(HISTORY_LEN).fill(0));

  const volPending    = useRef(false);
  const brightPending = useRef(false);

  const refresh = useCallback(async () => {
    const s = await invoke<{
      cpu: CpuStats; ram: RamStats; gpu: GpuStats;
      cores: CoreInfo[]; temps: ExtTemps; disk: DiskStats;
      net: NetStats; conns: NetConn[];
      vol: VolumeInfo; bright: BrightnessInfo; leds: KeyboardLeds;
    }>("get_all_stats");

    setCpu(s.cpu); setRam(s.ram); setGpu(s.gpu);
    if (!volPending.current)    setVol(s.vol);
    if (!brightPending.current) setBright(s.bright);
    setLeds(s.leds); setCores(s.cores); setTemps(s.temps);
    setDisk(s.disk); setNet(s.net); setConns(s.conns);
    setRxHist(h => [...h.slice(1), s.net.rx_mb_s]);
    setTxHist(h => [...h.slice(1), s.net.tx_mb_s]);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, [refresh]);

  const handleVolume = async (v: number) => {
    volPending.current = true;
    setVol(prev => prev ? { ...prev, percent: v } : null);
    await invoke("set_volume", { percent: v });
    volPending.current = false;
  };
  const handleMute = async () => {
    await invoke("toggle_mute");
    setVol(await invoke<VolumeInfo>("get_volume"));
  };
  const handleBrightness = async (v: number) => {
    brightPending.current = true;
    setBright({ percent: v });
    await invoke("set_brightness", { percent: v });
    brightPending.current = false;
  };
  const handleLed = async (device: string, value: boolean) => {
    setLeds(prev => prev ? { ...prev, [dKey(device)]: value } : null);
    await invoke("set_keyboard_led", { device, value });
  };
  const dKey = (d: string) =>
    d.includes("capslock") ? "capslock" : d.includes("numlock") ? "numlock" : "scrolllock";

  return (
    <div className="dashboard-root">
      <TabNav active={tab} onChange={setTab} />

      <div className="tab-content">

        {/* ── SYS ── */}
        {tab === "sys" && (
          <div className="dashboard">
            <StatCard label="CPU · i7-13650HX">
              <div className="gauge-row">
                <ArcGauge value={cpu?.usage ?? 0} size={90} />
                <div className="stat-details">
                  <div className="stat-detail"><span>Uso</span><strong>{cpu?.usage.toFixed(1) ?? "—"}%</strong></div>
                  <div className="stat-detail"><span>Temp</span><strong>{cpu?.temp.toFixed(0) ?? "—"}°C</strong></div>
                  <div className="stat-detail"><span>Cores</span><strong>20</strong></div>
                </div>
              </div>
            </StatCard>

            <StatCard label="RAM">
              <div className="gauge-row">
                <ArcGauge value={ram?.percent ?? 0} size={90} />
                <div className="stat-details">
                  <div className="stat-detail"><span>Usado</span><strong>{ram?.used_gb.toFixed(1) ?? "—"} GB</strong></div>
                  <div className="stat-detail"><span>Total</span><strong>{ram?.total_gb.toFixed(0) ?? "—"} GB</strong></div>
                  <div className="stat-detail"><span>Frec.</span><strong>{ram?.speed_mt ?? "—"} MT/s</strong></div>
                </div>
              </div>
            </StatCard>

            <StatCard label="GPU · RTX 4060">
              <div className="gauge-row">
                <ArcGauge value={gpu?.gpu_util ?? 0} size={90} />
                <div className="stat-details">
                  <div className="stat-detail"><span>Temp</span><strong>{gpu?.temp.toFixed(0) ?? "—"}°C</strong></div>
                  <div className="stat-detail"><span>Potencia</span><strong>{gpu?.power_w.toFixed(1) ?? "—"} W</strong></div>
                  <div className="stat-detail"><span>VRAM</span><strong>{gpu ? `${gpu.vram_used_mb} / ${gpu.vram_total_mb}` : "—"} MB</strong></div>
                </div>
              </div>
            </StatCard>
          </div>
        )}

        {/* ── MONITOR ── */}
        {tab === "monitor" && (
          <div className="dashboard monitor-grid">
            <div className="span-full">
              <CpuCoresPanel cores={cores} />
            </div>
            <ExtTempsPanel temps={temps} />
            <DiskPanel disk={disk} />
          </div>
        )}

        {/* ── RED ── */}
        {tab === "red" && (
          <NetworkPanel
            stats={net}
            rxHistory={rxHist}
            txHistory={txHist}
            connections={conns}
          />
        )}

        {/* ── CONTROL ── */}
        {tab === "control" && (
          <div className="dashboard">
            <StatCard label="Volumen">
              <SliderControl icon="VOL" label="Salida" value={vol?.percent ?? 0} onChange={handleVolume} />
              <button className={`mute-btn ${vol?.muted ? "muted" : ""}`} onClick={handleMute}>
                {vol?.muted ? "SILENCIADO" : "ACTIVO"}
              </button>
            </StatCard>

            <StatCard label="Brillo">
              <SliderControl icon="LUX" label="Pantalla" value={bright?.percent ?? 0} onChange={handleBrightness} />
            </StatCard>

            <StatCard label="LEDs Teclado">
              {[
                { key: "capslock",   label: "Caps Lock",   device: "input9::capslock" },
                { key: "numlock",    label: "Num Lock",    device: "input9::numlock" },
                { key: "scrolllock", label: "Scroll Lock", device: "input9::scrolllock" },
              ].map(({ key, label, device }) => (
                <div key={key} className="led-row">
                  <span className="led-label">{label}</span>
                  <button
                    className={`led-toggle ${leds?.[key as keyof KeyboardLeds] ? "on" : "off"}`}
                    onClick={() => handleLed(device, !leds?.[key as keyof KeyboardLeds])}
                  >
                    <span className="led-dot" />
                    {leds?.[key as keyof KeyboardLeds] ? "ON" : "OFF"}
                  </button>
                </div>
              ))}
            </StatCard>
          </div>
        )}

        {/* ── CARA ── */}
        {tab === "cara" && <FacePanel active={tab === "cara"} />}

      </div>
    </div>
  );
}
