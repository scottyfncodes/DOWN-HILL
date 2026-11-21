import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './base.css'
import './downhill.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { track } from './analytics/pulse'
import { COURSE, groundLevel, surfaceHeight, terrainHeight } from './course'
import { Rider } from './rider'
import { simulateRun, STRIDE, type Outcome, type RunResult } from './sim'
import { DownhillSound } from './sound'
import { BOUNDS, buildWorld, v3 } from './world'

type Phase = 'preview' | 'aim' | 'run' | 'tumble' | 'done'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const els = {
  root: $('dh'),
  canvas: $<HTMLCanvasElement>('dh-stage'),
  run: $('dh-run'),
  hint: $('dh-hint'),
  line: $('dh-line'),
  launch: $<HTMLButtonElement>('dh-launch'),
  skip: $<HTMLButtonElement>('dh-skip'),
  sound: $<HTMLButtonElement>('dh-sound'),
  result: $('dh-result'),
  resultKicker: $('dh-result-kicker'),
  resultTitle: $('dh-result-title'),
  resultDetail: $('dh-result-detail'),
  retry: $<HTMLButtonElement>('dh-retry'),
}

const COPY: Record<Outcome, [string, string]> = {
  finish: ['Clean run.', ''],
  gap: ['Into the gap.', 'Not enough table under the wheels.'],
  rock: ['Met a boulder.', 'It was there first.'],
  tree: ['Hugged a pine.', 'The pine is fine.'],
  post: ['Found the gate post.', 'So close to the banner.'],
  bale: ['Missed the gate.', 'The hay bales did not mind.'],
  landing: ['Heavy landing.', 'Knees have opinions.'],
  edge: ['Off the edge of the world.', 'It is a long way down to the plinth.'],
  stall: ['Ran out of hill.', 'A gentle stop. Very dignified.'],
}

// ————— Persistence (this prototype keeps its own small record) —————
interface Store {
  line: number
  runs: number
  finishes: number
  best: number | null
  history: Array<{ x: number; ok: boolean }>
  sound: boolean
  previewed: boolean
}
const KEY = 'downhill'
function loadStore(): Store {
  const base: Store = { line: 0, runs: 0, finishes: 0, best: null, history: [], sound: true, previewed: false }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (raw && typeof raw === 'object') {
      const line = Number(raw.line)
      base.line = Number.isFinite(line) ? Math.max(COURSE.startRange[0], Math.min(COURSE.startRange[1], line)) : 0
      base.runs = Number(raw.runs) || 0
      base.finishes = Number(raw.finishes) || 0
      base.best = typeof raw.best === 'number' ? raw.best : null
      base.history = Array.isArray(raw.history) ? raw.history.slice(-12).filter((h: { x: unknown }) => typeof h?.x === 'number') : []
      base.sound = raw.sound !== false
      base.previewed = raw.previewed === true
    }
  } catch {
    /* fresh start */
  }
  return base
}
const store = loadStore()
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* private mode */
  }
}

// ————— Renderer and scene —————
let renderer: THREE.WebGLRenderer
try {
  renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
} catch {
  $('dh-fallback').hidden = false
  throw new Error('WebGL unavailable')
}
const params = new URLSearchParams(location.search)
const TEST = params.has('test')
renderer.setClearColor(0x000000, 0)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.35
scene.fog = new THREE.Fog(0xe9e1d1, 70, 190)

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400)
scene.add(new THREE.HemisphereLight(0xfff4e2, 0x6d5a3e, 1.0))
const sun = new THREE.DirectionalLight(0xffe8c8, 2.4)
sun.castShadow = true
const lowPower = Math.min(screen.width, screen.height) < 500
sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048)
sun.shadow.camera.left = -18
sun.shadow.camera.right = 18
sun.shadow.camera.top = 18
sun.shadow.camera.bottom = -18
sun.shadow.camera.near = 1
sun.shadow.camera.far = 90
sun.shadow.bias = -0.0005
sun.shadow.normalBias = 0.03
scene.add(sun, sun.target)

const world = buildWorld()
scene.add(world.group)

const sound = new DownhillSound()
sound.enabled = store.sound

