/** The difficulty curve: per hill, the share of (line, stance) pairs that finish, and the median finish time. */
import { HILLS } from '../src/hills'
import { score } from './tune'
for (const h of HILLS) {
  const s = score(h, 0.04)
  const n = Math.round(13.2 / 0.04) + 1
  const pairs = Object.values(s).reduce((a, v) => a + v.fin, 0)
  console.log(`${h.name.padEnd(18)} ${(h.length + ' m').padStart(6)}  pairs ${((pairs / (3 * n)) * 100).toFixed(1).padStart(5)}%  ` + Object.entries(s).map(([k, v]) => `${k} ${String(v.fin).padStart(3)} ch${String(v.changes).padStart(3)}`).join('  '))
}
