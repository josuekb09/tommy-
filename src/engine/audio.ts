/**
 * Audio alert lifecycle manager for Tommy Timer.
 * - Reuses a single shared AudioContext across state transitions instead of leaking unmanaged instances.
 * - Supports unlocking the AudioContext from a user gesture to adhere to browser autoplay policies.
 * - Degrades gracefully when Web Audio is unsupported, suspended, or blocked.
 */

let sharedAudioContext: AudioContext | undefined

export function getAudioContext(): AudioContext | undefined {
  if (sharedAudioContext) return sharedAudioContext
  if (typeof window === "undefined") return undefined
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return undefined
  try {
    sharedAudioContext = new AudioCtx()
  } catch {
    return undefined
  }
  return sharedAudioContext
}

/**
 * Initializes or resumes the audio context. Call during user gestures (e.g. clicking Start, Resume, or toggling sound).
 */
export function unlockAudio(): void {
  const ctx = getAudioContext()
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined)
  }
}

/**
 * Plays a discrete threshold tone (523Hz / C5 sine with gain decay) if audio is available and enabled.
 * Returns true if tone was scheduled, false otherwise.
 */
export function playThresholdTone(): boolean {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== "running") return false
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(523.25, ctx.currentTime) // C5
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
    return true
  } catch {
    return false
  }
}

/**
 * For testing purposes only: resets the singleton context.
 */
export function _setSharedAudioContextForTesting(ctx?: AudioContext): void {
  sharedAudioContext = ctx
}
