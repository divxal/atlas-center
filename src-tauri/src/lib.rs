use std::process::Command;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

// ── Estado persistente ────────────────────────────────────────────────────────

static LAST_CPU_STAT:  Mutex<Option<(u64, u64)>>                                        = Mutex::new(None);
static LAST_DISK_STAT: Mutex<Option<(u64, u64, u64)>>                                   = Mutex::new(None);
static LAST_NET_STAT:  Mutex<Option<(u64, u64, u64)>>                                   = Mutex::new(None);
static GEO_CACHE:      Mutex<Option<std::collections::HashMap<String, (f64, f64)>>>     = Mutex::new(None);
static CMD_CACHE:      Mutex<Option<std::collections::HashMap<String, (u64, String)>>>  = Mutex::new(None);
static CAMERA_RUNNING: AtomicBool = AtomicBool::new(false);

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Serialize)] pub struct CpuStats      { pub usage: f32, pub temp: f32 }
#[derive(Serialize)] pub struct RamStats      { pub used_gb: f32, pub total_gb: f32, pub percent: f32, pub speed_mt: u32 }
#[derive(Serialize)] pub struct GpuStats      { pub temp: f32, pub power_w: f32, pub gpu_util: f32, pub vram_used_mb: u32, pub vram_total_mb: u32 }
#[derive(Serialize)] pub struct VolumeInfo    { pub percent: u32, pub muted: bool }
#[derive(Serialize)] pub struct BrightnessInfo{ pub percent: u32 }
#[derive(Serialize)] pub struct KeyboardLeds  { pub capslock: bool, pub numlock: bool, pub scrolllock: bool }

#[derive(Serialize)]
pub struct AllStats {
    pub cpu:    CpuStats,
    pub ram:    RamStats,
    pub gpu:    GpuStats,
    pub cores:  Vec<CoreInfo>,
    pub temps:  ExtTemps,
    pub disk:   DiskStats,
    pub net:    NetStats,
    pub conns:  Vec<NetConnection>,
    pub vol:    VolumeInfo,
    pub bright: BrightnessInfo,
    pub leds:   KeyboardLeds,
}

#[derive(Serialize, Clone)]
pub struct CoreInfo {
    pub id: u32,
    pub freq_mhz: u32,
    pub max_mhz: u32,
}

#[derive(Serialize)]
pub struct ExtTemps {
    pub nvme_c: f32,
    pub ram_c: f32,
    pub wifi_c: f32,
}

#[derive(Serialize)]
pub struct DiskStats {
    pub used_gb: f32,
    pub total_gb: f32,
    pub percent: f32,
    pub read_mb_s: f32,
    pub write_mb_s: f32,
}

#[derive(Serialize)]
pub struct NetStats {
    pub rx_mb_s: f32,
    pub tx_mb_s: f32,
    pub rx_total_mb: f32,
    pub tx_total_mb: f32,
}

