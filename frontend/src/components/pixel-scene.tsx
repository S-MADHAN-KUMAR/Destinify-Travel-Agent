/**
 * PixelScene — a procedural pixel-art landscape, rebuilt to match the
 * signature hero of the reference design (Inspo: cofounder-co).
 *
 * Everything is drawn on a fixed integer grid so the art snaps to chunky
 * pixels, and the whole thing is deterministic (seeded PRNG) so the server
 * and client always render identical output.
 *
 *   grid:  400 x 346 scene units, 1 pixel = 2 units
 *   horizon (grass line): y = 215
 */

type Rect = { x: number; y: number; w: number; h: number; f: string };

const SW = 400;
const SH = 346;
const HORIZON = 215;
const P = 2;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const q = (v: number) => Math.round(v / P) * P;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ] as const;
}

function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = clamp255(r1 + (r2 - r1) * t);
  const g = clamp255(g1 + (g2 - g1) * t);
  const bl = clamp255(b1 + (b2 - b1) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

function gradientAt(t: number, stops: [number, string][]) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (t <= p1) {
      const local = p1 === p0 ? 0 : (t - p0) / (p1 - p0);
      return mix(c0, c1, Math.max(0, Math.min(1, local)));
    }
  }
  return stops[stops.length - 1][1];
}

/** Fill from a varying top edge down to a fixed bottom. */
function fillToBottom(
  out: Rect[],
  x0: number,
  x1: number,
  topOf: (x: number) => number,
  bottom: number,
  f: string,
) {
  let runX = x0;
  let runY = q(topOf(x0));
  const emit = (endX: number) => {
    const h = bottom - runY;
    if (h > 0) out.push({ x: runX, y: runY, w: endX - runX, h, f });
  };
  for (let x = x0 + P; x <= x1; x += P) {
    const y = q(topOf(x));
    if (y !== runY) {
      emit(x);
      runX = x;
      runY = y;
    }
  }
  emit(x1);
}

/** Fill from a fixed top down to a varying bottom edge (canopy). */
function fillToTop(
  out: Rect[],
  x0: number,
  x1: number,
  top: number,
  bottomOf: (x: number) => number,
  f: string,
) {
  let runX = x0;
  let runY = q(bottomOf(x0));
  const emit = (endX: number) => {
    const h = runY - top;
    if (h > 0) out.push({ x: runX, y: top, w: endX - runX, h, f });
  };
  for (let x = x0 + P; x <= x1; x += P) {
    const y = q(bottomOf(x));
    if (y !== runY) {
      emit(x);
      runX = x;
      runY = y;
    }
  }
  emit(x1);
}

/** A band of fixed thickness whose top edge undulates. */
function fillBand(
  out: Rect[],
  x0: number,
  x1: number,
  topOf: (x: number) => number,
  h: number,
  f: string,
) {
  let runX = x0;
  let runY = q(topOf(x0));
  const emit = (endX: number) => out.push({ x: runX, y: runY, w: endX - runX, h, f });
  for (let x = x0 + P; x <= x1; x += P) {
    const y = q(topOf(x));
    if (y !== runY) {
      emit(x);
      runX = x;
      runY = y;
    }
  }
  emit(x1);
}

/** A quantised disc — the building block for clouds and foliage. */
function disc(out: Rect[], cx: number, cy: number, r: number, f: string) {
  const rr = Math.max(P, q(r));
  const top = q(cy - rr);
  for (let y = top; y <= cy + rr; y += P) {
    const dy = y + P / 2 - cy;
    const d2 = rr * rr - dy * dy;
    if (d2 <= 0) continue;
    const hw = Math.max(P, q(Math.sqrt(d2)));
    out.push({ x: q(cx - hw), y, w: hw * 2, h: P, f });
  }
}

/* ------------------------------------------------------------------ */
/* palette                                                             */
/* ------------------------------------------------------------------ */

