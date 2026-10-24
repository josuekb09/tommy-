import type { Segment } from "./meeting"

export type Theme = "system" | "light" | "dark"

/** Per-device preferences. Club-wide rules live on the Club. */
export type AppSettings = {
  sound: boolean
  vibration: boolean
  /** Quick mute on the Timer screen: no sound or vibration, preferences kept. */
  silent: boolean
  /** Show the elapsed time on the speaker view; many clubs show only the colour. */
  speakerClock: boolean
  /** Show the pattern/icon cue next to every signal. */
  signalPatterns: boolean
  theme: Theme
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
