// a little rhythmic loop, made on the spot with web audio: no files, no third
// party. one beat clock drives both the sound and the bounce of the pieces, so
// they stay in time, and the tempo follows how fast the capsules fall.
//
// the clock lives in page time (performance.now). when the tempo changes it is
// re-anchored, so the beat count stays continuous and nothing jumps.

const bpmFor = (rowsPerSecond: number) => Math.min(176, Math.max(92, 92 + 11 * rowsPerSecond))
// a cheerful pentatonic: c d e g a, in two octaves
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]
const ARP = [0, 2, 4, 5, 4, 2, 3, 1, 0, 2, 4, 7, 6, 4, 3, 2]
const BASS = [130.81, 130.81, 98.0, 110.0]

export function createMusic() {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noise: AudioBuffer | null = null
  let sound = true
  let running = false
  let timer: ReturnType<typeof setInterval> | undefined
  let anchor = { t: 0, beats: 0, bpm: bpmFor(0) }
  let next = 0 // the next eighth note to schedule
  const now = () => performance.now() / 1000
  const beatsAt = (t: number) => anchor.beats + ((t - anchor.t) * anchor.bpm) / 60

  // audio needs a tap or click before it may start; play() runs inside one
  function ensure() {
    if (!sound) return
    if (!ctx) {
      try {
        ctx = new AudioContext()
        master = ctx.createGain()
        master.gain.value = 0.16
        master.connect(ctx.destination)
        noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate)
        const data = noise.getChannelData(0)
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      } catch {
        // no web audio here: the game plays on in silence, and still bounces
        ctx = null
        return
      }
    }
    if (ctx.state === 'suspended') void ctx.resume()
  }

  function tone(freq: number, at: number, length: number, type: OscillatorType, level: number, to = freq) {
    const osc = ctx!.createOscillator()
    const gain = ctx!.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, at + length)
    gain.gain.setValueAtTime(level, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + length)
    osc.connect(gain).connect(master!)
    osc.start(at)
    osc.stop(at + length + 0.02)
  }

  function hiss(at: number, length: number, level: number, cutoff: number) {
    const src = ctx!.createBufferSource()
    const filter = ctx!.createBiquadFilter()
    const gain = ctx!.createGain()
    src.buffer = noise
    filter.type = 'highpass'
    filter.frequency.value = cutoff
    gain.gain.setValueAtTime(level, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + length)
    src.connect(filter).connect(gain).connect(master!)
    src.start(at)
    src.stop(at + length + 0.02)
  }

  // one eighth note of the loop: a two-bar pattern of sixteen eighths
  function voice(step: number, at: number) {
    const inBar = step % 8
    if (inBar === 0 || inBar === 4) tone(140, at, 0.14, 'sine', 0.9, 48) // kick
    if (inBar === 2 || inBar === 6) hiss(at, 0.09, 0.35, 1800) // clap
    hiss(at, 0.025, 0.12, 7000) // hat
    if (inBar % 2 === 0) tone(BASS[Math.floor(step / 4) % BASS.length], at, 0.18, 'triangle', 0.5)
    tone(SCALE[ARP[step % 16]], at, 0.1, 'square', 0.07)
  }

  function schedule() {
    if (!ctx || !running || !sound || ctx.state !== 'running') return
    const offset = ctx.currentTime - now()
    const horizon = now() + 0.15
    for (;;) {
      const t = anchor.t + ((next * 0.5 - anchor.beats) * 60) / anchor.bpm
      if (t > horizon) break
      if (t >= now() - 0.03) voice(next, t + offset)
      next++
    }
  }

  return {
    get sound() {
      return sound
    },
    // re-anchor the clock at the new tempo, keeping the beat count continuous
    tempo(rowsPerSecond: number) {
      const bpm = bpmFor(rowsPerSecond)
      if (bpm === anchor.bpm) return
      const t = now()
      anchor = { t, beats: beatsAt(t), bpm }
    },
    play(rowsPerSecond: number) {
      this.tempo(rowsPerSecond)
      running = true
      ensure()
      next = Math.ceil(beatsAt(now()) * 2)
      timer ??= setInterval(schedule, 25)
    },
    pause() {
      running = false
      clearInterval(timer)
      timer = undefined
      if (ctx?.state === 'running') void ctx.suspend()
    },
    setSound(on: boolean) {
      sound = on
      if (on && running) {
        ensure()
        next = Math.ceil(beatsAt(now()) * 2)
      } else if (!on && ctx?.state === 'running') void ctx.suspend()
    },
    // a tap or click: the one moment a browser lets audio start
    wake: ensure,
    // 1 on the beat, falling to 0 within the first third of it; 0 when stopped
    pulse() {
      if (!running) return 0
      const b = beatsAt(now())
      return Math.max(0, 1 - (b - Math.floor(b)) * 3)
    },
    dispose() {
      this.pause()
      void ctx?.close()
      ctx = null
    },
  }
}

export type Music = ReturnType<typeof createMusic>
