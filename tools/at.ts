/** Where every line is at given distances: npx tsx tools/at.ts <hill> <step> <d1,d2,...> */
import { sectionAt, useHill } from '../src/course'
import { HILLS } from '../src/hills'
import { simulateRun, STRIDE } from '../src/sim'
const [id, st, ds] = process.argv.slice(2)
const hill = HILLS.find((h) => h.id === id)!
useHill(hill)
const marks = ds.split(',').map(Number)
for (let x = hill.startRange[0]; x <= hill.startRange[1] + 1e-9; x += Number(st)) {
  const r = simulateRun(x)
  const cells = marks.map((m) => {
    for (let i = 0; i < r.frames.length / STRIDE; i++) if (r.frames[i * STRIDE + 1] >= m) return `${r.frames[i * STRIDE].toFixed(1).padStart(5)}@${r.frames[i * STRIDE + 7].toFixed(1).padStart(4)}`
    return '     ---   '
  })
  console.log(x.toFixed(2).padStart(6), cells.join(' '), r.outcome, r.outcome === 'finish' ? r.time.toFixed(1) : sectionAt(r.end.d).name)
}