const C = {
  sky: [
    [0, "#1c91ec"],
    [0.42, "#3ba4f2"],
    [0.76, "#7cc7f4"],
    [1, "#a6daf9"],
  ] as [number, string][],
  cloud: "#ffffff",
  cloudBase: "#d9eefb",
  cloudCool: "#eaf6ff",
  treeFar: "#2f6d36",
  treeFarDark: "#25592c",
  canopy: "#2f6b2c",
  canopyDark: "#1d4a20",
  canopyLight: "#4a8f3a",
  canopySpark: "#68a25b",
  trunk: "#6b4a2c",
  trunkDark: "#4a3220",
  trunkLight: "#8a6440",
  trunkHi: "#a57c52",
  grass: "#629959",
  grassHi: "#77af68",
  grassLo: "#4f8349",
  grassDeep: "#42714040",
  grassDeepSolid: "#416f3f",
  shadow: "#3b6c41",
  coolShadow: "#2f6f8e",
  rock: "#9aa3a6",
  rockDark: "#6f787c",
  log: "#8a6a3f",
  logHi: "#a88452",
  logDark: "#5f4726",
  logRing: "#c79d66",
  case: "#6f7880",
  caseDark: "#535b62",
  caseHi: "#98a1a8",
  deck: "#b9bfc4",
  deckDark: "#9199a0",
  deckHi: "#d7dbde",
  screen: "#79c6f5",
  screenDeep: "#4aabef",
  petal: "#d84c4c",
  petalDark: "#a83535",
  petalWhite: "#ffffff",
  petalSun: "#f5d14b",
  stem: "#3f7a3a",
};

/* ------------------------------------------------------------------ */
/* builders                                                            */
/* ------------------------------------------------------------------ */

function buildSky(out: Rect[]) {
  for (let y = 0; y < HORIZON; y += 8) {
    const h = Math.min(8, HORIZON - y);
    out.push({ x: 0, y, w: SW, h, f: gradientAt(y / HORIZON, C.sky) });
  }
}

function buildClouds(out: Rect[]) {
  const place: [number, number, number][] = [
    [46, 62, 1.0],
    [148, 44, 0.72],
    [232, 96, 1.18],
    [330, 56, 0.86],
    [96, 132, 0.62],
    [300, 158, 0.7],
  ];

  for (const [cx, cy, s] of place) {
    const hw = 30 * s;
    // flat, cool base
    out.push({
      x: q(cx - hw),
      y: q(cy + 5),
      w: q(hw * 2),
      h: q(10 * s) + P,
      f: C.cloudBase,
    });
    // puffs
    disc(out, cx - hw * 0.55, cy + 1, 13 * s, C.cloud);
    disc(out, cx + hw * 0.5, cy + 3, 11 * s, C.cloudCool);
    disc(out, cx - hw * 0.02, cy - 8 * s, 16 * s, C.cloud);
    disc(out, cx + hw * 0.92, cy + 4, 7 * s, C.cloudCool);
    disc(out, cx - hw * 0.95, cy + 4, 8 * s, C.cloudCool);
  }
}

function buildFarForest(out: Rect[]) {
  const rand = rng(9137);

  // Two depth layers of bumpy treeline sitting on the horizon.
  const lobe = (x: number, c: number, w: number, h: number) =>
    h * Math.max(0, 1 - Math.abs(x - c) / w);

  const backTop = (x: number) =>
    HORIZON -
    10 -
    lobe(x, 34, 60, 26) -
    lobe(x, 128, 74, 20) -
    lobe(x, 214, 66, 30) -
    lobe(x, 300, 80, 22) -
    lobe(x, 378, 58, 27) -
    rand() * 4;

  fillToBottom(out, 0, SW, backTop, HORIZON + 6, C.treeFarDark);

  const frontTop = (x: number) =>
    HORIZON -
    6 -
    lobe(x, 62, 44, 17) -
    lobe(x, 156, 52, 13) -
    lobe(x, 246, 46, 19) -
    lobe(x, 340, 54, 15) -
    rand() * 3;

  fillToBottom(out, 0, SW, frontTop, HORIZON + 4, C.treeFar);
}

