import { COURSE, obstacleAt, pitAt, sectionAt, type Obstacle, type Pit } from './course'
import { simulateRun, STRIDE, type RunResult, type Stance } from './sim'

/**
 * The run report's "why": what ended a run, measured from the run itself, and
 * what to change. Every number here comes from the simulation (where the
 * rider was, how fast, when), so the advice is the same every time for the
 * same line and stance.
 */

export interface Reading {
  /** What happened, in one sentence. */
  why: string
  /** What to try next, or '' when there is nothing useful to add. */
  advice: string
}

const KMH = 3.6
const RIDER = 0.35
const NAME: Record<Stance, string> = { tuck: 'Tuck', cruise: 'Cruise', tall: 'Tall' }
const m = (v: number) => `${Math.abs(v).toFixed(1)} m`
const side = (dx: number) => (dx < 0 ? 'left' : 'right')

/** The rider's x where the run first reached distance d. */
function xAt(r: RunResult, d: number): number | null {
  const n = r.frames.length / STRIDE
  for (let i = 0; i < n; i++) if (r.frames[i * STRIDE + 1] >= d) return r.frames[i * STRIDE]
  return null
}

/**
 * The stance to suggest, or '' when there is none to suggest: on a hill without stances
 * (Gravity Hill), when there is no faster or slower one, or when that stance, ridden from the
 * same line, would not get past this point. The run is deterministic, so this is checked, not
 * guessed: advice the game gives is advice that works here.
 */
let current: RunResult | null = null
const BY_NAME: Record<string, Stance> = { Tuck: 'tuck', Cruise: 'cruise', Tall: 'tall' }
function verified(name: string): string {
  if (!name || !current) return name
  const r = current
  const alt = simulateRun(r.cause.line, BY_NAME[name])
  return alt.outcome === 'finish' || alt.end.d > r.end.d + 1 ? name : ''
}
/** Which way to move the start line so the path at distance d moves toward `dir` (-1 left, +1 right). Tested, not assumed. */
function nudgeFor(r: RunResult, d: number, dir: number): string {
  const x = xAt(r, d)
  if (x === null) return ''
  // A direction counts only if a small and a bigger nudge both move the path the right way there.
  const moves = (k: number, step: number) => {
    const c = xAt(simulateRun(r.cause.line + k * step, r.cause.stance), d)
    return c !== null && Math.sign(c - x) === dir && Math.abs(c - x) > 0.005
  }
  for (const k of [-1, 1]) if (moves(k, 0.1) && moves(k, 0.3)) return k < 0 ? 'left' : 'right'
  return ''
}
const nudgeText = (want: string, n: string) => (n ? `nudge the line ${n}${n !== want ? ' (the hill turns it round)' : ''}` : 'try a different line to get there')

