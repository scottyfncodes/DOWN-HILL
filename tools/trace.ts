/** Trace one run: npx tsx tools/trace.ts <hill> <x> [every-n-metres] */
import { sectionAt, useHill } from '../src/course'
import { HILLS } from '../src/hills'
import { type Stance, simulateRun, STRIDE } from '../src/sim'
const [id, xs, evs] = process.argv.slice(2)
useHill(HILLS.find((h) => h.id === id)!)
const r = simulateRun(Number(xs), (process.env.STANCE ?? 'cruise') as Stance)
const every = Number(evs ?? 10)
let next = 0
for (let i = 0; i < r.frames.length / STRIDE; i++) {
  const f = (k: number) => r.frames[i * STRIDE + k]
  if (f(1) >= next) {
    console.log(`t ${(i * r.frameDt).toFixed(1).padStart(5)} d ${f(1).toFixed(1).padStart(6)} x ${f(0).toFixed(2).padStart(6)} hdg ${f(3).toFixed(2).padStart(5)} v ${f(7).toFixed(1).padStart(5)} ${f(6) ? 'AIR ' : ''}${sectionAt(f(1)).name}`)
    next += every
  }
}
console.log(r.outcome, r.time.toFixed(1), r.events.filter((e) => e.kind !== 'mud').map((e) => `${e.kind}@${e.t.toFixed(1)}`).join(' '))
