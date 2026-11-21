/**
 * Sweep the start line and print what happens from every position.
 *   npx tsx tools/sweep.ts [step]
 */
import { COURSE } from '../src/course'
import { simulateRun } from '../src/sim'

const step = Number(process.argv[2] ?? 0.1)
let prev = ''
let runStart = COURSE.startRange[0]
const runs: string[] = []
const flush = (end: number, label: string) => runs.push(`${runStart.toFixed(2).padStart(6)} .. ${end.toFixed(2).padStart(6)}  ${label}`)
for (let x = COURSE.startRange[0]; x <= COURSE.startRange[1] + 1e-9; x += step) {
  const r = simulateRun(x)
  const takeoffs = r.events.filter((e) => e.kind === 'takeoff').length
  const label = `${r.outcome.padEnd(8)}`
  if (label !== prev) {
    if (prev) flush(x - step, prev)
    runStart = x
    prev = label
  }
  if (process.env.V) console.log(x.toFixed(2), r.outcome, r.time.toFixed(1) + 's', 'air', r.maxAir.toFixed(2), 'top', r.topSpeed.toFixed(1), 'jumps', takeoffs, 'end', r.end.x.toFixed(1), r.end.d.toFixed(1))
}
flush(COURSE.startRange[1], prev)
console.log(runs.join('\n'))
