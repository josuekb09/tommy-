import type { TimingProfile } from "./timing"

export type SegmentKind = "opening" | "prepared_speeches" | "table_topics" | "evaluations" | "reports" | "other"

export const agendaRoles = [
  "Toastmaster",
  "GeneralEvaluator",
  "TableTopicsMaster",
  "Speaker",
  /** The evaluator's short brief before the speech: same person, separate timed slot. */
  "EvaluatorBrief",
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
  /** A visitor rather than a club member. */
  guest?: boolean
  speechTitle?: string
  pathwaysProject?: string
  /** For evaluators and their briefs: the agenda item of the speech being evaluated. */
  evaluatesItemId?: string
  /** The library profile this item's timing came from, if any. */
  profileId?: string
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