function buildGrass(out: Rect[]) {
  const grassStops: [number, string][] = [
    [0, "#5c9355"],
    [0.18, "#629959"],
    [0.5, "#639a5a"],
    [0.78, "#5b9153"],
    [1, "#548a4e"],
  ];
  const span = SH - HORIZON;
  for (let y = HORIZON; y < SH; y += 6) {
    const h = Math.min(6, SH - y);
    out.push({
      x: 0,
      y,
      w: SW,
      h,
      f: gradientAt((y - HORIZON) / span, grassStops),
    });
  }

  // wind-swept light streaks
  const rand = rng(4421);
  for (let i = 0; i < 7; i++) {
    const base = HORIZON + 12 + i * 17 + rand() * 8;
    const amp = 3 + rand() * 5;
    const freq = 0.03 + rand() * 0.03;
    const phase = rand() * 10;
    fillBand(
      out,
      0,
      SW,
      (x) => base + Math.sin(x * freq + phase) * amp,
      5 + Math.round(rand() * 3) * 2,
      i % 2 === 0 ? C.grassHi : C.grassLo,
    );
  }

  // clumpy tufts
  for (let i = 0; i < 210; i++) {
    const x = q(rand() * SW);
    const y = q(HORIZON + 6 + rand() * (span - 14));
    const tall = rand() > 0.55;
    const w = tall ? 2 : 4 + (rand() > 0.7 ? 2 : 0);
    const h = tall ? 4 + Math.round(rand() * 2) * 2 : 2;
    const r = rand();
    out.push({
      x,
      y,
      w,
      h,
      f: r > 0.62 ? C.grassHi : r > 0.28 ? C.grassLo : C.grassDeepSolid,
    });
  }

  // blades along the very bottom edge
  for (let x = 0; x < SW; x += 6) {
    const h = 6 + (Math.sin(x * 0.11) + 1) * 6;
    out.push({ x: q(x), y: q(SH - h), w: P, h: q(h), f: C.grassDeepSolid });
  }
}

function buildBushes(out: Rect[]) {
  // shrubs sitting on the horizon line
  disc(out, 52, 212, 22, C.canopyDark);
  disc(out, 80, 216, 16, C.canopy);
  disc(out, 108, 220, 12, C.canopyLight);
  disc(out, 138, 210, 18, C.canopyDark);
  disc(out, 132, 204, 12, C.canopy);
  disc(out, 22, 216, 14, C.canopy);
  // a couple of rocks for balance
  const rocks: [number, number, number][] = [
    [30, 288, 13],
    [330, 302, 11],
    [120, 318, 9],
  ];
  for (const [x, y, r] of rocks) {
    disc(out, x, y, r, C.rockDark);
    disc(out, x - 1, y - 2, r - 2, C.rock);
    out.push({ x: q(x - r), y: q(y + r - 2), w: q(r * 2), h: P, f: C.rockDark });
  }
}

function buildTreeShadow(out: Rect[]) {
  disc(out, 276, 258, 48, C.shadow);
  disc(out, 324, 264, 34, C.shadow);
  disc(out, 238, 262, 30, C.shadow);
}

