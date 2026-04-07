# Atlas Center

A modern system dashboard built with **Tauri 2 + React + TypeScript** for Linux (CachyOS / Arch + Hyprland).

Monitors and controls your hardware in real time through a clean, dark, animated UI.

---

## Features

| Tab | What it shows |
|-----|--------------|
| **SYS** | CPU usage & temperature · RAM usage & speed · GPU utilization, wattage & VRAM |
| **MONITOR** | Per-core CPU frequency bars · NVMe / RAM / Wi-Fi temperatures · Disk usage & I/O speed |
| **RED** | Network up/down sparklines · Active TCP connections · 3D wireframe globe with arcs to remote IPs |
| **CONTROL** | Volume slider & mute · Screen brightness · Keyboard LEDs (Caps / Num / Scroll Lock) |
| **CARA** | Live IR camera feed · Real-time face detection & recognition via **howdy** (dlib) |

Additional details:
- Looping background video with a branded intro animation on launch
- Single IPC batch call every 500 ms — no polling avalanche
- TTL-based command cache (sensors 2 s · nvidia-smi 1 s · df 5 s · dmidecode 1 h …)
- IR face recognition uses the same dlib models and certainty threshold as howdy

---

## Stack

- **Backend** — Rust · Tauri 2
- **Frontend** — React 19 · TypeScript · Vite 6
- **3D Globe** — Three.js + topojson / world-atlas
- **Face recognition** — Python 3 · dlib · OpenCV (via howdy's installed models)

---

## Requirements

### System
- Linux with Wayland (tested on CachyOS / Arch + Hyprland)
- `ffmpeg` — IR camera capture
- `nvidia-smi` — GPU stats
- `sensors` (`lm-sensors`) — CPU & board temperatures
- `pactl` (`pipewire-pulse` or `pulseaudio`) — volume control
- `brightnessctl` — screen brightness & keyboard LEDs
- `ss` (`iproute2`) — active TCP connections
- `curl` — geo IP lookup (ip-api.com)

### Face recognition (optional — CARA tab)
- [`howdy`](https://github.com/boltgolt/howdy) installed and configured with at least one face model
- `python-dlib` · `python-opencv` · `python-numpy`

### Build
- Node.js ≥ 20 · npm
- Rust (stable) · Cargo
- Tauri CLI v2 (`npm install` installs it locally)

---

## Setup

```bash
git clone https://github.com/divxal/atlas-center.git
cd atlas-center
npm install
```

### Assets

The repo includes the default video assets. To use your own animations, replace the files in `public/assets/`:

```
public/assets/
  background.mp4   # looping background video (~6 s recommended)
  intro.mp4        # intro animation played once on launch (~10 s)
```

### Run (development)

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev
```

> The `WEBKIT_DISABLE_DMABUF_RENDERER=1` env var is required on Wayland with the NVIDIA proprietary driver.

### Build (production)

```bash
npm run tauri:build
```

---

## Hyprland integration

Add to your `userprefs.conf` to always open fullscreen:

```ini
windowrule = fullscreen 1, match:class ^(com.atlas.atlas-center)$
```

---

## Hardware this was built for

| Component | Model |
|-----------|-------|
| CPU | Intel Core i7-13650HX |
| GPU | NVIDIA GeForce RTX 4060 Laptop |
| RAM | 24 GB DDR5 |
| OS | CachyOS (Arch-based) |
| WM | Hyprland |

Some stat paths are hardcoded for this configuration (e.g. `/dev/video2` for the IR camera, `nvme0n1` for disk I/O). Adjust `src-tauri/src/lib.rs` to match your hardware.

---

## Project structure

```
atlas-center/
├── src/
│   ├── components/       # React components (Dashboard, panels, globe…)
│   ├── styles/           # Per-component CSS
│   └── App.tsx           # Root — intro animation + background video
├── src-tauri/
│   ├── src/lib.rs        # All Tauri commands (stats, camera, controls)
│   └── face_detect.py    # Python face detection/recognition helper
└── public/
    └── assets/           # background.mp4, intro.mp4 (not tracked)
```

---

## License

MIT
