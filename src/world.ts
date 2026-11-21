import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { COURSE, groundLevel, rampDeck, terrainHeight, type Obstacle } from './course'

/**
 * The diorama: a slice of hillside on a walnut plinth, with soil layers on its
 * cut sides, painted lanes, wooden ramps, boulders, pines, a tyre wall and the
 * finish gate. Everything is generated from the course data.
 */

export const v3 = (x: number, h: number, d: number) => new THREE.Vector3(x, h, -d)

const W = COURSE.edge + 0.6 // half-width of the diorama
const D0 = -3
const D1 = COURSE.length
const BASE = -38 // bottom of the soil block (below the lowest point)

const col = (hex: number) => new THREE.Color(hex)
const PAL = {
  lane: col(0xc4aa80),
  laneDark: col(0xb2966d),
  hedge: col(0x6f8f3f),
  grass: col(0x88a24f),
  grassDry: col(0xb3b062),
  pit: col(0x6a5240),
  pitDeep: col(0x3e2f25),
  paint: col(0xf4efe2),
  finishA: col(0x2b2b2b),
  finishB: col(0xf4efe2),
  soil: [col(0x6b4a33), col(0x8a6440), col(0xb08452), col(0x7d5a3c), col(0x8f8a80)],
}

/** Deterministic hash noise for colour variation. */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function surfaceColor(x: number, d: number, h: number, out: THREE.Color) {
  const ax = Math.abs(x)
  const n = hash(Math.floor(x * 3), Math.floor(d * 3)) * 0.06 - 0.03
  const base = groundLevel(x, d)
  const inPit = COURSE.pits.some((p) => x > p.x0 - 0.3 && x < p.x1 + 0.3 && d > p.d0 - 0.3 && d < p.d1 + 0.3) && h < base - 0.25
  if (inPit) {
    const depth = Math.min(1, (base - h) / 4)
    out.copy(PAL.pit).lerp(PAL.pitDeep, depth)
  } else if (ax > COURSE.halfWidth) {
    out.copy(PAL.grass).lerp(PAL.grassDry, hash(Math.floor(x * 2), Math.floor(d * 1.5)) * 0.5)
  } else {
    // Hedgerow dividers between the three lanes at the top of the hill.
    const onDivider = d > 4 && d < 70 && Math.abs(ax - 3.9) < 0.55
    // The banked wall is turf.
    const bank = COURSE.ridges.find((r) => r.bank)
    const bankH = bank ? h - terrainHeight(x + 3, d) : 0
    if (onDivider) out.copy(PAL.hedge)
    else if (bank && x < -2 && d > 60 && d < 96 && bankH > 0.25) out.copy(PAL.grass)
    else {
      out.copy(Math.floor(d / 3) % 2 === 0 ? PAL.lane : PAL.laneDark).lerp(PAL.lane, 0.6)
    }
    // Finish line: a checker across the gate.
    if (Math.abs(d - COURSE.finishD) < 0.5 && Math.abs(x - COURSE.finishX) < COURSE.finishHalf + 0.3) {
      out.copy((Math.floor(x * 2) + Math.floor(d * 2)) % 2 === 0 ? PAL.finishA : PAL.finishB)
    }
  }
  out.offsetHSL(0, 0, n)
}

function terrainMesh(): THREE.Mesh {
  const dx = 0.2
  const dd = 0.35
  const nx = Math.round((2 * W) / dx) + 1
  const nd = Math.round((D1 - D0) / dd) + 1
  const pos = new Float32Array(nx * nd * 3)
  const colors = new Float32Array(nx * nd * 3)
  const c = new THREE.Color()
  for (let j = 0; j < nd; j++) {
    const d = D0 + j * dd
    for (let i = 0; i < nx; i++) {
      const x = -W + i * dx
      const h = terrainHeight(x, d)
      const k = (j * nx + i) * 3
      pos[k] = x
      pos[k + 1] = h
      pos[k + 2] = -d
      surfaceColor(x, d, h, c)
      colors[k] = c.r
      colors[k + 1] = c.g
      colors[k + 2] = c.b
    }
  }
  const idx: number[] = []
  for (let j = 0; j < nd - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      const b = a + 1
      const e = a + nx
      const f = e + 1
      idx.push(a, b, e, b, f, e)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }))
  m.receiveShadow = true
  return m
}

