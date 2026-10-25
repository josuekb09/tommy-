import Dexie from "dexie"
import type { AgendaItem, AgendaRole, AppSettings, Club, Meeting, ProfileDefinition, SegmentKind, TimedRecord, TimingAction, TimingProfile } from "../domain"
import { buildRecord } from "../engine/timing"
import { builtInProfiles, defaultRules } from "../engine/profiles"
import type { TommyDB } from "./db"
import { defaultSettings, segmentOrder, type Ids } from "./repository"

/** Shapes stored by Tommy v1 in the "tommy" IndexedDB database. */
export type LegacyThresholds = { green: number; yellow: number; red: number }
export type LegacyTurn = {
  id: string
  name: string
  role: string
  thresholds: LegacyThresholds
  status: "queued" | "running" | "paused" | "done"
  startedAt?: number
  elapsedMs: number
  note?: string
  edited?: boolean
}
export type LegacyMeeting = {
  id: string
  date: string
  title: string
  segments: { id: string; type: "speeches" | "evaluations" | "tableTopics"; turns: LegacyTurn[] }[]
}
export type LegacySettings = {
  withinEarly?: number
  withinLate?: number
  sound?: boolean
  vibration?: boolean
  colourBlind?: boolean
  dark?: boolean
  theme?: "system" | "light" | "dark"
  presetOverrides?: Record<string, LegacyThresholds>
  currentMeetingId?: string
}

const segmentKinds: Record<LegacyMeeting["segments"][number]["type"], SegmentKind> = {
  speeches: "prepared_speeches",
  evaluations: "evaluations",
  tableTopics: "table_topics",
}
const roles: Record<string, AgendaRole> = { Speech: "Speaker", "Ice Breaker": "Speaker", Evaluation: "Evaluator", "Table Topics": "TableTopicsSpeaker" }
const profileIds: Record<string, string> = { Speech: "speech", "Ice Breaker": "ice_breaker", Evaluation: "evaluation", "Table Topics": "table_topics" }
const times = (t: LegacyThresholds) => ({ green: t.green, amber: t.yellow, red: t.red })

/**
 * Rebuilds each v1 turn as an action log that reproduces its exact elapsed
 * time. Running turns keep running from their original start.
 */
export function legacyActions(turn: LegacyTurn, at: number): TimingAction[] {
  const elapsed = Math.max(0, Math.round(turn.elapsedMs))
  switch (turn.status) {
    case "queued":
      return []
    case "running": {
      const since = turn.startedAt ?? at
      return [{ type: "start", at: since - elapsed }]
    }
    case "paused":
      return [
        { type: "start", at: at - elapsed },
        { type: "pause", at },
      ]
    case "done":
      return [
        { type: "start", at: at - elapsed },
        { type: "stop", at },
      ]
  }
}

export function convertLegacy(legacy: { meetings: LegacyMeeting[]; settings?: LegacySettings }, at: number, ids: Ids) {
  const old = legacy.settings ?? {}
  const current = legacy.meetings.find(meeting => meeting.id === old.currentMeetingId) ?? legacy.meetings[0]
  // v1 preset edits become the club's edits of the matching built-in profiles.
  const profiles: Record<string, ProfileDefinition> = Object.fromEntries(
    Object.entries(old.presetOverrides ?? {}).flatMap(([name, t]) => {
      const builtIn = builtInProfiles.find(profile => profile.id === profileIds[name])
      return builtIn ? [[builtIn.id, { ...builtIn, ...times(t) }]] : []
    }),
  )
  const club: Club = {
    id: ids(),
    name: current?.title?.trim() || "My club",
    // v1 applied its allowances to Table Topics too; keep that behaviour for migrated clubs.
    defaultRules: { ...defaultRules, graceSeconds: old.withinLate ?? defaultRules.graceSeconds, graceAppliesToTableTopics: true },
    profiles,
  }
  const rules = club.defaultRules
  const records: TimedRecord[] = []

  const meetings: Meeting[] = legacy.meetings.map(source => {
    const segments = segmentOrder.map(kind => {
      const original = source.segments.find(segment => segmentKinds[segment.type] === kind)
      const items: AgendaItem[] = (original?.turns ?? []).map((turn, order) => {
        const role = roles[turn.role] ?? "Other"
        const timing: TimingProfile = { ...times(turn.thresholds), graceSeconds: rules.graceSeconds, disqualifyEnabled: false }
        const actions = legacyActions(turn, at)
        if (actions.length) records.push(buildRecord(turn.id, source.id, actions, timing, { legacy: true }))
        const speechTitle = turn.note?.match(/Speech title: ([^·]+)/)?.[1].trim()
        return {
          id: turn.id,
          order,
          role,
          personName: turn.name,
          ...(turn.role === "Ice Breaker" && { pathwaysProject: "Ice Breaker" }),
          ...(speechTitle && { speechTitle }),
          ...(profileIds[turn.role] && { profileId: profileIds[turn.role] }),
          timing,
        }
      })
      return { id: original?.id ?? ids(), kind, items }
    })
    const timed = records.some(record => record.meetingId === source.id)
    const status: Meeting["status"] = !timed ? "draft" : source.id === current?.id ? "live" : "finished"
    return { id: source.id, clubId: club.id, date: source.date, segments, status, createdAt: at, updatedAt: at }
  })

  const settings: AppSettings = {
    ...defaultSettings,
    sound: old.sound ?? defaultSettings.sound,
    vibration: old.vibration ?? defaultSettings.vibration,
    signalPatterns: old.colourBlind ?? defaultSettings.signalPatterns,
    theme: old.theme ?? (old.dark ? "dark" : "system"),
    currentMeetingId: current?.id,
    currentClubId: club.id,
  }
  return { club, meetings, records, settings }
}

export async function readLegacyDatabase(name = "tommy"): Promise<{ meetings: LegacyMeeting[]; settings?: LegacySettings } | undefined> {
  if (!(await Dexie.exists(name))) return undefined
  const legacy = new Dexie(name)
  try {
    await legacy.open()
    const tables = legacy.tables.map(table => table.name)
    const meetings = tables.includes("meetings") ? ((await legacy.table("meetings").toArray()) as LegacyMeeting[]) : []
    const settings = tables.includes("settings") ? ((await legacy.table("settings").get("main")) as LegacySettings | undefined) : undefined
    return { meetings, settings }
  } finally {
    legacy.close()
  }
}

/**
 * Copies v1 data into the new database once. The v1 database is never
 * modified or deleted, so it remains a backup.
 */
export async function migrateLegacyIfNeeded(db: TommyDB, options: { legacyName?: string; now?: number; ids?: Ids } = {}) {
  if (await db.meta.get("legacyMigrated")) return { migrated: 0 }
  const legacy = await readLegacyDatabase(options.legacyName)
  const done = () => db.meta.put({ key: "legacyMigrated", value: options.now ?? Date.now() })
  if (!legacy?.meetings.length || (await db.meetings.count()) > 0) {
    await done()
    return { migrated: 0 }
  }
  const converted = convertLegacy(legacy, options.now ?? Date.now(), options.ids ?? (() => crypto.randomUUID()))
  await db.transaction("rw", [db.clubs, db.meetings, db.timedRecords, db.settings, db.meta], async () => {
    await db.clubs.put(converted.club)
    await db.meetings.bulkPut(converted.meetings)
    await db.timedRecords.bulkPut(converted.records)
    await db.settings.put(converted.settings, "app")
    await done()
  })
  return { migrated: converted.meetings.length }
}
