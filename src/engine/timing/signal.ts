import type { Signal, TimeResult, TimingProfile, WithinRule } from "../../domain"

/**
 * Signal shown while timing. Thresholds are inclusive at the start: green
 * appears at exactly 5:00.000, not at 4:59.999. Red appears on reaching the
 * red time, or 1 ms after it when the profile says `redAt: "exceed"`.
 * Overtime begins once the grace period after red has passed (strictly later
 * than red + grace), which matches the contest qualification boundary.
 * See docs/TIMING_SPEC.md §3.
 */
export function signalAt(elapsedMs: number, profile: TimingProfile): Signal {
  const s = (seconds: number) => seconds * 1000
  const exceed = profile.redAt === "exceed"
  const pastLimit = elapsedMs > s(profile.red + profile.graceSeconds)
  if (pastLimit && profile.disqualifyEnabled) return "disqualified"
  // With red-on-exceed and no grace, red itself is the last signal; overtime would hide it.
  const overtimeShown = profile.overtime !== "never" && !(exceed && profile.graceSeconds === 0)
  if (pastLimit && overtimeShown) return "overtime"
  if (exceed ? elapsedMs > s(profile.red) : elapsedMs >= s(profile.red)) return "red"
  if (profile.redOnly) return "none"
  if (elapsedMs >= s(profile.amber)) return "amber"
  if (elapsedMs >= s(profile.green)) return "green"
  return "none"
}

/**
 * Result for reports. "strict" is green to red; "grace" widens the window by
 * the grace periods (graceUnderSeconds below green, graceSeconds above red).
 * Contest profiles always use their grace window. Red-only profiles have no
 * minimum. Both window edges count as within time.
 */
export function resultFor(elapsedMs: number, profile: TimingProfile, rule: WithinRule): TimeResult {
  const useGrace = rule === "grace" || profile.disqualifyEnabled
  const over = useGrace ? profile.graceSeconds : 0
  const under = useGrace ? (profile.graceUnderSeconds ?? profile.graceSeconds) : 0
  const min = profile.redOnly ? 0 : Math.max(0, profile.green - under) * 1000
  const max = (profile.red + over) * 1000
  const outcome: TimeResult = elapsedMs < min ? "under" : elapsedMs > max ? "over" : "within"
  return outcome !== "within" && profile.disqualifyEnabled ? "disqualified" : outcome
}

const order: Signal[] = ["none", "green", "amber", "red", "overtime", "disqualified"]
export const signalRank = (signal: Signal) => order.indexOf(signal)
