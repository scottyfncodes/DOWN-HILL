/**
 * Sweep the start line and print what happens from every position.
 *   npx tsx tools/sweep.ts [step] [hill]       e.g. npm run sweep -- 0.02 rollers
 * V=1 prints every line.
 */
import { COURSE, sectionAt, useHill } from '../src/course'
import { HILLS } from '../src/hills'
import { type Stance, simulateRun } from '../src/sim'

const step = Number(process.argv[2] ?? 0.1)
const id = process.argv[3] ?? HILLS[0].id
const hill = HILLS.find((h) => h.id === id)
if (!hill) throw new Error(`no hill ${id}: ${HILLS.map((h) => h.id).join(', ')}`)
useHill(hill)
let prev = ''
let runStart = COURSE.startRange[0]
let finishes = 0
let total = 0
const times: number[] = []
const runs: string[] = []
const flush = (end: number, label: string) => runs.push(`${runStart.toFixed(2).padStart(6)} .. ${end.toFixed(2).padStart(6)}  ${label}`)
for (let x = COURSE.startRange[0]; x <= COURSE.startRange[1] + 1e-9; x += step) {
  const r = simulateRun(x, (process.env.STANCE ?? 'cruise') as Stance)
  total++
  if (r.outcome === 'finish') {
    finishes++
    times.push(r.time)
  }
  const label = `${r.outcome.padEnd(8)} ${r.outcome === 'finish' ? '' : sectionAt(r.end.d).name}`
  if (label !== prev) {
    if (prev) flush(x - step, prev)
    runStart = x
    prev = label
  }
  if (process.env.V) console.log(x.toFixed(2), r.outcome, r.time.toFixed(1) + 's', 'air', r.maxAir.toFixed(2), 'top', r.topSpeed.toFixed(1), 'jumps', r.jumps, 'end', r.end.x.toFixed(1), r.end.d.toFixed(1))
}
flush(COURSE.startRange[1], prev)
console.log(`${hill.name} (${hill.length} m)`)
console.log(runs.join('\n'))
console.log(`finishes ${finishes}/${total}${times.length ? `, ${Math.min(...times).toFixed(1)}–${Math.max(...times).toFixed(1)} s` : ''}`)
