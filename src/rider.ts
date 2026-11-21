import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * The longboarder: a small, chunky character on a cruiser deck, built from
 * primitives and posed procedurally (crouch, carve lean, air tuck, celebration).
 * Parts are kept addressable so a crash can throw them about as a ragdoll.
 */

const C = {
  skin: 0xe8b48f,
  jacket: 0xd9772b,
  jacketDark: 0xb85f1c,
  pants: 0x3f5266,
  shoe: 0xf1ece2,
  helmet: 0x2f6f6a,
  visor: 0x1d2a2a,
  deck: 0xb7834c,
  grip: 0x2b2b2b,
  truck: 0xb7bcc0,
  wheel: 0xf0b44a,
}

const mat = (color: number, rough = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })

function capsule(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10)
  g.translate(0, -len / 2 - r, 0) // pivot at the top
  const mesh = new THREE.Mesh(g, m)
  mesh.castShadow = true
  return mesh
}

export interface RiderParts {
  head: THREE.Object3D
  torso: THREE.Object3D
  armL: THREE.Object3D
  armR: THREE.Object3D
  legL: THREE.Object3D
  legR: THREE.Object3D
  board: THREE.Object3D
}

export class Rider {
  /** Placed at the board's contact point, oriented to the board. */
  readonly root = new THREE.Group()
  readonly board = new THREE.Group()
  /** The character, which leans and crouches on the board. */
  readonly body = new THREE.Group()
  private hips = new THREE.Group()
  private torso = new THREE.Group()
  private head = new THREE.Group()
  private armL = new THREE.Group()
  private armR = new THREE.Group()
  private foreArmL = new THREE.Group()
  private foreArmR = new THREE.Group()
  private thighL = new THREE.Group()
  private thighR = new THREE.Group()
  private shinL = new THREE.Group()
  private shinR = new THREE.Group()
  private wheels: THREE.Mesh[] = []

