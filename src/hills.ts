import { GRAVITY_HILL, slopeFrom, type Hill, type Obstacle } from './course'

/**
 * The hills, in the order they open. Each is longer than the last and asks
 * more of the line: Gravity Hill teaches it, the rest test how well a run was
 * read. Every hill has finishing lines (tests/hills.test.ts proves it).
 */

const W = 7.6
const base = { halfWidth: W, edge: 9.6, startD: 2, startRange: [-6.6, 6.6] as [number, number], finishHalf: 2.9 }

/** A finish gate at (x, d): two posts and hay bales to either side. */
function gate(x: number, d: number, half = 3.2): Obstacle[] {
  return [
    { kind: 'post', x: x - half, d, r: 0.25, height: 3.2 },
    { kind: 'post', x: x + half, d, r: 0.25, height: 3.2 },
    { kind: 'bale', x: -W + 0.2, d: d + 0.6, bx: x - half - 0.4, bd: d + 0.6, r: 0.6, height: 1.1 },
    { kind: 'bale', x: x + half + 0.4, d: d + 0.6, bx: W - 0.2, bd: d + 0.6, r: 0.6, height: 1.1 },
  ]
}

/** A roller across [x0, x1] at d. */
const roller = (d: number, height = 0.5, x0 = -14, x1 = 14, width = 0.9) => ({ ax: x0, ad: d, bx: x1, bd: d, height, width, look: 'dirt' as const })
const hedge = (x: number, d0: number, d1: number, height = 0.7, width = 0.4) => ({ ax: x, ad: d0, bx: x, bd: d1, height, width, look: 'hedge' as const })

const bankL = (ax: number, ad: number, bx: number, bd: number, height = 1.2, width = 1.6) => ({ ax, ad, bx, bd, height, width, bank: true, look: 'turf' as const })
/** A bank on the right-hand side (high at +x): the same wall, drawn uphill. */
const bankR = (ax: number, ad: number, bx: number, bd: number, height = 1.2, width = 1.6) => ({ ax: bx, ad: bd, bx: ax, bd: ad, height, width, bank: true, look: 'turf' as const })
const rock = (x: number, d: number, r = 0.7, height = 1.0): Obstacle => ({ kind: 'rock', x, d, r, height })
const tree = (x: number, d: number, height = 3.4): Obstacle => ({ kind: 'tree', x, d, r: 0.55, height })
const tyres = (x: number, d: number, bx: number, bd: number): Obstacle => ({ kind: 'tyres', x, d, bx, bd, r: 0.55, height: 1.1 })

export const ROLLERS: Hill = {
  ...base,
  id: 'rollers',
  name: 'Roller Hill',
  brief: 'New: pick a stance before you launch. Tuck is fast, Tall is slow. The table wants speed; the plank does not.',
  length: 236,
  finishD: 222,
  finishX: 0,
  maxTime: 50,
  trueCrests: true,
  stances: true,
  slope: slopeFrom([
    [0, 0.05],
    [6, 0.3],
    [28, 0.28],
    [56, 0.17],
    [100, 0.2],
    [140, 0.15],
    [200, 0.12],
    [218, 0.08],
    [236, 0],
  ]),
  troughFrom: 160,
  ridges: [
    hedge(-3.6, 5, 102),
    hedge(3.6, 5, 102),
    // The rollers proper: right across the hill.
    roller(78, 0.5, -14, 14, 1.3),
    roller(92, 0.5, -14, 14, 1.3),
    // The funnel: two banks gather all three ways back toward the middle.
    bankL(-8.6, 124, -2.6, 152, 1.1),
    bankR(8.6, 124, 2.6, 152, 1.1),
    // The ripples: one low wave across the hill, a last jolt before the run-in.
    roller(182, 0.3, -14, 14, 1.6),
    // The run-in: banks either side steer riders to the gate.
    bankL(-8.6, 190, -3.2, 216),
    bankR(8.6, 190, 3.2, 216),
  ],
  ramps: [
    { name: 'The Step', x0: 4.0, x1: 7.2, d0: 102, d1: 110.5, rise: 2.2 },
    { name: 'The Table', x0: -1.1, x1: 1.1, d0: 101, d1: 110.5, rise: 1.4 },
  ],
  pits: [{ x0: -7.4, x1: 7.4, d0: 112, d1: 124, depth: 5, bridges: [[-6.0, -5.1]] }],
  mud: [
    { x: -5.6, d: 38, rx: 1.9, rd: 9 },
    { x: 5.7, d: 62, rx: 1.15, rd: 9 },
    { x: 3.0, d: 162, rx: 2.0, rd: 6 },
  ],
  obstacles: [
    tree(-3.4, 166, 3.2),
    tree(5.8, 196, 3.6),
    rock(-2.6, 204, 0.7, 0.9),
    ...gate(0, 222),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 24, name: 'The Lanes' },
    { d: 70, name: 'The Rollers' },
    { d: 101, name: 'The Plank' },
    { d: 124, name: 'The Funnel' },
    { d: 154, name: 'The Bog' },
    { d: 176, name: 'The Ripples' },
    { d: 214, name: 'The Gate' },
  ],
  dashes: { xs: [-5.6, 0, 5.6], d0: 4, d1: 22 },
}

