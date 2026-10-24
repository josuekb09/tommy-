import type { Signal, TimeResult, TimingProfile, WithinRule } from "../../domain"

/**
 * Signal shown while timing. Thresholds are inclusive at the start: green
 * appears at exactly 5:00.000, not at 4:59.999. Overtime begins once the
 * grace period after red has passed (strictly later than red + grace), which
 * matches the contest qualification boundary.
 */
export function signalAt(elapsedMs: number, profile: TimingProfile): Signal {
  const s = (seconds: number) => seconds * 1000
  if (elapsedMs > s(profile.red + profile.graceSeconds)) return profile.disqualifyEnabled ? "disqualified" : "overtime"
  if (elapsedMs >= s(profile.red)) return "red"
  if (elapsedMs >= s(profile.amber)) return "amber"
  if (elapsedMs >= s(profile.green)) return "green"
  return "none"
}

/**
 * Result for reports. "strict" is green to red; "grace" widens the window by
 * the profile's grace period on both sides (Toastmasters contest rule). Both
 * window edges count as within time.
 */
export function resultFor(elapsedMs: number, profile: TimingProfile, rule: WithinRule): TimeResult {
  const grace = rule === "grace" ? profile.graceSeconds : 0
  const min = Math.max(0, profile.green - grace) * 1000
  const max = (profile.red + grace) * 1000
  const outcome: TimeResult = elapsedMs < min ? "under" : elapsedMs > max ? "over" : "within"
  return outcome !== "within" && profile.disqualifyEnabled ? "disqualified" : outcome
}

const order: Signal[] = ["none", "green", "amber", "red", "overtime", "disqualified"]
export const signalRank = (signal: Signal) => order.indexOf(signal)
