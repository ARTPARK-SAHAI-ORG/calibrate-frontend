"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A lightweight audio player that allocates a real HTMLAudioElement only when
 * the user first presses play. Rendering a native `<audio>` per row hits
 * Chromium's per-page WebMediaPlayer cap (~hundreds-1000), after which extra
 * players render dead/greyed — which is why STT/TTS datasets broke past ~500
 * rows. Creating the player on demand keeps the live count to whatever is
 * actually playing.
 */

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export function LazyAudioPlayer({
  src,
  className = "",
}: {
  src: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Tear down the media player on unmount so it doesn't linger against the cap.
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = "";
        el.load();
        audioRef.current = null;
      }
    };
  }, []);

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current;
    const el = new Audio(src);
    el.addEventListener("loadedmetadata", () =>
      setDuration(el.duration || 0),
    );
    el.addEventListener("timeupdate", () => setCurrentTime(el.currentTime));
    el.addEventListener("ended", () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });
    el.addEventListener("pause", () => setIsPlaying(false));
    el.addEventListener("play", () => setIsPlaying(true));
    audioRef.current = el;
    return el;
  };

  const togglePlay = () => {
    const el = ensureAudio();
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = ensureAudio();
    const t = Number(e.target.value);
    el.currentTime = t;
    setCurrentTime(t);
  };

  const progressMax = duration || 0;

  return (
    <div
      className={`flex items-center gap-2 h-8 px-2 rounded-full bg-muted ${className}`}
    >
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-foreground cursor-pointer"
      >
        {isPlaying ? (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
          </svg>
        )}
      </button>
      <span className="flex-shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <input
        type="range"
        min={0}
        max={progressMax}
        step={0.01}
        value={Math.min(currentTime, progressMax)}
        onChange={handleSeek}
        disabled={progressMax === 0}
        aria-label="Seek"
        className="flex-1 h-1 cursor-pointer accent-foreground disabled:cursor-not-allowed"
      />
    </div>
  );
}