// Position marker on the start line: a brass ring under the rider and a short dotted arrow ahead.
const marker = new THREE.Group()
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.66, 40), new THREE.MeshBasicMaterial({ color: 0xc29d5f, transparent: true, opacity: 0.9, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  marker.add(ring)
  const dot = new THREE.CircleGeometry(0.07, 10)
  dot.rotateX(-Math.PI / 2)
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(dot, new THREE.MeshBasicMaterial({ color: 0xc29d5f, transparent: true, opacity: 0.85 - i * 0.08, depthWrite: false }))
    m.position.z = -1.1 - i * 0.7
    m.name = 'dot'
    marker.add(m)
  }
}
scene.add(marker)

// History pegs on the start bar: where earlier runs began (brass = finished, red = crashed).
const pegs = new THREE.Group()
scene.add(pegs)
function drawPegs() {
  for (const c of [...pegs.children]) pegs.remove(c)
  const geo = new THREE.SphereGeometry(0.09, 10, 8)
  const ok = new THREE.MeshStandardMaterial({ color: 0xd4ac5e, roughness: 0.35, metalness: 0.6 })
  const bad = new THREE.MeshStandardMaterial({ color: 0xc9452f, roughness: 0.55 })
  const d = COURSE.startD - 0.9
  store.history.forEach((h, i) => {
    const m = new THREE.Mesh(geo, h.ok ? ok : bad)
    m.position.copy(v3(h.x, terrainHeight(0, d) + 0.25, d))
    m.scale.setScalar(0.7 + (i / Math.max(1, store.history.length)) * 0.5)
    pegs.add(m)
  })
}
drawPegs()

// The previous run's path, as a faint dotted trail down the hill.
const trailGeo = new THREE.CircleGeometry(0.09, 8)
trailGeo.rotateX(-Math.PI / 2)
const trail = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0x3a3226, transparent: true, opacity: 0.28, depthWrite: false }), 900)
trail.count = 0
trail.frustumCulled = false
scene.add(trail)
function setTrail(run: RunResult | null) {
  trail.count = 0
  if (!run) return
  const f = run.frames
  const m = new THREE.Matrix4()
  let n = 0
  let lastX = Infinity
  let lastD = Infinity
  for (let i = 0; i < f.length / STRIDE && n < 900; i++) {
    const x = f[i * STRIDE]
    const d = f[i * STRIDE + 1]
    if (Math.hypot(x - lastX, d - lastD) < 0.9) continue
    lastX = x
    lastD = d
    const y = f[i * STRIDE + 6] ? f[i * STRIDE + 2] : surfaceHeight(x, d)
    m.makeTranslation(x, y + 0.04, -d)
    trail.setMatrixAt(n++, m)
  }
  trail.count = n
  trail.instanceMatrix.needsUpdate = true
}

// Confetti for the finish (paper squares, brass and linen).
const confettiGeo = new THREE.PlaneGeometry(0.12, 0.08)
const confetti = new THREE.InstancedMesh(confettiGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), 90)
confetti.count = 0
confetti.frustumCulled = false
scene.add(confetti)
const confettiState: Array<{ p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3 }> = []
function popConfetti() {
  confettiState.length = 0
  const colors = [0xc29d5f, 0xf4efe2, 0xc9452f, 0x2f6f6a]
  const posts = COURSE.obstacles.filter((o) => o.kind === 'post')
  for (let i = 0; i < 90; i++) {
    const p = posts[i % 2]
    const top = v3(p.x, terrainHeight(p.x, p.d) + p.height, p.d)
    const side = p.x < 0 ? 1 : -1
    confettiState.push({
      p: top.clone(),
      v: new THREE.Vector3(side * (1 + Math.random() * 3), 3 + Math.random() * 4, (Math.random() - 0.5) * 3),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
      w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    })
    confetti.setColorAt(i, new THREE.Color(colors[i % colors.length]))
  }
  confetti.count = 90
  if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true
}
function stepConfetti(dt: number) {
  if (!confettiState.length) return
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const one = new THREE.Vector3(1, 1, 1)
  confettiState.forEach((c, i) => {
    c.v.y -= 6 * dt
    c.v.multiplyScalar(1 - 1.6 * dt)
    c.p.addScaledVector(c.v, dt)
    const ground = terrainHeight(c.p.x, -c.p.z) + 0.02
    if (c.p.y < ground) {
      c.p.y = ground
      c.v.set(0, 0, 0)
      c.w.set(0, 0, 0)
      c.r.x = -Math.PI / 2
    }
    c.r.x += c.w.x * dt
    c.r.y += c.w.y * dt
    c.r.z += c.w.z * dt
    m.compose(c.p, q.setFromEuler(c.r), one)
    confetti.setMatrixAt(i, m)
  })
  confetti.instanceMatrix.needsUpdate = true
}

