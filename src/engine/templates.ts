import type { AgendaItem, AgendaRole, ClubRules, Meeting, ProfileDefinition, Segment, SegmentKind, Template } from "../domain"
import { sortedItems } from "./agenda"
import { defaultProfileIdForRole, defaultRules, definitionFromRange, definitionOf, profileFor, resolveProfile } from "./profiles"
import { profileFromRange } from "./range"

export const segmentKinds: SegmentKind[] = ["opening", "prepared_speeches", "table_topics", "evaluations", "reports", "other"]

/**
 * One slot of a built-in template: a library profile, or the time the club's
 * agenda prints. `untimed` is a role the agenda lists with no time: shown, never timed.
 */
type Slot = {
  key?: string
  role: AgendaRole
  profileId?: string
  printed?: string
  title?: string
  evaluates?: string
  extraRoles?: AgendaRole[]
  untimed?: true
}
type Block = [SegmentKind, Slot[], title?: string]

function builtIn(id: string, name: string, layout: Block[]): Template {
  const segments: Segment[] = layout.map(([kind, slots, title]) => {
    const segmentId = `${id}:${kind}${title ? `-${title.toLowerCase().replace(/W+/g, "-")}` : ""}`
    return {
      id: segmentId,
      kind,
      ...(title && { title }),
      items: slots.map((slot, order) => {
        const parsed = slot.printed ? profileFromRange(slot.printed).profile : null
        if (slot.printed && !parsed) throw new Error(`Template ${id}: cannot read "${slot.printed}"`)
        const isTableTopics = slot.role === "TableTopicsSpeaker"
        return {
          id: slot.key ? `${id}:${slot.key}` : `${segmentId}-${order}`,
          order,
          role: slot.role,
          personName: "",
          ...(slot.title && { speechTitle: slot.title }),
          ...(slot.evaluates && { evaluatesItemId: `${id}:${slot.evaluates}` }),
          ...(slot.extraRoles && { extraRoles: slot.extraRoles }),
          ...(slot.untimed && { timed: false as const }),
          ...(!parsed && { profileId: slot.profileId ?? defaultProfileIdForRole(slot.role) }),
          timing: parsed
            ? resolveProfile(definitionFromRange(parsed, slot.printed!), defaultRules, isTableTopics)
            : profileFor(slot.role, defaultRules, {}, slot.profileId),
        }
      }),
    }
  })
  return { id, name, segments: withAllSegments(segments, id) }
}

const speech = (key: string, profileId = "speech"): Slot => ({ key, role: "Speaker", profileId })
const brief = (speechKey: string, printed = "1:00"): Slot => ({ role: "EvaluatorBrief", printed, evaluates: speechKey })
const evaluation = (speechKey: string): Slot => ({ role: "Evaluator", profileId: "evaluation", evaluates: speechKey })
const untimed = (role: AgendaRole, extraRoles?: AgendaRole[]): Slot => ({ role, untimed: true, ...(extraRoles && { extraRoles }) })

/**
 * Roles and timings of the formats Tommy's clubs use, read from their real
 * agendas (fixtures/agendas/), never names. Speeches, briefs, evaluations and
 * Table Topics follow the printed order, timings and pairings; the opening
 * and reports keep the roles the Timer reports on, with the time printed
 * (or none). Toastmaster link-ins, breaks and mid-meeting Timer reports are
 * left out. Table Topics speakers are added live, so that segment starts with
 * only its Master.
 */
export const builtInTemplates: Template[] = [
  builtIn("builtin-toasted", "ToastED", [
    [
      "opening",
      [
        { role: "SergeantAtArms", printed: "3:00" },
        { role: "President", printed: "25:00" },
        { role: "Toastmaster", printed: "5:00" },
        { role: "Timer", printed: "2:00" },
        { role: "AhCounter", printed: "2:00" },
        { role: "Grammarian", printed: "2:00" },
      ],
    ],
    ["prepared_speeches", [brief("s1"), speech("s1", "ice_breaker"), brief("s2"), speech("s2"), brief("s3"), speech("s3")]],
    ["other", [{ role: "Other", printed: "10:00 15:00 20:00", title: "Educational" }], "Educational"],
    ["table_topics", [untimed("TableTopicsMaster")]],
    ["evaluations", [evaluation("s1"), evaluation("s2"), evaluation("s3")]],
    [
      "reports",
      [
        { role: "Timer", printed: "1:00" },
        { role: "AhCounter", printed: "2:00" },
        { role: "Grammarian", printed: "2:00" },
      ],
    ],
    ["other", [{ role: "President", printed: "18:00" }], "Closing"],
  ]),
  builtIn("builtin-cape-town", "Cape Town", [
    [
      "opening",
      [
        { role: "SergeantAtArms", printed: "1:00 1:30 2:00" },
        { role: "President", printed: "1:00 2:00 3:00" },
        { role: "Toastmaster", printed: "3:00 4:00 5:00" },
        { role: "Other", printed: "5:00 6:00 7:00" },
      ],
    ],
    ["prepared_speeches", [speech("s1", "ice_breaker"), speech("s2"), speech("s3"), speech("s4"), speech("s5")]],
    ["evaluations", [evaluation("s1"), evaluation("s2"), evaluation("s3"), evaluation("s4"), evaluation("s5")]],
    ["table_topics", [untimed("TableTopicsMaster")]],
    ["reports", [untimed("Timer"), untimed("AhCounter"), untimed("Grammarian")]],
  ]),
  builtIn("builtin-pinelands", "Pinelands", [
    ["opening", [untimed("SergeantAtArms"), untimed("President"), untimed("Toastmaster")]],
    ["prepared_speeches", [speech("s1"), speech("s2"), speech("s3")]],
    ["evaluations", [evaluation("s1"), evaluation("s2"), evaluation("s3")]],
    ["reports", [untimed("Timer"), untimed("Grammarian", ["AhCounter"])]],
    ["other", [untimed("President")], "Closing"],
  ]),
]

/** Adds any missing segment kinds at the end, so every meeting has every segment. */
export function withAllSegments(segments: Segment[], idPrefix: string, ids?: () => string): Segment[] {
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
          ...(item.timed === false && { timed: false as const }),
          ...(item.roleAsWritten && { roleAsWritten: item.roleAsWritten }),
          ...(item.extraRoles?.length && { extraRoles: item.extraRoles }),
          ...(item.event && { event: item.event }),
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
    ...(segment.title && { title: segment.title }),
    ...(segment.participantTiming && {
      participantTiming: resolveProfile(definitionOf(segment.participantTiming, undefined, clubProfiles), rules, true),
    }),
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
