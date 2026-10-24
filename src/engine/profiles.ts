import type { AgendaRole, ClubRules, ProfileDefinition, SegmentKind, TimingProfile } from "../domain"
import type { ParsedRange } from "./range"

const m = (minutes: number) => minutes * 60
const range = (green: number, amber: number, red: number) => ({ green: m(green), amber: m(amber), red: m(red) })
const contest = (graceUnderSeconds = 30) => ({ contest: { graceOverSeconds: 30, graceUnderSeconds } })

/** Toastmasters defaults. Clubs can edit any of them; edits are stored on the club by id. */
export const builtInProfiles: ProfileDefinition[] = [
  { id: "speech", name: "Prepared speech", category: "speech", ...range(5, 6, 7) },
  { id: "ice_breaker", name: "Ice Breaker", category: "speech", ...range(4, 5, 6) },
  { id: "speech_8_10", name: "Speech 8 to 10 min", category: "speech", ...range(8, 9, 10) },
  { id: "speech_10_12", name: "Speech 10 to 12 min", category: "speech", ...range(10, 11, 12) },
  { id: "speech_13_15", name: "Speech 13 to 15 min", category: "speech", ...range(13, 14, 15) },
  { id: "speech_18_22", name: "Speech 18 to 22 min", category: "speech", ...range(18, 20, 22) },
  { id: "educational", name: "Educational", category: "speech", ...range(10, 15, 20) },
  { id: "evaluation", name: "Evaluation", category: "evaluation", ...range(2, 2.5, 3) },
  { id: "evaluator_brief", name: "Evaluator brief", category: "evaluation", red: m(1), redOnly: true },
  { id: "table_topics_evaluation", name: "Table Topics evaluation", category: "evaluation", ...range(2, 2.5, 3) },
  { id: "general_evaluator", name: "General Evaluator", category: "evaluation", ...range(5, 6, 7) },
  { id: "table_topics", name: "Table Topics", category: "table_topics", ...range(1, 1.5, 2) },
  { id: "toastmaster_intro", name: "Toastmaster introduction", category: "role", ...range(1, 1.5, 2) },
  { id: "timer_report", name: "Timer report", category: "role", red: m(2), redOnly: true },
  { id: "ah_counter_report", name: "Ah-Counter report", category: "role", red: m(2), redOnly: true },
  { id: "grammarian_report", name: "Grammarian report", category: "role", red: m(2), redOnly: true },
  { id: "role_report", name: "Other role report", category: "role", red: m(2), redOnly: true },
  // Contest rules: under the minimum − 30 s or over the maximum + 30 s is disqualified.
  // Table Topics contests qualify from 1:00 to 2:30, so there is no grace under the minimum.
  { id: "contest_international", name: "Contest: International Speech", category: "contest", ...range(5, 6, 7), ...contest() },
  { id: "contest_humorous", name: "Contest: Humorous Speech", category: "contest", ...range(5, 6, 7), ...contest() },
  { id: "contest_evaluation", name: "Contest: Evaluation", category: "contest", ...range(2, 2.5, 3), ...contest() },
  { id: "contest_table_topics", name: "Contest: Table Topics", category: "contest", ...range(1, 1.5, 2), ...contest(0) },
  { id: "contest_tall_tales", name: "Contest: Tall Tales", category: "contest", ...range(3, 4, 5), ...contest() },
]

export const defaultRules: ClubRules = {
  graceEnabled: true,
  graceSeconds: 30,
  graceAppliesToTableTopics: false,
  withinRule: "grace",
  amberRule: "printed",
  amberBeforeRedSeconds: 60,
  redAt: "reach",
  overtime: "afterGrace",
  contestMode: false,
  reportStyle: "exact",
}

/** Club rules with defaults filled in for anything a club saved before the rule existed. */
export const rulesOf = (club?: { defaultRules?: Partial<ClubRules> }): ClubRules => ({ ...defaultRules, ...club?.defaultRules })

/** Built-ins with the club's edits applied, followed by the club's custom profiles. */
export function profileLibrary(clubProfiles: Record<string, ProfileDefinition> = {}): ProfileDefinition[] {
  const builtIns = builtInProfiles.map(profile => clubProfiles[profile.id] ?? profile)
  const custom = Object.values(clubProfiles).filter(profile => !builtInProfiles.some(builtIn => builtIn.id === profile.id))
  return [...builtIns, ...custom]
}

