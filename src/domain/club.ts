export type WithinRule = "strict" | "grace"
export type ReportStyle = "exact" | "category"

export type ClubRules = {
  graceSeconds: number
  /** Table Topics has no grace period unless the club opts in. */
  graceAppliesToTableTopics: boolean
  withinRule: WithinRule
  contestMode: boolean
  reportStyle: ReportStyle
}

export type Club = {
  id: string
  name: string
  number?: string
  district?: string
  defaultRules: ClubRules
}

export type Member = { id: string; name: string; aliases: string[] }
export type Guest = { id: string; name: string; addedAt: number }
