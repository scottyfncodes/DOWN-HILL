import { describe, expect, it } from 'vitest'
import { GRAVITY_HILL, mudAt, obstacleAt, surfaceHeight, useHill } from '../src/course'
import { HILLS } from '../src/hills'
import { simulateRun, STRIDE } from '../src/sim'

/** One verified finishing line per hill (the e2e test plays some of them in the browser). */
export const LINES: Record<string, number> = {
  gravity: 0.8,
  rollers: 1.5,
  pinball: 0.4,
  meadow: 0.4,
  quarry: 1.3,
  longway: 3.2,
}

interface Sweep {
  finishes: number
  total: number
  widest: number
  times: number[]
  outcomes: Set<string>
}

const sweeps = new Map<string, Sweep>()
function sweep(id: string): Sweep {
  const cached = sweeps.get(id)
  if (cached) return cached
  useHill(HILLS.find((h) => h.id === id)!)
  const s: Sweep = { finishes: 0, total: 0, widest: 0, times: [], outcomes: new Set() }
  let streak = 0
  for (let i = 0; i <= 660; i++) {
    const x = -6.6 + i * 0.02
    const r = simulateRun(x)
    s.total++
    s.outcomes.add(r.outcome)
    if (r.outcome === 'finish') {
      s.finishes++
      s.times.push(r.time)
      streak++
      s.widest = Math.max(s.widest, streak)
    } else streak = 0
  }
  sweeps.set(id, s)
  return s
}
const median = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]

describe('the hills', () => {
  it('opens with Gravity Hill, unchanged, and has six hills', () => {
    expect(HILLS[0]).toBe(GRAVITY_HILL)
    expect(HILLS.map((h) => h.id)).toEqual(Object.keys(LINES))
  })

  for (const hill of HILLS) {
    describe(hill.name, () => {
      it('has a verified finishing line', () => {
        useHill(hill)
        const r = simulateRun(LINES[hill.id])
        expect(r.outcome).toBe('finish')
      })

      it('is deterministic', () => {
        useHill(hill)
        for (const x of [-4.3, 0.1, 2.7]) {
          const a = simulateRun(x)
          const b = simulateRun(x)
          expect(Array.from(a.frames)).toEqual(Array.from(b.frames))
          expect(a.outcome).toBe(b.outcome)
        }
      })

      it('can be finished, but not by most lines, and never by a knife-edge alone', () => {
        const s = sweep(hill.id)
        expect(s.finishes / s.total).toBeGreaterThan(0.03)
        expect(s.finishes / s.total).toBeLessThan(0.5)
        // At least one window three fine steps wide, so a careful player can hit it on purpose.
        expect(s.widest).toBeGreaterThanOrEqual(3)
        // Several different ways to fail: reading the run matters.
        expect(s.outcomes.size).toBeGreaterThanOrEqual(3)
      })

      it('rides on the surface on the ground', () => {
        useHill(hill)
        const r = simulateRun(LINES[hill.id])
        for (let i = 0; i < r.frames.length / STRIDE; i++) {
          if (r.frames[i * STRIDE + 6]) continue
          const x = r.frames[i * STRIDE]
          const d = r.frames[i * STRIDE + 1]
          expect(r.frames[i * STRIDE + 2]).toBeGreaterThan(surfaceHeight(x, d) - 0.05)
        }
      })
    })
  }

  it('each hill is longer, takes longer and asks for a finer line than the one before', () => {
    for (let i = 1; i < HILLS.length; i++) {
      const a = HILLS[i - 1]
      const b = HILLS[i]
      expect(b.length, b.name).toBeGreaterThan(a.length)
      expect(median(sweep(b.id).times), b.name).toBeGreaterThan(median(sweep(a.id).times))
    }
    // The last three get steadily harder to finish.
    const rate = (id: string) => sweep(id).finishes / sweep(id).total
    expect(rate('meadow')).toBeLessThan(rate('pinball'))
    expect(rate('quarry')).toBeLessThan(rate('meadow'))
    expect(rate('longway')).toBeLessThan(rate('quarry'))
  })

  it('mud slows a rider who goes through it', () => {
    const hill = HILLS.find((h) => h.id === 'rollers')!
    useHill(hill)
    expect(mudAt(-5.6, 38)).toBeGreaterThan(0.9)
    expect(mudAt(0, 38)).toBe(0)
    const speedAt = (x: number, d: number) => {
      const r = simulateRun(x)
      for (let i = 0; i < r.frames.length / STRIDE; i++) if (r.frames[i * STRIDE + 1] >= d) return r.frames[i * STRIDE + 7]
      return 0
    }
    // Same lane, one line through the bog, one beside it.
    expect(speedAt(-5.6, 50)).toBeLessThan(speedAt(5.6, 50) - 1)
  })

  it('sheep walk on a fixed timetable, and meeting one ends the run', () => {
    const hill = HILLS.find((h) => h.id === 'meadow')!
    useHill(hill)
    const sheep = hill.obstacles.find((o) => o.kind === 'sheep')!
    expect(obstacleAt(sheep, 0).x).toBeCloseTo(sheep.x)
    expect(obstacleAt(sheep, sheep.period! / 2).x).toBeCloseTo(sheep.bx!)
    let met = false
    for (let x = -6.6; x <= 6.6 && !met; x += 0.1) met = simulateRun(x).outcome === 'sheep'
    expect(met).toBe(true)
  })

  it('Gravity Hill is untouched by the new hills (switching back restores it exactly)', () => {
    useHill(HILLS[5])
    simulateRun(0)
    useHill(GRAVITY_HILL)
    const r = simulateRun(0.8)
    expect(r.outcome).toBe('finish')
    expect(r.time).toBeCloseTo(13.425, 3)
  })
})
