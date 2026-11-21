import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './base.css'
import './downhill.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { track } from './analytics/pulse'
import { COURSE, groundLevel, sectionAt, surfaceHeight, terrainHeight, useHill } from './course'
import { HILLS } from './hills'
import { Rider } from './rider'
import { simulateRun, STRIDE, type Outcome, type RunResult } from './sim'
import { DownhillSound } from './sound'
import { BOUNDS, buildWorld, v3, type World } from './world'

type Phase = 'preview' | 'aim' | 'run' | 'tumble' | 'done'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const els = {
  root: $('dh'),
  canvas: $<HTMLCanvasElement>('dh-stage'),
  run: $('dh-run'),
  hillNo: $('dh-hillno'),
  title: $('dh-title'),
  prev: $<HTMLButtonElement>('dh-prev'),
  next: $<HTMLButtonElement>('dh-next'),
  hint: $('dh-hint'),
  line: $('dh-line'),
  nudgeL: $<HTMLButtonElement>('dh-left'),
  nudgeR: $<HTMLButtonElement>('dh-right'),
  launch: $<HTMLButtonElement>('dh-launch'),
  skip: $<HTMLButtonElement>('dh-skip'),
  survey: $<HTMLButtonElement>('dh-survey'),
  sound: $<HTMLButtonElement>('dh-sound'),
  hudSection: $('dh-hud-section'),
  hudSpeed: $('dh-hud-speed'),
  hudTrack: $('dh-hud-track'),
  ff: $<HTMLButtonElement>('dh-ff'),
  ffLabel: $('dh-ff-label'),
  result: $('dh-result'),
  resultKicker: $('dh-result-kicker'),
  resultTitle: $('dh-result-title'),
  resultDetail: $('dh-result-detail'),
  reportTrack: $('dh-report-track'),
  reportWhere: $('dh-report-where'),
  statTime: $('dh-stat-time'),
  statSpeed: $('dh-stat-speed'),
  statAir: $('dh-stat-air'),
  retry: $<HTMLButtonElement>('dh-retry'),
  replay: $<HTMLButtonElement>('dh-replay'),
  nextHill: $<HTMLButtonElement>('dh-nexthill'),
}

const COPY: Record<Outcome, [string, string]> = {
  finish: ['Clean run.', ''],
  gap: ['Into the gap.', 'Not enough table under the wheels.'],
  rock: ['Met a boulder.', 'It was there first.'],
  sheep: ['Met a sheep.', 'The sheep has right of way. Always.'],
  mud: ['Stuck in the mud.', 'The bog keeps what it catches.'],
  tree: ['Hugged a pine.', 'The pine is fine.'],
  post: ['Found the gate post.', 'So close to the banner.'],
  bale: ['Missed the gate.', 'The hay bales did not mind.'],
  landing: ['Heavy landing.', 'Knees have opinions.'],
  edge: ['Off the edge of the world.', 'It is a long way down to the plinth.'],
  stall: ['Ran out of hill.', 'A gentle stop. Very dignified.'],
}

// ————— Persistence (this prototype keeps its own small record) —————
/** One hill's record: where the line was left, how it has gone, and how far down the best run got. */
interface HillRecord {
  line: number
  runs: number
  finishes: number
  best: number | null
  history: Array<{ x: number; ok: boolean }>
  /** The furthest any run has reached, as a fraction of the way to the finish. */
  reach: number
  seen: boolean
}
interface Store {
  hill: string
  sound: boolean
  records: Record<string, HillRecord>
}
/**
 * Saved as before: Gravity Hill keeps the original top-level keys (line, runs,
 * finishes, best, history, previewed), so an existing record still loads; the
 * other hills live under `hills`.
 */