export const PINBALL: Hill = {
  ...base,
  id: 'pinball',
  name: 'Pinball Wood',
  brief: 'The bank throws you across. Three ways over the creek, and the gate is off to one side.',
  length: 318,
  finishD: 304,
  finishX: -2.4,
  maxTime: 60,
  trueCrests: true,
  stances: true,
  slope: slopeFrom([
    [0, 0.05],
    [6, 0.3],
    [30, 0.24],
    [70, 0.2],
    [120, 0.22],
    [170, 0.16],
    [240, 0.15],
    [290, 0.1],
    [318, 0],
  ]),
  troughFrom: 250,
  ridges: [
    // The chicane: one long bank that throws the left side across the hill.
    bankL(-8.6, 60, -1.2, 98, 1.2),
    // The run-in: banks that gather riders toward the off-centre gate.
    bankL(-8.6, 270, -4.6, 300, 1.1),
    bankR(8.6, 256, -0.4, 298, 1.2),
  ],
  ramps: [{ name: 'The Kicker', x0: -1.3, x1: 1.3, d0: 140, d1: 148, rise: 0.85 }],
  pits: [{ x0: -7.4, x1: 7.4, d0: 150, d1: 164, depth: 4.5, bridges: [[-5.6, -4.5], [4.2, 5.3]] }],
  mud: [{ x: 4.6, d: 112, rx: 2.0, rd: 8 }],
  obstacles: [
    // The wood: tyre bumpers on the edges, pines in between.
    tyres(-7.4, 168, -4.6, 182),
    tyres(7.4, 172, 4.6, 186),
    tree(-2.6, 192),
    tree(2.8, 206, 3.6),
    tree(-4.2, 222, 3.8),
    tree(-5.4, 236, 3.2),
    tree(5.0, 244),
    ...gate(-2.4, 304, 2.9),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 56, name: 'The Chicane' },
    { d: 104, name: 'The Bog' },
    { d: 130, name: 'The Creek' },
    { d: 164, name: 'The Wood' },
    { d: 258, name: 'The Run-in' },
    { d: 298, name: 'The Gate' },
  ],
  dashes: { xs: [-4, 0, 4], d0: 4, d1: 20 },
}

/** A sheep that wanders from (x0, d) to (x1, d) and back every `period` seconds. */
const sheep = (x0: number, x1: number, d: number, period: number, phase = 0): Obstacle => ({ kind: 'sheep', x: x0, d, bx: x1, bd: d, r: 0.55, height: 0.9, period, phase })

