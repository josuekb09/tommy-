import "fake-indexeddb/auto"
import Dexie from "dexie"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { TommyDB } from "./db"
import { exportAll, exportMeeting, importExport, ImportError, parseExport } from "./export-import"
import { convertLegacy, migrateLegacyIfNeeded, type LegacyMeeting } from "./migrate-legacy"
import { createRepository, RecordedTimeError, type Repository } from "./repository"
import { profileFor, defaultRules } from "../engine/profiles"
import { elapsedAt, stateOf } from "../engine/timing"

let db: TommyDB
let repo: Repository
let clock = 1_000_000
let counter = 0
const ids = () => `id-${++counter}`
const speech = profileFor("Speaker", defaultRules)

beforeEach(async () => {
  clock = 1_000_000
  counter = 0
  db = new TommyDB(`test-${crypto.randomUUID()}`)
  repo = createRepository(db, { now: () => clock, ids })
})
afterEach(async () => {
  await db.delete()
})

async function meetingWithSpeaker() {
  const meeting = await repo.meetings.current()
  const item = await repo.meetings.addItem(meeting.id, "prepared_speeches", { role: "Speaker", personName: "Ada Lovelace", timing: speech })
  return { meeting, item }
}

describe("repository", () => {
  it("creates a current meeting and club on first use and remembers them", async () => {
    const meeting = await repo.meetings.current()
    expect(meeting.segments.map(segment => segment.kind)).toEqual(["opening", "prepared_speeches", "table_topics", "evaluations", "reports", "other"])
    expect((await repo.meetings.current()).id).toBe(meeting.id)
    expect((await repo.settings.get()).currentMeetingId).toBe(meeting.id)
    expect((await repo.clubs.current()).id).toBe(meeting.clubId)
  })

  it("saves each agenda change immediately", async () => {
    const { meeting, item } = await meetingWithSpeaker()
    await repo.meetings.updateItem(meeting.id, item.id, { speechTitle: "Engines" })
    const stored = await db.meetings.get(meeting.id)
    expect(stored!.segments[1].items).toEqual([{ ...item, order: 0, speechTitle: "Engines" }])
  })

  it("persists every timing action so a reload restores a running timer exactly", async () => {
    const { meeting, item } = await meetingWithSpeaker()
    await repo.records.append(meeting.id, item.id, { type: "start", at: 10_000 })
    const reopened = createRepository(new TommyDB(db.name))
    const record = await reopened.records.get(item.id)
    expect(record!.status).toBe("running")
    expect(elapsedAt(stateOf(record!.actions), 10_000 + 95_432)).toBe(95_432)
    expect((await reopened.meetings.get(meeting.id))!.status).toBe("live")
  })

  it("writes nothing for an action that has no effect", async () => {
    const { meeting, item } = await meetingWithSpeaker()
    expect(await repo.records.append(meeting.id, item.id, { type: "stop", at: 1 })).toBeUndefined()
    expect(await db.timedRecords.count()).toBe(0)
  })

  it("refuses to remove an item with a recorded time unless confirmed", async () => {
    const { meeting, item } = await meetingWithSpeaker()
    await repo.records.append(meeting.id, item.id, { type: "start", at: 0 })
    await repo.records.append(meeting.id, item.id, { type: "stop", at: 300_000 })
    await expect(repo.meetings.removeItem(meeting.id, item.id)).rejects.toBeInstanceOf(RecordedTimeError)
    expect(await repo.records.get(item.id)).toBeDefined()
    await repo.meetings.removeItem(meeting.id, item.id, { confirmRecorded: true })
    expect(await repo.records.get(item.id)).toBeUndefined()
  })

  it("adds a guest once regardless of letter case", async () => {
    const first = await repo.guests.add("Sam Guest")
    expect((await repo.guests.add(" sam guest ")).id).toBe(first.id)
  })
})

