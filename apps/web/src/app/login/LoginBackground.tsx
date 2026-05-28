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
 *
 * `onReady` fires exactly once when the video first reaches a paintable
 * state (or when the safety timer trips). The parent uses it to gate
 * the login card's fade-in so the user sees the cosmos *before* the
 * form lands — per Zack: "the first thing the person sees is the
 * cosmos video. then the other items."
 */
export function LoginBackground({ onReady }: { onReady?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  // Guards against `onReady` firing more than once when several video
  // events (`loadeddata`, `canplay`, `playing`) race to flip ready.
  const firedRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let cancelled = false;
    const flip = () => {
      if (cancelled || firedRef.current) return;
      firedRef.current = true;
      setReady(true);
      onReady?.();
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
  }, [onReady]);

  return (
    <>
      {/* 4K looping video — opaque from first paint. Zack: "skip the
          black and start with the video." The previous opacity-0
          fade-in held the video invisible until the first frame
          decoded, which always meant ~200-1000ms of solid black on
          a cold load. Now the <video> element is opacity-100 the
          moment it mounts; the browser paints frames as soon as it
          has them. The narrow window between mount and first-frame
          decode still shows the page background (bg-black), but
          it's measurably shorter than the old fade-and-wait. */}
      <video
        ref={videoRef}
        className="fixed inset-0 z-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/video/space-nebula.mp4" type="video/mp4" />
      </video>

      {/* Gradient overlay + radial vignette. Still tied to `ready`
          so the overlays don't darken an empty (frame-less) video
          element — that combination reads as a half-rendered
          loading state. They cross-fade in once the cosmos is
          actually painting. */}
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
