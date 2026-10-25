import type { AgendaItem, AgendaRole, ClubRules, ProfileDefinition, Segment, SegmentKind, TimingProfile } from "../../domain"
import { editDistance, matchPeople, normalizeName, type Person } from "../people"
import { defaultProfileIdForRole, definitionFromRange, formatClock, profileFor, rangeLabel, resolveProfile, roleLabels } from "../profiles"
import { profileFromRange } from "../range"
import type { RawAgenda, RawLine } from "./extraction"
import { readRole, type RoleReading } from "./roles"

export type FlagField = "person" | "role" | "timing" | "pairing" | "line"

/** Something the Timer should look at before the meeting, in words. A suggestion is applied only when the Timer taps it. */
export type Flag = { field: FlagField; message: string; suggestion?: { label: string; patch: Partial<DraftItem> } }

/** An agenda item as read from the sheet, before it joins a meeting. Pairings point at other draft keys. */
export type DraftItem = Omit<AgendaItem, "id" | "order" | "evaluatesItemId"> & {
  key: string
  evaluatesKey?: string
  flags: Flag[]
  /** The printed row, to compare with the photo. */
  source: string
}

export type DraftSegment = { kind: SegmentKind; title?: string; participantTiming?: TimingProfile; items: DraftItem[] }

export type ImportDraft = {
  meeting: { club?: string; date?: string; theme?: string; wordOfTheDay?: string; venue?: string; startTime?: string }
  segments: DraftSegment[]
  /** Names from the attending and guest lists: suggestions for Table Topics and the member list, never participants. */
  roster: { attending: string[]; specialGuests: string[] }
  /** Problems with the sheet as a whole ("not an agenda", "too blurry"). */
  problems: string[]
}

export type BuildContext = { rules: ClubRules; clubProfiles?: Record<string, ProfileDefinition>; people?: Person[] }

