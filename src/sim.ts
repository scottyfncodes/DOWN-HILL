import { COURSE, inPit, surfaceHeight, type Obstacle } from './course'

/**
 * Hands-off rider physics. Deterministic, fixed 240 Hz, and computed in full
 * at launch; the renderer only plays the run back.
 *
 * The rider is a board, not a marble: wheels roll along the heading and do not
 * slide sideways. Side-slope gravity makes the rider lean and carve (it turns
 * the heading instead of pushing the board sideways), so the board follows
 * valleys, rides up banks and comes back down them like a longboarder would.
 * Off a lip the rider flies ballistically and lands on the surface below.
 */

export const DT = 1 / 240
const G = 9.8
const ROLL = 0.018 // rolling resistance (fraction of g)
const DRAG = 0.0042 // air drag per speed²
const CARVE = 0.92 // how much side-slope gravity turns into carving
const MIN_TURN_SPEED = 2.2
const SETTLE = 0.45 // riders settle toward the fall line instead of swinging forever
const LAUNCH_SPEED = 1.2 // initial push off the start line
const HARD_LANDING = 9.5 // normal speed that ends a run on landing
const CRASH_IMPACT = 3.2 // normal speed into an obstacle that ends a run
const MAX_TIME = 40
export const RECORD_EVERY = 4 // 60 Hz playback
export const STRIDE = 8 // x, d, y, heading, lean, pitch, air, speed

export type Outcome = 'finish' | 'gap' | 'edge' | 'rock' | 'tree' | 'post' | 'bale' | 'landing' | 'stall'

export type RunEvent =
  | { t: number; kind: 'takeoff'; speed: number }
  | { t: number; kind: 'land'; impact: number }
  | { t: number; kind: 'bounce'; impact: number; what: Obstacle['kind'] }
  | { t: number; kind: 'graze'; what: Obstacle['kind'] }
  | { t: number; kind: 'crash'; what: Outcome }
  | { t: number; kind: 'finish' }

export interface RunResult {
  outcome: Outcome
  frames: Float32Array
  frameDt: number
  time: number
  events: RunEvent[]
  /** Where and how fast the run ended (for the crash tumble or the finish roll-out). */
  end: { x: number; d: number; y: number; vx: number; vd: number; vy: number; heading: number }
  maxAir: number
  topSpeed: number
}

function normalAt(x: number, d: number) {
  const e = 0.04
  const hx = (surfaceHeight(x + e, d) - surfaceHeight(x - e, d)) / (2 * e)
  const hd = (surfaceHeight(x, d + e) - surfaceHeight(x, d - e)) / (2 * e)
  return { hx, hd }
}

/** Closest point and distance from the rider to an obstacle footprint. */
function obstacleContact(o: Obstacle, x: number, d: number, riderR: number) {
  let px = o.x
  let pd = o.d
  if (o.bx !== undefined && o.bd !== undefined) {
    const ex = o.bx - o.x
    const ed = o.bd - o.d
    const t = Math.max(0, Math.min(1, ((x - o.x) * ex + (d - o.d) * ed) / (ex * ex + ed * ed)))
    px = o.x + ex * t
    pd = o.d + ed * t
  }
  const dx = x - px
  const dd = d - pd
  const dist = Math.sqrt(dx * dx + dd * dd)
  const depth = o.r + riderR - dist
  if (depth <= 0) return null
  return { nx: dist > 1e-9 ? dx / dist : 0, nd: dist > 1e-9 ? dd / dist : -1, depth }
}

