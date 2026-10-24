export type WithinRule = "strict" | "grace"
export type ReportStyle = "exact" | "category"
/** printed: use the profile's amber; midpoint: always halfway; beforeRed: a fixed time before red. */
export type AmberRule = "printed" | "midpoint" | "beforeRed"

export type ClubRules = {
  graceEnabled: boolean
  graceSeconds: number
  /** Table Topics has no grace period unless the club opts in. */
  graceAppliesToTableTopics: boolean
  withinRule: WithinRule
  amberRule: AmberRule
  /** Used when amberRule is "beforeRed". */
  amberBeforeRedSeconds: number
  redAt: "reach" | "exceed"
  overtime: "afterGrace" | "never"
  /** Disqualification outside the grace window; names hidden on the speaker display. */
  contestMode: boolean
  reportStyle: ReportStyle
}

export type ProfileCategory = "speech" | "evaluation" | "table_topics" | "role" | "contest" | "custom"

/**
 * A named entry in the club's timing profile library. Seconds. A red-only
 * profile has no green or amber. Contest profiles carry their own grace window
 * and always disqualify outside it, whatever the club rules say.
 */
export type ProfileDefinition = {
  id: string
  name: string
  category: ProfileCategory
  green?: number
  amber?: number
  red: number
  redOnly?: boolean
  contest?: { graceOverSeconds: number; graceUnderSeconds: number }
}

export type Club = {
  id: string
  name: string
  number?: string
  district?: string
  defaultRules: ClubRules
  /** Edited built-in profiles (by id) and custom profiles. */
  profiles?: Record<string, ProfileDefinition>
}

export type Member = { id: string; name: string; aliases: string[] }
export type Guest = { id: string; name: string; addedAt: number }
