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
 *
 * Robustness:
 *   - We try to autoplay manually after mount (some browsers will silently
 *     refuse the declarative `autoPlay` attr but accept an explicit
 *     `play()` call once the document is interactive)
 *   - We flip `ready` on the *earliest* of `loadeddata`, `canplay`,
 *     `playing`, OR a 1500ms safety timer. This stops the video sitting at
 *     `opacity-0` indefinitely on slow dev servers where `loadeddata`
 *     doesn't fire promptly for a 32MB MP4.
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

    let cancelled = false;
    const flip = () => {
      if (!cancelled) setReady(true);
    };

    v.addEventListener("loadeddata", flip);
    v.addEventListener("canplay", flip);
    v.addEventListener("playing", flip);

    // Safety net: if none of those fire (slow connection, browser quirks,
    // big MP4 still buffering), reveal the video anyway after 1.5s. The
    // user gets the first decoded frame plus whatever streams in.
    const timer = setTimeout(flip, 1500);

    if (reduceMotion) {
      v.pause();
    } else {
      // Some browsers ignore the declarative autoPlay; an explicit play
      // call after hydration is more reliable. Muted is required for
      // autoplay to be allowed in Chrome/Safari.
      v.play().catch(() => {
        // Autoplay blocked entirely — still reveal the video so the
        // poster frame shows.
        flip();
      });
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      v.removeEventListener("loadeddata", flip);
      v.removeEventListener("canplay", flip);
      v.removeEventListener("playing", flip);
    };
  }, []);

  return (
    <>
      {/* 4K looping video */}
      <video
        ref={videoRef}
        className={`fixed inset-0 z-0 h-full w-full object-cover transition-opacity duration-700 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/video/space-nebula.mp4" type="video/mp4" />
      </video>

      {/* Gradient overlay + radial vignette. Both fade in with the
          video so the pre-load state is pure black (page bg) instead of
          a gradient on black, which reads as a half-rendered loading
          state.  */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[1] transition-opacity duration-700 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0.25) 65%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[2] transition-opacity duration-700 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </>
  );
}