// ————— Rider —————
let rider = new Rider()
scene.add(rider.root)

const up = new THREE.Vector3()
const fwd = new THREE.Vector3()
const right = new THREE.Vector3()
const back = new THREE.Vector3()
const basis = new THREE.Matrix4()
const qTarget = new THREE.Quaternion()

function normal3(x: number, d: number, out: THREE.Vector3) {
  const e = 0.15
  const hx = (surfaceHeight(x + e, d) - surfaceHeight(x - e, d)) / (2 * e)
  const hd = (surfaceHeight(x, d + e) - surfaceHeight(x, d - e)) / (2 * e)
  // World z = -d, so the d-gradient flips sign.
  return out.set(-hx, 1, hd).normalize()
}

/** Place the rider: position on the surface (or in the air), board aligned to the ground or flight. */
function placeRider(x: number, d: number, y: number, heading: number, pitch: number, air: boolean, smooth: number) {
  rider.root.position.set(x, y, -d)
  if (air) up.set(0, 1, 0)
  else normal3(x, d, up)
  fwd.set(Math.sin(heading), 0, -Math.cos(heading))
  if (air) fwd.applyAxisAngle(right.crossVectors(fwd, up).normalize(), pitch)
  fwd.addScaledVector(up, -fwd.dot(up)).normalize()
  back.copy(fwd).negate()
  right.crossVectors(up, back).normalize()
  basis.makeBasis(right, up, back)
  qTarget.setFromRotationMatrix(basis)
  if (smooth >= 1) rider.root.quaternion.copy(qTarget)
  else rider.root.quaternion.slerp(qTarget, smooth)
}

// ————— State —————
let phase: Phase = 'aim'
let phaseT = 0
let run: RunResult | null = null
let lastRun: RunResult | null = null
let clock = 0
let landSquash = 0
let eventIdx = 0
let timeScale = 1
let newBest = false
const tumbleParts: Array<{ obj: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; r: number }> = []
let rollOut = { speed: 0, x: 0, d: 0, heading: 0 }

function setPhase(p: Phase) {
  phase = p
  phaseT = 0
  els.root.dataset.phase = p
  marker.visible = p === 'aim'
  els.skip.hidden = p !== 'preview'
  els.launch.disabled = p !== 'aim'
}

function fmtLine(x: number) {
  const v = x.toFixed(1)
  return x > 0.049 ? `+${v}` : x < -0.049 ? `−${v.slice(1)}` : '0.0'
}

function updateLine() {
  els.line.textContent = fmtLine(store.line)
  els.run.textContent = `Run ${store.runs + 1}`
}

function resetRider() {
  scene.remove(rider.root)
  for (const p of tumbleParts) scene.remove(p.obj)
  tumbleParts.length = 0
  rider = new Rider()
  scene.add(rider.root)
  const x = store.line
  const d = COURSE.startD
  placeRider(x, d, surfaceHeight(x, d), 0, 0, false, 1)
  marker.visible = true
}

function launch() {
  if (phase !== 'aim') return
  sound.unlock()
  run = simulateRun(store.line)
  eventIdx = 0
  marker.visible = false
  els.result.hidden = true
  if (store.runs === 0) track('game_start', { mode: 'downhill' })
  sound.push()
  setPhase('run')
}

function finishRun() {
  const r = run!
  const ok = r.outcome === 'finish'
  store.runs++
  newBest = false
  if (ok) {
    store.finishes++
    newBest = store.best !== null && r.time < store.best - 0.005
    if (store.best === null || r.time < store.best) store.best = +r.time.toFixed(2)
  }
  store.history.push({ x: +store.line.toFixed(2), ok })
  store.history = store.history.slice(-12)
  save()
  drawPegs()
  track('game_complete', { result: ok ? 'win' : 'lose', level: 1, mode: 'downhill' })
  lastRun = r
}