#[derive(Serialize)]
pub struct NetConnection {
    pub remote_ip: String,
    pub port: u16,
    pub lat: f64,
    pub lng: f64,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn sh_out(script: &str) -> String {
    Command::new("sh").args(["-c", script]).output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

/// Ejecuta `script` con caché TTL. Si la salida cacheada es reciente, la devuelve sin spawning.
fn cached_sh(key: &str, script: &str, ttl_ms: u64) -> String {
    let ts = now_ms();
    {
        let guard = CMD_CACHE.lock().unwrap();
        if let Some(map) = guard.as_ref() {
            if let Some((cached_ts, cached_out)) = map.get(key) {
                if ts.saturating_sub(*cached_ts) < ttl_ms {
                    return cached_out.clone();
                }
            }
        }
    }
    let out = sh_out(script);
    let mut guard = CMD_CACHE.lock().unwrap();
    guard.get_or_insert_with(std::collections::HashMap::new)
        .insert(key.to_string(), (ts, out.clone()));
    out
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn read_cpu_usage() -> f32 {
    fn read_stat() -> Option<(u64, u64)> {
        let s = std::fs::read_to_string("/proc/stat").ok()?;
        let line = s.lines().next()?;
        let nums: Vec<u64> = line.split_whitespace().skip(1)
            .filter_map(|x| x.parse().ok()).collect();
        if nums.len() < 4 { return None; }
        let idle = nums[3] + nums.get(4).copied().unwrap_or(0);
        Some((idle, nums.iter().sum()))
    }
    let current = read_stat().unwrap_or((0, 1));
    let mut guard = LAST_CPU_STAT.lock().unwrap();
    let prev = guard.unwrap_or(current);
    *guard = Some(current);
    let d_idle  = current.0.saturating_sub(prev.0) as f32;
    let d_total = current.1.saturating_sub(prev.1) as f32;
    if d_total == 0.0 { return 0.0; }
    (1.0 - d_idle / d_total) * 100.0
}

// ── Funciones internas (reutilizables sin atributo tauri::command) ────────────

fn get_cpu_stats_inner() -> CpuStats {
    let usage = read_cpu_usage();
    let sensors_out = cached_sh("sensors", "sensors", 2000);
    let temp = sensors_out.lines()
        .find(|l| l.contains("Package id 0"))
        .and_then(|l| { let s = l.find('+')? + 1; let e = l[s..].find('°')?; l[s..s+e].parse().ok() })
        .unwrap_or(0.0);
    CpuStats { usage, temp }
}

fn get_ram_stats_inner() -> RamStats {
    let meminfo = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
    let mut total_kb = 0u64; let mut available_kb = 0u64;
    for line in meminfo.lines() {
        if line.starts_with("MemTotal:")          { total_kb     = line.split_whitespace().nth(1).and_then(|v| v.parse().ok()).unwrap_or(0); }
        else if line.starts_with("MemAvailable:") { available_kb = line.split_whitespace().nth(1).and_then(|v| v.parse().ok()).unwrap_or(0); }
    }
    let used_kb = total_kb.saturating_sub(available_kb);
    let dmi = cached_sh("dmidecode", "sudo -A dmidecode -t memory 2>/dev/null | grep 'Configured Memory Speed' | head -1", 3_600_000);
    let speed_mt = dmi.split_whitespace().find_map(|v| v.parse::<u32>().ok()).unwrap_or(4800);
    RamStats {
        used_gb: used_kb as f32 / 1_048_576.0,
        total_gb: total_kb as f32 / 1_048_576.0,
        percent: if total_kb > 0 { used_kb as f32 / total_kb as f32 * 100.0 } else { 0.0 },
        speed_mt,
    }
}

fn get_gpu_stats_inner() -> GpuStats {
    let out = cached_sh("nvidia-smi", "nvidia-smi --query-gpu=temperature.gpu,power.draw,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits", 1000);
    let p: Vec<&str> = out.split(',').map(|s| s.trim()).collect();
    GpuStats {
        temp:          p.get(0).and_then(|v| v.parse().ok()).unwrap_or(0.0),
        power_w:       p.get(1).and_then(|v| v.parse().ok()).unwrap_or(0.0),
        gpu_util:      p.get(2).and_then(|v| v.parse().ok()).unwrap_or(0.0),
        vram_used_mb:  p.get(3).and_then(|v| v.parse().ok()).unwrap_or(0),
        vram_total_mb: p.get(4).and_then(|v| v.parse().ok()).unwrap_or(0),
    }
}

fn get_volume_inner() -> VolumeInfo {
    let vol_out  = cached_sh("pactl-vol",  "pactl get-sink-volume @DEFAULT_SINK@", 1000);
    let mute_out = cached_sh("pactl-mute", "pactl get-sink-mute @DEFAULT_SINK@",   1000);
    let percent  = vol_out.lines().next().and_then(|l| l.split('/').nth(1))
        .and_then(|s| s.trim().trim_end_matches('%').parse::<u32>().ok()).unwrap_or(0);
    VolumeInfo { percent, muted: mute_out.contains("yes") }
}

fn get_brightness_inner() -> BrightnessInfo {
    let out = cached_sh("brightness", "brightnessctl -d nvidia_0 get", 2000);
    BrightnessInfo { percent: out.trim().parse::<u32>().unwrap_or(0).min(100) }
}

fn get_keyboard_leds_inner() -> KeyboardLeds {
    let caps   = cached_sh("led-caps",   "brightnessctl -d 'input9::capslock' get",   2000);
    let num    = cached_sh("led-num",    "brightnessctl -d 'input9::numlock' get",    2000);
    let scroll = cached_sh("led-scroll", "brightnessctl -d 'input9::scrolllock' get", 2000);
    KeyboardLeds {
        capslock:   caps.trim()   == "1",
        numlock:    num.trim()    == "1",
        scrolllock: scroll.trim() == "1",
    }
}

fn get_cpu_cores_inner() -> Vec<CoreInfo> {
    (0..20u32).map(|i| {
        let freq_hz: u64 = std::fs::read_to_string(format!("/sys/devices/system/cpu/cpu{}/cpufreq/scaling_cur_freq", i)).unwrap_or_default().trim().parse().unwrap_or(0);
        let max_hz:  u64 = std::fs::read_to_string(format!("/sys/devices/system/cpu/cpu{}/cpufreq/cpuinfo_max_freq", i)).unwrap_or_default().trim().parse().unwrap_or(4_900_000);
        CoreInfo { id: i, freq_mhz: (freq_hz / 1000) as u32, max_mhz: (max_hz / 1000) as u32 }
    }).collect()
}

fn get_ext_temps_inner() -> ExtTemps {
    let sensors_out = cached_sh("sensors", "sensors", 2000);
    let mut nvme_c = 0.0f32; let mut ram_c = 0.0f32; let mut wifi_c = 0.0f32;
    let mut section = "";
    for line in sensors_out.lines() {
        if line.starts_with("nvme")         { section = "nvme"; }
        else if line.starts_with("spd5118") { section = "ram"; }
        else if line.starts_with("iwlwifi") { section = "wifi"; }
        if line.contains("temp1_input") || line.contains("Composite") ||
           ((section == "ram" || section == "wifi") && line.contains("temp1:")) {
            if let Some(v) = line.split(':').nth(1).and_then(|s| {
                let s = s.trim().split_whitespace().next()?;
                s.trim_start_matches('+').trim_end_matches('C').trim_end_matches('°').parse::<f32>().ok()
            }) {
                match section {
                    "nvme" if nvme_c == 0.0 => nvme_c = v,
                    "ram"  if ram_c  == 0.0 => ram_c  = v,
                    "wifi" if wifi_c == 0.0 => wifi_c = v,
                    _ => {}
                }
            }
        }
    }
    ExtTemps { nvme_c, ram_c, wifi_c }
}

fn get_disk_stats_inner() -> DiskStats {
    let df_out = cached_sh("df", "df / --output=size,used,avail --block-size=1 | tail -1", 5000);
    let parts: Vec<u64> = df_out.split_whitespace().filter_map(|v| v.parse().ok()).collect();
    let total_gb = parts.get(0).copied().unwrap_or(0) as f32 / 1_073_741_824.0;
    let used_gb  = parts.get(1).copied().unwrap_or(0) as f32 / 1_073_741_824.0;
    let percent  = if total_gb > 0.0 { used_gb / total_gb * 100.0 } else { 0.0 };
    let diskstats = std::fs::read_to_string("/proc/diskstats").unwrap_or_default();
    let (read_sectors, write_sectors) = diskstats.lines()
        .find(|l| l.split_whitespace().nth(2) == Some("nvme0n1"))
        .map(|l| {
            let f: Vec<u64> = l.split_whitespace().filter_map(|v| v.parse().ok()).collect();
            (f.get(4).copied().unwrap_or(0), f.get(8).copied().unwrap_or(0))
        }).unwrap_or((0, 0));
    let ts = now_ms();
    let mut guard = LAST_DISK_STAT.lock().unwrap();
    let (read_mb_s, write_mb_s) = if let Some((prev_ts, prev_r, prev_w)) = *guard {
        let dt = ts.saturating_sub(prev_ts) as f32 / 1000.0;
        if dt > 0.0 {
            ((read_sectors.saturating_sub(prev_r)) as f32 * 512.0 / 1_048_576.0 / dt,
             (write_sectors.saturating_sub(prev_w)) as f32 * 512.0 / 1_048_576.0 / dt)
        } else { (0.0, 0.0) }
    } else { (0.0, 0.0) };
    *guard = Some((ts, read_sectors, write_sectors));
    DiskStats { used_gb, total_gb, percent, read_mb_s, write_mb_s }
}

fn get_net_stats_inner() -> NetStats {
    let net_dev = std::fs::read_to_string("/proc/net/dev").unwrap_or_default();
    let (rx_bytes, tx_bytes) = net_dev.lines()
        .find(|l| l.trim_start().starts_with("wlan0"))
        .map(|l| {
            let f: Vec<u64> = l.split_whitespace().filter_map(|v| v.parse().ok()).collect();
            (f.get(0).copied().unwrap_or(0), f.get(8).copied().unwrap_or(0))
        }).unwrap_or((0, 0));
    let ts = now_ms();
    let mut guard = LAST_NET_STAT.lock().unwrap();
    let (rx_mb_s, tx_mb_s) = if let Some((prev_ts, prev_rx, prev_tx)) = *guard {
        let dt = ts.saturating_sub(prev_ts) as f32 / 1000.0;
        if dt > 0.0 {
            (rx_bytes.saturating_sub(prev_rx) as f32 / 1_048_576.0 / dt,
             tx_bytes.saturating_sub(prev_tx) as f32 / 1_048_576.0 / dt)
        } else { (0.0, 0.0) }
    } else { (0.0, 0.0) };
    *guard = Some((ts, rx_bytes, tx_bytes));
    NetStats { rx_mb_s, tx_mb_s, rx_total_mb: rx_bytes as f32 / 1_048_576.0, tx_total_mb: tx_bytes as f32 / 1_048_576.0 }
}

fn get_net_connections_inner() -> Vec<NetConnection> {
    let out = cached_sh("ss", "ss -n -t state established 2>/dev/null | tail -n +2", 2000);
    out.lines().filter_map(|line| {
        let parts: Vec<&str> = line.split_whitespace().collect();
        let peer = parts.get(3)?;
        let mut iter = peer.rsplitn(2, ':');
        let port_str = iter.next()?;
        let ip = iter.next()?;
        if ip.starts_with("127.") || ip.starts_with("192.168.") || ip.starts_with("10.") { return None; }
        let (lat, lng) = geo_lookup(ip);
        Some(NetConnection { remote_ip: ip.to_string(), port: port_str.parse().unwrap_or(0), lat, lng })
    }).collect()
}

// ── Comandos Tauri (wrappers delgados) ────────────────────────────────────────

#[tauri::command] fn get_cpu_stats()      -> CpuStats      { get_cpu_stats_inner() }
#[tauri::command] fn get_ram_stats()      -> RamStats      { get_ram_stats_inner() }
#[tauri::command] fn get_gpu_stats()      -> GpuStats      { get_gpu_stats_inner() }
#[tauri::command] fn get_volume()         -> VolumeInfo    { get_volume_inner() }
#[tauri::command] fn get_brightness()     -> BrightnessInfo{ get_brightness_inner() }
#[tauri::command] fn get_keyboard_leds()  -> KeyboardLeds  { get_keyboard_leds_inner() }
#[tauri::command] fn get_cpu_cores()      -> Vec<CoreInfo> { get_cpu_cores_inner() }
#[tauri::command] fn get_ext_temps()      -> ExtTemps      { get_ext_temps_inner() }
#[tauri::command] fn get_disk_stats()     -> DiskStats     { get_disk_stats_inner() }
#[tauri::command] fn get_net_stats()      -> NetStats      { get_net_stats_inner() }
#[tauri::command] fn get_net_connections()-> Vec<NetConnection> { get_net_connections_inner() }

fn invalidate_cache(keys: &[&str]) {
    if let Ok(mut guard) = CMD_CACHE.lock() {
        if let Some(map) = guard.as_mut() {
            for key in keys { map.remove(*key); }
        }
    }
}

#[tauri::command] fn set_volume(percent: u32) -> bool {
    let ok = Command::new("pactl").args(["set-sink-volume", "@DEFAULT_SINK@", &format!("{}%", percent)])
        .status().map(|s| s.success()).unwrap_or(false);
    invalidate_cache(&["pactl-vol"]);
    ok
}
#[tauri::command] fn toggle_mute() -> bool {
    let ok = Command::new("pactl").args(["set-sink-mute", "@DEFAULT_SINK@", "toggle"])
        .status().map(|s| s.success()).unwrap_or(false);
    invalidate_cache(&["pactl-mute"]);
    ok
}
#[tauri::command] fn set_brightness(percent: u32) -> bool {
    let ok = Command::new("brightnessctl").args(["-d", "nvidia_0", "set", &format!("{}%", percent.clamp(1, 100))])
        .status().map(|s| s.success()).unwrap_or(false);
    invalidate_cache(&["brightness"]);
    ok
}
#[tauri::command] fn set_keyboard_led(device: String, value: bool) -> bool {
    let ok = Command::new("brightnessctl").args(["-d", &device, "set", if value { "1" } else { "0" }])
        .status().map(|s| s.success()).unwrap_or(false);
    invalidate_cache(&["led-caps", "led-num", "led-scroll"]);
    ok
}
fn geo_lookup(ip: &str) -> (f64, f64) {
    let mut cache = GEO_CACHE.lock().unwrap();
    let map = cache.get_or_insert_with(std::collections::HashMap::new);
    if let Some(&coords) = map.get(ip) { return coords; }

    // ip-api.com — gratuito, sin clave, hasta 45 req/min
    let out = sh_out(&format!(
        "curl -sf --max-time 2 'http://ip-api.com/json/{}?fields=lat,lon'", ip
    ));
    let coords = (|| -> Option<(f64, f64)> {
        let lat_start = out.find("\"lat\":")?  + 6;
        let lat_end   = out[lat_start..].find([',', '}'])? + lat_start;
        let lon_start = out.find("\"lon\":")?  + 6;
        let lon_end   = out[lon_start..].find([',', '}'])? + lon_start;
        let lat: f64 = out[lat_start..lat_end].trim().parse().ok()?;
        let lng: f64 = out[lon_start..lon_end].trim().parse().ok()?;
        Some((lat, lng))
    })().unwrap_or((0.0, 0.0));

    map.insert(ip.to_string(), coords);
    coords
}

