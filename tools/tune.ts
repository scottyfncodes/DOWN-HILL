/**
 * Score a hill: finishes per stance (0.04 steps), outcome changes, and a balance score.
 * Used by the design search; import { score } from './tune'.
 */
import { GRAVITY_HILL, useHill, type Hill } from '../src/course'
import { simulateRun, STANCES } from '../src/sim'

export function score(h: Hill, step = 0.04) {
  useHill(GRAVITY_HILL)
  useHill(h)
  const out: Record<string, { fin: number; changes: number; widest: number }> = {}
  for (const st of STANCES) {
    let prev = ''
    let fin = 0
    let changes = 0
    let run = 0
    let widest = 0
    for (let x = -6.6; x <= 6.6 + 1e-9; x += step) {
      const o = simulateRun(x, st).outcome
      if (o === 'finish') {
        fin++
        run++
        widest = Math.max(widest, run)
      } else run = 0
      if (prev && o !== prev) changes++
      prev = o
    }
    out[st] = { fin, changes, widest: widest * step }
  }
  return out
}
