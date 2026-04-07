import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import logoSvg from "./assets/logo.svg";
import { Dashboard } from "./components/Dashboard";
import { Intro } from "./components/Intro";

function useClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString("es-ES"));
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString("es-ES")), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function App() {
  const time = useClock();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const restart = () => { video.currentTime = 0; video.play(); };
    video.addEventListener("ended", restart);
    return () => video.removeEventListener("ended", restart);
  }, []);

  const handleIntroDone = useCallback(() => setIntroDone(true), []);

  return (
    <div className="app">
      {!introDone && <Intro onDone={handleIntroDone} />}

      <video ref={videoRef} className="bg-video" autoPlay muted playsInline preload="auto" disablePictureInPicture>
        <source src="/assets/background.mp4" type="video/mp4" />
      </video>
      <div className="overlay" />

      <div className="layout">
        <header className="topbar">
          <div className="brand">
            <img src={logoSvg} className="brand-logo" alt="D1VX4L logo" />
            <span>ATLAS CENTER</span>
          </div>
          <div className="topbar-right">
            <span className="clock">{time}</span>
          </div>
        </header>

        <main className="content">
          <Dashboard />
        </main>
      </div>
    </div>
  );
}

export default App;