describe("club rules", () => {
  it("re-applies changed rules to people not yet timed and never to recorded ones", async () => {
    const { meeting, item: timed } = await meetingWithSpeaker()
    const waiting = await repo.meetings.addItem(meeting.id, "prepared_speeches", { role: "Speaker", personName: "Ben", profileId: "speech", timing: speech })
    await repo.records.append(meeting.id, timed.id, { type: "start", at: 0 })
    await repo.records.append(meeting.id, timed.id, { type: "stop", at: 280_000 })

    const club = await repo.clubs.current()
    const strict = { ...club, defaultRules: { ...club.defaultRules, graceEnabled: false, contestMode: true } }
    await repo.clubs.put(strict)
    await repo.meetings.applyClubRules(meeting.id, strict)

    const items = (await repo.meetings.get(meeting.id))!.segments.flatMap(segment => segment.items)
    expect(items.find(item => item.id === timed.id)!.timing).toEqual(speech)
    expect(items.find(item => item.id === waiting.id)!.timing).toMatchObject({ green: 300, red: 420, graceSeconds: 0, disqualifyEnabled: true })
  })

  it("fills in rules missing from a club saved by an older version", async () => {
    const club = await repo.clubs.current()
    const { graceEnabled: _removed, ...older } = club.defaultRules
    await db.clubs.put({ ...club, defaultRules: older as typeof club.defaultRules })
    expect((await repo.clubs.current()).defaultRules.graceEnabled).toBe(true)
  })
})

describe("export and import", () => {
  async function populated() {
    const { meeting, item } = await meetingWithSpeaker()
    const evaluator = await repo.meetings.addItem(meeting.id, "evaluations", {
      role: "Evaluator",
      personName: "Grace Hopper",
      evaluatesItemId: item.id,
      timing: profileFor("Evaluator", defaultRules),
    })
    await repo.records.append(meeting.id, item.id, { type: "start", at: 0 })
    await repo.records.append(meeting.id, item.id, { type: "stop", at: 400_000 })
    await repo.records.append(meeting.id, item.id, { type: "edit", at: 401_000, ms: 405_000, reason: "Started late" })
    await repo.members.put({ id: "m1", name: "Ada Lovelace", aliases: ["Ada"] })
    await repo.guests.add("Sam Guest")
    return { meeting, item, evaluator }
  }

  it("round-trips all data exactly through a JSON file", async () => {
    await populated()
    const before = await exportAll(db, 1)
    const file = JSON.stringify(before)
    await db.delete()
    await db.open()
    await importExport(db, parseExport(file), "restore")
    expect(await exportAll(db, 1)).toEqual(before)
  })

  it("imports a meeting as a copy without touching existing data", async () => {
    const { meeting, item, evaluator } = await populated()
    const original = await exportAll(db, 1)
    const file = parseExport(JSON.stringify(await exportMeeting(db, meeting.id)))
    await importExport(db, file, "copy", ids)

    const meetings = await db.meetings.toArray()
    expect(meetings).toHaveLength(2)
    const copy = meetings.find(m => m.id !== meeting.id)!
    const [copiedSpeaker] = copy.segments.find(s => s.kind === "prepared_speeches")!.items
    const [copiedEvaluator] = copy.segments.find(s => s.kind === "evaluations")!.items
    expect(copiedSpeaker.id).not.toBe(item.id)
    expect(copiedEvaluator.id).not.toBe(evaluator.id)
    expect(copiedEvaluator.evaluatesItemId).toBe(copiedSpeaker.id)
    const copiedRecord = await db.timedRecords.get(copiedSpeaker.id)
    expect(copiedRecord).toMatchObject({ meetingId: copy.id, elapsedMs: 405_000, edits: [{ fromMs: 400_000, toMs: 405_000, reason: "Started late" }] })
    // The original meeting, its record and the people are unchanged.
    expect(await db.meetings.get(meeting.id)).toEqual(original.data.meetings[0])
    expect(await db.timedRecords.get(item.id)).toEqual(original.data.timedRecords[0])
    expect(await db.members.count()).toBe(1)
  })

  it("rejects files that are not Tommy exports", () => {
    expect(() => parseExport("not json")).toThrow(ImportError)
    expect(() => parseExport(JSON.stringify({ format: "other" }))).toThrow(ImportError)
  })
})

