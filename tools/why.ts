/** Print the run report's "why" for a spread of lines: npx tsx tools/why.ts <hill> [stance] [step] */
import { useHill } from '../src/course'
import { HILLS } from '../src/hills'
import { readRun } from '../src/analysis'
import { simulateRun, type Stance } from '../src/sim'
const [id, st, step] = process.argv.slice(2)
useHill(HILLS.find((h) => h.id === id)!)
for (let x = -6.6; x <= 6.6 + 1e-9; x += Number(step ?? 0.6)) {
  const r = simulateRun(x, (st ?? 'cruise') as Stance)
  const w = readRun(r)
  console.log(`${x.toFixed(2).padStart(6)} ${r.outcome.padEnd(7)} ${w.why}  →  ${w.advice}`)
}
