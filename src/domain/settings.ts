import type { Segment } from "./meeting"
import type { TimingProfile } from "./timing"

export type Theme = "system" | "light" | "dark"

/** Per-device preferences. Club-wide rules live on the Club. */
export type AppSettings = {
  sound: boolean
  vibration: boolean
  /** Quick mute on the Timer screen: no sound or vibration, preferences kept. */
  silent: boolean
  /** Show the pattern/icon cue next to every signal. */
  signalPatterns: boolean
  theme: Theme
  /** Club overrides of the built-in profiles, keyed by profile id. */
  profileOverrides: Record<string, TimingProfile>
  currentMeetingId?: string
  currentClubId?: string
}

export type Template = {
  id: string
  clubId?: string
  name: string
  /** A meeting's segments with people removed. */
  segments: Segment[]
}
