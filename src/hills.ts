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
const hedge = (x: number, d0: number, d1: number, height = 0.7) => ({ ax: x, ad: d0, bx: x, bd: d1, height, width: 0.4, look: 'hedge' as const })

export const ROLLERS: Hill = {
  ...base,
  id: 'rollers',
  name: 'Roller Hill',
  brief: 'Mud is slow. Rollers like speed. The plank likes neither.',
  length: 236,
  finishD: 222,
  finishX: 0,
  maxTime: 50,
  trueCrests: true,
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
    // Three small rollers in the middle lane.
    roller(26, 0.35, -3.2, 3.2, 0.8),
    roller(32, 0.35, -3.2, 3.2, 0.8),
    roller(38, 0.35, -3.2, 3.2, 0.8),
    // The rollers proper: right across the hill.
    roller(76, 0.42),
    roller(83, 0.42),
    roller(90, 0.42),
    roller(97, 0.42),
    // A late set, smaller.
    roller(180, 0.4),
    roller(186, 0.4),
    // The run-in: banks either side steer riders to the gate.
    { ax: -8.6, ad: 190, bx: -3.8, bd: 214, height: 1.2, width: 1.6, bank: true, look: 'turf' },
    { ax: 3.8, ad: 214, bx: 8.6, bd: 190, height: 1.2, width: 1.6, bank: true, look: 'turf' },
  ],
  ramps: [
    { name: 'The Step', x0: 4.0, x1: 7.2, d0: 102, d1: 110.5, rise: 1.8 },
    { name: 'The Table', x0: -1.1, x1: 1.1, d0: 101, d1: 110.5, rise: 1.9 },
  ],
  pits: [{ x0: -7.4, x1: 7.4, d0: 112, d1: 120, depth: 5, bridges: [[-6.0, -5.1]] }],
  mud: [
    { x: -5.6, d: 38, rx: 1.9, rd: 9 },
    { x: 5.7, d: 62, rx: 1.15, rd: 9 },
    { x: 4.5, d: 150, rx: 2.4, rd: 6 },
  ],
  obstacles: [
    { kind: 'tyres', x: 7.4, d: 126, bx: 4.4, bd: 142, r: 0.55, height: 1.1 },
    { kind: 'tyres', x: -7.4, d: 128, bx: -4.6, bd: 143, r: 0.55, height: 1.1 },
    { kind: 'tree', x: 0.9, d: 160, r: 0.55, height: 3.4 },
    { kind: 'rock', x: 2.8, d: 170, r: 0.75, height: 1.0 },
    { kind: 'tree', x: -4.8, d: 172, r: 0.55, height: 3.2 },
    { kind: 'tree', x: 5.2, d: 196, r: 0.55, height: 3.6 },
    { kind: 'rock', x: -2.6, d: 204, r: 0.7, height: 0.9 },
    ...gate(0, 222),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 24, name: 'The Lanes' },
    { d: 70, name: 'The Rollers' },
    { d: 101, name: 'The Plank' },
    { d: 124, name: 'The Bumpers' },
    { d: 145, name: 'The Bog' },
    { d: 176, name: 'The Ripples' },
    { d: 214, name: 'The Gate' },
  ],
  dashes: { xs: [-5.6, 0, 5.6], d0: 4, d1: 22 },
}

const bankL = (ax: number, ad: number, bx: number, bd: number, height = 1.2, width = 1.6) => ({ ax, ad, bx, bd, height, width, bank: true, look: 'turf' as const })
/** A bank on the right-hand side (high at +x): the same wall, drawn uphill. */
const bankR = (ax: number, ad: number, bx: number, bd: number, height = 1.2, width = 1.6) => ({ ax: bx, ad: bd, bx: ax, bd: ad, height, width, bank: true, look: 'turf' as const })
const rock = (x: number, d: number, r = 0.7, height = 1.0): Obstacle => ({ kind: 'rock', x, d, r, height })
const tree = (x: number, d: number, height = 3.4): Obstacle => ({ kind: 'tree', x, d, r: 0.55, height })
const tyres = (x: number, d: number, bx: number, bd: number): Obstacle => ({ kind: 'tyres', x, d, bx, bd, r: 0.55, height: 1.1 })