export const MEADOW: Hill = {
  ...base,
  id: 'meadow',
  name: 'Sheep Meadow',
  brief: 'The sheep keep their own time. Arrive when they are elsewhere: speed decides when you get there.',
  length: 400,
  finishD: 386,
  finishX: 2,
  maxTime: 70,
  trueCrests: true,
  stances: true,
  slope: slopeFrom([
    [0, 0.05],
    [6, 0.3],
    [30, 0.26],
    [70, 0.17],
    [120, 0.15],
    [150, 0.2],
    [200, 0.16],
    [260, 0.15],
    [330, 0.13],
    [372, 0.08],
    [400, 0],
  ]),
  troughFrom: 300,
  ridges: [
    // An open meadow: no hedges, so every line keeps its place across the hill.
    roller(134, 0.5, -14, 14, 1.3),
    roller(150, 0.5, -14, 14, 1.3),
    // The funnel: banks either side gather riders for the flock.
    bankL(-8.6, 194, -3.2, 216, 1.1),
    bankR(8.6, 194, 3.2, 216, 1.1),
    bankL(-8.6, 340, -3.0, 378, 1.2),
    bankR(8.6, 344, 4.6, 380, 1.1),
  ],
  ramps: [
    { name: 'The Table', x0: -1.4, x1: 1.4, d0: 43, d1: 53, rise: 2.2 },
    { name: 'The Ledge', x0: 4.4, x1: 7.2, d0: 172, d1: 181, rise: 1.8 },
  ],
  pits: [
    { x0: -3.2, x1: 3.2, d0: 54.5, d1: 63, depth: 5 },
    { x0: -7.4, x1: 7.4, d0: 182.5, d1: 190, depth: 4.5, bridges: [[-6.1, -5.1], [-0.7, 0.7]] },
  ],
  mud: [
    { x: -5.7, d: 34, rx: 1.6, rd: 10 },
    { x: 5.7, d: 44, rx: 1.4, rd: 8 },
  ],
  obstacles: [
    // The meadow: a sheep in each lane, each on its own timetable.
    sheep(-6.6, -4.4, 98, 4.0, 2.0),
    sheep(-1.8, 1.8, 104, 3.2, 1.6),
    sheep(6.6, 4.4, 110, 5.0, 1.25),
    // The flock.
    sheep(-6.4, 6.4, 224, 6.0, 0.6),
    sheep(6.4, -6.4, 236, 8.0, 1.0),
    sheep(-5.0, 5.0, 248, 5.0, 3.6),
    tree(-3.8, 272),
    tree(3.6, 290, 3.6),
    tree(-5.2, 310, 3.2),
    rock(-1.8, 330, 0.75),
    ...gate(2, 386, 2.9),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 38, name: 'The Table' },
    { d: 88, name: 'The Meadow' },
    { d: 126, name: 'The Rollers' },
    { d: 166, name: 'The Ledge' },
    { d: 194, name: 'The Funnel' },
    { d: 216, name: 'The Flock' },
    { d: 262, name: 'The Copse' },
    { d: 336, name: 'The Run-in' },
    { d: 380, name: 'The Gate' },
  ],
  dashes: { xs: [-5.75, 0, 5.75], d0: 4, d1: 38 },
}

