import type { AgendaRole } from "../../domain"
import { normalizeName } from "../people"

/** What a printed role means. `agendaOnly` lines (arrivals, break, social) are never timed and have no person. */
export type RoleReading = {
  roles: AgendaRole[]
  /** 1 for "1st Evaluator", "Evaluator 1" or "Speaker #1". */
  ordinal?: number
  /** "Timekeepers Report", "Grammarian Feedback": a role report rather than the role's introduction. */
  report: boolean
  agendaOnly: boolean
  /** A printed heading for the segment the line opens, e.g. "Educational", "Break". */
  title?: string
}

/**
 * Printed role names, most specific first. Every pattern runs against the
 * role text with case, accents and punctuation removed, so "Um, Er Counter"
 * is "um er counter" and "Timekeeper's Report" is "timekeeper s report".
 */
const synonyms: [RegExp, AgendaRole][] = [
  [/\btable topics? master\b|\bttm\b|\btopics master\b/, "TableTopicsMaster"],
  [/\btable topics? evaluator\b/, "TableTopicsEvaluator"],
  [/\btable topics? speakers?\b/, "TableTopicsSpeaker"],
  [/\bgeneral evaluator\b|\bge\b/, "GeneralEvaluator"],
  [/\bsergeant at arms\b|\bsergeant\b|\bsaa\b/, "SergeantAtArms"],
  [/\bpresident\b/, "President"],
  [/\btimekeepers?\b|\btime keepers?\b|\btimers?\b/, "Timer"],
  [/\b(?:um|ah|er|uh)(?: (?:um|ah|er|uh))* counter\b|\bfiller word counter\b/, "AhCounter"],
  [/\bgrammarian\b/, "Grammarian"],
  [/\btoastmaster\b|\btmod\b|\btme\b|\brole player reports\b/, "Toastmaster"],
  [/\bevaluators?\b|\bevaluation reports?\b|\bevaluations?\b/, "Evaluator"],
  [/\bspeakers?\b|\bprepared speech(?:es)?\b/, "Speaker"],
]

const agendaOnly = /^(?:arrivals?|break|interval|tea break|social(?: gathering)?|networking|end of (?:evening|meeting)|30 min break)\b/
const ordinalWords: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 }

function ordinalOf(text: string): number | undefined {
  const numeric = text.match(/\b(\d+)(?:st|nd|rd|th)\b/) ?? text.match(/\b(?:speaker|evaluator|speech)\s*#?\s*(\d+)\b/)
  if (numeric) return Number(numeric[1])
  const word = text.match(/\b(first|second|third|fourth|fifth|sixth)\b/)
  return word ? ordinalWords[word[1]] : undefined
}

/**
 * Reads a printed role. One line can hold several roles ("Grammarian/Ah
 * Counter"): each part separated by "/", "&" or "and" is read on its own.
 * Unknown text becomes "Other" with the printed words as the title.
 */
export function readRole(printed: string): RoleReading {
  const text = normalizeName(printed)
  const report = /\breports?\b|\bfeedback\b/.test(text)
  if (!text) return { roles: ["Other"], report: false, agendaOnly: false }
  if (agendaOnly.test(text)) return { roles: ["Other"], report: false, agendaOnly: true, title: printed.trim() }
  const parts = printed
    .split(/\/|&|\band\b/i)
    .map(normalizeName)
    .filter(Boolean)
  const roles: AgendaRole[] = []
  for (const part of parts) {
    const match = synonyms.find(([pattern]) => pattern.test(part))
    if (match && !roles.includes(match[1])) roles.push(match[1])
  }
  if (!roles.length) return { roles: ["Other"], report, agendaOnly: false, title: printed.trim() }
  return { roles, report, agendaOnly: false, ...(ordinalOf(text) !== undefined && { ordinal: ordinalOf(text) }) }
}
