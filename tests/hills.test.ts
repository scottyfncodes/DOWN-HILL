import { describe, expect, it } from 'vitest'
import { GRAVITY_HILL, mudAt, obstacleAt, surfaceHeight, useHill } from '../src/course'
import { HILLS } from '../src/hills'
import { readRun } from '../src/analysis'
import { simulateRun, STANCES, STRIDE, type Stance } from '../src/sim'

/** One verified finishing line and stance per hill (the e2e test plays some of them in the browser). */
export const LINES: Record<string, [number, Stance]> = {
  gravity: [0.8, 'cruise'],
  rollers: [0, 'tuck'],
  pinball: [-0.3, 'tuck'],
  meadow: [0, 'tuck'],
  quarry: [-5.38, 'cruise'],
  longway: [-0.24, 'tuck'],
}

interface Sweep {
  /** Per stance: finishing lines, the widest window (in 0.02 steps), how often the outcome changes along the line. */
  stances: Record<string, { finishes: number; widest: number; changes: number }>
  pairs: number
  finishes: number
  times: number[]
}

const sweeps = new Map<string, Sweep>()
function sweep(id: string): Sweep {
  const cached = sweeps.get(id)
  if (cached) return cached
  const hill = HILLS.find((h) => h.id === id)!
  useHill(hill)
  const s: Sweep = { stances: {}, pairs: 0, finishes: 0, times: [] }
  // Gravity Hill is line only: the game always rides it in cruise.
  for (const st of hill.stances ? STANCES : (['cruise'] as Stance[])) {
    const row = { finishes: 0, widest: 0, changes: 0 }
    let streak = 0
    let prev = ''
    for (let i = 0; i <= 660; i++) {
      const r = simulateRun(-6.6 + i * 0.02, st)
      s.pairs++
      if (prev && r.outcome !== prev) row.changes++
      prev = r.outcome
      if (r.outcome === 'finish') {
        row.finishes++
        s.finishes++
        s.times.push(r.time)
        streak++
        row.widest = Math.max(row.widest, streak)
      } else streak = 0
    }
    s.stances[st] = row
  }
  sweeps.set(id, s)
  return s
}
const median = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]
const rate = (id: string) => sweep(id).finishes / sweep(id).pairs

describe('the hills', () => {
  it('opens with Gravity Hill, unchanged and line only, and has six hills', () => {
    expect(HILLS[0]).toBe(GRAVITY_HILL)
    expect(GRAVITY_HILL.stances).toBeFalsy()
    expect(HILLS.slice(1).every((h) => h.stances)).toBe(true)
    expect(HILLS.map((h) => h.id)).toEqual(Object.keys(LINES))
  })

  it('cruise is the original physics: Gravity Hill rides exactly as before', () => {
    useHill(GRAVITY_HILL)
    const a = simulateRun(0.8)
    const b = simulateRun(0.8, 'cruise')
    expect(Array.from(a.frames)).toEqual(Array.from(b.frames))
    expect(a.time).toBeCloseTo(13.425, 3)
  })

  for (const hill of HILLS) {
    describe(hill.name, () => {
      it('has a verified finishing line', () => {
        useHill(hill)
        const [x, st] = LINES[hill.id]
        expect(simulateRun(x, st).outcome).toBe('finish')
      })

      it('is deterministic', () => {
        useHill(hill)
        for (const st of STANCES) {
          const a = simulateRun(-4.3, st)
          const b = simulateRun(-4.3, st)
          expect(Array.from(a.frames)).toEqual(Array.from(b.frames))
          expect(a.outcome).toBe(b.outcome)
        }
      })

      it('can be finished on purpose, but not by most lines', () => {
        const s = sweep(hill.id)
        expect(rate(hill.id)).toBeGreaterThan(0.03)
        expect(rate(hill.id)).toBeLessThan(0.5)
        // Every stance on offer has a window at least three fine steps wide: each is a real choice.
        for (const [st, row] of Object.entries(s.stances)) expect(row.widest, st).toBeGreaterThanOrEqual(3)
      })

      it('nearby lines behave alike: the outcome changes only a few dozen times across the hill', () => {
        for (const [st, row] of Object.entries(sweep(hill.id).stances)) expect(row.changes, st).toBeLessThanOrEqual(60)
      })

      it('rides on the surface on the ground', () => {
        useHill(hill)
        const [x, st] = LINES[hill.id]
        const r = simulateRun(x, st)
        for (let i = 0; i < r.frames.length / STRIDE; i++) {
          if (r.frames[i * STRIDE + 6]) continue
          expect(r.frames[i * STRIDE + 2]).toBeGreaterThan(surfaceHeight(r.frames[i * STRIDE], r.frames[i * STRIDE + 1]) - 0.05)
        }
      })
    })
  }

  it('each hill is longer, takes longer and is harder to finish than the one before', () => {
    for (let i = 1; i < HILLS.length; i++) {
      const a = HILLS[i - 1]
      const b = HILLS[i]
      expect(b.length, b.name).toBeGreaterThan(a.length)
      expect(median(sweep(b.id).times), b.name).toBeGreaterThan(median(sweep(a.id).times))
      expect(rate(b.id), b.name).toBeLessThan(rate(a.id))
    }
  })

  it('stance matters: on every hill after the first, some lines finish only in a stance other than cruise', () => {
    for (const hill of HILLS.slice(1)) {
      useHill(hill)
      let needOther = 0
      for (let x = -6.6; x <= 6.6; x += 0.1) {
        if (simulateRun(x, 'cruise').outcome === 'finish') continue
        if (simulateRun(x, 'tuck').outcome === 'finish' || simulateRun(x, 'tall').outcome === 'finish') needOther++
      }
      expect(needOther, hill.name).toBeGreaterThanOrEqual(4)
    }
  })

  it('tucked is fastest and tall slowest down the same open slope', () => {
    useHill(HILLS[1])
    const speedAt = (st: Stance, d: number) => {
      const r = simulateRun(0, st)
      for (let i = 0; i < r.frames.length / STRIDE; i++) if (r.frames[i * STRIDE + 1] >= d) return r.frames[i * STRIDE + 7]
      return 0
    }
    expect(speedAt('tuck', 60)).toBeGreaterThan(speedAt('cruise', 60))
    expect(speedAt('cruise', 60)).toBeGreaterThan(speedAt('tall', 60))
  })

  it('mud slows a rider who goes through it', () => {
    useHill(HILLS.find((h) => h.id === 'rollers')!)
    expect(mudAt(-5.6, 38)).toBeGreaterThan(0.9)
    expect(mudAt(0, 38)).toBe(0)
    const speedAt = (x: number, d: number) => {
      const r = simulateRun(x)
      for (let i = 0; i < r.frames.length / STRIDE; i++) if (r.frames[i * STRIDE + 1] >= d) return r.frames[i * STRIDE + 7]
      return 0
    }
    expect(speedAt(-5.6, 50)).toBeLessThan(speedAt(5.6, 50) - 1)
  })

  it('sheep walk on a fixed timetable, and meeting one ends the run', () => {
    const hill = HILLS.find((h) => h.id === 'meadow')!
    useHill(hill)
    const sheep = hill.obstacles.find((o) => o.kind === 'sheep')!
    // Its walk repeats exactly every period, and it reaches both ends of it.
    const xs = Array.from({ length: 200 }, (_, i) => obstacleAt(sheep, (i / 200) * sheep.period!).x)
    expect(obstacleAt(sheep, 1.234).x).toBeCloseTo(obstacleAt(sheep, 1.234 + sheep.period!).x, 9)
    expect(Math.min(...xs)).toBeCloseTo(Math.min(sheep.x, sheep.bx!), 2)
    expect(Math.max(...xs)).toBeCloseTo(Math.max(sheep.x, sheep.bx!), 2)
    let met = false
    for (let x = -6.6; x <= 6.6 && !met; x += 0.1) met = simulateRun(x).outcome === 'sheep'
    expect(met).toBe(true)
  })
})