export const QUARRY: Hill = {
  ...base,
  id: 'quarry',
  name: 'The Quarry',
  brief: 'Three lanes, four gaps. Each lane wants a different speed: too slow falls short, too fast slams the next lip.',
  length: 470,
  finishD: 456,
  finishX: -1.5,
  maxTime: 80,
  trueCrests: true,
  stances: true,
  slope: slopeFrom([
    [0, 0.05],
    [6, 0.32],
    [36, 0.26],
    [80, 0.2],
    [140, 0.22],
    [200, 0.18],
    [260, 0.2],
    [330, 0.16],
    [400, 0.14],
    [440, 0.08],
    [470, 0],
  ]),
  troughFrom: 400,
  ridges: [
    // Three lanes through the gaps, walled by hedges.
    hedge(-3.6, 6, 306, 0.8),
    hedge(3.6, 6, 306, 0.8),
    bankL(-8.6, 410, -4.2, 446, 1.2),
    bankR(8.6, 404, 2.0, 446, 1.2),
  ],
  ramps: [
    // Gap one.
    { name: 'Left Table', x0: -6.8, x1: -4.4, d0: 50, d1: 59, rise: 1.8 },
    { name: 'Middle Table', x0: -1.4, x1: 1.4, d0: 50, d1: 59, rise: 1.8 },
    { name: 'Right Table', x0: 4.4, x1: 6.8, d0: 50, d1: 59, rise: 1.8 },
    // Gap two.
    { name: 'The Long Table', x0: -1.4, x1: 1.4, d0: 118, d1: 130, rise: 2.0 },
    { name: 'Right Kicker', x0: 4.4, x1: 6.8, d0: 124, d1: 130, rise: 1.4 },
    // Gap three: the drop.
    { name: 'Left Drop', x0: -6.8, x1: -4.4, d0: 196, d1: 202, rise: 1.2 },
    { name: 'Right Drop', x0: 4.4, x1: 6.8, d0: 196, d1: 202, rise: 1.2 },
    // Gap four: the double, all lanes.
    { name: 'The Double', x0: -6.8, x1: 6.8, d0: 262, d1: 271, rise: 1.9 },
    { name: 'The Second', x0: -2.4, x1: 6.8, d0: 292, d1: 299, rise: 1.3 },
  ],
  pits: [
    { x0: -7.4, x1: 7.4, d0: 60.5, d1: 69, depth: 5 },
    { x0: -7.4, x1: 7.4, d0: 131.5, d1: 141, depth: 5, bridges: [[-6.1, -5.2]] },
    { x0: -7.4, x1: 7.4, d0: 203.5, d1: 212, depth: 5, bridges: [[-0.45, 0.45]] },
    { x0: -7.4, x1: 7.4, d0: 272.5, d1: 280, depth: 4.5 },
    { x0: -7.4, x1: 7.4, d0: 300.5, d1: 306, depth: 4.5, bridges: [[-6.4, -4.8]] },
  ],
  mud: [
    { x: 5.6, d: 30, rx: 1.4, rd: 8 },
    { x: -5.6, d: 166, rx: 1.6, rd: 16 },
  ],
  obstacles: [
    // The rock garden: each lane's rock sits at the edge of where its riders arrive.
    rock(-6.6, 322, 0.45),
    rock(2.6, 332, 0.7),
    rock(-1.2, 346, 0.75),
    rock(6.6, 352, 0.7),
    tree(-3.0, 370, 3.4),
    tree(3.4, 380, 3.6),
    tree(-3.4, 398, 3.2),
    rock(1.8, 420, 0.75),
    ...gate(-1.5, 456, 2.9),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 44, name: 'Gap One' },
    { d: 112, name: 'Gap Two' },
    { d: 150, name: 'The Sump' },
    { d: 190, name: 'The Drop' },
    { d: 256, name: 'The Double' },
    { d: 312, name: 'The Rock Garden' },
    { d: 362, name: 'The Last Wood' },
    { d: 404, name: 'The Run-in' },
    { d: 450, name: 'The Gate' },
  ],
  dashes: { xs: [-5.6, 0, 5.6], d0: 4, d1: 44 },
}

