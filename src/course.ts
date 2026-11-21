/**
 * The hills: each one handcrafted, described as pure data plus a height
 * function. Coordinates: x is across the hill (+ right, looking downhill), d is
 * distance downhill, h is height. Rendering maps (x, h, d) to three.js (x, y, -d).
 *
 * One hill is active at a time (`useHill`). `COURSE` is a live binding to it,
 * so the physics, the renderer and the camera all read the same hill.
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
  /** Plank bridges across the pit: [x0, x1] spans that stay at ground level. */
  bridges?: Array<[number, number]>
}

/** A smooth bump along a line on the hill: lane dividers, rollers and banked berms. */
export interface Ridge {
  ax: number
  ad: number
  bx: number
  bd: number
  height: number
  width: number
  /** A one-sided banked wall: high on the left of A→B, sloping down to the line. */
  bank?: boolean
  /** How it is painted: a hedge divider, turf, or bare dirt (rollers). */
  look?: 'hedge' | 'turf' | 'dirt'
}

/** A patch of mud: an ellipse that drags at the wheels. */
export interface Mud {
  x: number
  d: number
  rx: number
  rd: number
}

export type ObstacleKind = 'rock' | 'tree' | 'tyres' | 'post' | 'bale' | 'sheep'

/** Obstacles are circles (r) or segments (bx, bd) in plan, with a height. */
export interface Obstacle {
  kind: ObstacleKind
  x: number
  d: number
  r: number
  bx?: number
  bd?: number
  height: number
  /** A mover (sheep) wanders from (x, d) to (bx, bd) and back once every `period` seconds. */
  period?: number
  phase?: number
}

/** A named stretch of the hill, for signs and the run report. */
export interface Section {
  d: number
  name: string
}

export interface Hill {
  id: string
  name: string
  /** One line under the title before the first run: what this hill asks of you. */
  brief: string
  halfWidth: number
  /** Beyond this the rider has left the diorama. */
  edge: number
  startD: number
  startRange: [number, number]
  length: number
  finishD: number
  finishX: number
  finishHalf: number
  /** The longest a run can take before it is called a stall. */
  maxTime: number
  /** Crests launch the board when taken fast (later hills); Gravity Hill only launches off sheer lips. */
  trueCrests?: boolean
  /** Downhill slope (rise per unit) at distance d. */
  slope: (d: number) => number
  /** Where the lower hill starts to gather riders into a shallow valley. */
  troughFrom: number
  ridges: Ridge[]
  ramps: Ramp[]
  pits: Pit[]
  mud: Mud[]
  obstacles: Obstacle[]
  sections: Section[]
  /** Painted centre dashes: lane centres and the stretch they run. */
  dashes: { xs: number[]; d0: number; d1: number }
}

export const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

/** A slope profile from key points [d, slope], eased between them. */
export function slopeFrom(keys: Array<[number, number]>): (d: number) => number {
  return (d: number) => {
    if (d <= keys[0][0]) return keys[0][1]
    for (let i = 1; i < keys.length; i++) {
      const [d1, s1] = keys[i]
      if (d < d1) {
        const [d0, s0] = keys[i - 1]
        return s0 + (s1 - s0) * smooth((d - d0) / (d1 - d0))
      }
    }
    return keys[keys.length - 1][1]
  }
}

/** Gravity Hill's slope: steep start, rolling middle, gentle run-out. */
function gravitySlope(d: number): number {
  if (d < 0) return 0.05
  if (d < 22) return 0.05 + 0.27 * smooth(d / 6)
  if (d < 40) return 0.32 - 0.14 * smooth((d - 22) / 14)
  if (d < 70) return 0.18
  if (d < 100) return 0.18 + 0.06 * Math.sin(((d - 70) / 30) * Math.PI)
  if (d < 135) return 0.18 - 0.06 * smooth((d - 100) / 30)
  return 0.12 - 0.12 * smooth((d - 135) / 16)
}

