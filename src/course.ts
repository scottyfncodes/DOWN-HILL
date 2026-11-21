/**
 * The test course: one handcrafted hill, described as pure data plus a height
 * function. Coordinates: x is across the hill (+ right, looking downhill), d is
 * distance downhill, h is height. Rendering maps (x, h, d) to three.js (x, y, -d).
 */

export interface Ramp {
  name: string
  /** Lateral extent of the deck. */
  x0: number
  x1: number
  /** Where the ramp starts and where its lip is. */
  d0: number
  d1: number
  /** Height of the lip above the hill. */
  rise: number
}

export interface Pit {
  x0: number
  x1: number
  d0: number
  d1: number
  depth: number
}

/** A smooth bump along a line on the hill: lane dividers and the banked berm. */
export interface Ridge {
  ax: number
  ad: number
  bx: number
  bd: number
  height: number
  width: number
  /** A one-sided banked wall: high on the left of A→B, sloping down to the line. */
  bank?: boolean
}

export type ObstacleKind = 'rock' | 'tree' | 'tyres' | 'post' | 'bale'

/** Obstacles are circles (r) or segments (bx, bd) in plan, with a height. */
export interface Obstacle {
  kind: ObstacleKind
  x: number
  d: number
  r: number
  bx?: number
  bd?: number
  height: number
}

