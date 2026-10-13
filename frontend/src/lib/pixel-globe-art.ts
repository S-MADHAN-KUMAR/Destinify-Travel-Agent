/**
 * Pixel globe art — the Earth as chunky pixel art, after the reference image:
 * black gridded space, a single white marker, and a blocky blue/green globe
 * with white cloud streaks and limb shading.
 *
 * Deterministic and asset-free: the art is generated once at module load on a
 * fixed integer cell grid, then projected orthographically so the landforms
 * are real ones — coarse lon/lat polygons for the coastlines, layered value
 * noise for colour, the sphere normal for shading.
 *
 *   cell:  4 scene units  ->  the globe is ~59 pixels across
 *   view:  Atlantic centred (lon -20 deg) — Americas left, Africa/Europe right
 */
export type Rect = { x: number; y: number; w: number; h: number; f: string };
export type Pt = [number, number]; // [lon, lat]
export const VIEW = 320;
export const CELL = 4;
const COLS = VIEW / CELL; // 80
const CX = VIEW / 2;
const CY = VIEW / 2;
const R = 118;
const LON0 = -20;

/* ------------------------------------------------------------------ */
/* maths + noise                                                       */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const normLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

function hash2(x: number, y: number): number {
  let h = Math.imul(Math.floor(x), 374761393) + Math.imul(Math.floor(y), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    sum += amp * vnoise(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum * 1.06; // â‰ˆ0..1
}

/* ------------------------------------------------------------------ */
/* geography â€” coarse outlines, ~2Â° per pixel at the equator           */
/* ------------------------------------------------------------------ */

const NORTH_AMERICA: Pt[] = [
  [-168, 65], [-163, 60], [-156, 58], [-150, 60], [-140, 60], [-135, 58], [-131, 54],
  [-126, 50], [-124, 44], [-122, 37], [-117, 32], [-114, 28], [-110, 24], [-106, 21],
  [-97, 16], [-92, 15], [-88, 13], [-84, 10], [-80, 9], [-78, 8], [-79, 14], [-84, 20],
  [-88, 21], [-90, 25], [-85, 29], [-82, 27], [-80, 26], [-81, 31], [-76, 35], [-74, 39],
  [-70, 42], [-66, 45], [-61, 46], [-56, 50], [-56, 54], [-64, 58], [-70, 61], [-78, 63],
  [-80, 68], [-84, 70], [-90, 72], [-100, 73], [-110, 72], [-118, 70], [-125, 70],
  [-133, 69], [-141, 70], [-152, 71], [-160, 70], [-166, 68],
];

const GREENLAND: Pt[] = [
  [-52, 60], [-44, 60], [-32, 67], [-22, 70], [-19, 76], [-24, 81], [-38, 83], [-52, 80],
  [-60, 76], [-62, 70], [-58, 64],
];

const SOUTH_AMERICA: Pt[] = [
  [-79, 9], [-74, 11], [-70, 12], [-62, 10], [-52, 5], [-50, 0], [-44, -2], [-37, -5],
  [-35, -8], [-39, -14], [-41, -21], [-48, -25], [-54, -33], [-58, -38], [-62, -41],
  [-65, -47], [-69, -53], [-73, -54], [-74, -48], [-73, -42], [-72, -36], [-71, -30],
  [-70, -23], [-71, -18], [-75, -14], [-78, -7], [-81, -4], [-80, 1], [-78, 5],
];

const AFRICA: Pt[] = [
  [-17, 15], [-16, 21], [-10, 27], [-1, 32], [9, 34], [18, 32], [25, 32], [32, 31],
  [34, 27], [37, 21], [40, 16], [43, 12], [48, 11], [51, 12], [47, 5], [42, -1], [40, -8],
  [37, -15], [34, -22], [30, -30], [25, -34], [19, -35], [15, -29], [13, -23], [12, -17],
  [9, -1], [9, 4], [4, 6], [-2, 5], [-7, 4], [-11, 6], [-14, 10],
];

const EURASIA: Pt[] = [
  [-9, 43], [-9, 38], [-6, 36], [-2, 37], [0, 39], [3, 42], [7, 44], [11, 44], [15, 42],
  [19, 40], [23, 38], [26, 38], [28, 41], [33, 42], [36, 41], [36, 36], [35, 33], [34, 31],
  [34, 28], [38, 22], [41, 16], [43, 13], [45, 15], [48, 20], [51, 24], [54, 17], [57, 20],
  [59, 22], [61, 25], [65, 25], [67, 24], [70, 21], [73, 16], [76, 9], [79, 9], [81, 13],
  [84, 19], [87, 21], [90, 22], [92, 21], [94, 18], [97, 14], [99, 10], [100, 6],
  [103, 1], [104, 7], [107, 10], [109, 14], [110, 18], [113, 22], [117, 23], [120, 26],
  [121, 30], [122, 34], [120, 37], [123, 40], [126, 40], [129, 43], [131, 45], [135, 48],
  [140, 53], [142, 59], [148, 60], [155, 59], [160, 61], [163, 64], [170, 66], [176, 65],
  [180, 66], [180, 71], [172, 71], [160, 70], [150, 72], [140, 74], [132, 73], [125, 74],
  [115, 77], [105, 78], [95, 78], [85, 76], [75, 74], [68, 73], [62, 71], [55, 69],
  [48, 67], [42, 66], [38, 67], [34, 70], [30, 71], [25, 71], [20, 70], [15, 67],
  [11, 64], [7, 62], [5, 59], [7, 56], [9, 54], [6, 53], [3, 52], [0, 51], [-3, 50],
  [-5, 48], [-2, 46], [-2, 44],
];

const AUSTRALIA: Pt[] = [
  [113, -22], [114, -33], [118, -35], [125, -33], [132, -32], [138, -35], [145, -38],
  [150, -37], [153, -28], [146, -19], [142, -11], [136, -12], [130, -11], [125, -14],
  [121, -19],
];

const ISLANDS: Pt[][] = [
  [[-6, 50], [-3, 53], [-3, 58], [-6, 58], [-8, 55], [-6, 51]],                 // Britain
  [[-10, 52], [-10, 55], [-6, 55], [-6, 52]],                                    // Ireland
  [[-24, 64], [-14, 64], [-14, 66], [-23, 66]],                                  // Iceland
  [[129, 32], [134, 34], [141, 36], [143, 42], [140, 45], [136, 37], [131, 33]],  // Japan
  [[95, 5], [106, -6], [104, -7], [96, 3]],                                      // Sumatra
  [[105, -6], [114, -7], [114, -9], [105, -8]],                                  // Java
  [[109, 2], [117, 4], [119, -3], [110, -4]],                                    // Borneo
  [[131, -1], [141, -3], [150, -9], [140, -9], [132, -4]],                       // New Guinea
  [[119, 18], [124, 18], [126, 8], [122, 5], [119, 11]],                         // Philippines
  [[172, -34], [178, -38], [175, -41], [172, -44], [167, -46], [169, -42]],      // New Zealand
  [[43, -16], [48, -14], [50, -18], [47, -25], [44, -22]],                       // Madagascar
  [[80, 6], [82, 7], [81, 10], [79, 8]],                                         // Sri Lanka
  [[-84, 20], [-77, 20], [-75, 23], [-80, 23]],                                  // Cuba
  [[-74, 18], [-69, 18], [-70, 20], [-73, 20]],                                  // Hispaniola
];

const WATER: Pt[][] = [
  [[-95, 60], [-78, 60], [-76, 51], [-90, 51]],          // Hudson Bay
  [[27, 46], [41, 46], [41, 41], [28, 41]],              // Black Sea
  [[47, 47], [54, 47], [54, 37], [47, 37]],              // Caspian Sea
  [[-92, 48], [-76, 48], [-76, 42], [-88, 41]],          // Great Lakes
];

const LAND: Pt[][] = [
  NORTH_AMERICA, GREENLAND, SOUTH_AMERICA, AFRICA, EURASIA, AUSTRALIA, ...ISLANDS,
];

function inPoly(pts: Pt[], lon: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function isLand(lon: number, lat: number): boolean {
  if (lat < -63) return true; // Antarctic ice
  for (const w of WATER) if (inPoly(w, lon, lat)) return false;
  for (const l of LAND) if (inPoly(l, lon, lat)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* palette                                                             */
/* ------------------------------------------------------------------ */

const C = {
  deep: "#1b3a86",
  sea: "#2a55b4",
  seaLight: "#3568c8",
  shallow: "#3f7ad2",
  leaf: "#478a38",
  leafLight: "#5da247",
  forest: "#2f6b34",
  moss: "#3d7a35",
  dry: "#b79c5e",
  sand: "#cdb877",
  ochre: "#a87a45",
  ice: "#e9f1f8",
  iceDim: "#d3e2f0",
  cloud: "#f7fafd",
  cloudDim: "#e0e9f3",
};

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function shade(h: string, k: number): string {
  const [r, g, b] = hex(h);
  const f = (v: number) => clamp(Math.round(v * k), 0, 255);
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/* ------------------------------------------------------------------ */
/* per-cell colouring                                                  */
/* ------------------------------------------------------------------ */

type Cell = {
  i: number;
  j: number;
  u: number;
  v: number;
  z: number;
  d: number;
  lon: number;
  lat: number;
  land: boolean;
};

const LX = -0.45;
const LY = 0.5;
const LZ = 0.74;

function lightAt(c: Cell): number {
  const lam = Math.max(0, c.u * LX + c.v * LY + c.z * LZ);
  const k = 0.42 + 0.8 * lam;
  return Math.min(1.2, k * (1 - 0.3 * smoothstep(0.8, 1, c.d)));
}

function surfaceAt(c: Cell): string {
  const grain = hash2(c.i * 3 + 7, c.j * 5 + 11);
  // coarse, coherent fields: one decides the biome, one the ocean depth
  const eco = fbm(c.lon * 0.05 + 12.3, c.lat * 0.07 + 4.7);
  const depth = fbm(c.lon * 0.05 - 3.1, c.lat * 0.06 + 8.4);

  let base: string;
  if (c.land) {
    const abs = Math.abs(c.lat);
    if (c.lat > 66 || c.lat < -62) {
      base = eco > 0.5 ? C.ice : C.iceDim; // polar ice
    } else if (abs > 15 && abs < 34 && eco > 0.55) {
      base = eco > 0.7 ? C.sand : eco > 0.62 ? C.dry : C.ochre; // desert belts
    } else if (abs > 54) {
      base = eco > 0.5 ? C.forest : C.moss; // boreal
    } else {
      base = eco > 0.6 ? C.leafLight : eco > 0.48 ? C.leaf : C.forest;
    }
    // sparse per-pixel tint: texture, not confetti
    if (grain > 0.88) base = shade(base, 1.16);
    else if (grain < 0.12) base = shade(base, 0.85);
  } else {
    base = depth > 0.68 ? C.shallow : depth < 0.34 ? C.deep : C.sea;
    if (grain > 0.92) base = C.seaLight;
  }

  // diagonal cloud streaks, stretched along a 55° axis (the reference's look)
  const along = (c.lon * 0.55 + c.lat * 0.84) * 0.06 + 30;
  const across = (-c.lon * 0.84 + c.lat * 0.55) * 0.3 + 18;
  const band = fbm(along, across);
  if (band > 0.6) base = band > 0.72 ? C.cloud : C.cloudDim;

  return shade(base, lightAt(c));
}

/* ------------------------------------------------------------------ */
/* assemble                                                            */
/* ------------------------------------------------------------------ */

function buildGlobe(): Rect[] {
  const cells: (Cell | null)[] = new Array(COLS * COLS).fill(null);

  // pass 1 â€” sphere sampling + geographic lookup
  for (let j = 0; j < COLS; j++) {
    for (let i = 0; i < COLS; i++) {
      const x = i * CELL + CELL / 2;
      const y = j * CELL + CELL / 2;
      const u = (x - CX) / R;
      const v = (CY - y) / R;
      const d = Math.sqrt(u * u + v * v);
      if (d > 1) continue;
      const z = Math.sqrt(Math.max(0, 1 - d * d));
      const lat = (Math.asin(clamp(v, -1, 1)) * 180) / Math.PI;
      const lon = normLon((Math.atan2(u, z) * 180) / Math.PI + LON0);
      cells[j * COLS + i] = { i, j, u, v, z, d, lon, lat, land: isLand(lon, lat) };
    }
  }

  // pass 2 â€” dither the coastlines so the edges read as ragged pixels
  for (const c of cells) {
    if (!c || c.land) continue;
    let near = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = cells[(c.j + dj) * COLS + (c.i + di)];
      if (n?.land) near = true;
    }
    if (near && hash2(c.i + 101, c.j + 211) < 0.55) c.land = true;
  }

  // pass 3 â€” colour, then run-length merge into rects
  const out: Rect[] = [];
  for (let j = 0; j < COLS; j++) {
    let start = -1;
    let fill = "";
    const close = (end: number) => {
      if (start >= 0) out.push({ x: start * CELL, y: j * CELL, w: (end - start) * CELL, h: CELL, f: fill });
    };
    for (let i = 0; i <= COLS; i++) {
      const c = i < COLS ? cells[j * COLS + i] : null;
      const f = c ? surfaceAt(c) : "";
      if (f !== fill) {
        close(i);
        start = f ? i : -1;
        fill = f;
      }
    }
  }
  return out;
}

export const SCENE = buildGlobe();
