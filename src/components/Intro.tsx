import { useEffect, useRef, useState } from "react";
import "../styles/Intro.css";

interface Props { onDone: () => void }

export function Intro({ onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = 1.5;

    const handleEnd = () => {
      setFading(true);
      setTimeout(onDone, 600); // espera al fade
    };

    video.addEventListener("ended", handleEnd);
    return () => video.removeEventListener("ended", handleEnd);
  }, [onDone]);

  return (
    <div className={`intro-overlay ${fading ? "fade-out" : ""}`}>
      <video
        ref={videoRef}
        className="intro-video"
        src="/assets/intro.mp4"
        autoPlay
        muted
        playsInline
        disablePictureInPicture
      />
    </div>
  );
}