/** The nearest slower (or faster) stance that, from the same line, gets past this point. */
const slower = (s: Stance) => (!COURSE.stances ? '' : (s === 'tuck' ? ['Cruise', 'Tall'] : s === 'cruise' ? ['Tall'] : []).map(verified).find(Boolean) ?? '')
const faster = (s: Stance) => (!COURSE.stances ? '' : (s === 'tall' ? ['Cruise', 'Tuck'] : s === 'cruise' ? ['Tuck'] : []).map(verified).find(Boolean) ?? '')
/** "Already tucked: …" only makes sense where stances exist. */
const already = (what: string, rest: string) => (COURSE.stances ? `${what}: ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1))
/** Whether this run went through mud (only then is "keep out of the mud" useful advice). */
let muddyRun = false
const muddy = () => muddyRun

/** The ways over a pit: ramps whose lip is just above it and plank bridges, as x ranges. */
function crossings(p: Pit): Array<{ name: string; x0: number; x1: number; plank: boolean }> {
  const out: Array<{ name: string; x0: number; x1: number; plank: boolean }> = []
  for (const r of COURSE.ramps) if (r.d1 <= p.d0 + 0.5 && r.d1 > p.d0 - 4) out.push({ name: r.name.replace(/^The /, 'the '), x0: r.x0, x1: r.x1, plank: false })
  for (const [x0, x1] of p.bridges ?? []) out.push({ name: 'the plank', x0, x1, plank: true })
  return out
}

function gapReading(r: RunResult, stance: Stance): Reading {
  const e = r.end
  // The pit the rider went into (the end point may sit just past its walls).
  let pit: Pit | null = pitAt(e.x, e.d)
  if (!pit) {
    let best = Infinity
    for (const p of COURSE.pits) {
      const dd = e.d < p.d0 ? p.d0 - e.d : e.d > p.d1 ? e.d - p.d1 : 0
      if (dd < best && e.x > p.x0 - 1 && e.x < p.x1 + 1) {
        best = dd
        pit = p
      }
    }
  }
  const where = sectionAt(pit ? pit.d0 : e.d).name
  const takeoffs = r.events.filter((ev) => ev.kind === 'takeoff') as Array<{ t: number; speed: number; x: number; d: number }>
  const last = takeoffs[takeoffs.length - 1]
  // Jumped from a ramp's lip just before the pit but came down inside it: short. (Rolling off
  // the brink also leaves the ground, but no amount of speed is the answer to that.)
  const fromRamp = last && COURSE.ramps.some((rp) => last.x > rp.x0 - 0.3 && last.x < rp.x1 + 0.3 && last.d > rp.d1 - 1.5 && last.d < rp.d1 + 0.5)
  if (pit && last && fromRamp && last.d > pit.d0 - 6 && last.d < pit.d1) {
    const flown = e.d - last.d
    const needed = pit.d1 + 0.6 - last.d
    const short = needed - flown
    if (short > 0.05 && flown > 0.5) {
      const need = last.speed * Math.sqrt(needed / flown)
      const more = Math.max(1, Math.round((need - last.speed) * KMH))
      const f = faster(stance)
      return {
        why: `Came down ${m(short)} short of the far side of ${where}, taking off at ${Math.round(last.speed * KMH)} km/h.`,
        advice: f
          ? `About ${more} km/h more would carry it: try ${f}${muddy() ? ', or a line that keeps out of the mud' : ''}.`
          : stance === 'tuck' || !COURSE.stances
            ? already(`Even tucked it needs about ${more} km/h more`, `${muddy() ? 'a line with less mud, or ' : ''}a different way over.`)
            : `It needs about ${more} km/h more, and no stance gives it that here: ${muddy() ? 'a line with less mud, or ' : ''}a different way over.`,
      }
    }
  }
  // Rolled in: say where the nearest way over was.
  if (pit) {
    const x = xAt(r, pit.d0 - 0.5) ?? e.x
    const ways = crossings(pit)
    let best: { name: string; dx: number; plank: boolean } | null = null
    for (const w of ways) {
      const dx = x < w.x0 ? w.x0 + 0.15 - x : x > w.x1 ? w.x1 - 0.15 - x : 0
      if (dx !== 0 && (!best || Math.abs(dx) < Math.abs(best.dx))) best = { name: w.name, dx, plank: w.plank }
    }
    if (best) {
      const nudge = nudgeFor(r, pit.d0 - 0.5, Math.sign(best.dx))
      return {
        why: `Reached ${where} ${m(best.dx)} to the ${side(-best.dx)} of ${best.name}.`,
        advice: `Your path needs to cross ${m(best.dx)} further ${side(best.dx)}: ${nudgeText(side(best.dx), nudge)}.`,
      }
    }
  }
  return { why: `Dropped into ${where}.`, advice: 'Look for the ramp or the plank: the survey (the eye) shows where they are.' }
}

/** For a sheep: how much earlier or later the rider would have had to arrive to miss it. */
function sheepReading(r: RunResult, o: Obstacle, stance: Stance): Reading {
  const e = r.end
  const t = r.time
  const clear = (dt: number) => {
    const s = obstacleAt(o, t + dt)
    return Math.hypot(s.x - e.x, s.d - e.d) > o.r + RIDER + 0.25
  }
  let early = 0
  let late = 0
  for (let k = 1; k <= 200; k++) {
    if (!late && clear(-k * 0.02)) late = k * 0.02
    if (!early && clear(k * 0.02)) early = k * 0.02
    if (late && early) break
  }
  const where = sectionAt(o.d).name
  // Arriving later means slowing down; earlier means speeding up.
  if (early && (!late || early <= late)) {
    const s = slower(stance)
    return {
      why: `Reached the sheep at ${where} ${early.toFixed(1)} s too early: it was still crossing your line.`,
      advice: s ? `Arrive later: try ${s}, or a line that loses a little speed before ${where}.` : already('Already as slow as it goes', 'a line that meets the sheep at the other end of its walk.'),
    }
  }
  const f = faster(stance)
  return {
    why: `Reached the sheep at ${where} ${late.toFixed(1)} s too late: it had wandered onto your line.`,
    advice: f ? `Arrive sooner: try ${f}${muddy() ? `, or a line with less mud before ${where}` : ''}.` : already('Already tucked', 'a line that meets the sheep at the other end of its walk.'),
  }
}

function obstacleReading(r: RunResult, o: Obstacle): Reading {
  const e = r.end
  const what = o.kind === 'tree' ? 'a pine' : o.kind === 'post' ? 'the gate post' : o.kind === 'bale' ? 'the hay bales' : 'a boulder'
  const where = sectionAt(o.d).name
  if (o.kind === 'bale' || o.kind === 'post') {
    // Missed the gate: how far off its middle.
    const half = COURSE.finishHalf
    const dx = e.x - COURSE.finishX
    const off = Math.abs(dx) - half + RIDER + 0.1
    const n = nudgeFor(r, Math.min(e.d, COURSE.finishD) - 1, dx > 0 ? -1 : 1)
    return {
      why: `Reached the gate ${m(Math.max(0.1, off))} too far ${side(dx)} and caught ${what}.`,
      advice: `The gate is to your ${side(-dx)}: finish ${m(Math.max(0.1, off))} further ${side(-dx)}, so ${nudgeText(side(-dx), n)}.`,
    }
  }
  const dx = e.x - o.x
  const need = o.r + RIDER - Math.abs(dx) + 0.05
  const dir = dx >= 0 ? 1 : -1
  const n = nudgeFor(r, o.d - 1.5, dir)
  return {
    why: `Clipped ${what} at ${where}, ${m(Math.abs(dx))} off its middle.`,
    advice: `${m(need)} further ${side(dir)} on the way past would miss it: ${nudgeText(side(dir), n)}.`,
  }
}

/** Read a finished run: why it ended, and what to change. */
export function readRun(r: RunResult): Reading {
  const stance = r.cause.stance
  muddyRun = r.events.some((ev) => ev.kind === 'mud')
  current = r
  const e = r.end
  const where = sectionAt(e.d).name
  const speed = Math.round(Math.hypot(e.vx, e.vd) * KMH)
  switch (r.outcome) {
    case 'finish':
      return { why: '', advice: '' }
    case 'gap':
      return gapReading(r, stance)
    case 'landing': {
      const impact = r.cause.impact ?? 0
      const s = slower(stance)
      return {
        why: `Came down at ${impact.toFixed(1)} m/s at ${where}; the knees take 9.5.`,
        advice: s ? `Carry less speed into it: try ${s}, or a line that lands on a downslope.` : already('Already as slow as it goes', 'a line that lands on the downslope, not the next lip.'),
      }
    }
    case 'sheep':
      return sheepReading(r, COURSE.obstacles[r.cause.obstacle ?? 0], stance)
    case 'rock':
    case 'tree':
    case 'post':
    case 'bale': {
      const o = r.cause.obstacle !== undefined ? COURSE.obstacles[r.cause.obstacle] : undefined
      if (o) return obstacleReading(r, o)
      // Ran past the end of the hill beside the gate.
      const dx = e.x - COURSE.finishX
      return { why: `Missed the gate to the ${side(dx)}.`, advice: `Your path needs to finish further ${side(-dx)}.` }
    }
    case 'edge': {
      const s = slower(stance)
      return {
        why: `Carried off the ${side(e.x)} edge at ${where}, at ${speed} km/h.`,
        advice: s ? `Less speed would hold the turn: try ${s}, or start further ${side(-e.x)}.` : `Start further ${side(-e.x)}.`,
      }
    }
    case 'mud':
    case 'stall': {
      const f = faster(stance)
      const mud = r.outcome === 'mud'
      return {
        why: mud ? `Ran out of speed in the mud at ${where}.` : `Ran out of speed at ${where}.`,
        advice: f ? `More speed: try ${f}${mud ? ', or a line around the mud' : ''}.` : mud ? 'A line around the mud.' : 'A steeper line.',
      }
    }
  }
}

/** The stance names as the player sees them. */
export const STANCE_NAME = NAME