/** The cut sides of the diorama: soil strata from the surface down to the plinth. */
function sidesMesh(): THREE.Mesh {
  const pos: number[] = []
  const colors: number[] = []
  const c = new THREE.Color()
  const strata = (y: number, top: number) => {
    const depth = top - y
    const band = depth < 0.6 ? 0 : Math.floor((depth + Math.sin(y * 0.7) * 0.5) / 2.4) % 4 + 1
    return c.copy(PAL.soil[Math.min(PAL.soil.length - 1, band)])
  }
  const wall = (pts: Array<[number, number]>) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, d0] = pts[i]
      const [x1, d1] = pts[i + 1]
      const t0 = terrainHeight(x0, d0)
      const t1 = terrainHeight(x1, d1)
      // Split each column into strips so strata get their own colours.
      const rows = 12
      for (let r = 0; r < rows; r++) {
        const a0 = t0 - ((t0 - BASE) * r) / rows
        const b0 = t0 - ((t0 - BASE) * (r + 1)) / rows
        const a1 = t1 - ((t1 - BASE) * r) / rows
        const b1 = t1 - ((t1 - BASE) * (r + 1)) / rows
        const quad = [
          [x0, a0, d0],
          [x0, b0, d0],
          [x1, a1, d1],
          [x1, a1, d1],
          [x0, b0, d0],
          [x1, b1, d1],
        ]
        for (const [x, y, d] of quad) {
          pos.push(x, y, -d)
          strata(y, (t0 + t1) / 2)
          colors.push(c.r, c.g, c.b)
        }
      }
    }
  }
  const step = 0.5
  const left: Array<[number, number]> = []
  const right: Array<[number, number]> = []
  for (let d = D0; d <= D1 + 1e-6; d += step) {
    left.push([-W, d])
    right.push([W, d])
  }
  const front: Array<[number, number]> = []
  const back: Array<[number, number]> = []
  for (let x = -W; x <= W + 1e-6; x += step) {
    front.push([x, D0])
    back.push([x, D1])
  }
  wall(left.slice().reverse())
  wall(right)
  wall(front)
  wall(back.slice().reverse())
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, flatShading: true }))
  m.receiveShadow = true
  return m
}

function rampMesh(r: (typeof COURSE.ramps)[number]): THREE.Group {
  const g = new THREE.Group()
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x8f5f36, roughness: 0.8 })
  const nx = 8
  const nd = 24
  const pos: number[] = []
  const colors: number[] = []
  const c = new THREE.Color()
  const deck = (x: number, d: number) => terrainHeight(x, d) + rampDeck(r, x, d) + 0.02
  for (let j = 0; j < nd; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = r.x0 + ((r.x1 - r.x0) * i) / nx
      const x1 = r.x0 + ((r.x1 - r.x0) * (i + 1)) / nx
      const d0 = r.d0 + ((r.d1 - r.d0) * j) / nd
      const d1 = r.d0 + ((r.d1 - r.d0) * (j + 1)) / nd
      const xm = (x0 + x1) / 2
      const plank = Math.floor((xm - r.x0) / 0.38) % 2
      c.set(plank ? 0xc48d56 : 0xb98250).offsetHSL(0, 0, (hash(plank, j) - 0.5) * 0.04)
      const q = [
        [x0, d0],
        [x0, d1],
        [x1, d0],
        [x1, d0],
        [x0, d1],
        [x1, d1],
      ]
      for (const [x, d] of q) {
        pos.push(x, deck(Math.min(Math.max(x, r.x0 + 0.26), r.x1 - 0.26), Math.min(d, r.d1 - 0.001)), -d)
        colors.push(c.r, c.g, c.b)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }))
  top.castShadow = top.receiveShadow = true
  g.add(top)
  // Side skirts and the lip's back face.
  const side = (x: number) => {
    const s: number[] = []
    for (let j = 0; j < nd; j++) {
      const d0 = r.d0 + ((r.d1 - r.d0) * j) / nd
      const d1 = r.d0 + ((r.d1 - r.d0) * (j + 1)) / nd
      const xi = x < 0 || x === r.x0 ? r.x0 + 0.26 : r.x1 - 0.26
      const t0 = deck(xi, d0)
      const t1 = deck(xi, Math.min(d1, r.d1 - 0.001))
      const b0 = terrainHeight(x, d0) - 0.05
      const b1 = terrainHeight(x, d1) - 0.05
      s.push(x, t0, -d0, x, b0, -d0, x, t1, -d1, x, t1, -d1, x, b0, -d0, x, b1, -d1)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(s, 3))
    sg.computeVertexNormals()
    const m = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x9c6a3e, roughness: 0.85, side: THREE.DoubleSide }))
    m.castShadow = true
    return m
  }
  g.add(side(r.x0), side(r.x1))
  const lipH = r.rise
  const lip = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, lipH + 0.1, 0.12), woodDark)
  const mid = (r.x0 + r.x1) / 2
  lip.position.copy(v3(mid, terrainHeight(mid, r.d1) + lipH / 2 - 0.03, r.d1 + 0.06))
  lip.castShadow = true
  g.add(lip)
  // Two struts under the lip.
  for (const x of [r.x0 + 0.3, r.x1 - 0.3]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, lipH, 0.12), woodDark)
    strut.position.copy(v3(x, terrainHeight(x, r.d1) + lipH / 2, r.d1 - 0.4))
    g.add(strut)
  }
  // A brass-yellow warning stripe on the lip edge.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0 - 0.1, 0.05, 0.14), new THREE.MeshStandardMaterial({ color: 0xe3b23c, roughness: 0.5 }))
  stripe.position.copy(v3(mid, terrainHeight(mid, r.d1) + lipH + 0.02, r.d1 - 0.05))
  g.add(stripe)
  return g
}

