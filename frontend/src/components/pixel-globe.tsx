/**
 * PixelGlobe — the chat's "world" visual: black gridded space with the
 * pixel-art Earth centred in it. The artwork itself lives in
 * @/lib/pixel-globe-art (pure, deterministic, no assets / no WebGL).
 */

import type { CSSProperties } from "react";

import { SCENE, VIEW } from "@/lib/pixel-globe-art";

const SPACE: CSSProperties = {
  backgroundColor: "#06070a",
  backgroundImage:
    "linear-gradient(#10141b 1px, transparent 1px), linear-gradient(90deg, #10141b 1px, transparent 1px)",
  backgroundSize: "7px 7px",
};

export default function PixelGlobe({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={SPACE}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="h-full w-auto"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        {/* the lone marker star, top-left of the sheet */}
        <rect x={44} y={48} width={8} height={8} fill="#f4f8fc" />
        {SCENE.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.f} />
        ))}
      </svg>
    </div>
  );
}