describe("legacy v1 migration", () => {
  const legacyMeeting: LegacyMeeting = {
    id: "old-meeting",
    date: "2026-10-07",
    title: "Riverside Toastmasters",
    segments: [
      {
        id: "s1",
        type: "speeches",
        turns: [
          {
            id: "kim",
            name: "Kim Austen",
            role: "Ice Breaker",
            thresholds: { green: 240, yellow: 300, red: 360 },
            status: "done",
            elapsedMs: 342_000,
            edited: true,
            note: "Speech title: My story · Agenda duration: 6:00",
          },
          {
            id: "dan",
            name: "Daniel Foster",
            role: "Speech",
            thresholds: { green: 300, yellow: 360, red: 420 },
            status: "running",
            startedAt: 500_000,
            elapsedMs: 20_000,
          },
        ],
      },
      {
        id: "s2",
        type: "evaluations",
        turns: [
          { id: "priya", name: "Priya Patel", role: "Evaluation", thresholds: { green: 120, yellow: 150, red: 180 }, status: "paused", elapsedMs: 61_500 },
        ],
      },
      {
        id: "s3",
        type: "tableTopics",
        turns: [{ id: "alex", name: "Alex Morgan", role: "Table Topics", thresholds: { green: 60, yellow: 90, red: 120 }, status: "queued", elapsedMs: 0 }],
      },
    ],
  }

  it("preserves every recorded time exactly", () => {
    const { meetings, records, club, settings } = convertLegacy(
      {
        meetings: [legacyMeeting],
        settings: { withinLate: 20, colourBlind: false, currentMeetingId: "old-meeting", presetOverrides: { Speech: { green: 30, yellow: 60, red: 90 } } },
      },
      900_000,
      ids,
    )
    const byId = Object.fromEntries(records.map(record => [record.agendaItemId, record]))
    expect(byId.kim).toMatchObject({ status: "stopped", elapsedMs: 342_000, legacy: true })
    expect(byId.priya).toMatchObject({ status: "paused", elapsedMs: 61_500 })
    // A running v1 timer keeps running: elapsed = 20 s already banked + time since its start.
    expect(elapsedAt(stateOf(byId.dan.actions), 600_000)).toBe(120_000)
    expect(byId.alex).toBeUndefined()

    const speeches = meetings[0].segments.find(segment => segment.kind === "prepared_speeches")!
    expect(speeches.items[0]).toMatchObject({
      id: "kim",
      role: "Speaker",
      pathwaysProject: "Ice Breaker",
      speechTitle: "My story",
      profileId: "ice_breaker",
      timing: { green: 240, amber: 300, red: 360, graceSeconds: 20 },
    })
    expect(meetings[0].status).toBe("live")
    expect(club.name).toBe("Riverside Toastmasters")
    expect(club.profiles?.speech).toMatchObject({ name: "Prepared speech", green: 30, amber: 60, red: 90 })
    expect(settings).toMatchObject({ signalPatterns: false, currentMeetingId: "old-meeting" })
  })

  it("migrates from a real v1 database once and leaves it untouched", async () => {
    const legacyName = `legacy-${crypto.randomUUID()}`
    const legacy = new Dexie(legacyName)
    legacy.version(1).stores({ meetings: "id", settings: "" })
    await legacy.table("meetings").put(legacyMeeting)
    await legacy.table("settings").put({ currentMeetingId: "old-meeting" }, "main")
    legacy.close()

    expect(await migrateLegacyIfNeeded(db, { legacyName, now: 900_000, ids })).toEqual({ migrated: 1 })
    expect((await db.timedRecords.get("kim"))!.elapsedMs).toBe(342_000)
    expect(await migrateLegacyIfNeeded(db, { legacyName, now: 900_000, ids })).toEqual({ migrated: 0 })
    expect(await db.meetings.count()).toBe(1)

    const reopened = new Dexie(legacyName)
    await reopened.open()
    expect(await reopened.table("meetings").count()).toBe(1)
    reopened.close()
    await Dexie.delete(legacyName)
  })
})
