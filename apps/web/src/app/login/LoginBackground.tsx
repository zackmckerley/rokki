"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fullscreen looping nebula video + two-layer overlay for readability.
 *
 * The video is a client-only concern (decoding starts after hydration), so
 * this stays a client component while the login page itself can stay a
 * server component.
 *
 * Accessibility:
 *   - `prefers-reduced-motion` pauses the video on its first frame
 *   - video is decorative — no captions, aria-hidden
 *   - a black fallback background paints before the video decodes so the
 *     form never sits on a flash of unstyled white
 */
export function LoginBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      v.pause();
    }
  }, []);

  return (
    <>
      {/* 4K looping video */}
      <video
        ref={videoRef}
        className={`fixed inset-0 z-0 h-full w-full object-cover transition-opacity duration-1000 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onLoadedData={() => setReady(true)}
        aria-hidden="true"
      >
        <source src="/video/space-nebula.mp4" type="video/mp4" />
      </video>

      {/* Gradient overlay — darker at top and bottom edges */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0.25) 65%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* Radial vignette — focuses attention on the card */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </>
  );
}
