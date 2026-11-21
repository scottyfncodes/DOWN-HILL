/**
 * Downhill sounds, synthesized live: urethane wheel roar that follows speed
 * and carving, ramp clacks, landings, rubber tyres, the tumble, the finish bell.
 */
export class DownhillSound {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private noise: AudioBuffer | null = null
  private roll: { src: AudioBufferSourceNode; band: BiquadFilterNode; gain: GainNode; hum: OscillatorNode; humGain: GainNode } | null = null
  enabled = true

  unlock() {
    if (!this.enabled) return
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return
        this.ctx = new Ctor()
        this.out = this.ctx.createGain()
        this.out.gain.value = 0.8
        const comp = this.ctx.createDynamicsCompressor()
        this.out.connect(comp).connect(this.ctx.destination)
        const len = this.ctx.sampleRate * 2
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
        const d = this.noise.getChannelData(0)
        let s = 9
        for (let i = 0; i < len; i++) {
          s = (s * 1103515245 + 12345) >>> 0
          d[i] = (s / 4294967296) * 2 - 1
        }
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch {
      this.ctx = null
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (!on) {
      this.stopRoll()
      void this.ctx?.suspend()
    } else this.unlock()
  }

  pause(hidden: boolean) {
    if (!this.ctx) return
    if (hidden) void this.ctx.suspend()
    else if (this.enabled) void this.ctx.resume()
  }

  private ok() {
    return this.enabled && this.ctx && this.out && this.ctx.state === 'running' ? this.ctx : null
  }

  private tone(at: number, f: number, decay: number, amp: number, type: OscillatorType = 'sine', glide = 0) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f * (1 + glide), at)
    if (glide) o.frequency.exponentialRampToValueAtTime(f, at + decay)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(amp, at + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay * 4)
    o.connect(g).connect(this.out!)
    o.start(at)
    o.stop(at + decay * 4 + 0.05)
  }

  private burst(at: number, type: BiquadFilterType, f: number, dur: number, amp: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filt = ctx.createBiquadFilter()
    filt.type = type
    filt.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(amp, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    src.connect(filt).connect(g).connect(this.out!)
    src.start(at, Math.random())
    src.stop(at + dur + 0.05)
  }

  /** Wheel roar: call every frame. Louder and brighter with speed; carving adds grind. */
  rolling(speed: number, lean: number, air: boolean) {
    const ctx = this.ok()
    if (!ctx || !this.noise) return
    if (!this.roll) {
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.Q.value = 0.8
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(band).connect(gain).connect(this.out!)
      src.start()
      const hum = ctx.createOscillator()
      hum.type = 'triangle'
      const humGain = ctx.createGain()
      humGain.gain.value = 0
      hum.connect(humGain).connect(this.out!)
      hum.start()
      this.roll = { src, band, gain, hum, humGain }
    }
    const t = ctx.currentTime
    const k = Math.min(1, speed / 16)
    const level = air ? 0 : 0.02 + 0.16 * k + Math.min(0.08, Math.abs(lean) * 0.25)
    this.roll.gain.gain.setTargetAtTime(level, t, 0.04)
    this.roll.band.frequency.setTargetAtTime(300 + 1300 * k + Math.abs(lean) * 600, t, 0.06)
    this.roll.hum.frequency.setTargetAtTime(40 + speed * 7, t, 0.05)
    this.roll.humGain.gain.setTargetAtTime(air ? 0 : 0.02 * k, t, 0.05)
  }

  stopRoll() {
    if (!this.roll || !this.ctx) return
    const r = this.roll
    this.roll = null
    const t = this.ctx.currentTime
    r.gain.gain.setTargetAtTime(0, t, 0.03)
    r.humGain.gain.setTargetAtTime(0, t, 0.03)
    r.src.stop(t + 0.3)
    r.hum.stop(t + 0.3)
  }

  push() {
    const ctx = this.ok()
    if (!ctx) return
    const t = ctx.currentTime
    this.tone(t, 180, 0.04, 0.18, 'sine', 0.4)
    this.burst(t, 'bandpass', 900, 0.12, 0.08)
  }

  takeoff() {
    const ctx = this.ok()
    if (!ctx) return
    const t = ctx.currentTime
    this.tone(t, 420, 0.03, 0.12, 'triangle')
    this.burst(t, 'highpass', 2000, 0.05, 0.1)
  }

  land(impact: number) {
    const ctx = this.ok()
    if (!ctx) return
    const t = ctx.currentTime
    const a = Math.min(0.5, 0.12 + impact * 0.04)
    this.tone(t, 90, 0.08, a, 'sine', 0.6)
    this.tone(t, 260, 0.03, a * 0.5, 'triangle')
    this.burst(t, 'lowpass', 900, 0.07, a * 0.6)
  }

  boing() {
    const ctx = this.ok()
    if (!ctx) return
    const t = ctx.currentTime
    this.tone(t, 150, 0.12, 0.35, 'sine', 1.2)
    this.tone(t, 300, 0.06, 0.12, 'triangle', 0.8)
  }

  graze() {
    const ctx = this.ok()
    if (!ctx) return
    this.burst(ctx.currentTime, 'bandpass', 1400, 0.12, 0.12)
  }

  crash() {
    const ctx = this.ok()
    if (!ctx) return
    const t = ctx.currentTime
    this.tone(t, 70, 0.14, 0.5, 'sine', 0.8)
    this.burst(t, 'lowpass', 600, 0.18, 0.5)
    // The board clattering away.
    for (let i = 0; i < 4; i++) this.tone(t + 0.12 + i * 0.13 + Math.random() * 0.03, 520 + Math.random() * 200, 0.02, 0.12 / (i + 1), 'square')
    // A small, sympathetic "oof".
    this.tone(t + 0.05, 220, 0.09, 0.08, 'sawtooth', -0.3)
  }

  splat() {
    const ctx = this.ok()
    if (!ctx) return
    const t = ctx.currentTime
    this.tone(t, 60, 0.2, 0.45, 'sine', 0.9)
    this.burst(t, 'lowpass', 300, 0.3, 0.4)
  }

  finish() {
    const ctx = this.ok()
    if (!ctx) return
    const t = ctx.currentTime
    for (const [i, f] of [523.25, 659.25, 783.99, 1046.5].entries()) {
      this.tone(t + i * 0.09, f, 0.18, 0.09)
      this.tone(t + i * 0.09, f * 2.01, 0.08, 0.025)
    }
  }

  tick() {
    const ctx = this.ok()
    if (!ctx) return
    this.tone(ctx.currentTime, 1600, 0.01, 0.04)
  }
}