function buildTrunk(out: Rect[]) {
  const x0 = 254;
  const x1 = 294;
  const cx = (x0 + x1) / 2;
  const yTop = 40;
  const yBase = 250;
  const halfAt = (y: number) =>
    ((x1 - x0) / 2) * (0.74 + 0.26 * ((y - yTop) / (yBase - yTop)));

  let runStart = yTop;
  let prevL = q(cx - halfAt(yTop));
  let prevR = q(cx + halfAt(yTop));

  for (let y = yTop + P; y <= yBase; y += P) {
    const L = q(cx - halfAt(y));
    const R = q(cx + halfAt(y));
    if (L !== prevL || R !== prevR) {
      out.push({ x: prevL, y: runStart, w: prevR - prevL, h: y - runStart, f: C.trunk });
      runStart = y;
      prevL = L;
      prevR = R;
    }
  }
  out.push({ x: prevL, y: runStart, w: prevR - prevL, h: yBase + P - runStart, f: C.trunk });

  // bark: shade the left side, catch light on the right
  out.push({ x: prevL, y: yTop, w: 6, h: yBase - yTop, f: C.trunkDark });
  out.push({ x: prevR - 5, y: yTop + 8, w: 5, h: yBase - yTop - 8, f: C.trunkLight });
  out.push({ x: prevR - 11, y: yTop + 30, w: 3, h: yBase - yTop - 44, f: C.trunkHi });

  const rand = rng(777);
  for (let i = 0; i < 12; i++) {
    const y = q(yTop + 14 + rand() * (yBase - yTop - 40));
    const h = q(16 + rand() * 46);
    const x = q(prevL + 8 + rand() * (prevR - prevL - 22));
    out.push({ x, y, w: P, h, f: rand() > 0.5 ? C.trunkDark : C.trunkHi });
  }

  // roots flaring over the grass
  const roots: [number, number, number, number][] = [
    [236, 240, 44, 16],
    [298, 242, 42, 15],
    [224, 252, 36, 14],
    [318, 254, 38, 13],
    [258, 256, 60, 14],
  ];
  for (const [x, y, w, h] of roots) out.push({ x, y, w, h, f: C.trunkDark });
  for (const [x, y, w, h] of roots) out.push({ x: x + 4, y, w: w - 12, h: 5, f: C.trunk });
}

function buildCanopy(out: Rect[]) {
  const wob = (x: number, s: number, p: number) =>
    Math.sin(x * s + p) * 5 + Math.sin(x * s * 2.7 + p * 1.7) * 3;

  // Deep mass hanging over the trunk (x >= 250)
  const deepEdge = (x: number) => {
    const t = Math.max(0, Math.min(1, (x - 250) / 30));
    const tail = x > 356 ? (x - 356) * 0.55 : 0;
    return 62 + t * 84 - tail + wob(x, 0.07, 1.2);
  };

  // Shallow fringe across the rest of the sky
  const fringeEdge = (x: number) => {
    const left = x < 130 ? 30 : 0;
    const ramp = x > 214 ? (x - 214) * 0.6 : 0;
    return 44 + left + ramp + wob(x, 0.055, 2.4);
  };

  const paint = (
    x0: number,
    x1: number,
    edge: (x: number) => number,
    shade: number,
    body: string,
    dark: string,
  ) => {
    fillToTop(out, x0, x1, 0, edge, body);
    fillToTop(out, x0, x1, 0, (x) => edge(x) - shade, dark);
    fillToTop(out, x0, x1, 0, (x) => edge(x) - shade, body);
  };

  paint(250, SW, deepEdge, 16, C.canopy, C.canopyDark);
  paint(0, 250, fringeEdge, 10, C.canopy, C.canopyDark);

  // leaf highlights + sparks
  const rand = rng(20260);
  for (let i = 0; i < 170; i++) {
    const right = rand() > 0.38;
    const x = right ? 250 + rand() * (SW - 250) : rand() * 250;
    const bottom = right ? deepEdge(x) : fringeEdge(x);
    const y = 4 + rand() * Math.max(4, bottom - 22);
    const r = rand();
    out.push({
      x: q(x),
      y: q(y),
      w: 4,
      h: 4,
      f: r > 0.72 ? C.canopySpark : r > 0.4 ? C.canopyLight : C.canopyDark,
    });
  }
}