export const COURSE = {
  name: 'Gravity Hill',
  halfWidth: 7.6,
  /** Beyond this the rider has left the diorama. */
  edge: 9.6,
  startD: 2,
  startRange: [-6.6, 6.6] as [number, number],
  length: 156,
  finishD: 142,
  finishX: 0,
  finishHalf: 2.9,
  ridges: [
    // Lane dividers at the top: three ways down.
    { ax: -3.9, ad: 4, bx: -3.9, bd: 70, height: 0.7, width: 0.4 },
    { ax: 3.9, ad: 4, bx: 3.9, bd: 70, height: 0.7, width: 0.4 },
    // The left route's banked berm: carves riders back toward the middle.
    { ax: -8.4, ad: 62, bx: -3.8, bd: 88, height: 1.2, width: 1.6, bank: true },
  ] as Ridge[],
  ramps: [
    // The big table: long and shallow, built to clear the gap.
    { name: 'The Table', x0: -1.5, x1: 1.5, d0: 44, d1: 53, rise: 1.9 },
    // The kicker: short and steep, pops high but not far.
    { name: 'The Kicker', x0: 4.6, x1: 7.0, d0: 40, d1: 42.6, rise: 0.8 },
  ] as Ramp[],
  pits: [{ x0: -3.3, x1: 3.3, d0: 54.5, d1: 63.5, depth: 5 }] as Pit[],
  obstacles: [
    // A row of boulders across the right route, just past the kicker.
    { kind: 'rock', x: 5.0, d: 48.5, r: 0.75, height: 1.0 },
    { kind: 'rock', x: 6.3, d: 48.0, r: 0.8, height: 1.1 },
    { kind: 'rock', x: 7.5, d: 48.6, r: 0.7, height: 1.0 },
    // The tyre wall that bounces the right route back toward the finish.
    { kind: 'tyres', x: 7.6, d: 80, bx: 5.2, bd: 94, r: 0.55, height: 1.1 },
    // Pines and rocks on the lower hill.
    { kind: 'tree', x: -4.6, d: 100, r: 0.55, height: 3.4 },
    { kind: 'tree', x: 4.2, d: 108, r: 0.55, height: 3.6 },
    { kind: 'rock', x: -0.6, d: 118, r: 0.7, height: 0.9 },
    { kind: 'tree', x: -5.8, d: 124, r: 0.55, height: 3.2 },
    { kind: 'rock', x: 5.6, d: 128, r: 0.8, height: 1.0 },
    // Finish gate posts and the hay bales either side of it.
    { kind: 'post', x: -3.2, d: 142, r: 0.25, height: 3.2 },
    { kind: 'post', x: 3.2, d: 142, r: 0.25, height: 3.2 },
    { kind: 'bale', x: -7.4, d: 142.6, bx: -3.6, bd: 142.6, r: 0.6, height: 1.1 },
    { kind: 'bale', x: 3.6, d: 142.6, bx: 7.4, bd: 142.6, r: 0.6, height: 1.1 },
  ] as Obstacle[],
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

/** Downhill slope (rise per unit) along the course: steep start, rolling middle, gentle run-out. */
function slopeAt(d: number): number {
  if (d < 0) return 0.05
  if (d < 22) return 0.05 + 0.27 * smooth(d / 6)
  if (d < 40) return 0.32 - 0.14 * smooth((d - 22) / 14)
  if (d < 70) return 0.18
  if (d < 100) return 0.18 + 0.06 * Math.sin(((d - 70) / 30) * Math.PI)
  if (d < 135) return 0.18 - 0.06 * smooth((d - 100) / 30)
  return 0.12 - 0.12 * smooth((d - 135) / 16)
}

/** Base height profile, integrated once into a table. */
const STEP = 0.05
const PROFILE = (() => {
  const n = Math.ceil((COURSE.length + 20) / STEP) + 2
  const out = new Float64Array(n)
  let h = 0
  for (let i = 1; i < n; i++) {
    h -= slopeAt((i - 0.5) * STEP - 10) * STEP
    out[i] = h
  }
  return out
})()

function profile(d: number): number {
  const f = (d + 10) / STEP
  const i = Math.max(0, Math.min(PROFILE.length - 2, Math.floor(f)))
  const a = Math.min(1, Math.max(0, f - i))
  return PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * a
}

function ridgeHeight(r: Ridge, x: number, d: number): number {
  const ex = r.bx - r.ax
  const ed = r.bd - r.ad
  const len2 = ex * ex + ed * ed
  const tRaw = ((x - r.ax) * ex + (d - r.ad) * ed) / len2
  const t = Math.max(0, Math.min(1, tRaw))
  const px = r.ax + ex * t
  const pd = r.ad + ed * t
  const dist2 = (x - px) * (x - px) + (d - pd) * (d - pd)
  // Taper both ends over 4 units so riders meet a slope, not a step.
  const len = Math.sqrt(len2)
  const along = tRaw * len
  const taper = smooth(along / 4) * smooth((len - along) / 4)
  if (r.bank) {
    // Signed distance: positive on the left of A→B (the -x side for a line running downhill).
    const side = ((x - r.ax) * ed - (d - r.ad) * ex) / len
    return r.height * taper * smooth(-side / r.width)
  }
  return r.height * taper * Math.exp(-dist2 / (2 * r.width * r.width))
}

/** Lateral profile: a gentle trough so the course holds riders, with raised shoulders at the edges. */
function shoulders(x: number, d: number): number {
  const ax = Math.abs(x)
  // The lower hill is a shallow valley that gathers riders toward the finish.
  const trough = 0.0015 * smooth((d - 92) / 20)
  return trough * x * x + 1.4 * smooth((ax - COURSE.halfWidth) / 1.4)
}

function rampHeight(r: Ramp, x: number, d: number): number {
  // The back face is sheer: past the lip the deck is simply gone, so riders take off.
  if (d < r.d0 || d > r.d1) return 0
  const side = smooth((x - r.x0) / 0.25) * smooth((r.x1 - x) / 0.25)
  if (side <= 0) return 0
  const t = (d - r.d0) / (r.d1 - r.d0)
  // A curved transition: flat at the toe, steepest at the lip.
  return r.rise * side * t * t
}

function pitDepth(p: Pit, x: number, d: number): number {
  const wall = 0.6
  const fx = smooth((x - p.x0) / wall) * smooth((p.x1 - x) / wall)
  const fd = smooth((d - p.d0) / wall) * smooth((p.d1 - d) / wall)
  return p.depth * fx * fd
}

/** Terrain height as if the gap were filled in (for shading the gap and framing the camera). */
export function groundLevel(x: number, d: number): number {
  let h = profile(d) + shoulders(x, d)
  for (const r of COURSE.ridges) h += ridgeHeight(r, x, d)
  return h
}

/** Height of the terrain without ramps (what the renderer meshes). */
export function terrainHeight(x: number, d: number): number {
  let h = profile(d) + shoulders(x, d)
  for (const r of COURSE.ridges) h += ridgeHeight(r, x, d)
  for (const p of COURSE.pits) h -= pitDepth(p, x, d)
  return h
}

/** Height of the riding surface (terrain plus ramp decks). */
export function surfaceHeight(x: number, d: number): number {
  let h = terrainHeight(x, d)
  for (const r of COURSE.ramps) h += rampHeight(r, x, d)
  return h
}

export function inPit(x: number, d: number): boolean {
  return COURSE.pits.some((p) => x > p.x0 && x < p.x1 && d > p.d0 && d < p.d1)
}

/** Ramp-deck height above the terrain, for rendering. */
export function rampDeck(r: Ramp, x: number, d: number): number {
  return rampHeight(r, x, d)
}
