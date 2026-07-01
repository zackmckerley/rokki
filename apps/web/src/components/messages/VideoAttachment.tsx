"use client";

/**
 * Inline video/GIF renderer shared by the chat bubble (ChatThread) and the media
 * gallery (SignalThreadView).
 *
 * Two problems this fixes:
 *   1. A plain <video> shows a BLACK box until the user hits play — it looks
 *      broken / "not loading". Appending the `#t=0.1` media fragment tells the
 *      browser to seek to 0.1s on load (with preload="metadata") and paint that
 *      frame as the poster, so the first frame shows immediately.
 *   2. GIFs sent through Signal arrive as muted looping video (or image/gif).
 *      A GIF should animate on its own, not sit behind a play button — so when
 *      we can tell it's a GIF we autoplay it muted + looping with no controls.
 *
 * Signal (via signal-cli) does not expose the protocol GIF flag, so a GIF that
 * arrives as `video/mp4` with no `.gif` name can't be detected here — it falls
 * back to the poster-frame + controls path (first frame + one tap to play),
 * which is still correct, just not auto-looping.
 */

/** Add the `#t=0.1` fragment so the browser paints the first frame as a poster.
 *  Fragments are client-only, so this never touches a signed-URL query string. */
export function posterSrc(url: string): string {
  return url.includes("#") ? url : `${url}#t=0.1`;
}

/** Whether an attachment should be treated as an animated GIF (auto-loop). */
export function isGifLike(
  contentType: string | null | undefined,
  filename: string | null | undefined,
): boolean {
  const ct = (contentType ?? "").toLowerCase();
  const fn = (filename ?? "").toLowerCase();
  return ct === "image/gif" || ct === "video/gif" || fn.endsWith(".gif");
}

export function VideoAttachment({
  url,
  contentType,
  filename,
  className,
}: {
  url: string;
  contentType: string | null | undefined;
  filename: string | null | undefined;
  className?: string;
}) {
  if (isGifLike(contentType, filename)) {
    return (
      <span className="relative block">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={posterSrc(url)}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-label={filename ?? "GIF"}
          className={className}
        />
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
          GIF
        </span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={posterSrc(url)}
      controls
      playsInline
      preload="metadata"
      aria-label={filename ?? "video"}
      className={className}
    />
  );
}