const LOW = 0.8
const clockOf = (text: string | null) => {
  const match = text?.match(/^(\d{1,2})[:h.](\d{2})$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined
}
const promptedRoles: AgendaRole[] = ["Speaker", "Evaluator", "EvaluatorBrief", "TableTopicsSpeaker"]

/** "Christen O' Reilly (CT TM)" → name "Christen O'Reilly", note "(CT TM)". */
export function cleanName(printed: string | null): { name: string; note?: string } {
  if (!printed) return { name: "" }
  const tag = printed.match(/\s*(\([^)]*\))\s*$/)
  const name = printed
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/(\p{L})['’]\s+(\p{L})/gu, "$1'$2")
    .replace(/\s+/g, " ")
    .trim()
  return { name, ...(tag && { note: tag[1] }) }
}

type Reading = { line: RawLine; role: RoleReading; name: string; note?: string; report: boolean }

/** Where a line belongs. Toastmaster links (null) join their neighbours. */
function naturalKind(reading: Reading, seenSpeeches: boolean): { kind: SegmentKind; title?: string } | null {
  const [role] = reading.role.roles
  const event = normalizeName(reading.line.event ?? "")
  const closing = /\bclos(?:e|es|ing)\b/.test(event) || /\bclos(?:e|es|ing)\b/.test(normalizeName(reading.line.role))
  if (reading.role.agendaOnly) return { kind: "other", title: reading.role.title }
  switch (role) {
    case "Speaker":
    case "EvaluatorBrief":
      return { kind: "prepared_speeches" }
    case "Evaluator":
    case "GeneralEvaluator":
    case "TableTopicsEvaluator":
      return { kind: "evaluations" }
    case "TableTopicsMaster":
    case "TableTopicsSpeaker":
      return { kind: "table_topics" }
    case "Timer":
    case "AhCounter":
    case "Grammarian":
      // Before the speeches these roles introduce themselves; after them they report.
      return reading.report || seenSpeeches ? { kind: "reports" } : { kind: "opening" }
    case "President":
    case "SergeantAtArms":
      return seenSpeeches && closing ? { kind: "other", title: "Closing" } : { kind: "opening" }
    case "Toastmaster":
      if (closing) return { kind: "other", title: "Closing" }
      if (/\bcall for (?:\w+ )?times\b|\bvote\b|\binterval\b|\bannounce/.test(event)) return { kind: "reports" }
      return null
    default:
      return /\beducation(?:al)?\b/.test(normalizeName(reading.line.role)) ? { kind: "other", title: reading.role.title } : null
  }
}

function timingFor(role: AgendaRole, line: RawLine, ctx: BuildContext): { timing?: TimingProfile; profileId?: string; flags: Flag[] } {
  const flags: Flag[] = []
  const isTableTopics = role === "TableTopicsSpeaker"
  if (line.timing) {
    const parsed = profileFromRange(line.timing)
    if (parsed.profile) {
      if (line.confidence.timing < LOW) flags.push({ field: "timing", message: `Time hard to read: check “${line.timing}” on the photo.` })
      return { timing: resolveProfile(definitionFromRange(parsed.profile, line.timing), ctx.rules, isTableTopics), flags }
    }
    flags.push({ field: "timing", message: `Tommy can’t read the time “${line.timing}”: ${parsed.reason}` })
  }
  if (!promptedRoles.includes(role)) return { flags }
  const profileId = defaultProfileIdForRole(role)
  const timing = profileFor(role, ctx.rules, ctx.clubProfiles, profileId)
  if (!line.timing)
    flags.push({ field: "timing", message: `No time printed: using the club’s ${roleLabels[role].toLowerCase()} time (${rangeLabel(timing)}).` })
  return { timing, profileId, flags }
}

/** Two spellings of one person on the same sheet: a shared word and a near-identical other word. */
export function looksAlike(a: string, b: string) {
  const [x, y] = [normalizeName(a).split(" "), normalizeName(b).split(" ")]
  if (x.length !== y.length) return false
  const differing = x.map((word, i) => [word, y[i]] as const).filter(([u, v]) => u !== v)
  if (differing.length !== 1) return false
  const [u, v] = differing[0]
  return Math.min(u.length, v.length) >= 5 && editDistance(u, v) <= 2
}

/**
 * Turns a transcription into a draft agenda: roles from printed names,
 * timings through profileFromRange, evaluators paired with speeches, briefs
 * recognised, names cleaned and matched to the club, and everything doubtful
 * flagged with its reason. It never invents a person or a time, and it never
 * merges people: similar names are only offered as suggestions.
 */
export function buildDraft(raw: RawAgenda, ctx: BuildContext): ImportDraft {
  const problems = raw.readable ? [] : [raw.problem ?? "This photo could not be read as an agenda."]
  const readings: Reading[] = raw.lines
    .map(line => {
      const role = readRole(line.role)
      const { name, note } = cleanName(line.person)
      const report = role.report || /\breport|\bfeedback\b|\btimes\b/i.test(line.event ?? "")
      return { line, role, name, note, report }
    })
    // Table Topics speakers are chosen live: a row without a name is a heading, not a person.
    .filter(reading => !(reading.role.roles[0] === "TableTopicsSpeaker" && !reading.name))

  // Name spellings across the sheet, most frequent first, for "same person?" suggestions.
  const counts = new Map<string, number>()
  for (const { name } of readings) if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  const spellings = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  const inList = (list: string[], name: string) => list.some(entry => normalizeName(entry) === normalizeName(name))

  const items: Working[] = []
  readings.forEach((reading, index) => {
    const { line, role } = reading
    const [primary, ...extra] = role.roles
    const flags: Flag[] = []
    const { timing, profileId, flags: timingFlags } = timingFor(primary, line, ctx)
    flags.push(...timingFlags)
    if (line.confidence.role < LOW) flags.push({ field: "role", message: `Role hard to read: “${line.role}”.` })
    if (!reading.name && !role.agendaOnly && line.personUnreadable) flags.push({ field: "person", message: `Name can’t be read (${line.personUnreadable}).` })
    else if (!reading.name && promptedRoles.includes(primary)) flags.push({ field: "person", message: "No name on the agenda." })
    if (reading.name && line.confidence.person < LOW) flags.push({ field: "person", message: `Name hard to read: check “${reading.name}” on the photo.` })

    let personId: string | undefined
    let guest = !!reading.name && inList(raw.specialGuests, reading.name)
    if (reading.name) {
      const variant = spellings.find(
        other => other !== reading.name && (counts.get(other) ?? 0) >= (counts.get(reading.name) ?? 0) && looksAlike(other, reading.name),
      )
      if (variant)
        flags.push({
          field: "person",
          message: `Spelled “${reading.name}” here and “${variant}” elsewhere on this sheet.`,
          suggestion: { label: `Use “${variant}”`, patch: { personName: variant } },
        })
      if (inList(raw.apologies, reading.name)) flags.push({ field: "person", message: `${reading.name} is listed under apologies.` })
      const [match] = matchPeople(reading.name, ctx.people ?? [])
      if (match?.sameName && match.person.name === reading.name) {
        if (match.person.kind === "member") personId = match.person.id
        else guest = true
      } else if (match) {
        flags.push({
          field: "person",
          message: `Looks like ${match.person.name} (${match.person.kind === "member" ? "club member" : "guest"}).`,
          suggestion: {
            label: `Use ${match.person.name}`,
            patch:
              match.person.kind === "member" ? { personName: match.person.name, personId: match.person.id } : { personName: match.person.name, guest: true },
          },
        })
      }
    }

    const speech = line.speech
    const project =
      speech &&
      [speech.path, speech.level !== null && `Level ${speech.level}`, speech.projectNumber !== null && `#${speech.projectNumber}`, speech.project]
        .filter(Boolean)
        .join(" · ")
    items.push({
      key: `line-${index}`,
      role: primary,
      personName: reading.name,
      ...(personId && { personId }),
      ...(guest && { guest: true }),
      ...(speech?.title && { speechTitle: speech.title }),
      ...(project && { pathwaysProject: project }),
      ...(profileId && { profileId }),
      timing: timing ?? profileFor(primary, ctx.rules, ctx.clubProfiles),
      ...(!timing || role.agendaOnly ? { timed: false as const } : {}),
      ...(line.role.trim() && { roleAsWritten: line.role.trim() }),
      ...(extra.length && { extraRoles: extra }),
      ...(line.event && { event: line.event }),
      ...(line.startTime && { plannedStart: line.startTime }),
      ...(reading.note && { note: reading.note }),
      flags,
      source: line.source,
      reading,
    })
  })

  pairEvaluators(items)
  checkSchedule(items)

  // Segments come after pairing, so a brief sits with the speeches. Toastmaster links and unknown lines join the next block, else the previous one.
  let seenSpeeches = false
  const kinds = items.map(item => {
    const hint = naturalKind({ ...item.reading, role: { ...item.reading.role, roles: [item.role, ...(item.extraRoles ?? [])] } }, seenSpeeches)
    if (item.role === "Speaker") seenSpeeches = true
    return hint
  })
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i]) continue
    const next = kinds.slice(i + 1).find(Boolean)
    const previous = kinds.slice(0, i).reverse().find(Boolean)
    kinds[i] = (items[i].role === "Toastmaster" ? (next ?? previous) : (previous ?? next)) ?? { kind: "opening" }
  }

  const segments: DraftSegment[] = []
  items.forEach((item, i) => {
    const { kind, title } = kinds[i]!
    const { reading, ...draft } = item
    let segment = segments.at(-1)
    if (!segment || segment.kind !== kind || segment.title !== title) {
      segment = { kind, ...(title && { title }), items: [] }
      segments.push(segment)
    }
    // The Table Topics Master's printed range is each participant's time; "(15mins)" style totals are not.
    if (draft.role === "TableTopicsMaster" && draft.timed !== false) {
      const total = draft.timing.redOnly && draft.timing.red >= 300
      if (total) draft.flags.push({ field: "timing", message: `“${reading.line.timing}” looks like the whole Table Topics segment, not each speaker’s time.` })
      else segment.participantTiming = draft.timing
      segment.items.push({ ...draft, timed: false })
      return
    }
    segment.items.push(draft)
  })

  const meeting = Object.fromEntries(Object.entries(raw.meeting).filter(([key, value]) => value && key !== "meetingNumber")) as ImportDraft["meeting"]
  if (meeting.date && !/^\d{4}-\d{2}-\d{2}$/.test(meeting.date)) delete meeting.date
  return { meeting, segments, roster: { attending: raw.attending, specialGuests: raw.specialGuests }, problems }
}

