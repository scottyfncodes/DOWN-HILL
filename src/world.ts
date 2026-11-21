import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { COURSE, groundLevel, mudAt, obstacleAt, rampDeck, terrainHeight, type Obstacle, type Pit } from './course'

/**
 * The diorama: a slice of hillside on a walnut plinth, with soil layers on its
 * cut sides, painted lanes, wooden ramps, boulders, pines, a tyre wall and the
 * finish gate. Everything is generated from the course data.
 */

export const v3 = (x: number, h: number, d: number) => new THREE.Vector3(x, h, -d)

/** The plinth's extents for the active hill (refreshed by buildWorld). */
let W = COURSE.edge + 0.6 // half-width of the diorama
const D0 = -3
let D1 = COURSE.length
let BASE = -38 // bottom of the soil block (below the lowest point)

const col = (hex: number) => new THREE.Color(hex)
const PAL = {
  lane: col(0xc4aa80),
  laneDark: col(0xb2966d),
  hedge: col(0x6f8f3f),
  grass: col(0x88a24f),
  grassDry: col(0xb3b062),
  pit: col(0x6a5240),
  mud: col(0x5a4330),
  mudWet: col(0x4a3828),
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

/** How much a ridge stands proud here, and how it is painted. */
function ridgeLook(x: number, d: number, h: number): 'hedge' | 'turf' | 'dirt' | null {
  // The ridge's own height: the surface minus the bare hill under it.
  for (const r of COURSE.ridges) {
    if (!r.look) continue
    const minD = Math.min(r.ad, r.bd) - 3
    const maxD = Math.max(r.ad, r.bd) + 3
    if (d < minD || d > maxD) continue
    if (r.bank) {
      // A bank: turf where the wall rises clear of the hill beside it.
      const lift = h - terrainHeight(x + (r.ad < r.bd ? 3 : -3), d)
      const onLeft = r.ad < r.bd ? x < Math.max(r.ax, r.bx) + 1 : x > Math.min(r.ax, r.bx) - 1
      if (onLeft && lift > 0.25) return r.look
      continue
    }
    const ex = r.bx - r.ax
    const ed = r.bd - r.ad
    const len2 = ex * ex + ed * ed
    const t = ((x - r.ax) * ex + (d - r.ad) * ed) / len2
    if (t < 0 || t > 1) continue
    const dist = Math.hypot(x - (r.ax + ex * t), d - (r.ad + ed * t))
    if (dist < r.width * (r.look === 'dirt' ? 0.9 : 1.37)) return r.look
  }
  return null
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
    const look = ridgeLook(x, d, h)
    if (look === 'hedge') out.copy(PAL.hedge)
    else if (look === 'turf') out.copy(PAL.grass)
    else {
      out.copy(Math.floor(d / 3) % 2 === 0 ? PAL.lane : PAL.laneDark).lerp(PAL.lane, 0.6)
      // Rollers and berms: a darker, packed crest that reads from the start line.
      if (look === 'dirt') out.lerp(PAL.laneDark, 0.8).offsetHSL(0, 0.02, -0.04)
    }
    // Mud: dark and wet, with a sheen in the middle.
    const mud = COURSE.mud.length ? mudAt(x, d) : 0
    if (mud > 0) out.lerp(PAL.mud, Math.min(1, mud * 1.6)).lerp(PAL.mudWet, mud * mud * 0.6)
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
  const idx = new Uint32Array((nx - 1) * (nd - 1) * 6)
  let q = 0
  for (let j = 0; j < nd - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      const b = a + 1
      const e = a + nx
      const f = e + 1
      idx[q++] = a
      idx[q++] = b
      idx[q++] = e
      idx[q++] = b
      idx[q++] = f
      idx[q++] = e
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
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
  // A lone stack (a bumper) is one column; a wall is a row of them.
  const n = len < 0.1 ? 0 : Math.max(2, Math.round(len / 0.72))
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0
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
  banner.position.copy(v3((a.x + b.x) / 2, terrainHeight((a.x + b.x) / 2, a.d) + a.height - 0.45, a.d))
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
  const { xs, d0, d1 } = COURSE.dashes
  for (const x of xs) {
    for (let d = d0; d < d1; d += 3.2) {
      // No paint on the mud.
      if (COURSE.mud.length && mudAt(x, d) > 0) continue
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

/** A plank bridge across a pit, with rope rails on posts. */
function bridge(p: Pit, x0: number, x1: number): THREE.Object3D {
  const g = new THREE.Group()
  const plank = new THREE.MeshStandardMaterial({ color: 0xb98250, roughness: 0.8 })
  const plankDark = new THREE.MeshStandardMaterial({ color: 0x9c6a3e, roughness: 0.85 })
  const rope = new THREE.MeshStandardMaterial({ color: 0xd9c49a, roughness: 0.9 })
  const mid = (x0 + x1) / 2
  const w = x1 - x0
  const a = p.d0 - 0.6
  const b = p.d1 + 0.6
  const n = Math.round((b - a) / 0.42)
  const plankGeo = new THREE.BoxGeometry(w + 0.1, 0.07, 0.34)
  for (let i = 0; i < n; i++) {
    const d = a + ((i + 0.5) / n) * (b - a)
    const m = new THREE.Mesh(plankGeo, i % 3 === 1 ? plankDark : plank)
    m.position.copy(v3(mid, groundLevel(mid, d) + 0.0, d))
    m.rotation.y = (hash(i, 7) - 0.5) * 0.06
    m.castShadow = m.receiveShadow = true
    g.add(m)
  }
  const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6)
  for (const x of [x0 - 0.06, x1 + 0.06]) {
    const ends: THREE.Vector3[] = []
    for (const d of [a, (a + b) / 2, b]) {
      const post = new THREE.Mesh(postGeo, plankDark)
      const base = Math.max(groundLevel(x, d), terrainHeight(x, d)) - (d === (a + b) / 2 ? 0 : 0)
      post.position.copy(v3(x, groundLevel(x, d) + 0.42, d))
      post.castShadow = true
      g.add(post)
      ends.push(v3(x, base + 0.82, d))
    }
    const curve = new THREE.QuadraticBezierCurve3(ends[0], ends[1].clone().add(new THREE.Vector3(0, -0.12, 0)), ends[2])
    const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025, 5, false), rope)
    g.add(line)
  }
  return g
}

/** A sheep: a fleece of puffs, a dark face and four legs. Built facing +x (its direction of travel). */
const fleece = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 1, flatShading: true })
const sheepDark = new THREE.MeshStandardMaterial({ color: 0x2b2826, roughness: 0.8 })
function sheepMesh(seed: number): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Group()
  const puff = new THREE.IcosahedronGeometry(0.26, 0)
  const spots: Array<[number, number, number, number]> = [
    [0, 0.62, 0, 1.25],
    [0.24, 0.66, 0.1, 1],
    [-0.24, 0.64, -0.1, 1.05],
    [0.05, 0.78, -0.08, 0.9],
    [-0.1, 0.74, 0.14, 0.9],
    [0.3, 0.58, -0.14, 0.85],
    [-0.32, 0.56, 0.12, 0.9],
  ]
  for (const [x, y, z, k] of spots) {
    const m = new THREE.Mesh(puff, fleece)
    m.position.set(x, y, z)
    m.scale.setScalar(k)
    m.rotation.set(seed + x, seed * 2 + y, z)
    m.castShadow = true
    body.add(m)
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.2), sheepDark)
  head.position.set(0.5, 0.7, 0)
  head.castShadow = true
  const ears = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.36), sheepDark)
  ears.position.set(0.48, 0.8, 0)
  body.add(head, ears)
  const legGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.42, 5)
  for (const [x, z] of [
    [0.26, 0.13],
    [0.26, -0.13],
    [-0.26, 0.13],
    [-0.26, -0.13],
  ]) {
    const leg = new THREE.Mesh(legGeo, sheepDark)
    leg.position.set(x, 0.21, z)
    leg.castShadow = true
    g.add(leg)
  }
  body.name = 'body'
  g.add(body)
  return g
}