const KEY = 'downhill'
const clampLine = (x: number) => Math.max(COURSE.startRange[0], Math.min(COURSE.startRange[1], x))
function readRecord(raw: Record<string, unknown> | null | undefined, seenKey: 'previewed' | 'seen'): HillRecord {
  const r: HillRecord = { line: 0, runs: 0, finishes: 0, best: null, history: [], reach: 0, seen: false }
  if (!raw || typeof raw !== 'object') return r
  const line = Number(raw.line)
  r.line = Number.isFinite(line) ? Math.max(-6.6, Math.min(6.6, line)) : 0
  r.runs = Number(raw.runs) || 0
  r.finishes = Number(raw.finishes) || 0
  r.best = typeof raw.best === 'number' ? raw.best : null
  r.history = Array.isArray(raw.history) ? (raw.history as Array<{ x: unknown }>).slice(-12).filter((h) => typeof h?.x === 'number') as HillRecord['history'] : []
  const reach = Number(raw.reach)
  r.reach = Number.isFinite(reach) ? Math.max(0, Math.min(1, reach)) : r.finishes > 0 ? 1 : 0
  if (r.finishes > 0) r.reach = 1
  r.seen = raw[seenKey] === true
  return r
}
function loadStore(): Store {
  const base: Store = { hill: HILLS[0].id, sound: true, records: {} }
  let raw: Record<string, unknown> | null = null
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    /* fresh start */
  }
  base.records[HILLS[0].id] = readRecord(raw, 'previewed')
  const hills = (raw?.hills ?? {}) as Record<string, Record<string, unknown>>
  for (const h of HILLS.slice(1)) base.records[h.id] = readRecord(hills[h.id], 'seen')
  if (raw && typeof raw === 'object') {
    base.sound = raw.sound !== false
    if (typeof raw.hill === 'string' && HILLS.some((h) => h.id === raw!.hill)) base.hill = raw.hill
  }
  return base
}
const store = loadStore()
const save = () => {
  const g = store.records[HILLS[0].id]
  const hills: Record<string, HillRecord> = {}
  for (const h of HILLS.slice(1)) hills[h.id] = store.records[h.id]
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ line: g.line, runs: g.runs, finishes: g.finishes, best: g.best, history: g.history, sound: store.sound, previewed: g.seen, reach: g.reach, hill: store.hill, hills }),
    )
  } catch {
    /* private mode */
  }
}
const params = new URLSearchParams(location.search)
const TEST = params.has('test')
let TEST_UNLOCK = TEST && params.has('unlock')
const unlocked = (i: number) => i === 0 || store.records[HILLS[i - 1].id].finishes > 0 || TEST_UNLOCK
let hillIndex = Math.max(0, HILLS.findIndex((h) => h.id === (params.get('hill') ?? store.hill)))
if (!unlocked(hillIndex)) hillIndex = 0
useHill(HILLS[hillIndex])
/** The active hill's record. */
let rec = store.records[HILLS[hillIndex].id]

// ————— Renderer and scene —————
let renderer: THREE.WebGLRenderer
try {
  renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
} catch {
  $('dh-fallback').hidden = false
  throw new Error('WebGL unavailable')
}
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

let world: World = buildWorld()
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
const pegGeo = new THREE.SphereGeometry(0.09, 10, 8)
const pegOk = new THREE.MeshStandardMaterial({ color: 0xd4ac5e, roughness: 0.35, metalness: 0.6 })
const pegBad = new THREE.MeshStandardMaterial({ color: 0xc9452f, roughness: 0.55 })
function drawPegs() {
  for (const c of [...pegs.children]) pegs.remove(c)
  const d = COURSE.startD - 0.9
  rec.history.forEach((h, i) => {
    const m = new THREE.Mesh(pegGeo, h.ok ? pegOk : pegBad)
    m.position.copy(v3(h.x, terrainHeight(0, d) + 0.25, d))
    m.scale.setScalar(0.7 + (i / Math.max(1, rec.history.length)) * 0.5)
    pegs.add(m)
  })
}