// ── Cámara IR (ffmpeg → frames base64 → eventos Tauri) ───────────────────────

const FACE_DETECT_SCRIPT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/face_detect.py");

#[tauri::command]
fn start_camera(app: AppHandle) {
    if CAMERA_RUNNING.swap(true, Ordering::SeqCst) { return; }
    std::thread::spawn(move || {
        use std::io::{Read, Write, BufRead};
        use std::process::Stdio;
        use base64::Engine;

        // ── Proceso Python de detección facial ──────────────────────────────
        let mut py_proc = Command::new("python3")
            .arg(FACE_DETECT_SCRIPT)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok();

        // Hilo que lee resultados JSON del proceso Python y emite eventos
        let py_stdout = py_proc.as_mut().and_then(|p| p.stdout.take());
        if let Some(py_out) = py_stdout {
            let app2 = app.clone();
            std::thread::spawn(move || {
                let reader = std::io::BufReader::new(py_out);
                for line in reader.lines().flatten() {
                    let _ = app2.emit("camera-faces", line);
                }
            });
        }
        let mut py_stdin = py_proc.as_mut().and_then(|p| p.stdin.take());

        // ── Proceso ffmpeg para captura de frames ───────────────────────────
        let mut ffmpeg = match Command::new("ffmpeg")
            .args([
                "-f", "v4l2",
                "-video_size", "640x360",
                "-framerate", "15",
                "-i", "/dev/video2",
                "-f", "image2pipe",
                "-vcodec", "mjpeg",
                "-q:v", "3",
                "pipe:1",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(c) => c,
            Err(_) => {
                CAMERA_RUNNING.store(false, Ordering::SeqCst);
                if let Some(ref mut p) = py_proc { let _ = p.kill(); }
                return;
            }
        };

        let ff_stdout = match ffmpeg.stdout.take() {
            Some(s) => s,
            None => {
                CAMERA_RUNNING.store(false, Ordering::SeqCst);
                if let Some(ref mut p) = py_proc { let _ = p.kill(); }
                return;
            }
        };

        let mut reader = std::io::BufReader::new(ff_stdout);
        let mut buf = Vec::with_capacity(1 << 16);
        let mut frame_n = 0u32;

        while CAMERA_RUNNING.load(Ordering::SeqCst) {
            buf.clear();
            // Leer un frame JPEG buscando SOI (FF D8) y EOI (FF D9)
            let mut byte = [0u8; 1];
            let mut in_frame = false;
            loop {
                if reader.read_exact(&mut byte).is_err() { break; }
                if !in_frame {
                    if byte[0] == 0xFF {
                        let mut next = [0u8; 1];
                        if reader.read_exact(&mut next).is_err() { break; }
                        if next[0] == 0xD8 { in_frame = true; buf.extend_from_slice(&[0xFF, 0xD8]); }
                    }
                } else {
                    buf.push(byte[0]);
                    let len = buf.len();
                    if len >= 2 && buf[len-2] == 0xFF && buf[len-1] == 0xD9 { break; }
                }
            }
            if buf.len() > 4 {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
                let _ = app.emit("camera-frame", b64.clone());

                // Enviar cada 5° frame al detector Python (no saturar dlib)
                frame_n += 1;
                if frame_n % 5 == 0 {
                    if let Some(ref mut stdin) = py_stdin {
                        let _ = writeln!(stdin, "{}", b64);
                    }
                }
            }
        }

        let _ = ffmpeg.kill();
        if let Some(ref mut p) = py_proc { let _ = p.kill(); }
        CAMERA_RUNNING.store(false, Ordering::SeqCst);
    });
}

#[tauri::command]
fn stop_camera() {
    CAMERA_RUNNING.store(false, Ordering::SeqCst);
}

// ── Comando batch: todo en una sola llamada IPC ───────────────────────────────

#[tauri::command]
fn get_all_stats() -> AllStats {
    AllStats {
        cpu:    get_cpu_stats_inner(),
        ram:    get_ram_stats_inner(),
        gpu:    get_gpu_stats_inner(),
        cores:  get_cpu_cores_inner(),
        temps:  get_ext_temps_inner(),
        disk:   get_disk_stats_inner(),
        net:    get_net_stats_inner(),
        conns:  get_net_connections_inner(),
        vol:    get_volume_inner(),
        bright: get_brightness_inner(),
        leds:   get_keyboard_leds_inner(),
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_all_stats,
            start_camera, stop_camera,
            get_cpu_stats, get_ram_stats, get_gpu_stats,
            get_volume, set_volume, toggle_mute,
            get_brightness, set_brightness,
            get_keyboard_leds, set_keyboard_led,
            get_cpu_cores, get_ext_temps, get_disk_stats,
            get_net_stats, get_net_connections,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