function buildLog(out: Rect[]) {
  // shadow first
  out.push({ x: 300, y: 264, w: 84, h: 8, f: C.shadow });
  // body
  out.push({ x: 304, y: 248, w: 74, h: 22, f: C.log });
  out.push({ x: 304, y: 248, w: 74, h: 5, f: C.logHi });
  out.push({ x: 304, y: 265, w: 74, h: 5, f: C.logDark });
  // grain
  for (let x = 312; x < 370; x += 12) out.push({ x, y: 256, w: 2, h: 10, f: C.logDark });
  // sawn end with rings
  out.push({ x: 374, y: 246, w: 14, h: 26, f: C.logRing });
  out.push({ x: 377, y: 251, w: 8, h: 16, f: C.log });
  out.push({ x: 380, y: 255, w: 3, h: 8, f: C.logDark });
}

function buildLaptop(out: Rect[]) {
  // ground shadow
  disc(out, 200, 258, 54, C.shadow);
  disc(out, 204, 256, 40, C.coolShadow);

  // screen shell
  out.push({ x: 166, y: 188, w: 74, h: 44, f: C.caseDark });
  out.push({ x: 168, y: 190, w: 70, h: 40, f: C.case });
  out.push({ x: 168, y: 190, w: 70, h: 3, f: C.caseHi });

  // screen content: the same pixel sky, seen through the laptop
  out.push({ x: 172, y: 194, w: 62, h: 30, f: C.screen });
  out.push({ x: 172, y: 208, w: 62, h: 16, f: C.screenDeep });
  disc(out, 188, 204, 9, C.petalWhite);
  disc(out, 200, 201, 11, C.petalWhite);
  disc(out, 216, 206, 8, C.cloudCool);
  out.push({ x: 172, y: 220, w: 62, h: 4, f: C.grassLo });

  // hinge + deck
  out.push({ x: 164, y: 232, w: 78, h: 4, f: C.caseDark });
  out.push({ x: 160, y: 236, w: 86, h: 6, f: C.deckDark });
  out.push({ x: 158, y: 242, w: 90, h: 5, f: C.deck });
  out.push({ x: 156, y: 247, w: 94, h: 5, f: C.deckDark });

  // keyboard well + trackpad + front-lip notch
  out.push({ x: 168, y: 238, w: 66, h: 4, f: C.case });
  out.push({ x: 188, y: 243, w: 26, h: 4, f: C.deckHi });
  out.push({ x: 194, y: 248, w: 18, h: 3, f: C.caseHi });
}

function buildFlowers(out: Rect[]) {
  const rand = rng(1204);
  const beds: [number, number, number][] = [
    [66, 258, 34],
    [118, 300, 40],
    [214, 292, 30],
    [304, 286, 36],
    [352, 262, 26],
    [26, 320, 30],
    [248, 326, 34],
  ];

  for (const [cx, cy, spread] of beds) {
    const count = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const x = q(cx + (rand() - 0.5) * spread);
      const y = q(cy + (rand() - 0.5) * spread * 0.5);
      const r = rand();
      out.push({ x, y: y + 4, w: 2, h: 4, f: C.stem });
      if (r > 0.66) {
        out.push({ x: x - 2, y, w: 6, h: 4, f: C.petalWhite });
        out.push({ x, y, w: 2, h: 2, f: C.petalSun });
      } else if (r > 0.3) {
        out.push({ x: x - 2, y, w: 6, h: 4, f: C.petal });
        out.push({ x: x - 2, y, w: 2, h: 2, f: C.petalDark });
      } else {
        out.push({ x: x - 2, y, w: 6, h: 6, f: C.petalSun });
        out.push({ x, y: y + 2, w: 2, h: 2, f: C.logDark });
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* assemble                                                            */
/* ------------------------------------------------------------------ */

function buildScene(): Rect[] {
  const out: Rect[] = [];
  buildSky(out);
  buildClouds(out);
  buildFarForest(out);
  buildGrass(out);
  buildBushes(out);
  buildTreeShadow(out);
  buildFlowers(out);
  buildLog(out);
  buildTrunk(out);
  buildCanopy(out);
  buildLaptop(out);
  return out;
}

const SCENE = buildScene();

export default function PixelScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SW} ${SH}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {SCENE.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.f} />
      ))}
    </svg>
  );
}