export const PINBALL: Hill = {
  ...base,
  id: 'pinball',
  name: 'Pinball Wood',
  brief: 'Everything bounces. Nothing in the wood is in a straight line.',
  length: 318,
  finishD: 304,
  finishX: -2.4,
  maxTime: 60,
  trueCrests: true,
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
    // The slalom: low dirt berms set across the line, each nudging riders the other way.
    { ax: -7.8, ad: 20, bx: -0.6, bd: 30, height: 0.55, width: 0.7, look: 'dirt' },
    { ax: 7.8, ad: 32, bx: 0.6, bd: 42, height: 0.55, width: 0.7, look: 'dirt' },
    { ax: -7.8, ad: 44, bx: -0.6, bd: 54, height: 0.55, width: 0.7, look: 'dirt' },
    // The chicane: a bank on each side, one after the other.
    bankL(-8.6, 66, -2.2, 92),
    bankR(8.6, 96, 2.2, 122),
    // A brow that throws fast riders into the air before the creek.
    roller(128, 0.7, -14, 14, 1.4),
    bankL(-8.6, 270, -4.6, 300, 1.1),
    bankR(8.6, 256, -0.4, 298, 1.2),
  ],
  ramps: [{ name: 'The Kicker', x0: -0.8, x1: 0.8, d0: 143, d1: 149, rise: 1.5 }],
  pits: [{ x0: -7.4, x1: 7.4, d0: 151, d1: 158, depth: 4.5, bridges: [[-1.9, -1.35], [1.55, 2.2]] }],
  mud: [{ x: 0, d: 112, rx: 2.4, rd: 5 }],
  obstacles: [
    // The wood: pines and tyre bumpers.
    tyres(-7.4, 170, -4.4, 180),
    tyres(7.4, 176, 4.4, 186),
    tree(-2.6, 186),
    tree(3.0, 196, 3.6),
    tree(-1.4, 208),
    tree(-5.4, 214, 3.2),
    tree(5.6, 220),
    tree(3.2, 236, 3.8),
    tyres(-7.4, 238, -4.6, 248),
    tree(3.4, 244),
    rock(-2.0, 252, 0.7),
    tree(-3.6, 266, 3.6),
    rock(4.6, 280, 0.8),
    ...gate(-2.4, 304, 2.9),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 18, name: 'The Slalom' },
    { d: 64, name: 'The Chicane' },
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
  brief: 'The sheep keep their own time. Arrive when they are elsewhere.',
  length: 400,
  finishD: 386,
  finishX: 2,
  maxTime: 70,
  trueCrests: true,
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
    hedge(-3.7, 5, 66),
    hedge(3.7, 5, 66),
    roller(132, 0.45),
    roller(139, 0.45),
    roller(146, 0.45),
    roller(153, 0.45),
    // The kink: a low berm across the middle that turns riders toward the flock's far side.
    { ax: -2.6, ad: 212, bx: 3.4, bd: 222, height: 0.5, width: 0.7, look: 'dirt' },
    bankL(-8.6, 340, -3.0, 378, 1.2),
    bankR(8.6, 344, 4.6, 380, 1.1),
  ],
  ramps: [
    { name: 'The Table', x0: -1.4, x1: 1.4, d0: 43, d1: 53, rise: 2.2 },
    { name: 'The Kicker', x0: 4.6, x1: 7.0, d0: 40, d1: 42.6, rise: 0.8 },
    { name: 'The Ledge', x0: 4.4, x1: 7.2, d0: 172, d1: 181, rise: 1.8 },
  ],
  pits: [
    { x0: -3.2, x1: 3.2, d0: 54.5, d1: 63, depth: 5 },
    { x0: -7.4, x1: 7.4, d0: 182.5, d1: 190, depth: 4.5, bridges: [[-6.1, -5.1], [-0.7, 0.7]] },
  ],
  mud: [{ x: -5.7, d: 34, rx: 1.6, rd: 10 }],
  obstacles: [
    rock(5.0, 48.5, 0.75),
    rock(6.3, 48.0, 0.8, 1.1),
    rock(7.5, 48.6, 0.7),
    // The meadow: two sheep crossing.
    sheep(-6.6, -1.2, 98, 7.0),
    sheep(6.6, 1.6, 108, 9.0, 1.2),
    tyres(-7.4, 196, -4.6, 208),
    tyres(7.4, 200, 4.6, 212),
    // The flock.
    sheep(-6.4, 6.4, 224, 6.0, 0.6),
    sheep(6.4, -6.4, 236, 8.0, 2.2),
    sheep(-5.0, 5.0, 248, 5.0, 3.6),
    tree(-3.8, 272),
    tree(3.4, 282, 3.6),
    tree(0.2, 298),
    tree(-5.2, 310, 3.2),
    tree(6.8, 318),
    rock(0.8, 328, 0.75),
    tree(-0.6, 346, 3.6),
    ...gate(2, 386, 2.9),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 38, name: 'The Table' },
    { d: 88, name: 'The Meadow' },
    { d: 126, name: 'The Rollers' },
    { d: 166, name: 'The Ledge' },
    { d: 194, name: 'The Bumpers' },
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
  brief: 'Gap after gap. Every landing sets up the next take-off.',
  length: 470,
  finishD: 456,
  finishX: -1.5,
  maxTime: 80,
  trueCrests: true,
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
    // Two lanes at the top, split by a long hedge.
    hedge(0, 6, 70, 0.8),
    // The funnel: banks either side gather both lanes for the long table.
    bankL(-8.6, 78, -2.2, 112, 1.2),
    bankR(8.6, 78, 2.2, 112, 1.2),
    // The bank shot: a turf wall that turns the left lane back to the middle.
    bankL(-8.6, 150, -2.4, 186, 1.3),
    bankR(8.6, 146, 2.8, 184, 1.3),
    bankL(-8.6, 218, -3.6, 256, 0.9),
    bankR(8.6, 218, 3.6, 256, 0.9),
    roller(232, 0.5),
    roller(238, 0.5),
    // The rock garden's berm.
    { ax: 7.8, ad: 306, bx: 0.4, bd: 320, height: 0.55, width: 0.7, look: 'dirt' as const },
    bankL(-8.6, 410, -4.2, 446, 1.2),
    bankR(8.6, 404, 2.0, 446, 1.2),
  ],
  ramps: [
    // Gap one: a table in each lane.
    { name: 'Left Table', x0: -6.0, x1: -1.6, d0: 50, d1: 60, rise: 2.0 },
    { name: 'Right Table', x0: 1.6, x1: 6.0, d0: 49, d1: 59, rise: 1.9 },
    // Gap two: one long table in the middle.
    { name: 'The Long Table', x0: -2.6, x1: 2.6, d0: 118, d1: 130, rise: 2.2 },
    // Gap three: the step-down, off a kicker on the right.
    { name: 'The Drop', x0: 0.4, x1: 5.4, d0: 196, d1: 202, rise: 1.2 },
    // Gap four: the double.
    { name: 'The Double', x0: -3.0, x1: 3.0, d0: 262, d1: 271, rise: 1.9 },
    { name: 'The Second', x0: -3.6, x1: 3.6, d0: 288, d1: 295, rise: 1.3 },
  ],
  pits: [
    { x0: -7.4, x1: 7.4, d0: 61, d1: 70, depth: 5 },
    { x0: -7.4, x1: 7.4, d0: 131.5, d1: 141, depth: 5, bridges: [[-6.6, -5.9]] },
    { x0: -7.4, x1: 7.4, d0: 203.5, d1: 212, depth: 5, bridges: [[-1.2, -0.5]] },
    { x0: -7.4, x1: 7.4, d0: 272.5, d1: 280, depth: 4.5 },
    { x0: -7.4, x1: 7.4, d0: 296.5, d1: 302, depth: 4.5 },
  ],
  mud: [{ x: 4.2, d: 30, rx: 1.4, rd: 8 }],
  obstacles: [
    rock(-3.2, 160, 0.8),
    rock(3.6, 168, 0.8),
    // The rock garden.
    rock(-4.8, 320, 0.7),
    rock(-2.3, 326, 0.75),
    rock(2.6, 332, 0.7),
    rock(-3.2, 340, 0.7),
    rock(5.2, 344, 0.75),
    rock(0.6, 352, 0.7),
    tree(-5.8, 366, 3.4),
    tree(3.4, 372, 3.6),
    tree(0.6, 388, 3.6),
    tree(-3.4, 398, 3.2),
    rock(1.8, 420, 0.75),
    ...gate(-1.5, 456, 2.9),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 44, name: 'Gap One' },
    { d: 84, name: 'The Funnel' },
    { d: 112, name: 'The Long Table' },
    { d: 146, name: 'The Bank Shot' },
    { d: 190, name: 'The Drop' },
    { d: 226, name: 'The Rollers' },
    { d: 256, name: 'The Double' },
    { d: 304, name: 'The Rock Garden' },
    { d: 362, name: 'The Last Wood' },
    { d: 404, name: 'The Run-in' },
    { d: 450, name: 'The Gate' },
  ],
  dashes: { xs: [-4.1, 4.1], d0: 4, d1: 44 },
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
  slope: slopeFrom([
    [0, 0.05],
    [6, 0.3],
    [40, 0.24],
    [90, 0.2],
    [150, 0.18],
    [220, 0.2],
    [300, 0.17],
    [380, 0.16],
    [450, 0.15],
    [520, 0.1],
    [560, 0],
  ]),
  troughFrom: 480,
  ridges: [
    // The slalom.
    { ax: -7.8, ad: 18, bx: -0.8, bd: 28, height: 0.55, width: 0.7, look: 'dirt' as const },
    { ax: 7.8, ad: 30, bx: 0.8, bd: 40, height: 0.55, width: 0.7, look: 'dirt' as const },
    // The rollers.
    roller(108, 0.45),
    roller(115, 0.45),
    roller(122, 0.45),
    // The bank shots.
    bankL(-8.6, 160, -2.6, 194, 1.2),
    bankR(8.6, 164, 2.6, 198, 1.2),
    // The kink before the flock.
    { ax: 3.0, ad: 330, bx: -3.0, bd: 340, height: 0.5, width: 0.7, look: 'dirt' as const },
    bankL(-8.6, 492, -2.2, 538, 1.3),
    bankR(8.6, 496, 4.4, 540, 1.2),
  ],
  ramps: [
    { name: 'The Table', x0: -2.0, x1: 2.0, d0: 52, d1: 62, rise: 2.0 },
    { name: 'The Step', x0: 1.8, x1: 5.2, d0: 200, d1: 208, rise: 1.6 },
    { name: 'The Double', x0: -2.8, x1: 2.8, d0: 262, d1: 271, rise: 1.9 },
    { name: 'The Second', x0: -3.4, x1: 3.4, d0: 293, d1: 300, rise: 1.3 },
  ],
  pits: [
    { x0: -7.4, x1: 7.4, d0: 63.5, d1: 71, depth: 5, bridges: [[-6.4, -5.6], [5.4, 6.2]] },
    { x0: -7.4, x1: 7.4, d0: 209.5, d1: 217, depth: 5, bridges: [[-0.9, -0.3]] },
    { x0: -7.4, x1: 7.4, d0: 272.5, d1: 280, depth: 4.5 },
    { x0: -7.4, x1: 7.4, d0: 301.5, d1: 307, depth: 4.5 },
  ],
  mud: [
    { x: 0, d: 86, rx: 2.0, rd: 6 },
    { x: -0.2, d: 238, rx: 1.4, rd: 7 },
  ],
  obstacles: [
    // The meadow.
    sheep(-6.6, -0.8, 140, 6.5),
    sheep(6.6, 0.8, 148, 8.0, 1.6),
    rock(-3.4, 170, 0.75),
    rock(3.8, 176, 0.8),
    // The flock.
    sheep(-6.6, 4.0, 352, 7.0, 0.4),
    sheep(6.6, -4.0, 364, 6.0, 2.0),
    sheep(-4.0, 6.0, 376, 9.0, 4.4),
    // The wood.
    tree(-2.4, 400, 3.4),
    tree(2.8, 410, 3.6),
    tree(-5.6, 420, 3.2),
    tree(0.2, 430, 3.8),
    rock(4.6, 440, 0.8),
    tree(-5.0, 452, 3.4),
    rock(1.8, 466, 0.75),
    tree(5.4, 474, 3.4),
    tree(-1.2, 486, 3.6),
    ...gate(0.2, 546, 2.8),
  ],
  sections: [
    { d: 0, name: 'The Start' },
    { d: 16, name: 'The Slalom' },
    { d: 48, name: 'The Table' },
    { d: 80, name: 'The Bog' },
    { d: 100, name: 'The Rollers' },
    { d: 132, name: 'The Meadow' },
    { d: 158, name: 'The Bank Shots' },
    { d: 198, name: 'The Step' },
    { d: 224, name: 'The Mire' },
    { d: 256, name: 'The Double' },
    { d: 318, name: 'The Kink' },
    { d: 346, name: 'The Flock' },
    { d: 392, name: 'The Wood' },
    { d: 494, name: 'The Run-in' },
    { d: 540, name: 'The Gate' },
  ],
  dashes: { xs: [-4, 0, 4], d0: 4, d1: 16 },
}

export const HILLS: Hill[] = [GRAVITY_HILL, ROLLERS, PINBALL, MEADOW, QUARRY, LONG_WAY]
