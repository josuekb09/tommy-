import type { AgendaRole, ClubRules, SegmentKind, TimingProfile } from "../domain"

export type ProfileId = "table_topics" | "ice_breaker" | "speech" | "evaluation" | "report"
export type ProfileTimes = Pick<TimingProfile, "green" | "amber" | "red">

export const builtInProfiles: Record<ProfileId, { name: string } & ProfileTimes> = {
  table_topics: { name: "Table Topics", green: 60, amber: 90, red: 120 },
  ice_breaker: { name: "Ice Breaker", green: 240, amber: 300, red: 360 },
  speech: { name: "Standard speech", green: 300, amber: 360, red: 420 },
  evaluation: { name: "Evaluation", green: 120, amber: 150, red: 180 },
  report: { name: "Role report", green: 60, amber: 90, red: 120 },
}

export const defaultRules: ClubRules = {
  graceSeconds: 30,
  graceAppliesToTableTopics: false,
  withinRule: "grace",
  contestMode: false,
  reportStyle: "exact",
}

export const segmentForRole = (role: AgendaRole): SegmentKind => {
  switch (role) {
    case "Speaker":
      return "prepared_speeches"
    case "Evaluator":
    case "GeneralEvaluator":
      return "evaluations"
    case "TableTopicsSpeaker":
    case "TableTopicsEvaluator":
    case "TableTopicsMaster":
      return "table_topics"
    case "Timer":
    case "AhCounter":
    case "Grammarian":
      return "reports"
    case "Toastmaster":
    case "SergeantAtArms":
    case "President":
      return "opening"
    case "Other":
      return "other"
  }
}

export const defaultProfileIdForRole = (role: AgendaRole): ProfileId =>
  role === "Speaker" ? "speech" : role === "Evaluator" ? "evaluation" : role === "TableTopicsSpeaker" ? "table_topics" : "report"

/** Expands stored times into a full profile using the club's rules. */
export function makeProfile(times: ProfileTimes, rules: ClubRules, role: AgendaRole): TimingProfile {
  const isTableTopics = role === "TableTopicsSpeaker"
  return {
    green: times.green,
    amber: times.amber,
    red: times.red,
    graceSeconds: isTableTopics && !rules.graceAppliesToTableTopics ? 0 : rules.graceSeconds,
    disqualifyEnabled: rules.contestMode,
  }
}

export function profileFor(
  role: AgendaRole,
  rules: ClubRules,
  overrides: Partial<Record<string, ProfileTimes>> = {},
  profileId = defaultProfileIdForRole(role),
): TimingProfile {
  return makeProfile(overrides[profileId] ?? builtInProfiles[profileId as ProfileId] ?? builtInProfiles.report, rules, role)
}

export const segmentLabels: Record<SegmentKind, string> = {
  opening: "Opening",
  prepared_speeches: "Prepared speeches",
  table_topics: "Table Topics",
  evaluations: "Evaluations",
  reports: "Reports",
  other: "Other",
}

export const roleLabels: Record<AgendaRole, string> = {
  Toastmaster: "Toastmaster",
  GeneralEvaluator: "General Evaluator",
  TableTopicsMaster: "Table Topics Master",
  Speaker: "Speaker",
  Evaluator: "Evaluator",
  TableTopicsSpeaker: "Table Topics speaker",
  TableTopicsEvaluator: "Table Topics evaluator",
  Timer: "Timer",
  AhCounter: "Ah-Counter",
  Grammarian: "Grammarian",
  SergeantAtArms: "Sergeant at Arms",
  President: "President",
  Other: "Other",
}

export const formatClock = (ms: number) => {
  const total = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** Parses "m:ss" or plain seconds into milliseconds. Empty or invalid input returns undefined. */
export function parseClock(text: string): number | undefined {
  const value = text.trim()
  const parts = value.split(":")
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) {
    const seconds = Number(parts[1])
    return seconds < 60 ? (Number(parts[0]) * 60 + seconds) * 1000 : undefined
  }
  return /^\d+$/.test(value) ? Number(value) * 1000 : undefined
}
