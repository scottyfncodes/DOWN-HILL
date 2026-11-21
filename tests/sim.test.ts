import { describe, expect, it } from 'vitest'
import { COURSE, surfaceHeight } from '../src/course'
import { simulateRun, STRIDE } from '../src/sim'

/** Lines verified to finish, one per route (also played in the browser by e2e/play.mjs). */
export const ROUTES = { left: -6.3, centre: 0.8, right: 5.2 }

describe('downhill: one hands-off run', () => {
  it('is deterministic: the same line gives a bit-identical run', () => {
    for (const x of [-6.3, -2, 0.8, 4.4, 5.2]) {
      const a = simulateRun(x)
      const b = simulateRun(x)
      expect(Array.from(a.frames)).toEqual(Array.from(b.frames))
      expect(a.events).toEqual(b.events)
      expect(a.outcome).toBe(b.outcome)
    }
  })

  it('has a reliable finishing line on each of the three routes, taking 10 to 20 seconds', () => {
    for (const [route, x] of Object.entries(ROUTES)) {
      const r = simulateRun(x)
      expect(r.outcome, route).toBe('finish')
      expect(r.time, route).toBeGreaterThan(10)
      expect(r.time, route).toBeLessThan(20)
      // Not a knife edge: neighbours within ±0.1 also finish.
      for (const dx of [-0.1, 0.1]) expect(simulateRun(x + dx).outcome, `${route} ${dx}`).toBe('finish')
    }
  })

  it('routes are physically different: the table, the bank and the kicker plus tyre wall', () => {
    const centre = simulateRun(ROUTES.centre)
    const left = simulateRun(ROUTES.left)
    const right = simulateRun(ROUTES.right)
    expect(centre.maxAir).toBeGreaterThan(1) // clears the gap
    expect(left.maxAir).toBe(0) // carves the bank, never leaves the ground
    expect(right.events.some((e) => e.kind === 'takeoff')).toBe(true)
    expect(right.events.some((e) => e.kind === 'bounce' && e.what === 'tyres')).toBe(true)
  })

  it('the starting line meaningfully changes the outcome (several distinct endings)', () => {
    const outcomes = new Set<string>()
    let finishes = 0
    let total = 0
    for (let x = COURSE.startRange[0]; x <= COURSE.startRange[1] + 1e-9; x += 0.2) {
      const r = simulateRun(x)
      outcomes.add(r.outcome)
      total++
      if (r.outcome === 'finish') finishes++
    }
    expect(outcomes.size).toBeGreaterThanOrEqual(4)
    expect(outcomes.has('finish')).toBe(true)
    expect(outcomes.has('gap')).toBe(true)
    // Rewarding but not trivial.
    expect(finishes / total).toBeGreaterThan(0.12)
    expect(finishes / total).toBeLessThan(0.5)
  })

  it('missing the table drops the rider into the gap', () => {
    expect(simulateRun(-2).outcome).toBe('gap')
    expect(simulateRun(2).outcome).toBe('gap')
  })

  it('ramps launch consistently: the table always gives the same flight from the same line', () => {
    const a = simulateRun(0.6)
    const b = simulateRun(0.9)
    expect(a.maxAir).toBeCloseTo(b.maxAir, 1)
  })

  it('rides on the surface: the board never sinks into the hill', () => {
    const r = simulateRun(ROUTES.left)
    for (let i = 0; i < r.frames.length / STRIDE; i++) {
      const x = r.frames[i * STRIDE]
      const d = r.frames[i * STRIDE + 1]
      const y = r.frames[i * STRIDE + 2]
      expect(y).toBeGreaterThan(surfaceHeight(x, d) - 0.05)
    }
  })

  it('carves rather than slides: on the ground, travel follows the board heading', () => {
    const r = simulateRun(ROUTES.left)
    const f = r.frames
    for (let i = 1; i < f.length / STRIDE - 1; i++) {
      if (f[i * STRIDE + 6] || f[(i - 1) * STRIDE + 6]) continue
      const dx = f[i * STRIDE] - f[(i - 1) * STRIDE]
      const dd = f[i * STRIDE + 1] - f[(i - 1) * STRIDE + 1]
      if (Math.hypot(dx, dd) < 0.05) continue
      const travel = Math.atan2(dx, dd)
      const heading = f[i * STRIDE + 3]
      expect(Math.abs(Math.atan2(Math.sin(travel - heading), Math.cos(travel - heading)))).toBeLessThan(0.15)
    }
  })
})