/** A wooden signpost on the shoulder naming the stretch of hill ahead. */
function signpost(name: string, x: number, d: number): THREE.Object3D {
  const g = new THREE.Group()
  const c = document.createElement('canvas')
  c.width = 384
  c.height = 96
  const k = c.getContext('2d')!
  k.fillStyle = '#efe6d2'
  k.fillRect(0, 0, 384, 96)
  k.strokeStyle = '#8f5f36'
  k.lineWidth = 8
  k.strokeRect(4, 4, 376, 88)
  k.fillStyle = '#303532'
  k.font = '500 36px "IBM Plex Mono", ui-monospace, monospace'
  k.textAlign = 'center'
  k.textBaseline = 'middle'
  k.fillText(name.toUpperCase(), 192, 50, 352)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }))
  // A plain wooden back, so the lettering never reads mirrored from below.
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ color: 0x9c6a3e, roughness: 0.85 }))
  backing.rotation.y = Math.PI
  backing.position.z = -0.01
  board.add(backing)
  const ground = terrainHeight(x, d)
  board.position.copy(v3(x, ground + 1.35, d))
  // Face up the hill (+z is uphill), angled toward the middle so it reads on the way down.
  board.rotation.y = x < 0 ? 0.35 : -0.35
  board.castShadow = true
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x8f5f36, roughness: 0.8 }))
  post.position.copy(v3(x, ground + 0.6, d))
  post.castShadow = true
  g.add(post, board)
  g.userData.dispose = () => tex.dispose()
  return g
}

