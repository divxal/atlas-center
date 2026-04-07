import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "../styles/FacePanel.css";

interface FaceResult {
  top: number; right: number; bottom: number; left: number;
  name: string; recognized: boolean; certainty: number | null;
}

export function FacePanel({ active }: { active: boolean }) {
  const imgRef    = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [fps, setFps]       = useState(0);
  const frameCount  = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const facesRef    = useRef<FaceResult[]>([]);

  // Dibuja los bounding boxes sobre el canvas overlay
  function drawFaces(img: HTMLImageElement, faces: FaceResult[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Ajustar canvas al tamaño mostrado de la imagen
    const dw = img.clientWidth;
    const dh = img.clientHeight;
    if (canvas.width !== dw || canvas.height !== dh) {
      canvas.width  = dw;
      canvas.height = dh;
    }
    ctx.clearRect(0, 0, dw, dh);

    // Factor de escala: la cámara es 640x360, el canvas puede ser distinto
    const natW = img.naturalWidth  || 640;
    const natH = img.naturalHeight || 360;
    const sx = dw / natW;
    const sy = dh / natH;

    for (const face of faces) {
      const x = face.left   * sx;
      const y = face.top    * sy;
      const w = (face.right  - face.left)   * sx;
      const h = (face.bottom - face.top)    * sy;

      // Rectángulo
      ctx.strokeStyle = face.recognized ? "rgba(255,255,255,0.95)" : "rgba(180,60,60,0.9)";
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(x, y, w, h);

      // Esquinas decorativas
      const cs = Math.min(w, h) * 0.18;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // TL
      ctx.moveTo(x, y + cs); ctx.lineTo(x, y); ctx.lineTo(x + cs, y);
      // TR
      ctx.moveTo(x + w - cs, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cs);
      // BR
      ctx.moveTo(x + w, y + h - cs); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cs, y + h);
      // BL
      ctx.moveTo(x + cs, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cs);
      ctx.stroke();

      // Etiqueta
      const label = face.recognized
        ? face.name
        : `Desconocido${face.certainty !== null ? ` · ${face.certainty.toFixed(1)}` : ""}`;
      const fontSize = Math.max(10, Math.round(dh * 0.028));
      ctx.font = `700 ${fontSize}px monospace`;
      const tw = ctx.measureText(label).width;
      const pad = 5;
      const lx = x;
      const ly = y > fontSize + pad * 2 + 4 ? y - fontSize - pad * 2 - 2 : y + h + 2;

      ctx.fillStyle = face.recognized ? "rgba(0,0,0,0.75)" : "rgba(80,0,0,0.75)";
      ctx.fillRect(lx, ly, tw + pad * 2, fontSize + pad * 2);
      ctx.fillStyle = face.recognized ? "#ffffff" : "rgba(255,120,120,1)";
      ctx.fillText(label, lx + pad, ly + fontSize + pad - 1);
    }
  }

  useEffect(() => {
    if (!active) {
      invoke("stop_camera");
      setStatus("idle");
      facesRef.current = [];
      return;
    }

    setStatus("loading");
    invoke("start_camera").catch(() => setStatus("error"));

    const unlistenFrame = listen<string>("camera-frame", (event) => {
      const img = imgRef.current;
      if (img) {
        img.src = `data:image/jpeg;base64,${event.payload}`;
        setStatus("ok");
        // Redibujar overlay con las caras más recientes
        img.onload = () => drawFaces(img, facesRef.current);
      }
      frameCount.current++;
      const now = Date.now();
      if (now - lastFpsTime.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastFpsTime.current = now;
      }
    });

    const unlistenFaces = listen<string>("camera-faces", (event) => {
      try {
        const faces: FaceResult[] = JSON.parse(event.payload);
        facesRef.current = faces;
        const img = imgRef.current;
        if (img && img.complete) drawFaces(img, faces);
      } catch { /* ignorar JSON malformado */ }
    });

    return () => {
      invoke("stop_camera");
      unlistenFrame.then(f => f());
      unlistenFaces.then(f => f());
      setStatus("idle");
      facesRef.current = [];
    };
  }, [active]);

  return (
    <div className="face-panel">
      <div className="face-feed-wrap">
        {status === "idle"    && <div className="face-status">Cámara inactiva</div>}
        {status === "loading" && <div className="face-status">Iniciando cámara IR…</div>}
        {status === "error"   && <div className="face-status error">Error al iniciar ffmpeg</div>}
        <img
          ref={imgRef}
          className={`face-video ${status === "ok" ? "visible" : ""}`}
          alt="IR camera"
        />
        <canvas ref={canvasRef} className="face-canvas" />
        {status === "ok" && (
          <div className="face-overlay-label">/dev/video2 · IR · {fps} fps</div>
        )}
      </div>

      <div className="face-controls">
        <div className="face-card">
          <span className="face-card-label">HOWDY</span>
          <div className="face-info-row"><span>Certeza mín.</span><strong>3.5</strong></div>
          <div className="face-info-row"><span>Dispositivo</span><strong>/dev/video2</strong></div>
          <div className="face-info-row"><span>Formato</span><strong>v4l2 MJPEG</strong></div>
          <div className="face-info-row"><span>Resolución</span><strong>640×360</strong></div>
        </div>

        <div className="face-card">
          <span className="face-card-label">ESTADO</span>
          <div className={`face-badge ${status}`}>
            {status === "ok"      ? `ACTIVO · ${fps} FPS` :
             status === "loading" ? "INICIANDO"            :
             status === "error"   ? "ERROR"                : "INACTIVO"}
          </div>
        </div>
      </div>
    </div>
  );
}