// The last three runs' paths, as faint dotted trails down the hill (the newest darkest),
// each ending in a marker where it stopped: a red cross for a crash, a brass disc for the finish.
const TRAILS = 3
const MAX_DOTS = 1400
const trailGeo = new THREE.CircleGeometry(0.09, 8)
trailGeo.rotateX(-Math.PI / 2)
const trails = Array.from({ length: TRAILS }, (_, i) => {
  const m = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0x3a3226, transparent: true, opacity: [0.34, 0.18, 0.1][i], depthWrite: false }), MAX_DOTS)
  m.count = 0
  m.frustumCulled = false
  scene.add(m)
  return m
})
const crossGeo = (() => {
  const a = new THREE.PlaneGeometry(0.75, 0.16)
  a.rotateY(Math.PI / 4)
  const b = new THREE.PlaneGeometry(0.75, 0.16)
  b.rotateY(-Math.PI / 4)
  const g = new THREE.BufferGeometry()
  const pa = a.getAttribute('position').array as Float32Array
  const pb = b.getAttribute('position').array as Float32Array
  const pos = new Float32Array(pa.length + pb.length)
  pos.set(pa)
  pos.set(pb, pa.length)
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const ia = a.getIndex()!.array
  const idx = [...ia, ...Array.from(ia, (k) => k + pa.length / 3)]
  g.setIndex(idx)
  g.rotateX(-Math.PI / 2)
  return g
})()
const endMarks = Array.from({ length: TRAILS }, (_, i) => {
  const cross = new THREE.Mesh(crossGeo, new THREE.MeshBasicMaterial({ color: 0xc9452f, transparent: true, opacity: [0.9, 0.5, 0.3][i], depthWrite: false, side: THREE.DoubleSide }))
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc29d5f, transparent: true, opacity: [0.95, 0.55, 0.3][i], depthWrite: false }))
  cross.visible = disc.visible = false
  scene.add(cross, disc)
  return { cross, disc }
})
/** Runs shown as trails, newest first (re-simulated from the record, so they survive a reload). */
let shownRuns: RunResult[] = []
function setTrails(runs: RunResult[]) {
  shownRuns = runs.slice(0, TRAILS)
  const m = new THREE.Matrix4()
  trails.forEach((trail, k) => {
    const run = shownRuns[k]
    const mark = endMarks[k]
    trail.count = 0
    mark.cross.visible = mark.disc.visible = false
    if (!run) return
    const f = run.frames
    let n = 0
    let lastX = Infinity
    let lastD = Infinity
    for (let i = 0; i < f.length / STRIDE && n < MAX_DOTS; i++) {
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
    const e = run.end
    const target = run.outcome === 'finish' ? mark.disc : mark.cross
    const ground = Math.abs(e.x) > BOUNDS.W ? e.y : Math.max(surfaceHeight(e.x, e.d), Math.min(e.y, surfaceHeight(e.x, e.d) + 3))
    target.position.set(e.x, ground + 0.06, -e.d)
    target.visible = true
  })
}
/** Rebuild the trails from the record's last lines (deterministic, so the same paths come back). */
function trailsFromRecord() {
  const lines = rec.history.slice(-TRAILS).reverse()
  setTrails(lines.map((h) => simulateRun(h.x)))
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
    const side = p.x < COURSE.finishX ? 1 : -1
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
let clock = 0
let landSquash = 0
let eventIdx = 0
let timeScale = 1
/** Playback speed chosen by the player during a run (1×, 2×, 4×). */
const FF = [1, 2, 4]
let ff = 0
/** A replay re-watches the last run without counting it. */
let replaying = false
let newBest = false
let newReach = false
let previewTotal = 7
const tumbleParts: Array<{ obj: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; r: number }> = []
let rollOut = { speed: 0, x: 0, d: 0, heading: 0 }

function setPhase(p: Phase) {
  phase = p
  phaseT = 0
  els.root.dataset.phase = p
  marker.visible = p === 'aim'
  els.skip.hidden = p !== 'preview'
  const locked = !unlocked(hillIndex)
  els.launch.disabled = p !== 'aim' || locked
  els.nudgeL.disabled = els.nudgeR.disabled = p !== 'aim' || locked
  els.survey.disabled = p !== 'aim'
  updateHillNav()
  if (p !== 'run') {
    ff = 0
    els.ffLabel.textContent = '1×'
  }
}

function fmtLine(x: number) {
  // Two decimals when the line sits between tenths, so a fine adjustment is always visible.
  const fine = Math.abs(x * 10 - Math.round(x * 10)) > 0.01
  const v = Math.abs(x).toFixed(fine ? 2 : 1)
  return x > 0.0049 ? `+${v}` : x < -0.0049 ? `−${v}` : fine ? '0.00' : '0.0'
}

const kmh = (v: number) => Math.round(v * 3.6)

function updateLine() {
  els.line.textContent = fmtLine(rec.line)
  els.run.textContent = `Run ${rec.runs + 1}`
}

/** The stretch of hill where a run ended, and how far down that is. */
function reachOf(r: RunResult) {
  const d = Math.min(r.end.d, COURSE.finishD)
  return { frac: r.outcome === 'finish' ? 1 : Math.max(0, Math.min(1, (d - COURSE.startD) / (COURSE.finishD - COURSE.startD))), where: sectionAt(d).name }
}

function lastRunLine(): string {
  const r = shownRuns[0]
  if (!r) return ''
  if (r.outcome === 'finish') return `Last run: clean, ${r.time.toFixed(1)} s.`
  return `Last run: ${COPY[r.outcome][0].replace(/\.$/, '').toLowerCase()} at ${reachOf(r).where}.`
}

function updateHillNav() {
  const i = hillIndex
  const busy = phase === 'run' || phase === 'tumble' || phase === 'preview'
  els.prev.disabled = busy || i === 0
  els.next.disabled = busy || i === HILLS.length - 1
  els.next.setAttribute('aria-label', i < HILLS.length - 1 && !unlocked(i + 1) ? `Next hill (locked): ${HILLS[i + 1].name}` : 'Next hill')
}

function updateLabels() {
  const h = HILLS[hillIndex]
  const locked = !unlocked(hillIndex)
  els.hillNo.textContent = `Hill ${hillIndex + 1} of ${HILLS.length}`
  els.title.textContent = h.name
  els.root.dataset.locked = String(locked)
  els.launch.textContent = locked ? 'Locked' : 'Launch'
  if (locked) els.hint.textContent = `Finish ${HILLS[hillIndex - 1].name} to open this hill. Have a look around.`
  else if (rec.runs === 0) els.hint.textContent = hillIndex === 0 ? 'Drag left or right to choose your line.' : h.brief
  else els.hint.textContent = lastRunLine() || 'Same line, or try another.'
  document.title = hillIndex === 0 ? 'Downhill' : `${h.name} · Downhill`
  updateLine()
  updateHillNav()
}

function resetRider() {
  scene.remove(rider.root)
  for (const p of tumbleParts) scene.remove(p.obj)
  tumbleParts.length = 0
  rider = new Rider()
  scene.add(rider.root)
  const x = rec.line
  const d = COURSE.startD
  placeRider(x, d, surfaceHeight(x, d), 0, 0, false, 1)
  marker.visible = true
}

function launch() {
  if (phase !== 'aim' || !unlocked(hillIndex)) return
  sound.unlock()
  run = simulateRun(rec.line)
  replaying = false
  eventIdx = 0
  marker.visible = false
  els.result.hidden = true
  if (rec.runs === 0 && hillIndex === 0) track('game_start', { mode: 'downhill' })
  sound.push()
  setPhase('run')
  setTrack(els.hudTrack, 0, rec.reach, false)
}

function replay() {
  if (phase !== 'done' || !run) return
  sound.stopRoll()
  els.result.hidden = true
  confetti.count = 0
  confettiState.length = 0
  resetRider()
  replaying = true
  eventIdx = 0
  marker.visible = false
  setPhase('run')
  setTrack(els.hudTrack, 0, rec.reach, false)
}

function finishRun() {
  const r = run!
  const ok = r.outcome === 'finish'
  newBest = false
  newReach = false
  if (replaying) return
  rec.runs++
  const reach = reachOf(r).frac
  if (reach > rec.reach + 0.005 && rec.runs > 1) newReach = true
  rec.reach = Math.max(rec.reach, reach)
  if (ok) {
    rec.finishes++
    newBest = rec.best !== null && r.time < rec.best - 0.005
    if (rec.best === null || r.time < rec.best) rec.best = +r.time.toFixed(2)
  }
  rec.history.push({ x: +rec.line.toFixed(2), ok })
  rec.history = rec.history.slice(-12)
  save()
  drawPegs()
  track('game_complete', { result: ok ? 'win' : 'lose', level: hillIndex + 1, mode: 'downhill' })
  setTrails([r, ...shownRuns])
}

/** Fill a progress track: how far down this run got, and the best so far. */
function setTrack(el: HTMLElement, frac: number, best: number, crashed: boolean) {
  el.style.setProperty('--at', String(frac))
  el.style.setProperty('--best', String(best))
  el.dataset.crashed = String(crashed)
  el.dataset.best = String(best > 0.001 && best < 0.999)
}

/** Section ticks on the report track, so the reader can see what lies between here and the gate. */
function drawTicks(el: HTMLElement) {
  for (const t of [...el.querySelectorAll('.dh-track__tick')]) t.remove()
  for (const s of COURSE.sections.slice(1)) {
    const f = (s.d - COURSE.startD) / (COURSE.finishD - COURSE.startD)
    if (f <= 0 || f >= 1) continue
    const tick = document.createElement('span')
    tick.className = 'dh-track__tick'
    tick.style.setProperty('--at', String(f))
    tick.title = s.name
    el.appendChild(tick)
  }
}

function showResult() {
  const r = run!
  const ok = r.outcome === 'finish'
  const [title, line] = COPY[r.outcome]
  const { frac, where } = reachOf(r)
  els.resultKicker.textContent = `${replaying ? 'Replay' : `Run ${rec.runs}`} · line ${fmtLine(rec.line)}`
  els.resultTitle.textContent = title
  els.result.dataset.win = String(ok)
  if (ok) {
    const best = rec.finishes <= 1 ? '' : newBest ? ' A new best.' : ` Best ${rec.best!.toFixed(1)} s.`
    els.resultDetail.textContent = `${r.time.toFixed(1)} s down ${COURSE.name}.${best}`
  } else els.resultDetail.textContent = line
  drawTicks(els.reportTrack)
  setTrack(els.reportTrack, frac, rec.reach, !ok)
  els.reportWhere.textContent = ok
    ? 'Through the gate.'
    : `Stopped at ${where}, ${Math.round(frac * 100)}% of the way down.${newReach ? ' Your furthest yet.' : rec.finishes === 0 && rec.reach > frac + 0.01 ? ` Furthest so far: ${Math.round(rec.reach * 100)}%.` : ''}`
  els.statTime.textContent = `${r.time.toFixed(1)} s`
  els.statSpeed.textContent = `${kmh(r.topSpeed)} km/h`
  els.statAir.textContent = `${r.airTotal.toFixed(1)} s`
  const next = hillIndex + 1
  els.nextHill.hidden = !(ok && next < HILLS.length)
  const opened = ok && !replaying && rec.finishes === 1 && next < HILLS.length
  if (opened) els.resultDetail.textContent += ` ${HILLS[next].name} is open.`
  els.nextHill.textContent = 'Next hill'
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
  replaying = false
  resetRider()
  updateLabels()
  setPhase('aim')
}

/** Switch to another hill (the world is rebuilt; the rider waits at its start). */
function setHill(i: number) {
  if (i < 0 || i >= HILLS.length || i === hillIndex) return
  if (phase === 'run' || phase === 'tumble' || phase === 'preview') return
  sound.stopRoll()
  hillIndex = i
  useHill(HILLS[i])
  rec = store.records[HILLS[i].id]
  if (unlocked(i)) {
    store.hill = HILLS[i].id
    save()
  }
  scene.remove(world.group)
  world.dispose()
  world = buildWorld()
  scene.add(world.group)
  els.result.hidden = true
  confetti.count = 0
  confettiState.length = 0
  run = null
  replaying = false
  drawPegs()
  trailsFromRecord()
  resetRider()
  updateLabels()
  const [p, l] = aimCamera()
  camPos.copy(p)
  camLook.copy(l)
  // A first look at a new hill: the survey flies it once.
  if (unlocked(i) && !rec.seen && !params.has('nopreview')) startPreview()
  else setPhase('aim')
}

function startPreview() {
  previewTotal = Math.min(14, Math.max(7, 4 + COURSE.length / 45))
  setPhase('preview')
}

// ————— Crash tumble (a small ragdoll of the rider's parts) —————
let seed = 1
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
function startTumble(r: RunResult) {
  seed = Math.floor((rec.line + 20) * 1000) + 7
  const parts = rider.parts()
  const base = new THREE.Vector3(r.end.vx, Math.max(r.end.vy, 0) + 2.5, -r.end.vd)
  if (r.outcome === 'stall' || r.outcome === 'mud') base.set(0.6, 1, 0)
  // Into the gap: the rider stays in it.
  if (r.outcome === 'gap') base.set(r.end.vx * 0.1, 0.6, -r.end.vd * 0.04)
  const scale = r.outcome === 'stall' || r.outcome === 'mud' ? 0.3 : r.outcome === 'gap' ? 0.3 : 0.75
  for (const [name, obj] of Object.entries(parts)) {
    scene.attach(obj)
    const v = base.clone().multiplyScalar(scale)
    v.x += (rnd() - 0.5) * 4
    v.y += rnd() * 3
    v.z += (rnd() - 0.5) * 4
    if (name === 'board') v.multiplyScalar(1.2).add(new THREE.Vector3((rnd() - 0.5) * 3, 2, 0))
    const w = new THREE.Vector3((rnd() - 0.5) * 14, (rnd() - 0.5) * 14, (rnd() - 0.5) * 14).multiplyScalar(r.outcome === 'stall' || r.outcome === 'mud' ? 0.2 : 1)
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
  const x = rec.line
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
  // Longer hills spend longer gliding, so each stretch still gets a look.
  const glide = COURSE.length > 200 ? 0.78 : 0.7
  const cx = COURSE.finishX * 0.5
  if (t < glide) {
    const k = e(t / glide)
    const d = 2 + (COURSE.finishD + 8 - 2) * k
    const h = terrainHeight(cx, d)
    const pos = v3(cx + Math.sin(k * Math.PI * Math.max(1, Math.round(COURSE.length / 160))) * 6, h + 14 - k * 4, d - 14)
    const look = v3(cx, terrainHeight(cx, d + 18) + 1, d + 18)
    return [pos, look]
  }
  const k = e((t - glide) / (1 - glide))
  const [ap, al] = aimCamera()
  const endD = COURSE.finishD + 8
  const from = v3(cx, terrainHeight(cx, endD) + 10, endD - 14)
  const fromLook = v3(cx, terrainHeight(cx, endD + 18) + 1, endD + 18)
  // Arc high over the hill on the way back up.
  const pos = from.clone().lerp(ap, k)
  pos.y += Math.sin(k * Math.PI) * (18 + COURSE.length / 20)
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

let hudSection = ''
let hudSpeed = -1
let hudTick = 0
function updateHud(d: number, speed: number) {
  hudTick++
  if (hudTick % 4) return
  const name = sectionAt(d).name
  if (name !== hudSection) els.hudSection.textContent = hudSection = name
  const v = kmh(speed)
  if (v !== hudSpeed) els.hudSpeed.textContent = String((hudSpeed = v))
  els.hudTrack.style.setProperty('--at', String(Math.max(0, Math.min(1, (d - COURSE.startD) / (COURSE.finishD - COURSE.startD)))))
}

function frame(realDt: number) {
  const dt = realDt * timeScale * (phase === 'run' ? FF[ff] : 1)
  clock += realDt * timeScale
  phaseT += dt
  switch (phase) {
    case 'preview': {
      moveCamera(previewCamera(Math.min(1, phaseT / previewTotal)), dt, 999)
      rider.pose({ crouch: 0.15, lean: 0, air: 0, cheer: 0, t: clock, speed: 0 })
      world.update(clock, clock)
      if (phaseT >= previewTotal) endPreview()
      followSun(camLook)
      break
    }
    case 'aim': {
      const x = rec.line
      const d = COURSE.startD
      placeRider(x, d, surfaceHeight(x, d), 0, 0, false, 1)
      marker.position.copy(v3(x, surfaceHeight(x, d) + 0.03, d))
      rider.pose({ crouch: 0.15 + Math.sin(clock * 2) * 0.03, lean: 0, air: 0, cheer: 0, t: clock, speed: 0 })
      // The sheep wait where they will be at the moment of launch.
      world.update(0, clock)
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
        else if (e.kind === 'mud') sound.squelch()
      }
      landSquash = Math.max(0, landSquash - dt * 3)
      placeRider(x, d, y, heading, air ? pitch * 0.6 : 0, air, air ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 18))
      const ahead = COURSE.ramps.some((rp) => x > rp.x0 - 0.5 && x < rp.x1 + 0.5 && d > rp.d0 - 8 && d < rp.d1)
      rider.pose({ crouch: Math.min(1, 0.2 + speed / 30 + (ahead ? 0.4 : 0) + landSquash * 0.8), lean, air: air ? 1 : 0, cheer: 0, t: clock, speed })
      sound.rolling(speed, lean, air)
      world.update(t, clock)
      updateHud(d, speed)
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
        } else {
          if (r.outcome === 'gap' || r.outcome === 'edge') sound.splat()
          else if (r.outcome === 'sheep') sound.baa()
          else sound.crash()
          startTumble(r)
          setPhase('tumble')
        }
      }
      break
    }
    case 'tumble': {
      const r = run!
      world.update(r.time + phaseT, clock)
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
      if (run) world.update(run.time + 2 + phaseT, clock)
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
  rec.seen = true
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
  if (phase !== 'aim' || drag || !unlocked(hillIndex)) return
  e.preventDefault()
  drag = { id: e.pointerId, startX: e.clientX, startLine: rec.line }
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
  const next = clampLine(drag.startLine + (e.clientX - drag.startX) * perPx)
  rec.line = Math.round(next * 100) / 100
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

/** Fine steps of 0.02: enough to find the narrow lines on the later hills. */
function nudge(step: number) {
  if (phase !== 'aim' || !unlocked(hillIndex)) return
  rec.line = clampLine(+(rec.line + step).toFixed(2))
  updateLine()
  save()
}
// Hold a nudge button to keep stepping.
for (const [btn, dir] of [
  [els.nudgeL, -1],
  [els.nudgeR, 1],
] as const) {
  let timer = 0
  const stop = () => {
    clearTimeout(timer)
    timer = 0
  }
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    sound.unlock()
    nudge(dir * 0.02)
    let delay = 380
    const again = () => {
      nudge(dir * 0.02)
      delay = Math.max(60, delay * 0.8)
      timer = window.setTimeout(again, delay)
    }
    timer = window.setTimeout(again, delay)
  })
  btn.addEventListener('pointerup', stop)
  btn.addEventListener('pointerleave', stop)
  btn.addEventListener('pointercancel', stop)
  // Keyboard activation (Enter / Space on a focused button).
  btn.addEventListener('click', (e) => {
    if ((e as PointerEvent).pointerType === '' || e.detail === 0) nudge(dir * 0.02)
  })
}

function cycleSpeed() {
  if (phase !== 'run') return
  ff = (ff + 1) % FF.length
  els.ffLabel.textContent = `${FF[ff]}×`
  els.ff.setAttribute('aria-label', `Playback speed ${FF[ff]}×`)
}

els.launch.addEventListener('click', () => launch())
els.retry.addEventListener('click', () => retry())
els.replay.addEventListener('click', () => replay())
els.nextHill.addEventListener('click', () => setHill(hillIndex + 1))
els.prev.addEventListener('click', () => setHill(hillIndex - 1))
els.next.addEventListener('click', () => setHill(hillIndex + 1))
els.ff.addEventListener('click', () => cycleSpeed())
els.skip.addEventListener('click', () => endPreview())
els.survey.addEventListener('click', () => {
  if (phase === 'aim') startPreview()
})
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
  if (k === 'f' && phase === 'run') return cycleSpeed()
  if ((phase === 'done' || phase === 'tumble') && (k === 'r' || k === 'enter' || k === ' ')) {
    if ((e.target as HTMLElement).tagName === 'BUTTON' && k !== 'r') return
    e.preventDefault()
    return retry()
  }
  if (phase === 'done' && k === 'w') return replay()
  if ((phase === 'aim' || phase === 'done') && k === '[') return setHill(hillIndex - 1)
  if ((phase === 'aim' || phase === 'done') && k === ']') return setHill(hillIndex + 1)
  if (phase !== 'aim') return
  if (k === 'v') return startPreview()
  if (!unlocked(hillIndex)) return
  const step = e.shiftKey ? 0.02 : 0.1
  if (k === 'arrowleft') rec.line = clampLine(+(rec.line - step).toFixed(2))
  else if (k === 'arrowright') rec.line = clampLine(+(rec.line + step).toFixed(2))
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
drawPegs()
trailsFromRecord()
resetRider()
updateLabels()
{
  const [p, l] = aimCamera()
  camPos.copy(p)
  camLook.copy(l)
}
const skipPreview = params.has('nopreview') || !unlocked(hillIndex) || (rec.seen && !params.has('preview'))
if (skipPreview) setPhase('aim')
else startPreview()

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
    line: () => rec.line,
    outcome: () => run?.outcome ?? null,
    time: () => run?.time ?? null,
    store: () => JSON.parse(JSON.stringify(store)),
    speed: (k: number) => (timeScale = k),
    /** Jump to a known line (drag and keyboard positioning are tested separately). */
    setLine: (x: number) => {
      if (phase !== 'aim') return
      rec.line = clampLine(x)
      updateLine()
    },
    riderPos: () => rider.root.position.toArray(),
    /** Seconds into the current phase (playback time during a run). */
    phaseTime: () => phaseT,
    hill: () => HILLS[hillIndex].id,
    hills: () => HILLS.map((h) => h.id),
    setHill: (id: string) => setHill(HILLS.findIndex((h) => h.id === id)),
    unlockAll: () => {
      TEST_UNLOCK = true
      updateLabels()
      setPhase(phase)
    },
  }
}
