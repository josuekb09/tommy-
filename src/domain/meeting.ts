import type { TimingProfile } from "./timing"

export type SegmentKind = "opening" | "prepared_speeches" | "table_topics" | "evaluations" | "reports" | "other"

export const agendaRoles = [
  "Toastmaster",
  "GeneralEvaluator",
  "TableTopicsMaster",
  "Speaker",
  "Evaluator",
  "TableTopicsSpeaker",
  "TableTopicsEvaluator",
  "Timer",
  "AhCounter",
  "Grammarian",
  "SergeantAtArms",
  "President",
  "Other",
] as const
export type AgendaRole = (typeof agendaRoles)[number]

export type AgendaItem = {
  id: string
  order: number
  role: AgendaRole
  /** Member id when the person is on the club roster. */
  personId?: string
  personName: string
  speechTitle?: string
  pathwaysProject?: string
  /** For evaluators: the agenda item of the speech being evaluated. */
  evaluatesItemId?: string
  timing: TimingProfile
}

export type Segment = { id: string; kind: SegmentKind; items: AgendaItem[] }

export type MeetingStatus = "draft" | "live" | "finished"

export type Meeting = {
  id: string
  clubId?: string
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  theme?: string
  wordOfTheDay?: string
  segments: Segment[]
  status: MeetingStatus
  createdAt: number
  updatedAt: number
}