function showResult() {
  const r = run!
  const [title, line] = COPY[r.outcome]
  els.resultKicker.textContent = `Run ${store.runs} · line ${fmtLine(store.line)}`
  els.resultTitle.textContent = title
  els.result.dataset.win = String(r.outcome === 'finish')
  if (r.outcome === 'finish') {
    const best = store.finishes <= 1 ? '' : newBest ? ' A new best.' : ` Best ${store.best!.toFixed(1)} s.`
    els.resultDetail.textContent = `${r.time.toFixed(1)} s down the hill.${best}`
  } else els.resultDetail.textContent = line
  els.result.hidden = false
  setPhase('done')
  requestAnimationFrame(() => els.retry.focus({ preventScroll: true }))
}

function retry() {
  if (phase !== 'done' && phase !== 'tumble') return
  sound.stopRoll()
  els.result.hidden = true
  confetti.count = 0
  confettiState.length = 0
  setTrail(lastRun)
  resetRider()
  updateLine()
  setPhase('aim')
}

// ————— Crash tumble (a small ragdoll of the rider's parts) —————
let seed = 1
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
function startTumble(r: RunResult) {
  seed = Math.floor((store.line + 20) * 1000) + 7
  const parts = rider.parts()
  const base = new THREE.Vector3(r.end.vx, Math.max(r.end.vy, 0) + 2.5, -r.end.vd)
  if (r.outcome === 'stall') base.set(0.6, 1, 0)
  // Into the gap: the rider stays in it.
  if (r.outcome === 'gap') base.set(r.end.vx * 0.1, 0.6, -r.end.vd * 0.04)
  const scale = r.outcome === 'stall' ? 0.3 : r.outcome === 'gap' ? 0.3 : 0.75
  for (const [name, obj] of Object.entries(parts)) {
    scene.attach(obj)
    const v = base.clone().multiplyScalar(scale)
    v.x += (rnd() - 0.5) * 4
    v.y += rnd() * 3
    v.z += (rnd() - 0.5) * 4
    if (name === 'board') v.multiplyScalar(1.2).add(new THREE.Vector3((rnd() - 0.5) * 3, 2, 0))
    const w = new THREE.Vector3((rnd() - 0.5) * 14, (rnd() - 0.5) * 14, (rnd() - 0.5) * 14).multiplyScalar(r.outcome === 'stall' ? 0.2 : 1)
    tumbleParts.push({ obj, v, w, r: name === 'torso' ? 0.25 : name === 'head' ? 0.2 : 0.12 })
  }
  scene.remove(rider.root)
}

function groundAt(x: number, z: number) {
  const d = -z
  if (Math.abs(x) > BOUNDS.W || d < BOUNDS.D0 || d > BOUNDS.D1) return BOUNDS.BASE + 0.05
  return terrainHeight(x, d)
}

function stepTumble(dt: number) {
  const q = new THREE.Quaternion()
  for (const p of tumbleParts) {
    p.v.y -= 9.8 * dt
    p.obj.position.addScaledVector(p.v, dt)
    const ang = p.w.length()
    if (ang > 1e-4) {
      q.setFromAxisAngle(p.w.clone().divideScalar(ang), ang * dt)
      p.obj.quaternion.premultiply(q)
    }
    const g = groundAt(p.obj.position.x, p.obj.position.z) + p.r
    if (p.obj.position.y < g) {
      p.obj.position.y = g
      if (p.v.y < 0) p.v.y = -p.v.y * 0.32
      p.v.x *= 0.72
      p.v.z *= 0.72
      p.w.multiplyScalar(0.7)
    }
  }
}

// ————— Camera —————
const camPos = new THREE.Vector3()
const camLook = new THREE.Vector3()
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
let portrait = true

function aimCamera(): [THREE.Vector3, THREE.Vector3] {
  const x = store.line
  const d = COURSE.startD
  const h = surfaceHeight(x, d)
  const back = portrait ? 8.5 : 6.5
  const height = portrait ? 5.2 : 3.6
  return [v3(x * 0.6, h + height, d - back), v3(x * 0.3, h - 6.5, d + 20)]
}

function chaseCamera(x: number, d: number, y: number, heading: number, air: boolean): [THREE.Vector3, THREE.Vector3] {
  const back = portrait ? 8 : 6.2
  const hx = Math.sin(heading) * 0.6
  const hd = Math.cos(heading) * 0.6 + 0.4
  const n = Math.hypot(hx, hd)
  const bx = x - (hx / n) * back
  const bd = d - (hd / n) * back
  // Frame against the hill as if the gap were filled, so the camera sails over it with the rider.
  const groundBehind = groundLevel(bx, bd)
  const ground = air ? Math.max(Math.min(y, groundLevel(x, d) + 2), groundLevel(x, d)) : Math.max(y, groundLevel(x, d) - 1)
  const pos = v3(bx, Math.max(ground + (portrait ? 4.4 : 3.2), groundBehind + 1.6), bd)
  const look = v3(x + (hx / n) * 7, ground - 1.2, d + (hd / n) * 7)
  return [pos, look]
}

