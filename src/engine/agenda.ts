import type { AgendaItem, Meeting, Segment } from "../domain"
import { roleLabels } from "./profiles"

/** A segment's items in agenda order. */
export const sortedItems = (segment: Segment) => [...segment.items].sort((a, b) => a.order - b.order)

/** Every item in the order the meeting runs: segments as arranged, then each segment's items. */
export const orderedItems = (meeting: Meeting) => meeting.segments.flatMap(sortedItems)

/** The person's name, or the role while a template slot has no one in it yet. */
export const personLabel = (item: AgendaItem) => item.personName.trim() || roleLabels[item.role]

const renumber = (items: AgendaItem[]) => items.map((item, order) => ({ ...item, order }))

/**
 * Who comes after `currentId` in meeting order, among the items still
 * waiting. Wraps to earlier items, so someone skipped is never forgotten.
 */
export function nextInOrder(meeting: Meeting, currentId: string | undefined, waiting: (item: AgendaItem) => boolean): AgendaItem | undefined {
  const items = orderedItems(meeting)
  const index = items.findIndex(item => item.id === currentId)
  return items.slice(index + 1).find(waiting) ?? items.slice(0, Math.max(index, 0)).find(waiting)
}

/** Moves an item to a new position within its segment. */
export function moveItem(meeting: Meeting, itemId: string, toIndex: number): Meeting {
  return {
    ...meeting,
    segments: meeting.segments.map(segment => {
      const items = sortedItems(segment)
      const from = items.findIndex(item => item.id === itemId)
      if (from < 0) return segment
      const [moved] = items.splice(from, 1)
      items.splice(Math.max(0, Math.min(toIndex, items.length)), 0, moved)
      return { ...segment, items: renumber(items) }
    }),
  }
}

/** Moves a whole segment earlier (-1) or later (+1) in the meeting. */
export function moveSegment(meeting: Meeting, segmentId: string, delta: -1 | 1): Meeting {
  const segments = [...meeting.segments]
  const from = segments.findIndex(segment => segment.id === segmentId)
  const to = from + delta
  if (from < 0 || to < 0 || to >= segments.length) return meeting
  ;[segments[from], segments[to]] = [segments[to], segments[from]]
  return { ...meeting, segments }
}

/** Adds an item to a segment, at the end or just before another item (an evaluator's brief goes right before the speech). */
export function insertItem(meeting: Meeting, segmentId: string, item: AgendaItem, beforeItemId?: string): Meeting {
  return {
    ...meeting,
    segments: meeting.segments.map(segment => {
      if (segment.id !== segmentId) return segment
      const items = sortedItems(segment)
      const at = items.findIndex(existing => existing.id === beforeItemId)
      items.splice(at < 0 ? items.length : at, 0, item)
      return { ...segment, items: renumber(items) }
    }),
  }
}

const evaluates = (item: AgendaItem) => item.role === "Evaluator" || item.role === "EvaluatorBrief"

/** The speech an evaluator (or their brief) is linked to, if it is still on the agenda. */
export function evaluatedSpeech(meeting: Meeting, item: AgendaItem): AgendaItem | undefined {
  if (!evaluates(item) || !item.evaluatesItemId) return undefined
  return orderedItems(meeting).find(other => other.id === item.evaluatesItemId && other.role === "Speaker")
}

/** "Evaluating: Ada Lovelace" for evaluators and briefs that are paired. */
export function evaluatingLabel(meeting: Meeting, item: AgendaItem): string | undefined {
  const speech = evaluatedSpeech(meeting, item)
  return speech && `Evaluating: ${personLabel(speech)}`
}

export type AgendaWarning = { itemId: string; message: string }

const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`)

/**
 * Pairing problems worth a look before the meeting. They never block
 * anything: a club may have fewer evaluators than speakers on purpose.
 */
export function agendaWarnings(meeting: Meeting): AgendaWarning[] {
  const items = orderedItems(meeting)
  const warnings: AgendaWarning[] = []
  for (const item of items.filter(evaluates)) {
    if (!evaluatedSpeech(meeting, item))
      warnings.push({ itemId: item.id, message: `${personLabel(item)} (${roleLabels[item.role].toLowerCase()}) is not paired with a speaker.` })
  }
  for (const speech of items.filter(item => item.role === "Speaker")) {
    const evaluators = items.filter(item => item.role === "Evaluator" && item.evaluatesItemId === speech.id)
    if (!evaluators.length) warnings.push({ itemId: speech.id, message: `No evaluator for ${personLabel(speech)}.` })
    if (evaluators.length > 1)
      warnings.push({ itemId: speech.id, message: `${personLabel(speech)} has ${evaluators.length} evaluators: ${listNames(evaluators.map(personLabel))}.` })
    const brief = items.find(item => item.role === "EvaluatorBrief" && item.evaluatesItemId === speech.id)
    if (brief && evaluators.length === 1 && brief.personName.trim() !== evaluators[0].personName.trim())
      warnings.push({
        itemId: brief.id,
        message: `The brief before ${personLabel(speech)}'s speech is by ${personLabel(brief)}, but ${personLabel(evaluators[0])} evaluates it.`,
      })
  }
  return warnings
}

/** "Guest 3": the name a Table Topics participant gets when there is no time to ask. */
export function nextGuestName(meeting: Meeting) {
  const count = meeting.segments.flatMap(segment => segment.items).filter(item => item.role === "TableTopicsSpeaker").length
  return `Guest ${count + 1}`
}