  constructor() {
    // Board: deck along -z (forward), kicktails, trucks and soft wheels.
    const deck = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.045, 1.12, 3, 0.02), mat(C.deck, 0.6))
    deck.position.y = 0.16
    deck.castShadow = true
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.006, 1.0), mat(C.grip, 0.95))
    grip.position.y = 0.185
    this.board.add(deck, grip)
    const wheelGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14)
    wheelGeo.rotateZ(Math.PI / 2)
    for (const z of [-0.38, 0.38]) {
      const truck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.06), mat(C.truck, 0.35, 0.8))
      truck.position.set(0, 0.11, z)
      this.board.add(truck)
      for (const x of [-0.15, 0.15]) {
        const w = new THREE.Mesh(wheelGeo, mat(C.wheel, 0.5))
        w.position.set(x, 0.06, z)
        w.castShadow = true
        this.board.add(w)
        this.wheels.push(w)
      }
    }
    this.root.add(this.board)

    // Body: stands sideways on the deck (regular stance, facing +x).
    const jacket = mat(C.jacket)
    const pants = mat(C.pants)
    const skin = mat(C.skin, 0.8)
    this.body.position.y = 0.19
    this.board.add(this.body)
    this.hips.position.y = 0.74
    this.body.add(this.hips)
    const pelvis = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.16, 0.22, 2, 0.06), pants)
    pelvis.castShadow = true
    this.hips.add(pelvis)

    for (const [thigh, shin, z] of [
      [this.thighL, this.shinL, -0.17],
      [this.thighR, this.shinR, 0.17],
    ] as const) {
      thigh.position.set(0, -0.02, z)
      thigh.add(capsule(0.075, 0.22, pants))
      shin.position.y = -0.37
      shin.add(capsule(0.065, 0.2, pants))
      const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.08, 0.24, 2, 0.03), mat(C.shoe, 0.8))
      shoe.position.set(0.03, -0.36, 0)
      shoe.rotation.y = Math.PI / 2
      shoe.castShadow = true
      shin.add(shoe)
      thigh.add(shin)
      this.hips.add(thigh)
    }

    this.torso.position.y = 0.06
    this.hips.add(this.torso)
    const chest = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.46, 0.3, 3, 0.1), jacket)
    chest.position.y = 0.24
    chest.castShadow = true
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.4, 0.01), mat(C.jacketDark))
    zip.position.set(0.172, 0.24, 0)
    zip.rotation.y = Math.PI / 2
    this.torso.add(chest)

    for (const [arm, fore, z] of [
      [this.armL, this.foreArmL, -0.2],
      [this.armR, this.foreArmR, 0.2],
    ] as const) {
      arm.position.set(0, 0.43, z)
      arm.add(capsule(0.06, 0.16, jacket))
      fore.position.y = -0.28
      fore.add(capsule(0.052, 0.14, jacket))
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin)
      hand.position.y = -0.27
      fore.add(hand)
      arm.add(fore)
      this.torso.add(arm)
    }

    // A big friendly head with a helmet and a visor stripe.
    this.head.position.y = 0.52
    this.torso.add(this.head)
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), skin)
    face.position.y = 0.17
    face.castShadow = true
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.185, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(C.helmet, 0.35))
    helmet.position.y = 0.19
    helmet.castShadow = true
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), mat(C.visor, 0.2, 0.3))
    visor.position.set(0.16, 0.2, 0)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), skin)
    nose.position.set(0.17, 0.13, 0)
    this.head.add(face, helmet, visor, nose)
    // Face downhill-ish: the rider looks along the board.
    this.head.rotation.y = 0.9
  }

  /**
   * Pose the rider. crouch 0..1, lean in radians (+ toward the rider's toes),
   * air 0..1 (tuck), cheer 0..1 (arms up), t seconds (for little idle motions).
   */
  pose(o: { crouch: number; lean: number; air: number; cheer: number; t: number; speed: number }) {
    const crouch = Math.min(1, o.crouch + o.air * 0.5)
    // Lean the whole body over the toe or heel edge.
    // (+lean turns toward the toe side, which is the board's +x.)
    this.body.rotation.z = -o.lean * 0.85
    this.board.rotation.z = -o.lean * 0.35
    // Legs: bend at hip and knee; the hips sink.
    const bend = 0.25 + crouch * 0.85
    this.thighL.rotation.x = 0
    this.thighL.rotation.z = bend
    this.thighR.rotation.z = bend
    this.shinL.rotation.z = -bend * 1.9
    this.shinR.rotation.z = -bend * 1.9
    this.hips.position.y = 0.74 - (1 - Math.cos(bend)) * 0.36 - (1 - Math.cos(bend * 1.9 - bend)) * 0.3 - crouch * 0.05
    // Torso tips forward over the toes when crouched.
    this.torso.rotation.z = -0.15 - crouch * 0.45
    // Arms out for balance; up and waving when airborne or cheering.
    const sway = Math.sin(o.t * 2.3) * 0.08
    const out = 0.5 + o.air * 0.9 + sway
    this.armL.rotation.x = out
    this.armR.rotation.x = -out
    this.armL.rotation.z = 0.2
    this.armR.rotation.z = 0.2
    this.foreArmL.rotation.z = -0.3 - o.air * 0.4
    this.foreArmR.rotation.z = -0.3 - o.air * 0.4
    if (o.cheer > 0) {
      const c = o.cheer
      this.armL.rotation.x = out * (1 - c) + 2.7 * c + Math.sin(o.t * 9) * 0.15 * c
      this.armR.rotation.x = -out * (1 - c) - 2.7 * c - Math.sin(o.t * 9 + 1) * 0.15 * c
      this.torso.rotation.z = this.torso.rotation.z * (1 - c) + 0.1 * c
    }
    this.head.rotation.z = -this.torso.rotation.z * 0.6
    for (const w of this.wheels) w.rotation.x -= o.speed * 0.016 / 0.06
  }

  /** Detach visible parts (in world space) for a crash tumble. */
  parts(): RiderParts {
    return { head: this.head, torso: this.torso, armL: this.armL, armR: this.armR, legL: this.thighL, legR: this.thighR, board: this.board }
  }
}