const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.9, flatShading: true })
const pineMat = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.85, flatShading: true })
const pineMat2 = new THREE.MeshStandardMaterial({ color: 0x4f7d40, roughness: 0.85, flatShading: true })
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.9 })

function rock(o: Obstacle, seed: number): THREE.Object3D {
  const g = new THREE.DodecahedronGeometry(1, 1)
  const p = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const k = 0.82 + hash(i + seed, seed) * 0.3
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, rockMat)
  m.scale.set(o.r * 1.1, o.height * 0.75, o.r * 1.05)
  m.rotation.y = seed
  m.position.copy(v3(o.x, terrainHeight(o.x, o.d) + o.height * 0.35, o.d))
  m.castShadow = m.receiveShadow = true
  return m
}

export function pine(x: number, d: number, height: number, seed = 0): THREE.Object3D {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, height * 0.3, 7), trunkMat)
  trunk.position.y = height * 0.15
  trunk.castShadow = true
  g.add(trunk)
  for (let i = 0; i < 3; i++) {
    const r = (0.95 - i * 0.24) * height * 0.32
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, height * 0.42, 8), i % 2 ? pineMat2 : pineMat)
    cone.position.y = height * (0.38 + i * 0.2)
    cone.rotation.y = seed + i
    cone.castShadow = true
    g.add(cone)
  }
  g.position.copy(v3(x, terrainHeight(x, d) - 0.05, d))
  return g
}

function tyreWall(o: Obstacle): THREE.Object3D {
  const g = new THREE.Group()
  const tyre = new THREE.TorusGeometry(0.36, 0.17, 8, 16)
  tyre.rotateX(Math.PI / 2)
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2b2a, roughness: 0.85 })
  const painted = new THREE.MeshStandardMaterial({ color: 0xc9452f, roughness: 0.7 })
  const len = Math.hypot((o.bx ?? o.x) - o.x, (o.bd ?? o.d) - o.d)
  const n = Math.max(2, Math.round(len / 0.72))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = o.x + ((o.bx ?? o.x) - o.x) * t
    const d = o.d + ((o.bd ?? o.d) - o.d) * t
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(tyre, (i + k) % 3 === 0 ? painted : dark)
      m.position.copy(v3(x, terrainHeight(x, d) + 0.17 + k * 0.33, d))
      m.castShadow = true
      g.add(m)
    }
  }
  return g
}

function baleRow(o: Obstacle): THREE.Object3D {
  const g = new THREE.Group()
  const hay = new THREE.MeshStandardMaterial({ color: 0xd8b75e, roughness: 0.95 })
  const band = new THREE.MeshStandardMaterial({ color: 0x8b6a3a, roughness: 0.9 })
  const len = Math.hypot((o.bx ?? o.x) - o.x, (o.bd ?? o.d) - o.d)
  const n = Math.max(1, Math.round(len / 1.25))
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    const x = o.x + ((o.bx ?? o.x) - o.x) * t
    const d = o.d + ((o.bd ?? o.d) - o.d) * t
    const bale = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.75, 0.8, 2, 0.12), hay)
    bale.position.copy(v3(x, terrainHeight(x, d) + 0.38, d))
    bale.castShadow = bale.receiveShadow = true
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.77, 0.82), band)
    strap.position.copy(bale.position)
    g.add(bale, strap)
  }
  return g
}