describe('the run report', () => {
  it('explains every crash, and says nothing for a clean run', () => {
    for (const hill of HILLS) {
      useHill(hill)
      for (const st of hill.stances ? STANCES : (['cruise'] as Stance[])) {
        for (let x = -6.6; x <= 6.6; x += 0.6) {
          const r = simulateRun(x, st)
          const w = readRun(r)
          if (r.outcome === 'finish') expect(w.why).toBe('')
          else {
            expect(w.why.length, `${hill.id} ${st} ${x}`).toBeGreaterThan(10)
            expect(w.advice.length, `${hill.id} ${st} ${x}`).toBeGreaterThan(10)
          }
        }
      }
    }
  })

  it('never suggests a stance on Gravity Hill, which has none', () => {
    useHill(GRAVITY_HILL)
    for (let x = -6.6; x <= 6.6; x += 0.2) expect(readRun(simulateRun(x)).advice).not.toMatch(/Tuck|Cruise|Tall|tucked/)
  })

  it('a suggested stance always gets the same line further down the hill', () => {
    const NAMES: Record<string, Stance> = { Tuck: 'tuck', Cruise: 'cruise', Tall: 'tall' }
    let n = 0
    for (const hill of HILLS.slice(1)) {
      useHill(hill)
      for (const st of STANCES) {
        for (let x = -6.6; x <= 6.6; x += 0.3) {
          const r = simulateRun(x, st)
          const m = readRun(r).advice.match(/try (Tuck|Cruise|Tall)/)
          if (!m) continue
          n++
          const r2 = simulateRun(x, NAMES[m[1]])
          expect(r2.outcome === 'finish' || r2.end.d > r.end.d + 1, `${hill.id} ${st} ${x} → ${m[1]}`).toBe(true)
        }
      }
    }
    expect(n).toBeGreaterThan(50)
  })

  it('following the line advice usually gets further (it is measured, not guessed)', () => {
    let n = 0
    let helped = 0
    for (const hill of HILLS) {
      useHill(hill)
      for (const st of hill.stances ? STANCES : (['cruise'] as Stance[])) {
        for (let x = -6.6; x <= 6.6; x += 0.6) {
          const r = simulateRun(x, st)
          const m = readRun(r).advice.match(/nudge the line (left|right)/)
          if (!m) continue
          n++
          const k = m[1] === 'left' ? -1 : 1
          for (let j = 1; j <= 50; j++) {
            const r2 = simulateRun(x + k * j * 0.04, st)
            if (r2.outcome === 'finish' || r2.end.d > r.end.d + 1) {
              helped++
              break
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(40)
    expect(helped / n).toBeGreaterThan(0.75)
  })
})