type Working = DraftItem & { reading: Reading }

/**
 * Pairs evaluators with speeches, in this order: "for <name>", "speech N",
 * the evaluator's own number ("2nd Evaluator") and "the next speech". A short
 * evaluator slot just before a speech is that evaluator's brief.
 */
function pairEvaluators(items: Working[]) {
  const speeches = items.filter(item => item.role === "Speaker")
  const nth = (n: number) => speeches.find(speech => speech.reading.role.ordinal === n) ?? speeches[n - 1]
  items.forEach((item, index) => {
    if (item.role !== "Evaluator") return
    const said = normalizeName(item.reading.line.evaluates ?? "")
    const event = normalizeName(item.reading.line.event ?? "")
    const nextSpeech = items.slice(index + 1).find(other => other.role !== "Toastmaster")
    const aboutNext = /\bnext (?:speech|speaker)\b/.test(said) || /\bnext (?:speech|speaker)\b/.test(event)
    const short = item.timed !== false && item.timing.red <= 90
    if (nextSpeech?.role === "Speaker" && (aboutNext || short)) {
      item.role = "EvaluatorBrief"
      item.evaluatesKey = nextSpeech.key
      return
    }
    const forName = said.match(/^for (.+)$/)
    const byName =
      forName &&
      matchPeople(
        forName[1],
        speeches.map(s => ({ id: s.key, name: s.personName, kind: "member" as const })),
      )[0]
    const byNumber = said.match(/\bspeech\s*#?\s*(\d+)\b/) ?? event.match(/\bspeech\s*#?\s*(\d+)\b/)
    const target =
      (byName && speeches.find(s => s.key === byName.person.id)) ||
      (byNumber && nth(Number(byNumber[1]))) ||
      (item.reading.role.ordinal !== undefined && nth(item.reading.role.ordinal)) ||
      (aboutNext && nextSpeech?.role === "Speaker" ? nextSpeech : undefined)
    if (target) item.evaluatesKey = target.key
    else item.flags.push({ field: "pairing", message: "Not paired with a speech: choose who this evaluator evaluates." })
  })
}

/**
 * Printed limits must fit between the planned start times. Rows without a
 * start time share the slot of the row above (a group of evaluations). When
 * the total is longer than the slot (plus a minute), the timing column was
 * probably read off by a row: the Timer is asked to check it.
 */
function checkSchedule(items: Working[]) {
  const starts = items.map(item => clockOf(item.plannedStart ?? null))
  for (let i = 0; i < items.length; i++) {
    if (starts[i] === undefined) continue
    let end = i + 1
    while (end < items.length && starts[end] === undefined) end++
    if (end >= items.length) break
    const slot = (starts[end]! - starts[i]!) * 60
    const group = items.slice(i, end).filter(item => item.timed !== false && item.reading.line.timing && item.role !== "TableTopicsMaster")
    const total = group.reduce((sum, item) => sum + item.timing.red, 0)
    if (slot > 0 && total > slot + 60)
      for (const item of group)
        item.flags.push({
          field: "timing",
          message: `Doesn’t fit the schedule: ${formatClock(total * 1000)} printed for a ${formatClock(slot * 1000)} slot (${item.plannedStart} to ${items[end].plannedStart}). The time may belong to another row.`,
        })
  }
}

/**
 * The confirmed draft as meeting segments with fresh ids; pairings follow
 * the ids. Flags and sources stay in the review, not in the meeting.
 */
export function draftToSegments(draft: ImportDraft, ids: () => string): Segment[] {
  const idOf = new Map(draft.segments.flatMap(segment => segment.items.map(item => [item.key, ids()] as const)))
  return draft.segments.map(segment => ({
    id: ids(),
    kind: segment.kind,
    ...(segment.title && { title: segment.title }),
    ...(segment.participantTiming && { participantTiming: segment.participantTiming }),
    items: segment.items.map((item, order) => {
      const { key, evaluatesKey, flags: _flags, source: _source, ...rest } = item
      void _flags
      void _source
      const evaluatesItemId = evaluatesKey && idOf.get(evaluatesKey)
      return { ...rest, id: idOf.get(key)!, order, ...(evaluatesItemId && { evaluatesItemId }) }
    }),
  }))
}