function previewCamera(t: number): [THREE.Vector3, THREE.Vector3] {
  // Establish from above the start, glide down the hill above the course, swoop back up to the rider.
  const e = (k: number) => k * k * (3 - 2 * k)
  if (t < 0.7) {
    const k = e(t / 0.7)
    const d = 2 + (COURSE.finishD + 8 - 2) * k
    const h = terrainHeight(0, d)
    const pos = v3(Math.sin(k * Math.PI) * 6, h + 14 - k * 4, d - 14)
    const look = v3(0, terrainHeight(0, d + 18) + 1, d + 18)
    return [pos, look]
  }
  const k = e((t - 0.7) / 0.3)
  const [ap, al] = aimCamera()
  const endD = COURSE.finishD + 8
  const from = v3(0, terrainHeight(0, endD) + 10, endD - 14)
  const fromLook = v3(0, terrainHeight(0, endD + 18) + 1, endD + 18)
  // Arc high over the hill on the way back up.
  const pos = from.clone().lerp(ap, k)
  pos.y += Math.sin(k * Math.PI) * 18
  return [pos, fromLook.lerp(al, k)]
}

function moveCamera(target: [THREE.Vector3, THREE.Vector3], dt: number, rate: number) {
  const k = rate >= 999 ? 1 : 1 - Math.exp(-dt * rate)
  camPos.lerp(target[0], k)
  camLook.lerp(target[1], k)
  // Never inside the hill.
  const floor = groundAt(camPos.x, camPos.z) + 0.8
  if (camPos.y < floor) camPos.y = floor
  camera.position.copy(camPos)
  camera.lookAt(camLook)
}

// Keep the sun's shadow box near what the camera is looking at.
function followSun(focus: THREE.Vector3) {
  sun.target.position.copy(focus)
  sun.position.copy(focus).add(tmpA.set(-14, 26, 10))
}

// ————— Frame —————
function sample(r: RunResult, t: number, k: number) {
  const f = r.frames
  const n = f.length / STRIDE
  const pos = t / r.frameDt
  const i = Math.min(n - 1, Math.floor(pos))
  const j = Math.min(n - 1, i + 1)
  const a = Math.min(1, pos - i)
  return f[i * STRIDE + k] + (f[j * STRIDE + k] - f[i * STRIDE + k]) * a
}