export function simulateRun(startX: number): RunResult {
  let x = startX
  let d = COURSE.startD
  let y = surfaceHeight(x, d)
  let heading = 0 // radians; 0 = straight downhill, + = toward +x
  let speed = LAUNCH_SPEED
  let air = false
  let vx = 0
  let vd = 0
  let vy = 0
  let groundVy = 0
  let lean = 0
  let airTime = 0
  let maxAir = 0
  let topSpeed = 0
  let slowFor = 0
  const events: RunEvent[] = []
  const frames: number[] = []
  const hit = new Map<Obstacle, number>()
  let outcome: Outcome | null = null
  const steps = Math.round(MAX_TIME / DT)
  let step = 0

  const record = () => {
    const sp = air ? Math.hypot(vx, vd) : speed
    const pitch = air ? Math.atan2(vy, Math.max(0.5, Math.hypot(vx, vd))) : Math.atan2(groundVy, Math.max(0.5, speed))
    frames.push(x, d, y, heading, lean, pitch, air ? 1 : 0, sp)
  }
  record()

  for (; step < steps && !outcome; step++) {
    const t = (step + 1) * DT
    if (!air) {
      const { hx, hd } = normalAt(x, d)
      const k = 1 / (1 + hx * hx + hd * hd)
      const gx = -G * hx * k
      const gd = -G * hd * k
      const dirx = Math.sin(heading)
      const dird = Math.cos(heading)
      const along = gx * dirx + gd * dird
      const lateral = gx * dird - gd * dirx // positive pushes toward +x side of the heading
      speed += (along - ROLL * G - DRAG * speed * speed) * DT
      if (speed < 0) speed = 0
      // Carve: side-slope gravity turns the board (centripetal), it does not slide it.
      const turn = (CARVE * lateral) / Math.max(speed, MIN_TURN_SPEED)
      heading += turn * DT
      // Settle toward the fall line (wrapped to the nearest direction).
      const fall = Math.atan2(gx, gd)
      let off = fall - heading
      off = Math.atan2(Math.sin(off), Math.cos(off))
      // Only when the fall line is ahead: going up a ramp, gravity points back and must not turn the rider round.
      if (Math.hypot(gx, gd) > 0.4 && Math.cos(off) > 0.2) heading += off * SETTLE * DT
      lean += (Math.atan2(turn * Math.max(speed, MIN_TURN_SPEED), G) - lean) * Math.min(1, DT * 10)
      const ox = x
      const od = d
      x += Math.sin(heading) * speed * DT
      d += Math.cos(heading) * speed * DT
      const ground = surfaceHeight(x, d)
      // Take off where the ground falls away faster than gravity can follow.
      const ballistic = y + groundVy * DT - 0.5 * G * DT * DT
      if (ground < ballistic - 0.004 && speed > 3) {
        air = true
        vx = (x - ox) / DT
        vd = (d - od) / DT
        vy = groundVy - G * DT
        y = ballistic
        airTime = 0
        events.push({ t, kind: 'takeoff', speed })
      } else {
        groundVy = (ground - y) / DT
        y = ground
      }
    } else {
      airTime += DT
      vy -= G * DT
      const s = Math.hypot(vx, vd)
      const drag = 1 - DRAG * s * DT
      vx *= drag
      vd *= drag
      x += vx * DT
      d += vd * DT
      y += vy * DT
      heading += (Math.atan2(vx, vd) - heading) * Math.min(1, DT * 6)
      lean *= 1 - Math.min(1, DT * 4)
      const ground = surfaceHeight(x, d)
      if (y <= ground) {
        maxAir = Math.max(maxAir, airTime)
        const { hx, hd } = normalAt(x, d)
        const n = Math.hypot(-hx, 1, -hd)
        const nx = -hx / n
        const ny = 1 / n
        const nd = -hd / n
        const vn = vx * nx + vy * ny + vd * nd
        const tx = vx - vn * nx
        const ty = vy - vn * ny
        const td = vd - vn * nd
        y = ground
        if (inPit(x, d) && -vn > 4) {
          outcome = 'gap'
        } else if (-vn > HARD_LANDING) {
          outcome = 'landing'
        } else {
          air = false
          // The knees soak up the landing; a heavy one costs a little speed.
          speed = Math.hypot(tx, ty, td) * (1 - 0.18 * Math.min(1, -vn / HARD_LANDING))
          heading = Math.atan2(tx, td)
          groundVy = ty
          events.push({ t, kind: 'land', impact: -vn })
        }
      }
    }

    // Obstacles: low ones can be cleared in the air.
    const groundHere = surfaceHeight(x, d)
    for (const o of COURSE.obstacles) {
      if (y - groundHere > o.height * 0.85) continue
      const c = obstacleContact(o, x, d, 0.35)
      if (!c) continue
      const vxs = air ? vx : Math.sin(heading) * speed
      const vds = air ? vd : Math.cos(heading) * speed
      const vn = vxs * c.nx + vds * c.nd
      x += c.nx * c.depth
      d += c.nd * c.depth
      if (vn >= 0) continue
      const last = hit.get(o)
      if (o.kind === 'tyres') {
        // Rubber: a lively bounce that sends the rider on, never a crash.
        const rx = vxs - 1.75 * vn * c.nx
        const rd = vds - 1.75 * vn * c.nd
        if (air) {
          vx = rx
          vd = rd
        } else {
          speed = Math.hypot(rx, rd)
          heading = Math.atan2(rx, rd)
        }
        if (last === undefined || t - last > 0.2) events.push({ t, kind: 'bounce', impact: -vn, what: o.kind })
        hit.set(o, t)
      } else if (-vn > CRASH_IMPACT) {
        outcome = o.kind === 'tree' ? 'tree' : o.kind === 'post' ? 'post' : o.kind === 'bale' ? 'bale' : 'rock'
        vx = vxs
        vd = vds
        break
      } else {
        // A glancing touch: slide along it, a little slower.
        const tx = vxs - vn * c.nx
        const td = vds - vn * c.nd
        if (air) {
          vx = tx * 0.9
          vd = td * 0.9
        } else {
          speed = Math.hypot(tx, td) * 0.9
          heading = Math.atan2(tx, td)
        }
        if (last === undefined || t - last > 0.3) events.push({ t, kind: 'graze', what: o.kind })
        hit.set(o, t)
      }
    }

    if (!outcome && Math.abs(x) > COURSE.edge) outcome = 'edge'
    if (!outcome && !air && inPit(x, d) && y < surfaceHeight(x, COURSE.pits[0].d0 - 1) - 2.5) outcome = 'gap'
    if (!outcome && d >= COURSE.finishD && Math.abs(x - COURSE.finishX) < COURSE.finishHalf) outcome = 'finish'
    if (!outcome && !air && speed < 0.25 && step > 240) {
      slowFor += DT
      if (slowFor > 1) outcome = 'stall'
    } else slowFor = 0
    if (!outcome && d > COURSE.length) outcome = 'bale'

    const sp = air ? Math.hypot(vx, vd) : speed
    if (sp > topSpeed) topSpeed = sp
    if ((step + 1) % RECORD_EVERY === 0) record()
  }

  if (!outcome) outcome = 'stall'
  if (!air) {
    vx = Math.sin(heading) * speed
    vd = Math.cos(heading) * speed
    vy = groundVy
  }
  events.push(outcome === 'finish' ? { t: (step + 1) * DT, kind: 'finish' } : { t: (step + 1) * DT, kind: 'crash', what: outcome })
  record()
  return {
    outcome,
    frames: new Float32Array(frames),
    frameDt: DT * RECORD_EVERY,
    time: step * DT,
    events,
    end: { x, d, y, vx, vd, vy, heading },
    maxAir,
    topSpeed,
  }
}
