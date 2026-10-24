import type { AgendaItem, AgendaRole, ClubRules, Meeting, ProfileDefinition, Segment, SegmentKind, Template } from "../domain"
import { sortedItems } from "./agenda"
import { defaultProfileIdForRole, defaultRules, definitionFromRange, definitionOf, profileFor, resolveProfile } from "./profiles"
import { profileFromRange } from "./range"

export const segmentKinds: SegmentKind[] = ["opening", "prepared_speeches", "table_topics", "evaluations", "reports", "other"]

/** One slot of a built-in template: a library profile, or the time the club's agenda prints. */
type Slot = { key?: string; role: AgendaRole; profileId?: string; printed?: string; title?: string; evaluates?: string }

function builtIn(id: string, name: string, layout: [SegmentKind, Slot[]][]): Template {
  const segments: Segment[] = layout.map(([kind, slots]) => ({
    id: `${id}:${kind}`,
    kind,
    items: slots.map((slot, order) => {
      const parsed = slot.printed ? profileFromRange(slot.printed).profile : null
      if (slot.printed && !parsed) throw new Error(`Template ${id}: cannot read "${slot.printed}"`)
      const isTableTopics = slot.role === "TableTopicsSpeaker"
      return {
        id: `${id}:${slot.key ?? `${kind}-${order}`}`,
        order,
        role: slot.role,
        personName: "",
        ...(slot.title && { speechTitle: slot.title }),
        ...(slot.evaluates && { evaluatesItemId: `${id}:${slot.evaluates}` }),
        ...(!parsed && { profileId: slot.profileId ?? defaultProfileIdForRole(slot.role) }),
        timing: parsed
          ? resolveProfile(definitionFromRange(parsed, slot.printed!), defaultRules, isTableTopics)
          : profileFor(slot.role, defaultRules, {}, slot.profileId),
      }
    }),
  }))
  return { id, name, segments: withAllSegments(segments, id) }
}

const speech = (key: string, profileId = "speech"): Slot => ({ key, role: "Speaker", profileId })
const brief = (speechKey: string, printed = "1:00"): Slot => ({ role: "EvaluatorBrief", printed, evaluates: speechKey })
const evaluation = (speechKey: string): Slot => ({ role: "Evaluator", profileId: "evaluation", evaluates: speechKey })

/**
 * Roles and timings of the formats Tommy's clubs use, never names. Table
 * Topics speakers are added live during the meeting, so that segment starts
 * empty. Timings marked `printed` are what the club's agenda prints.
 */
export const builtInTemplates: Template[] = [
  builtIn("builtin-toasted", "ToastED", [
    ["opening", [{ role: "President", printed: "2:00" }]],
    ["prepared_speeches", [brief("s1"), speech("s1", "ice_breaker"), brief("s2"), speech("s2"), brief("s3"), speech("s3")]],
    ["other", [{ role: "Other", printed: "15:00", title: "Educational" }]],
    ["table_topics", []],
    ["evaluations", [evaluation("s1"), evaluation("s2"), evaluation("s3"), { role: "GeneralEvaluator", printed: "5:00" }]],
    [
      "reports",
      [
        { role: "Timer", printed: "1:00" },
        { role: "AhCounter", printed: "1:00" },
        { role: "Grammarian", printed: "1:00" },
      ],
    ],
  ]),
  builtIn("builtin-cape-town", "Cape Town", [
    ["opening", []],
    ["prepared_speeches", [speech("s1", "ice_breaker"), speech("s2"), speech("s3"), speech("s4")]],
    ["evaluations", [evaluation("s1"), evaluation("s2"), evaluation("s3"), evaluation("s4"), { role: "GeneralEvaluator" }]],
    ["table_topics", []],
    ["reports", [{ role: "Timer" }, { role: "AhCounter" }, { role: "Grammarian" }]],
  ]),
  builtIn("builtin-pinelands", "Pinelands", [
    ["opening", [{ role: "Toastmaster" }]],
    ["table_topics", []],
    ["prepared_speeches", [speech("s1"), speech("s2"), speech("s3")]],
    ["evaluations", [evaluation("s1"), evaluation("s2"), evaluation("s3"), { role: "GeneralEvaluator" }]],
    ["reports", [{ role: "Timer" }, { role: "AhCounter" }, { role: "Grammarian" }]],
  ]),
]

/** Adds any missing segment kinds at the end, so every meeting has every segment. */
function withAllSegments(segments: Segment[], idPrefix: string, ids?: () => string): Segment[] {
  const missing = segmentKinds.filter(kind => !segments.some(segment => segment.kind === kind))
  return [...segments, ...missing.map(kind => ({ id: ids ? ids() : `${idPrefix}:${kind}`, kind, items: [] }))]
}

/**
 * A template from a meeting: the order, roles, timings and evaluator
 * pairings, with every name, title and project removed. Table Topics
 * speakers are chosen live, so they are left out.
 */
export function templateFromMeeting(meeting: Meeting, name: string, id: string): Template {
  return {
    id,
    ...(meeting.clubId && { clubId: meeting.clubId }),
    name,
    segments: meeting.segments.map(segment => ({
      ...segment,
      items: sortedItems(segment)
        .filter(item => item.role !== "TableTopicsSpeaker")
        .map((item, order): AgendaItem => ({
          id: item.id,
          order,
          role: item.role,
          personName: "",
          ...(item.evaluatesItemId && { evaluatesItemId: item.evaluatesItemId }),
          ...(item.profileId && { profileId: item.profileId }),
          timing: item.timing,
        })),
    })),
  }
}

/**
 * The segments of a new meeting made from a template, with fresh ids
 * (pairings follow them) and every timing resolved with the club's current
 * rules and profile library.
 */
export function segmentsFromTemplate(template: Template, ids: () => string, rules: ClubRules, clubProfiles: Record<string, ProfileDefinition> = {}): Segment[] {
  const newIds = new Map(template.segments.flatMap(segment => segment.items.map(item => [item.id, ids()] as const)))
  const segments = template.segments.map(segment => ({
    id: ids(),
    kind: segment.kind,
    items: sortedItems(segment).map((item, order) => {
      const { evaluatesItemId, ...rest } = item
      const pairedWith = evaluatesItemId && newIds.get(evaluatesItemId)
      return {
        ...rest,
        id: newIds.get(item.id)!,
        order,
        ...(pairedWith && { evaluatesItemId: pairedWith }),
        timing: resolveProfile(definitionOf(item.timing, item.profileId, clubProfiles), rules, item.role === "TableTopicsSpeaker"),
      }
    }),
  }))
  return withAllSegments(segments, "", ids)
}