function frame(dt: number) {
  dt *= timeScale
  clock += dt
  phaseT += dt
  switch (phase) {
    case 'preview': {
      const total = 7
      moveCamera(previewCamera(Math.min(1, phaseT / total)), dt, 999)
      rider.pose({ crouch: 0.15, lean: 0, air: 0, cheer: 0, t: clock, speed: 0 })
      if (phaseT >= total) endPreview()
      followSun(camLook)
      break
    }
    case 'aim': {
      const x = store.line
      const d = COURSE.startD
      placeRider(x, d, surfaceHeight(x, d), 0, 0, false, 1)
      marker.position.copy(v3(x, surfaceHeight(x, d) + 0.03, d))
      rider.pose({ crouch: 0.15 + Math.sin(clock * 2) * 0.03, lean: 0, air: 0, cheer: 0, t: clock, speed: 0 })
      moveCamera(aimCamera(), dt, 7)
      followSun(rider.root.position)
      break
    }
    case 'run': {
      const r = run!
      const t = Math.min(phaseT, r.time)
      const x = sample(r, t, 0)
      const d = sample(r, t, 1)
      const y = sample(r, t, 2)
      const heading = sample(r, t, 3)
      const lean = sample(r, t, 4)
      const pitch = sample(r, t, 5)
      const air = sample(r, t, 6) > 0.5
      const speed = sample(r, t, 7)
      while (eventIdx < r.events.length && r.events[eventIdx].t <= t) {
        const e = r.events[eventIdx++]
        if (e.kind === 'takeoff') sound.takeoff()
        else if (e.kind === 'land') {
          sound.land(e.impact)
          landSquash = Math.min(1, e.impact / 7)
        } else if (e.kind === 'bounce') sound.boing()
        else if (e.kind === 'graze') sound.graze()
      }
      landSquash = Math.max(0, landSquash - dt * 3)
      placeRider(x, d, y, heading, air ? pitch * 0.6 : 0, air, air ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 18))
      const ahead = COURSE.ramps.some((rp) => x > rp.x0 - 0.5 && x < rp.x1 + 0.5 && d > rp.d0 - 8 && d < rp.d1)
      rider.pose({ crouch: Math.min(1, 0.2 + speed / 30 + (ahead ? 0.4 : 0) + landSquash * 0.8), lean, air: air ? 1 : 0, cheer: 0, t: clock, speed })
      sound.rolling(speed, lean, air)
      moveCamera(chaseCamera(x, d, y, heading, air), dt, 7)
      followSun(rider.root.position)
      if (phaseT >= r.time) {
        sound.stopRoll()
        finishRun()
        if (r.outcome === 'finish') {
          sound.finish()
          popConfetti()
          rollOut = { speed, x, d, heading }
          setPhase('tumble')
          phase = 'tumble'
          els.root.dataset.phase = 'tumble'
        } else {
          if (r.outcome === 'gap' || r.outcome === 'edge') sound.splat()
          else sound.crash()
          startTumble(r)
          setPhase('tumble')
        }
      }
      break
    }
    case 'tumble': {
      const r = run!
      if (r.outcome === 'finish') {
        // Roll out through the gate with arms up.
        // Scrub speed hard (a slide stop) so the rider stays on the plinth.
        rollOut.speed = Math.max(0, rollOut.speed - dt * 13)
        if (rollOut.d > BOUNDS.D1 - 4) rollOut.speed = 0
        rollOut.x += Math.sin(rollOut.heading) * rollOut.speed * dt
        rollOut.d += Math.cos(rollOut.heading) * rollOut.speed * dt
        placeRider(rollOut.x, rollOut.d, surfaceHeight(rollOut.x, rollOut.d), rollOut.heading, 0, false, 1 - Math.exp(-dt * 10))
        rider.pose({ crouch: 0.1, lean: 0, air: 0, cheer: Math.min(1, phaseT * 3), t: clock, speed: rollOut.speed })
        // Swing round to the rider's side, above the gate, for a look at the celebration.
        const a = Math.min(1, phaseT / 2.2) * 1.25
        const p = rider.root.position
        moveCamera([tmpA.set(p.x - Math.sin(a) * 7, p.y + 3.2 + a, p.z + Math.cos(a) * 7), tmpB.copy(p).add(new THREE.Vector3(0, 0.9, 0))], dt, 3)
        stepConfetti(dt)
        if (phaseT > 2.2 && els.result.hidden) showResult()
      } else {
        stepTumble(dt)
        const torso = tumbleParts.find((p) => p.r === 0.25)?.obj.position ?? camLook
        moveCamera([tmpA.copy(camPos).lerp(tmpB.copy(torso).add(new THREE.Vector3(2.5, 3.2, 5)), 0.5), torso.clone()], dt, 2)
        if (phaseT > 1.9 && els.result.hidden) showResult()
      }
      break
    }
    case 'done': {
      if (run?.outcome === 'finish') {
        stepConfetti(dt)
        rider.pose({ crouch: 0.1, lean: 0, air: 0, cheer: 1, t: clock, speed: 0 })
      } else stepTumble(dt)
      break
    }
  }
  // A gentle flutter in the finish banner.
  if (world.banner) world.banner.rotation.x = Math.sin(clock * 2.2) * 0.05
  renderer.render(scene, camera)
}

function endPreview() {
  store.previewed = true
  save()
  setPhase('aim')
}

// ————— Input —————
let drag: { id: number; startX: number; startLine: number } | null = null
const blocked = (e: Event) => (e.target as HTMLElement).closest('button, a, .dh-result')

