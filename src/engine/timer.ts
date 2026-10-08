import type { Settings, Thresholds, Turn } from "./types"

export type Clock = { now: () => number }
export const systemClock: Clock = { now: () => Date.now() }
export const elapsed = (turn: Turn, clock: Clock = systemClock) => turn.elapsedMs + (turn.status === "running" && turn.startedAt !== undefined ? Math.max(0, clock.now() - turn.startedAt) : 0)
export const start = (turn: Turn, clock: Clock = systemClock): Turn => turn.status === "running" ? turn : { ...turn, status: "running", startedAt: clock.now() }
export const pause = (turn: Turn, clock: Clock = systemClock): Turn => turn.status !== "running" ? turn : { ...turn, status: "paused", elapsedMs: elapsed(turn, clock), startedAt: undefined }
export const stop = (turn: Turn, clock: Clock = systemClock): Turn => ({ ...pause(turn, clock), status: "done" })
export const reset = (turn: Turn): Turn => ({ ...turn, status: "queued", startedAt: undefined, elapsedMs: 0 })
export const addOffset = (turn: Turn, ms: number): Turn => ({ ...turn, elapsedMs: Math.max(0, turn.elapsedMs + ms) })
export const stateAt = (ms: number, thresholds: Thresholds) => {
  const seconds = ms / 1000
  if (thresholds.disqualify && seconds >= thresholds.disqualify) return "disqualified"
  if (seconds >= thresholds.red) return "red"
  if (seconds >= thresholds.yellow) return "yellow"
  if (seconds >= thresholds.green) return "green"
  return "ready"
}
export const crossed = (previousMs: number, currentMs: number, thresholds: Thresholds) => (["green", "yellow", "red"] as const).filter((key) => previousMs < thresholds[key] * 1000 && currentMs >= thresholds[key] * 1000)
export const withinTime = (ms: number, thresholds: Thresholds, settings: Settings) => ms >= Math.max(0, thresholds.green - settings.withinEarly) * 1000 && ms <= (thresholds.red + settings.withinLate) * 1000
export const formatTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`
export const words = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)} minute${Math.floor(s / 60) === 1 ? "" : "s"} ${s % 60} second${s % 60 === 1 ? "" : "s"}` }
