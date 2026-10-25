import type { AgendaItem, AgendaRole, ClubRules, Meeting, ReportStyle, TimeEdit, TimedRecord, TimeResult } from "../../domain"
import { personLabel, timedItems } from "../agenda"
import { formatClock, rangeLabel, roleLabels } from "../profiles"
import { qualifyingWindow, resultFor, stateOf } from "../timing"

export type ReportGroupKey = "prepared_speeches" | "evaluations" | "table_topics" | "other"
export type AwardCategory = "speaker" | "table_topics" | "evaluator"
/** A result, or why there is none: never timed (or skipped, or reset), or the timer is still going. */
export type LineStatus = TimeResult | "not_timed" | "in_progress"

export type ReportLine = {
  itemId: string
  group: ReportGroupKey
  name: string
  role: AgendaRole
  roleLabel: string
  guest: boolean
  /** Only for a stopped timer. */
  elapsedMs?: number
  /** "6:12", or undefined when there is no recorded time (shown as "Not timed", never 0:00). */
  time?: string
  range: string
  status: LineStatus
  statusLabel: string
  /** Why the time is outside the window, in words, e.g. "Over time: 7:45 is over the 7:30 limit (7:00 plus 30 seconds grace)." */
  reason?: string
  /** The latest manual edit, with its reason. */
  edit?: TimeEdit
  /** Set for the roles that compete for a club award. */
  award?: { category: AwardCategory; eligible: boolean; reason?: string }
}

export type ReportGroup = { key: ReportGroupKey; label: string; lines: ReportLine[] }
export type AwardSummary = { category: AwardCategory; label: string; eligible: ReportLine[]; notEligible: ReportLine[] }
export type Report = { style: ReportStyle; groups: ReportGroup[]; awards: AwardSummary[] }

export const resultLabels: Record<TimeResult, string> = { under: "Under time", within: "Within time", over: "Over time", disqualified: "Disqualified" }
export const statusLabels: Record<LineStatus, string> = { ...resultLabels, not_timed: "Not timed", in_progress: "Still timing" }

export const groupLabels: Record<ReportGroupKey, string> = {
  prepared_speeches: "Prepared speeches",
  evaluations: "Evaluations",
  table_topics: "Table Topics",
  other: "Other",
}
const groupOrder: ReportGroupKey[] = ["prepared_speeches", "evaluations", "table_topics", "other"]

export const awardLabels: Record<AwardCategory, string> = { speaker: "Best Speaker", table_topics: "Best Table Topics", evaluator: "Best Evaluator" }

/** Report sections follow the Timer's log: what was timed, not where it sat on the agenda. */
export function groupOf(role: AgendaRole): ReportGroupKey {
  switch (role) {
    case "Speaker":
      return "prepared_speeches"
    case "Evaluator":
    case "EvaluatorBrief":
    case "GeneralEvaluator":
    case "TableTopicsEvaluator":
      return "evaluations"
    case "TableTopicsSpeaker":
      return "table_topics"
    default:
      return "other"
  }
}

const awardFor = (role: AgendaRole): AwardCategory | undefined =>
  role === "Speaker" ? "speaker" : role === "TableTopicsSpeaker" ? "table_topics" : role === "Evaluator" ? "evaluator" : undefined

const graceNote = (base: number, seconds: number, word: "plus" | "less") => (seconds ? ` (${formatClock(base * 1000)} ${word} ${seconds} seconds grace)` : "")

/** Why a time is not within the window, in words. Uses the same window as the result. */
export function outsideReason(elapsedMs: number, item: Pick<AgendaItem, "timing">, rules: Pick<ClubRules, "withinRule">): string | undefined {
  const result = resultFor(elapsedMs, item.timing, rules.withinRule)
  if (result === "within") return undefined
  const window = qualifyingWindow(item.timing, rules.withinRule)
  const time = formatClock(elapsedMs)
  const detail =
    elapsedMs < window.minMs
      ? `${time} is under the ${formatClock(window.minMs)} minimum${graceNote(item.timing.green, window.graceUnderSeconds, "less")}`
      : `${time} is over the ${formatClock(window.maxMs)} limit${graceNote(item.timing.red, window.graceOverSeconds, "plus")}`
  const lead = result === "disqualified" ? "Disqualified for time" : result === "under" ? "Under time" : "Over time"
  return `${lead}: ${detail}.`
}

function lineFor(item: AgendaItem, record: TimedRecord | undefined, rules: Pick<ClubRules, "withinRule" | "tableTopicsGuestsEligible">): ReportLine {
  const status = stateOf(record?.actions ?? []).status
  const base = {
    itemId: item.id,
    group: groupOf(item.role),
    name: personLabel(item),
    role: item.role,
    roleLabel: roleLabels[item.role],
    guest: !!item.guest,
    range: rangeLabel(item.timing),
    ...(record?.edits.length ? { edit: record.edits.at(-1) } : {}),
  }
  const category = awardFor(item.role)
  if (status !== "stopped" || !record) {
    const lineStatus: LineStatus = status === "running" || status === "paused" ? "in_progress" : "not_timed"
    return {
      ...base,
      status: lineStatus,
      statusLabel: statusLabels[lineStatus],
      ...(category && { award: { category, eligible: false, reason: lineStatus === "in_progress" ? "Still timing." : "Not timed." } }),
    }
  }
  const result = resultFor(record.elapsedMs, item.timing, rules.withinRule)
  const reason = outsideReason(record.elapsedMs, item, rules)
  const guestExcluded = category === "table_topics" && item.guest && !rules.tableTopicsGuestsEligible
  return {
    ...base,
    elapsedMs: record.elapsedMs,
    time: formatClock(record.elapsedMs),
    status: result,
    statusLabel: resultLabels[result],
    ...(reason && { reason }),
    ...(category && {
      award: reason
        ? { category, eligible: false, reason }
        : guestExcluded
          ? { category, eligible: false, reason: "Guest: this club's Table Topics award is for members only." }
          : { category, eligible: true },
    }),
  }
}

/**
 * The Timer's report for any meeting: every agenda item, grouped as in a
 * Timer's log, in agenda order. Items without a recorded time say so and are
 * never shown as 0:00. Award eligibility follows the result: only a time
 * within the window (grace included, as the club rules say) is eligible.
 */
export function buildReport(
  meeting: Meeting,
  records: TimedRecord[],
  rules: Pick<ClubRules, "withinRule" | "reportStyle" | "tableTopicsGuestsEligible">,
): Report {
  const byItem = new Map(records.map(record => [record.agendaItemId, record]))
  const lines = timedItems(meeting).map(item => lineFor(item, byItem.get(item.id), rules))
  const groups = groupOrder.map(key => ({ key, label: groupLabels[key], lines: lines.filter(line => line.group === key) })).filter(group => group.lines.length)
  const awards = (Object.keys(awardLabels) as AwardCategory[])
    .map(category => {
      const competing = lines.filter(line => line.award?.category === category)
      return {
        category,
        label: awardLabels[category],
        eligible: competing.filter(line => line.award!.eligible),
        notEligible: competing.filter(line => !line.award!.eligible),
      }
    })
    .filter(summary => summary.eligible.length + summary.notEligible.length > 0)
  return { style: rules.reportStyle, groups, awards }
}

/** The time as the club wants it reported: exact, or only the category. Never "0:00" for a missing time. */
export const shownTime = (line: ReportLine, style: ReportStyle) => (line.time === undefined ? undefined : style === "exact" ? line.time : undefined)
