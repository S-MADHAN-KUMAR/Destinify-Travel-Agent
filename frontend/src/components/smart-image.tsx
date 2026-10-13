"use client";

import { useState } from "react";

/**
 * A resilient image for agent-sourced photos (Wikimedia / Openverse / Yelp).
 *
 * Uses a plain <img> so it works for ANY host (no next/image allowlist to
 * maintain for unpredictable Openverse sources), with lazy loading and a
 * tasteful branded fallback when a source has no photo for a place.
 */

type SmartImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  /** Emoji/icon shown in the fallback tile. */
  icon?: string;
  /** Aspect ratio class, e.g. "aspect-[4/3]". */
  aspect?: string;
  sizes?: string;
};

export function SmartImage({
  src,
  alt,
  className = "",
  icon = "🖼️",
  aspect = "aspect-[4/3]",
}: SmartImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <div className={`relative overflow-hidden bg-sunken ${aspect} ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#e7eef5] via-[#eef2ef] to-[#f0ece4]"
          aria-label={alt}
          role="img"
        >
          <span className="text-2xl opacity-70 select-none" aria-hidden="true">
            {icon}
          </span>
        </div>
      )}
    </div>
  );
}

export default SmartImage;
