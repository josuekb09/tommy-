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
  /** An agenda line the Timer does not time (an intro with no time printed, a break): shown, never timed or reported. */
  timed?: false
  /** The role exactly as the printed agenda says it, e.g. "Um, Er Counter". */
  roleAsWritten?: string
  /** More roles held in the same slot, e.g. "Grammarian/Ah Counter" is one item for one person. */
  extraRoles?: AgendaRole[]
  /** What happens in the slot, as printed, e.g. "Introduce 1st evaluator". */
  event?: string
  /** Planned start time from the agenda, "18:57". */
  plannedStart?: string
  /** A short note kept from the agenda, e.g. a home-club tag "(CT TM)". */
  note?: string
}

/** Whether the Timer times this item. */
export const isTimed = (item: Pick<AgendaItem, "timed">) => item.timed !== false

/**
 * A block of the agenda. A kind can appear more than once (a meeting with a
 * Timer's report after the speeches and another after Table Topics), so the
 * agenda keeps its printed order.
 */
export type Segment = {
  id: string
  kind: SegmentKind
  items: AgendaItem[]
  /** Heading shown instead of the kind's label, e.g. "Closing". */
  title?: string
  /** Table Topics: the timing for each participant added during the meeting. */
  participantTiming?: TimingProfile
}

export type MeetingStatus = "draft" | "live" | "finished"

export type Meeting = {
  id: string
  clubId?: string
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  theme?: string
  wordOfTheDay?: string
  venue?: string
  /** Planned start, "18:15". */
  startTime?: string
  segments: Segment[]
  status: MeetingStatus
  createdAt: number
  updatedAt: number
}