function finishGate(): THREE.Object3D {
  const g = new THREE.Group()
  const red = new THREE.MeshStandardMaterial({ color: 0xc9452f, roughness: 0.6 })
  const white = new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.6 })
  const posts = COURSE.obstacles.filter((o) => o.kind === 'post')
  for (const p of posts) {
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, p.height / 6, 12), i % 2 ? white : red)
      seg.position.copy(v3(p.x, terrainHeight(p.x, p.d) + (p.height / 6) * (i + 0.5), p.d))
      seg.castShadow = true
      g.add(seg)
    }
  }
  // A cloth banner with a checker band.
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const x = c.getContext('2d')!
  x.fillStyle = '#f4efe2'
  x.fillRect(0, 0, 512, 96)
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? '#2b2b2b' : '#f4efe2'
      x.fillRect(i * 16, j * 12, 16, 12)
      x.fillRect(i * 16, 72 + j * 12, 16, 12)
    }
  }
  x.fillStyle = '#2b2b2b'
  x.font = '600 34px "IBM Plex Mono", ui-monospace, monospace'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText('F I N I S H', 256, 49)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const [a, b] = posts
  const span = b.x - a.x
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(span - 0.2, span * (96 / 512) * 1.1, 12, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }))
  banner.position.copy(v3((a.x + b.x) / 2, terrainHeight(0, a.d) + a.height - 0.45, a.d))
  banner.castShadow = true
  banner.name = 'banner'
  g.add(banner)
  return g
}

function startGate(): THREE.Object3D {
  const g = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x8f5f36, roughness: 0.75 })
  const [lo, hi] = COURSE.startRange
  const d = COURSE.startD - 0.9
  // The start bar the rider pushes off from, with a ruler of ticks.
  const bar = new THREE.Mesh(new RoundedBoxGeometry(hi - lo + 1.2, 0.12, 0.12, 2, 0.04), wood)
  bar.position.copy(v3(0, terrainHeight(0, d) + 0.12, d))
  bar.castShadow = true
  g.add(bar)
  for (const x of [lo - 0.6, hi + 0.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), wood)
    post.position.copy(v3(x, terrainHeight(x, d) + 0.25, d))
    post.castShadow = true
    g.add(post)
  }
  const tickMat = new THREE.MeshBasicMaterial({ color: 0x3a2a1e })
  for (let x = Math.ceil(lo); x <= hi; x += 1) {
    const big = x % 2 === 0
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.03, big ? 0.13 : 0.08, 0.01), tickMat)
    tick.position.copy(v3(x, terrainHeight(0, d) + 0.12 + (big ? 0 : 0.02), d - 0.065))
    g.add(tick)
  }
  return g
}

/** Painted dashes down the middle of each lane at the top of the hill. */
function laneDashes(): THREE.Object3D {
  const geo = new THREE.PlaneGeometry(0.09, 1.4)
  geo.rotateX(-Math.PI / 2)
  const paint = new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 })
  const g = new THREE.Group()
  for (const x of [-5.75, 0, 5.75]) {
    for (let d = 4; d < 40; d += 3.2) {
      const m = new THREE.Mesh(geo, paint)
      const h0 = terrainHeight(x, d - 0.7)
      const h1 = terrainHeight(x, d + 0.7)
      m.position.copy(v3(x, (h0 + h1) / 2 + 0.03, d))
      m.rotation.x = Math.atan2(h1 - h0, 1.4)
      m.receiveShadow = true
      g.add(m)
    }
  }
  return g
}

export function buildWorld(): { group: THREE.Group; banner: THREE.Object3D | null } {
  const group = new THREE.Group()
  group.add(terrainMesh(), sidesMesh())
  // Walnut plinth under the diorama (a nod to the workshop).
  const plinth = new THREE.Mesh(
    new RoundedBoxGeometry(2 * W + 1.6, 1.6, D1 - D0 + 1.6, 3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x5e3f2a, roughness: 0.55 }),
  )
  plinth.position.set(0, BASE - 0.75, -(D0 + D1) / 2)
  plinth.receiveShadow = true
  group.add(plinth)
  for (const r of COURSE.ramps) group.add(rampMesh(r))
  let seed = 1
  for (const o of COURSE.obstacles) {
    seed += 1.7
    if (o.kind === 'rock') group.add(rock(o, seed))
    else if (o.kind === 'tree') group.add(pine(o.x, o.d, o.height, seed))
    else if (o.kind === 'tyres') group.add(tyreWall(o))
    else if (o.kind === 'bale') group.add(baleRow(o))
  }
  // Decorative pines on the shoulders, clear of every line that matters.
  for (let d = 10; d < D1 - 4; d += 9.5) {
    const s = hash(d, 3)
    group.add(pine(-W + 0.45 + s * 0.3, d + s * 3, 2.6 + s * 1.4, d))
    group.add(pine(W - 0.45 - s * 0.3, d + 4 + s * 2, 2.4 + hash(d, 9) * 1.6, d + 1))
  }
  group.add(startGate())
  group.add(laneDashes())
  const gate = finishGate()
  group.add(gate)
  return { group, banner: gate.getObjectByName('banner') ?? null }
}

/** The plinth's extents, for framing the preview. */
export const BOUNDS = { W, D0, D1, BASE }