/** The first hill, exactly as it has always been. */
export const GRAVITY_HILL: Hill = {
  id: 'gravity',
  name: 'Gravity Hill',
  brief: 'Three ways down. Pick one.',
  halfWidth: 7.6,
  edge: 9.6,
  startD: 2,
  startRange: [-6.6, 6.6],
  length: 156,
  finishD: 142,
  finishX: 0,
  finishHalf: 2.9,
  maxTime: 40,
  slope: gravitySlope,
  troughFrom: 92,
  ridges: [
    // Lane dividers at the top: three ways down.
    { ax: -3.9, ad: 4, bx: -3.9, bd: 70, height: 0.7, width: 0.4, look: 'hedge' },
    { ax: 3.9, ad: 4, bx: 3.9, bd: 70, height: 0.7, width: 0.4, look: 'hedge' },
    // The left route's banked berm: carves riders back toward the middle.
    { ax: -8.4, ad: 62, bx: -3.8, bd: 88, height: 1.2, width: 1.6, bank: true, look: 'turf' },
  ],
  ramps: [
    // The big table: long and shallow, built to clear the gap.
    { name: 'The Table', x0: -1.5, x1: 1.5, d0: 44, d1: 53, rise: 1.9 },
    // The kicker: short and steep, pops high but not far.
    { name: 'The Kicker', x0: 4.6, x1: 7.0, d0: 40, d1: 42.6, rise: 0.8 },
  ],
  pits: [{ x0: -3.3, x1: 3.3, d0: 54.5, d1: 63.5, depth: 5 }],
  mud: [],
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
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 38, name: 'The Table' },
    { d: 54, name: 'The Gap' },
    { d: 64, name: 'The Bank' },
    { d: 96, name: 'The Pines' },
    { d: 136, name: 'The Gate' },
  ],
  dashes: { xs: [-5.75, 0, 5.75], d0: 4, d1: 40 },
}

// ————— The active hill —————

export let COURSE: Hill = GRAVITY_HILL

/** Base height profile, integrated once per hill into a table. */
const STEP = 0.05
let PROFILE = new Float64Array(2)

/** Features bucketed along the hill, so a height lookup only visits what is nearby. */
const BUCKET = 4
interface Near {
  ridges: Ridge[]
  pits: Pit[]
  ramps: Ramp[]
  mud: Mud[]
  obstacles: Obstacle[]
}
let NEAR: Near[] = []
const EMPTY: Near = { ridges: [], pits: [], ramps: [], mud: [], obstacles: [] }

function bucketIndex(d: number) {
  return Math.floor((d + 12) / BUCKET)
}

function build(h: Hill) {
  const n = Math.ceil((h.length + 20) / STEP) + 2
  const out = new Float64Array(n)
  let y = 0
  for (let i = 1; i < n; i++) {
    y -= h.slope((i - 0.5) * STEP - 10) * STEP
    out[i] = y
  }
  PROFILE = out
  const count = bucketIndex(h.length + 30) + 1
  NEAR = Array.from({ length: count }, () => ({ ridges: [], pits: [], ramps: [], mud: [], obstacles: [] }) as Near)
  const add = <K extends keyof Near>(key: K, item: Near[K][number], d0: number, d1: number) => {
    const a = Math.max(0, bucketIndex(d0))
    const b = Math.min(count - 1, bucketIndex(d1))
    for (let i = a; i <= b; i++) (NEAR[i][key] as Array<typeof item>).push(item)
  }
  // Order within each bucket follows the hill's own order, so sums are identical to a full scan.
  for (const r of h.ridges) {
    // A ridge is non-zero only where the point projects inside A→B (the taper is exactly 0 beyond),
    // so its reach along the hill is where those end lines cross the width of the diorama.
    const ex = r.bx - r.ax
    const ed = r.bd - r.ad
    if (Math.abs(ed) < 1e-6) {
      add('ridges', r, r.ad - r.width * 7, r.ad + r.width * 7)
    } else {
      const ends = [-14, 14].flatMap((x) => [r.ad - ((x - r.ax) * ex) / ed, r.bd - ((x - r.bx) * ex) / ed])
      add('ridges', r, Math.min(...ends) - 0.5, Math.max(...ends) + 0.5)
    }
  }
  for (const p of h.pits) add('pits', p, p.d0 - 1, p.d1 + 1)
  for (const r of h.ramps) add('ramps', r, r.d0 - 0.5, r.d1 + 0.5)
  for (const m of h.mud) add('mud', m, m.d - m.rd - 0.5, m.d + m.rd + 0.5)
  for (const o of h.obstacles) {
    const reach = o.r + 1.5
    add('obstacles', o, Math.min(o.d, o.bd ?? o.d) - reach, Math.max(o.d, o.bd ?? o.d) + reach)
  }
}

