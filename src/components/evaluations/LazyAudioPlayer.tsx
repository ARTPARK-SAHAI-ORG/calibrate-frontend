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

  // Tear down the media player when the source changes (e.g. the row's audio
  // was replaced) or on unmount, so it never points at a stale clip and never
  // lingers against the WebMediaPlayer cap.
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = "";
        el.load();
        audioRef.current = null;
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [src]);

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

  const seekToRatio = (clientX: number, track: HTMLDivElement) => {
    if (!duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const el = ensureAudio();
    el.currentTime = ratio * duration;
    setCurrentTime(el.currentTime);
  };

  const progress = duration ? Math.min(currentTime / duration, 1) * 100 : 0;

  return (
    <div
      className={`inline-flex items-center gap-2.5 h-8 pl-2 pr-3 rounded-full bg-muted ${className}`}
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

      <div
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        onClick={(e) => seekToRatio(e.clientX, e.currentTarget)}
        className="group relative flex-1 h-3 flex items-center cursor-pointer"
      >
        <div className="h-1 w-full rounded-full bg-foreground/15">
          <div
            className="h-full rounded-full bg-foreground/70"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-foreground shadow-sm opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2"
          style={{ left: `${progress}%` }}
        />
      </div>

      <span className="flex-shrink-0 text-[11px] tabular-nums text-muted-foreground w-[68px] text-right">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}
