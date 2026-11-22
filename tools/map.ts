/**
 * The whole answer space of a hill: every line (0.02 steps) under each stance, as one row per stance.
 *   npx tsx tools/map.ts <hill>
 * '#' finish, '.' gap, 'x' hit something, 's' sheep, 'L' hard landing, 'e' edge, '_' stall/mud.
 * Also prints, per stance, how many separate finishing windows there are and the widest.
 */
import { useHill } from '../src/course'
import { HILLS } from '../src/hills'
import { simulateRun, STANCES } from '../src/sim'
const id = process.argv[2]
useHill(HILLS.find((h) => h.id === id)!)
const glyph: Record<string, string> = { finish: '#', gap: '.', sheep: 's', landing: 'L', edge: 'e', stall: '_', mud: '_' }
const rows: Record<string, string> = {}
for (const st of STANCES) {
  let row = ''
  for (let i = 0; i <= 660; i++) row += glyph[simulateRun(-6.6 + i * 0.02, st).outcome] ?? 'x'
  rows[st] = row
  const wins = row.match(/#+/g) ?? []
  const changes = [...row].filter((c, i) => i && c !== row[i - 1]).length
  console.log(`${st.padEnd(6)} finishes ${String(wins.join('').length).padStart(3)}/661  windows ${String(wins.length).padStart(2)}  widest ${(Math.max(0, ...wins.map((w) => w.length)) * 0.02).toFixed(2)}  outcome changes ${changes}`)
}
const any = [...rows.cruise].filter((_, i) => STANCES.some((s) => rows[s][i] === '#')).length
const only = [...rows.cruise].filter((c, i) => c !== '#' && STANCES.some((s) => rows[s][i] === '#')).length
console.log(`lines with some finishing stance: ${any}; lines that need a stance other than cruise: ${only}`)
if (process.env.ROWS) for (const st of STANCES) console.log(st.padEnd(6), rows[st].replace(/(.{110})/g, '$1\n       '))
