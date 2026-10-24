import type { AgendaItem, AppSettings, Club, Guest, Meeting, Member, Segment, SegmentKind, TimedRecord, TimingAction } from "../domain"
import { appendAction } from "../engine/timing"
import { defaultRules, definitionOf, resolveProfile, rulesOf } from "../engine/profiles"
import type { TommyDB } from "./db"

export const defaultSettings: AppSettings = { sound: false, vibration: true, silent: false, speakerClock: false, signalPatterns: true, theme: "system" }

export const segmentOrder: SegmentKind[] = ["opening", "prepared_speeches", "table_topics", "evaluations", "reports", "other"]

export type Ids = () => string
const randomId: Ids = () => crypto.randomUUID()

export const localDate = (now: number) => {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function blankMeeting(now: number, ids: Ids = randomId, clubId?: string): Meeting {
  return {
    id: ids(),
    clubId,
    date: localDate(now),
    segments: segmentOrder.map(kind => ({ id: ids(), kind, items: [] })),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }
}

/** Fills in rules added after the club was saved. */
export const normalizeClub = (club: Club | undefined): Club | undefined => club && { ...club, defaultRules: rulesOf(club), profiles: club.profiles ?? {} }

export class RecordedTimeError extends Error {
  constructor() {
    super("This item has a recorded time. Confirm before removing it.")
  }
}

/**
 * The only module that reads or writes IndexedDB. Every mutation is saved
 * before it resolves, so the UI never holds unsaved timing state.
 */
export function createRepository(db: TommyDB, options: { now?: () => number; ids?: Ids } = {}) {
  const now = options.now ?? (() => Date.now())
  const ids = options.ids ?? randomId

  const settings = {
    async get(): Promise<AppSettings> {
      return { ...defaultSettings, ...(await db.settings.get("app")) }
    },
    async update(patch: Partial<AppSettings>) {
      await db.transaction("rw", db.settings, async () => {
        const current = { ...defaultSettings, ...(await db.settings.get("app")) }
        await db.settings.put({ ...current, ...patch }, "app")
      })
    },
  }

  const clubs = {
    get: async (id: string) => normalizeClub(await db.clubs.get(id)),
    put: (club: Club) => db.clubs.put(club),
    /** The club for this device, created on first use. */
    async current(): Promise<Club> {
      const { currentClubId } = await settings.get()
      const existing = normalizeClub(currentClubId ? await db.clubs.get(currentClubId) : await db.clubs.toCollection().first())
      if (existing) return existing
      const club: Club = { id: ids(), name: "My club", defaultRules, profiles: {} }
      await db.clubs.put(club)
      await settings.update({ currentClubId: club.id })
      return club
    },
  }

  const meetings = {
    get: (id: string) => db.meetings.get(id),
    list: () => db.meetings.orderBy("date").reverse().toArray(),
    async create(clubId?: string): Promise<Meeting> {
      const meeting = blankMeeting(now(), ids, clubId)
      await db.meetings.put(meeting)
      await settings.update({ currentMeetingId: meeting.id })
      return meeting
    },
    /** The meeting this device is working on, created on first use. */
    async current(): Promise<Meeting> {
      const { currentMeetingId } = await settings.get()
      const found = currentMeetingId ? await db.meetings.get(currentMeetingId) : undefined
      if (found) return found
      const latest = await db.meetings.orderBy("updatedAt").last()
      if (latest) {
        await settings.update({ currentMeetingId: latest.id })
        return latest
      }
      return meetings.create((await clubs.current()).id)
    },
    async update(id: string, change: (meeting: Meeting) => Meeting): Promise<Meeting> {
      return db.transaction("rw", db.meetings, async () => {
        const meeting = await db.meetings.get(id)
        if (!meeting) throw new Error(`Meeting ${id} not found`)
        const next = { ...change(meeting), id, updatedAt: now() }
        await db.meetings.put(next)
        return next
      })
    },
    async addItem(meetingId: string, kind: SegmentKind, item: Omit<AgendaItem, "id" | "order">): Promise<AgendaItem> {
      const created: AgendaItem = { ...item, id: ids(), order: 0 }
      await meetings.update(meetingId, meeting => ({
        ...meeting,
        segments: withSegment(meeting.segments, kind, ids).map(segment =>
          segment.kind === kind ? { ...segment, items: renumber([...segment.items, created]) } : segment,
        ),
      }))
      return { ...created, order: (await findItem(meetingId, created.id))?.order ?? 0 }
    },
    async updateItem(meetingId: string, itemId: string, patch: Partial<Omit<AgendaItem, "id">>) {
      await meetings.update(meetingId, meeting => ({
        ...meeting,
        segments: meeting.segments.map(segment => ({ ...segment, items: segment.items.map(item => (item.id === itemId ? { ...item, ...patch } : item)) })),
      }))
    },
    /** Refuses to remove an item with a recorded time unless the caller confirmed it. */
    async removeItem(meetingId: string, itemId: string, options: { confirmRecorded?: boolean } = {}) {
      await db.transaction("rw", db.meetings, db.timedRecords, async () => {
        const record = await db.timedRecords.get(itemId)
        if (record && record.status !== "idle" && !options.confirmRecorded) throw new RecordedTimeError()
        await meetings.update(meetingId, meeting => ({
          ...meeting,
          segments: meeting.segments.map(segment => ({ ...segment, items: renumber(segment.items.filter(item => item.id !== itemId)) })),
        }))
        await db.timedRecords.delete(itemId)
      })
    },
    /**
     * Re-resolves the timing of everyone in the meeting who has not been timed
     * yet, after the club changed its rules or profiles. Anyone with a record
     * keeps the profile they were timed with, so no recorded result changes.
     */
    async applyClubRules(meetingId: string, club: Club) {
      const rules = rulesOf(club)
      await db.transaction("rw", db.meetings, db.timedRecords, async () => {
        const timed = new Set((await db.timedRecords.where("meetingId").equals(meetingId).toArray()).filter(r => r.status !== "idle").map(r => r.agendaItemId))
        await meetings.update(meetingId, meeting => ({
          ...meeting,
          segments: meeting.segments.map(segment => ({
            ...segment,
            items: segment.items.map(item =>
              timed.has(item.id)
                ? item
                : { ...item, timing: resolveProfile(definitionOf(item.timing, item.profileId, club.profiles), rules, item.role === "TableTopicsSpeaker") },
            ),
          })),
        }))
      })
    },
    async remove(id: string) {
      await db.transaction("rw", db.meetings, db.timedRecords, async () => {
        await db.timedRecords.where("meetingId").equals(id).delete()
        await db.meetings.delete(id)
      })
    },
  }

  async function findItem(meetingId: string, itemId: string) {
    const meeting = await db.meetings.get(meetingId)
    return meeting?.segments.flatMap(segment => segment.items).find(item => item.id === itemId)
  }

  const records = {
    get: (agendaItemId: string) => db.timedRecords.get(agendaItemId),
    forMeeting: (meetingId: string) => db.timedRecords.where("meetingId").equals(meetingId).toArray(),
    /**
     * Applies one timing action and saves it in the same transaction.
     * Returns undefined, and writes nothing, when the action has no effect.
     */
    async append(meetingId: string, agendaItemId: string, action: TimingAction): Promise<TimedRecord | undefined> {
      return db.transaction("rw", db.meetings, db.timedRecords, async () => {
        const item = await findItem(meetingId, agendaItemId)
        if (!item) throw new Error(`Agenda item ${agendaItemId} not found`)
        const next = appendAction(await db.timedRecords.get(agendaItemId), { agendaItemId, meetingId }, action, item.timing)
        if (!next) return undefined
        await db.timedRecords.put(next)
        if (action.type === "start") {
          const meeting = await db.meetings.get(meetingId)
          if (meeting?.status === "draft") await db.meetings.put({ ...meeting, status: "live", updatedAt: now() })
        }
        return next
      })
    },
  }

  const members = {
    list: () => db.members.orderBy("name").toArray(),
    put: (member: Member) => db.members.put(member),
    remove: (id: string) => db.members.delete(id),
  }

  const guests = {
    list: () => db.guests.orderBy("name").toArray(),
    async add(name: string): Promise<Guest> {
      const existing = await db.guests.where("name").equalsIgnoreCase(name.trim()).first()
      if (existing) return existing
      const guest: Guest = { id: ids(), name: name.trim(), addedAt: now() }
      await db.guests.put(guest)
      return guest
    },
  }

  return { db, settings, clubs, meetings, records, members, guests }
}

export type Repository = ReturnType<typeof createRepository>

const renumber = (items: AgendaItem[]) => items.map((item, order) => ({ ...item, order }))

function withSegment(segments: Segment[], kind: SegmentKind, ids: Ids): Segment[] {
  if (segments.some(segment => segment.kind === kind)) return segments
  const added = [...segments, { id: ids(), kind, items: [] }]
  return added.sort((a, b) => segmentOrder.indexOf(a.kind) - segmentOrder.indexOf(b.kind))
}