/** Decorative pines on the shoulders, drawn as instances so long hills stay cheap. */
function shoulderPines(): THREE.Object3D {
  const g = new THREE.Group()
  const spots: Array<[number, number, number, number]> = []
  for (let d = 10; d < D1 - 4; d += 9.5) {
    const s = hash(d, 3)
    spots.push([-W + 0.45 + s * 0.3, d + s * 3, 2.6 + s * 1.4, d])
    spots.push([W - 0.45 - s * 0.3, d + 4 + s * 2, 2.4 + hash(d, 9) * 1.6, d + 1])
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 7), trunkMat, spots.length)
  const cones = [0, 1, 2].map((i) => new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), i % 2 ? pineMat2 : pineMat, spots.length))
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  spots.forEach(([x, d, height, seed], k) => {
    const base = v3(x, terrainHeight(x, d) - 0.05, d)
    m.compose(pos.copy(base).add(scl.set(0, height * 0.15, 0)), q.identity(), scl.set(1, height * 0.3, 1))
    trunk.setMatrixAt(k, m)
    for (let i = 0; i < 3; i++) {
      const r = (0.95 - i * 0.24) * height * 0.32
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), seed + i)
      m.compose(pos.copy(base).add(scl.set(0, height * (0.38 + i * 0.2), 0)), q, scl.set(r, height * 0.42, r))
      cones[i].setMatrixAt(k, m)
    }
  })
  for (const im of [trunk, ...cones]) {
    im.castShadow = true
    g.add(im)
  }
  return g
}

export interface World {
  group: THREE.Group
  banner: THREE.Object3D | null
  /** Move the sheep to where they are t seconds after launch (and let them graze). */
  update: (t: number, clock: number) => void
  dispose: () => void
}

export function buildWorld(): World {
  W = COURSE.edge + 0.6
  D1 = COURSE.length
  // The soil block reaches a little below the lowest point of the hill.
  let low = Infinity
  for (let d = D0; d <= D1; d += 2) low = Math.min(low, terrainHeight(0, d), terrainHeight(-W, d), terrainHeight(W, d))
  BASE = Math.min(-38, Math.floor(low - 4))
  BOUNDS.W = W
  BOUNDS.D1 = D1
  BOUNDS.BASE = BASE
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
  group.add(shoulderPines())
  for (const p of COURSE.pits) for (const [x0, x1] of p.bridges ?? []) group.add(bridge(p, x0, x1))
  // Signposts at each named stretch after the start, alternating sides.
  COURSE.sections.slice(1).forEach((s, i) => {
    if (s.d > COURSE.finishD - 10) return
    group.add(signpost(s.name, (i % 2 ? 1 : -1) * (COURSE.halfWidth + 0.55), s.d))
  })
  // The flock.
  const flock: Array<{ o: Obstacle; mesh: THREE.Group; body: THREE.Object3D; seed: number }> = []
  COURSE.obstacles.forEach((o, i) => {
    if (o.kind !== 'sheep') return
    const mesh = sheepMesh(i * 1.3)
    group.add(mesh)
    flock.push({ o, mesh, body: mesh.getObjectByName('body')!, seed: i * 1.7 })
  })
  group.add(startGate())
  group.add(laneDashes())
  const gate = finishGate()
  group.add(gate)
  const update = (t: number, clock: number) => {
    for (const f of flock) {
      const at = obstacleAt(f.o, t)
      f.mesh.position.copy(v3(at.x, terrainHeight(at.x, at.d), at.d))
      // Face the way it is walking; amble (a bob) while it walks, graze while it waits.
      const dx = (f.o.bx ?? f.o.x) - f.o.x
      const dd = (f.o.bd ?? f.o.d) - f.o.d
      const dir = at.dir >= 0 ? 1 : -1
      f.mesh.rotation.y = Math.atan2(dd * dir, dx * dir)
      const walking = Math.abs(at.dir)
      f.body.position.y = Math.abs(Math.sin(clock * 9 + f.seed)) * 0.05 * walking
      f.body.rotation.z = -(1 - walking) * 0.25 * (0.6 + 0.4 * Math.sin(clock * 1.3 + f.seed))
    }
  }
  update(0, 0)
  const dispose = () => {
    group.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      o.userData.dispose?.()
      const mat = m.material as THREE.MeshStandardMaterial | undefined
      if (mat && !SHARED.has(mat)) {
        mat.map?.dispose()
        mat.dispose()
      }
    })
  }
  return { group, banner: gate.getObjectByName('banner') ?? null, update, dispose }
}

/** Materials shared between hills (never disposed). */
const SHARED = new Set<THREE.Material>([rockMat, pineMat, pineMat2, trunkMat, fleece, sheepDark])

/** The plinth's extents, for framing the preview and the tumble. */
export const BOUNDS = { W, D0, D1, BASE }