export const LONG_WAY: Hill = {
  ...base,
  id: 'longway',
  name: 'The Long Way Down',
  brief: 'Everything you have met, end to end. Read it all before you go.',
  length: 560,
  finishD: 546,
  finishX: 0.2,
  finishHalf: 2.6,
  maxTime: 90,
  trueCrests: true,
  stances: true,
  slope: slopeFrom([
    [0, 0.05],
    [6, 0.3],
    [40, 0.24],
    [90, 0.2],
    [150, 0.18],
    [220, 0.14],
    [300, 0.15],
    [380, 0.16],
    [450, 0.15],
    [520, 0.1],
    [560, 0],
  ]),
  troughFrom: 480,
  ridges: [
    // Three lanes to the first gap, the bog and the meadow.
    hedge(-3.6, 6, 130, 0.8),
    hedge(3.6, 6, 130, 0.8),
    // The bank shot: one wall that throws the left side across.
    bankL(-8.6, 150, -1.4, 190, 1.2),
    // The double's lanes.
    hedge(-3.6, 240, 310, 0.8),
    hedge(3.6, 240, 310, 0.8),
    bankL(-8.6, 500, -3.6, 540, 1.2),
    bankR(8.6, 496, 4.4, 540, 1.2),
  ],
  ramps: [
    { name: 'Left Table', x0: -6.8, x1: -4.4, d0: 50, d1: 59, rise: 1.8 },
    { name: 'Middle Table', x0: -1.4, x1: 1.4, d0: 50, d1: 59, rise: 1.8 },
    { name: 'Right Table', x0: 4.4, x1: 6.8, d0: 50, d1: 59, rise: 1.8 },
    { name: 'The Kicker', x0: -1.3, x1: 0.6, d0: 200, d1: 208, rise: 0.85 },
    { name: 'The Double', x0: -6.8, x1: 6.8, d0: 262, d1: 271, rise: 1.4 },
    { name: 'Left Second', x0: -6.8, x1: -4.4, d0: 292, d1: 299, rise: 1.3 },
    { name: 'Right Second', x0: 4.4, x1: 6.8, d0: 292, d1: 299, rise: 1.3 },
  ],
  pits: [
    { x0: -7.4, x1: 7.4, d0: 60.5, d1: 69, depth: 5 },
    { x0: -7.4, x1: 7.4, d0: 210, d1: 224, depth: 4.5, bridges: [[1.4, 2.7], [3.3, 4.4], [5.5, 6.0]] },
    { x0: -7.4, x1: 7.4, d0: 272.5, d1: 280, depth: 4.5 },
    { x0: -7.4, x1: 7.4, d0: 300.5, d1: 306, depth: 4.5, bridges: [[-0.8, 0.8]] },
  ],
  mud: [
    { x: 0, d: 88, rx: 1.5, rd: 9 },
    { x: -5.6, d: 250, rx: 1.6, rd: 9 },
  ],
  obstacles: [
    // The meadow: a sheep in each outer lane.
    sheep(-6.8, -4.2, 112, 4.0),
    sheep(6.8, 4.2, 120, 5.0, 1.4),
    // The flock.
    sheep(-6.6, 4.0, 340, 7.0, 0.4),
    sheep(6.6, -4.0, 354, 6.0, 2.0),
    sheep(-4.0, 6.0, 368, 9.0, 4.4),
    // The wood.
    tree(-2.8, 404, 3.4),
    tree(3.0, 418, 3.6),
    tree(-5.6, 432, 3.2),
    tree(6.6, 452, 3.4),
    tree(-2.2, 470, 3.6),
    ...gate(0.2, 546, 2.8),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 44, name: 'The Gap' },
    { d: 76, name: 'The Bog' },
    { d: 104, name: 'The Meadow' },
    { d: 144, name: 'The Bank Shot' },
    { d: 194, name: 'The Creek' },
    { d: 236, name: 'The Mire' },
    { d: 258, name: 'The Double' },
    { d: 330, name: 'The Flock' },
    { d: 394, name: 'The Wood' },
    { d: 494, name: 'The Run-in' },
    { d: 540, name: 'The Gate' },
  ],
  dashes: { xs: [-5.6, 0, 5.6], d0: 4, d1: 44 },
}

export const HILLS: Hill[] = [GRAVITY_HILL, ROLLERS, PINBALL, MEADOW, QUARRY, LONG_WAY]