/** Make a hill the active one. */
export function useHill(h: Hill) {
  if (h === COURSE && PROFILE.length > 2) return
  COURSE = h
  build(h)
}
build(COURSE)

export function near(d: number): Near {
  return NEAR[bucketIndex(d)] ?? EMPTY
}

function profile(d: number): number {
  const f = (d + 10) / STEP
  const i = Math.max(0, Math.min(PROFILE.length - 2, Math.floor(f)))
  const a = Math.min(1, Math.max(0, f - i))
  return PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * a
}

/** The raw slope at d, for the run report's elevation strip. */
export function profileHeight(d: number): number {
  return profile(d)
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
  const trough = 0.0015 * smooth((d - COURSE.troughFrom) / 20)
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

function onBridge(p: Pit, x: number): boolean {
  if (!p.bridges) return false
  for (const [a, b] of p.bridges) if (x > a && x < b) return true
  return false
}

function pitDepth(p: Pit, x: number, d: number): number {
  if (onBridge(p, x)) return 0
  const wall = 0.6
  const fx = smooth((x - p.x0) / wall) * smooth((p.x1 - x) / wall)
  const fd = smooth((d - p.d0) / wall) * smooth((p.d1 - d) / wall)
  return p.depth * fx * fd
}

/** Terrain height as if the gaps were filled in (for shading the gap and framing the camera). */
export function groundLevel(x: number, d: number): number {
  const n = near(d)
  let h = profile(d) + shoulders(x, d)
  for (const r of n.ridges) h += ridgeHeight(r, x, d)
  return h
}

/** Height of the terrain without ramps (what the renderer meshes). */
export function terrainHeight(x: number, d: number): number {
  const n = near(d)
  let h = profile(d) + shoulders(x, d)
  for (const r of n.ridges) h += ridgeHeight(r, x, d)
  for (const p of n.pits) h -= pitDepth(p, x, d)
  return h
}

/** Height of the riding surface (terrain plus ramp decks). */
export function surfaceHeight(x: number, d: number): number {
  const n = near(d)
  let h = terrainHeight(x, d)
  for (const r of n.ramps) h += rampHeight(r, x, d)
  return h
}

/** The pit the point is over (bridges excepted), if any. */
export function pitAt(x: number, d: number): Pit | null {
  for (const p of near(d).pits) if (x > p.x0 && x < p.x1 && d > p.d0 && d < p.d1 && !onBridge(p, x)) return p
  return null
}

export function inPit(x: number, d: number): boolean {
  return pitAt(x, d) !== null
}

/** How much mud is under the wheels here: 0 (clean) to 1 (the middle of a patch). */
export function mudAt(x: number, d: number): number {
  let m = 0
  for (const p of near(d).mud) {
    const u = (x - p.x) / p.rx
    const v = (d - p.d) / p.rd
    const r = Math.sqrt(u * u + v * v)
    if (r < 1) m = Math.max(m, smooth((1 - r) / 0.25))
  }
  return m
}

/** Where a mover (a sheep) is at time t after launch; fixed obstacles stay put. */
export function obstacleAt(o: Obstacle, t: number): { x: number; d: number; dir: number } {
  if (!o.period || o.bx === undefined || o.bd === undefined) return { x: o.x, d: o.d, dir: 0 }
  const a = (2 * Math.PI * t) / o.period + (o.phase ?? 0)
  const k = (1 - Math.cos(a)) / 2
  return { x: o.x + (o.bx - o.x) * k, d: o.d + (o.bd - o.d) * k, dir: Math.sin(a) }
}

/** The named stretch of hill at distance d. */
export function sectionAt(d: number): Section {
  let s = COURSE.sections[0]
  for (const c of COURSE.sections) if (d >= c.d) s = c
  return s
}

/** Ramp-deck height above the terrain, for rendering. */
export function rampDeck(r: Ramp, x: number, d: number): number {
  return rampHeight(r, x, d)
}