export const defaultProfileIdForRole = (role: AgendaRole): string => {
  switch (role) {
    case "Speaker":
      return "speech"
    case "Evaluator":
      return "evaluation"
    case "EvaluatorBrief":
      return "evaluator_brief"
    case "TableTopicsSpeaker":
      return "table_topics"
    case "TableTopicsEvaluator":
      return "table_topics_evaluation"
    case "GeneralEvaluator":
      return "general_evaluator"
    case "Toastmaster":
      return "toastmaster_intro"
    case "Timer":
      return "timer_report"
    case "AhCounter":
      return "ah_counter_report"
    case "Grammarian":
      return "grammarian_report"
    default:
      return "role_report"
  }
}

const midpoint = (green: number, red: number) => Math.floor((green + red) / 2)

/**
 * Turns a library entry into the profile the engine times with, applying the
 * club's rules: grace (off, length, Table Topics exception), the amber rule,
 * red on reaching or exceeding, overtime behaviour and contest mode. Contest
 * profiles keep their own grace window and always disqualify outside it.
 */
export function resolveProfile(definition: ProfileDefinition, rules: ClubRules, isTableTopics = definition.category === "table_topics"): TimingProfile {
  const { red } = definition
  const green = definition.redOnly ? red : (definition.green ?? red)
  const amber = definition.redOnly
    ? red
    : rules.amberRule === "midpoint"
      ? midpoint(green, red)
      : rules.amberRule === "beforeRed"
        ? Math.max(green, red - rules.amberBeforeRedSeconds)
        : (definition.amber ?? midpoint(green, red))
  const behaviour = {
    ...(definition.redOnly && { redOnly: true as const }),
    ...(rules.redAt === "exceed" && { redAt: "exceed" as const }),
    ...(rules.overtime === "never" && { overtime: "never" as const }),
  }
  if (definition.contest) {
    const { graceOverSeconds, graceUnderSeconds } = definition.contest
    return {
      green,
      amber,
      red,
      graceSeconds: graceOverSeconds,
      disqualifyEnabled: true,
      ...(graceUnderSeconds !== graceOverSeconds && { graceUnderSeconds }),
      ...behaviour,
    }
  }
  const grace = !rules.graceEnabled || (isTableTopics && !rules.graceAppliesToTableTopics) ? 0 : rules.graceSeconds
  return { green, amber, red, graceSeconds: grace, disqualifyEnabled: rules.contestMode, ...behaviour }
}

/** The profile for a role (or an explicit library entry), resolved with the club's rules. */
export function profileFor(
  role: AgendaRole,
  rules: ClubRules,
  clubProfiles: Record<string, ProfileDefinition> = {},
  profileId = defaultProfileIdForRole(role),
): TimingProfile {
  const library = profileLibrary(clubProfiles)
  const definition = library.find(profile => profile.id === profileId) ?? library.find(profile => profile.id === defaultProfileIdForRole(role))!
  return resolveProfile(definition, rules, role === "TableTopicsSpeaker")
}

/** A library entry for a range typed by the Timer or read from an agenda. */
export function definitionFromRange(parsed: ParsedRange, name: string, id = "typed"): ProfileDefinition {
  return parsed.redOnly
    ? { id, name, category: "custom", red: parsed.red, redOnly: true }
    : { id, name, category: "custom", green: parsed.green, amber: parsed.amber, red: parsed.red }
}

/** The definition an existing agenda item was made from, so new club rules can be re-applied to it. */
export function definitionOf(timing: TimingProfile, profileId: string | undefined, clubProfiles: Record<string, ProfileDefinition> = {}): ProfileDefinition {
  const fromLibrary = profileId ? profileLibrary(clubProfiles).find(profile => profile.id === profileId) : undefined
  if (fromLibrary) return fromLibrary
  return timing.redOnly
    ? { id: "item", name: "Item", category: "custom", red: timing.red, redOnly: true }
    : { id: "item", name: "Item", category: "custom", green: timing.green, amber: timing.amber, red: timing.red }
}

/** "5:00 to 7:00", or "up to 2:00" for a red-only limit. */
export const rangeLabel = (profile: Pick<TimingProfile, "green" | "red" | "redOnly">) =>
  profile.redOnly ? `up to ${formatClock(profile.red * 1000)}` : `${formatClock(profile.green * 1000)} to ${formatClock(profile.red * 1000)}`

export const segmentForRole = (role: AgendaRole): SegmentKind => {
  switch (role) {
    case "Speaker":
    case "EvaluatorBrief":
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
  EvaluatorBrief: "Evaluator brief",
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

/** What is being timed, for headings such as "Speech 5:00 to 7:00". */
export const activityLabel = (role: AgendaRole) =>
  role === "Speaker" ? "Speech" : role === "Evaluator" ? "Evaluation" : role === "TableTopicsSpeaker" ? "Table Topics" : roleLabels[role]

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
