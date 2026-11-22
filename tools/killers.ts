/** What ends the runs on a hill: npx tsx tools/killers.ts <hill> [step] */
import { COURSE, sectionAt, useHill } from '../src/course'
import { HILLS } from '../src/hills'
import { simulateRun } from '../src/sim'
const [id, st] = process.argv.slice(2)
useHill(HILLS.find((h) => h.id === id)!)
const count = new Map<string, number>()
let n = 0
for (let x = COURSE.startRange[0]; x <= COURSE.startRange[1] + 1e-9; x += Number(st ?? 0.02)) {
  const r = simulateRun(x)
  n++
  let key = `${r.outcome} ${sectionAt(r.end.d).name}`
  if (['tree', 'rock', 'post', 'sheep'].includes(r.outcome)) {
    let best = Infinity
    for (const o of COURSE.obstacles) {
      const dd = Math.hypot(o.x - r.end.x, o.d - r.end.d)
      if (dd < best) {
        best = dd
        key = `${r.outcome} (${o.x}, ${o.d})`
      }
    }
  }
  count.set(key, (count.get(key) ?? 0) + 1)
}
for (const [k, v] of [...count].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k)
console.log(n)