els.root.addEventListener('pointerdown', (e) => {
  sound.unlock()
  if (blocked(e)) return
  if (phase === 'preview') {
    endPreview()
    return
  }
  if (phase !== 'aim' || drag) return
  e.preventDefault()
  drag = { id: e.pointerId, startX: e.clientX, startLine: store.line }
  try {
    els.root.setPointerCapture(e.pointerId)
  } catch {
    /* unsupported */
  }
})
els.root.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || phase !== 'aim') return
  e.preventDefault()
  // The whole range spans about 85% of the screen width, so a fingertip moves the rider precisely.
  const span = COURSE.startRange[1] - COURSE.startRange[0]
  const perPx = span / (els.canvas.clientWidth * 0.85)
  const next = Math.max(COURSE.startRange[0], Math.min(COURSE.startRange[1], drag.startLine + (e.clientX - drag.startX) * perPx))
  store.line = Math.round(next * 100) / 100
  updateLine()
})
const endDrag = (e: PointerEvent) => {
  if (!drag || e.pointerId !== drag.id) return
  drag = null
  save()
}
els.root.addEventListener('pointerup', endDrag)
els.root.addEventListener('pointercancel', endDrag)
els.root.addEventListener('lostpointercapture', endDrag)
for (const type of ['touchstart', 'touchmove', 'gesturestart', 'dblclick', 'contextmenu'] as const) {
  els.root.addEventListener(type, (e) => {
    if (!blocked(e)) e.preventDefault()
  }, { passive: false })
}

els.launch.addEventListener('click', () => launch())
els.retry.addEventListener('click', () => retry())
els.skip.addEventListener('click', () => endPreview())
els.sound.addEventListener('click', () => {
  store.sound = !store.sound
  sound.setEnabled(store.sound)
  els.sound.setAttribute('aria-pressed', String(store.sound))
  els.sound.setAttribute('aria-label', store.sound ? 'Sound on' : 'Sound off')
  save()
  sound.tick()
})
els.sound.setAttribute('aria-pressed', String(store.sound))

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key.toLowerCase()
  if (phase === 'preview' && (k === ' ' || k === 'enter' || k === 'escape')) return endPreview()
  if (k === 'm') return els.sound.click()
  if ((phase === 'done' || phase === 'tumble') && (k === 'r' || k === 'enter' || k === ' ')) {
    e.preventDefault()
    return retry()
  }
  if (phase !== 'aim') return
  const step = e.shiftKey ? 0.02 : 0.1
  if (k === 'arrowleft') store.line = Math.max(COURSE.startRange[0], +(store.line - step).toFixed(2))
  else if (k === 'arrowright') store.line = Math.min(COURSE.startRange[1], +(store.line + step).toFixed(2))
  else if ((k === ' ' || k === 'enter') && (e.target as HTMLElement).tagName !== 'BUTTON') {
    e.preventDefault()
    return launch()
  } else return
  e.preventDefault()
  updateLine()
  save()
})

document.addEventListener('visibilitychange', () => sound.pause(document.hidden))

// ————— Layout —————
function resize() {
  const w = els.canvas.clientWidth
  const h = els.canvas.clientHeight
  portrait = h >= w
  renderer.setPixelRatio(TEST ? 1 : Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.fov = portrait ? 58 : 46
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
window.visualViewport?.addEventListener('resize', resize)
resize()

// ————— Start —————
resetRider()
updateLine()
{
  const [p, l] = aimCamera()
  camPos.copy(p)
  camLook.copy(l)
}
const skipPreview = params.has('nopreview') || (store.previewed && !params.has('preview'))
setPhase(skipPreview ? 'aim' : 'preview')
if (store.runs > 0) els.hint.textContent = 'Same line, or try another.'

let last = performance.now()
let raf = 0
const loop = (now: number) => {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
  last = now
  frame(dt)
  raf = requestAnimationFrame(loop)
}
raf = requestAnimationFrame(loop)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(raf)
  else {
    last = performance.now()
    raf = requestAnimationFrame(loop)
  }
})

// Test hooks (only with ?test): read state and speed up playback, never steer.
if (TEST) {
  ;(window as unknown as { __downhill: unknown }).__downhill = {
    phase: () => phase,
    line: () => store.line,
    outcome: () => run?.outcome ?? null,
    time: () => run?.time ?? null,
    store: () => JSON.parse(JSON.stringify(store)),
    speed: (k: number) => (timeScale = k),
    /** Jump to a known line (drag and keyboard positioning are tested separately). */
    setLine: (x: number) => {
      if (phase !== 'aim') return
      store.line = Math.max(COURSE.startRange[0], Math.min(COURSE.startRange[1], x))
      updateLine()
    },
    riderPos: () => rider.root.position.toArray(),
  }
}
