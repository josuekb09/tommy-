import type { Meeting, TimedRecord } from "../domain"
import { dataTables, type TommyDB } from "./db"
import type { Ids } from "./repository"
import { exportEnvelope, type ExportEnvelope } from "./schema"

export async function exportAll(db: TommyDB, now = Date.now()): Promise<ExportEnvelope> {
  return {
    format: "tommy-export",
    version: 1,
    exportedAt: now,
    scope: "all",
    data: {
      clubs: await db.clubs.toArray(),
      members: await db.members.toArray(),
      guests: await db.guests.toArray(),
      meetings: await db.meetings.toArray(),
      timedRecords: await db.timedRecords.toArray(),
      templates: await db.templates.toArray(),
      settings: await db.settings.get("app"),
    },
  }
}

export async function exportMeeting(db: TommyDB, meetingId: string, now = Date.now()): Promise<ExportEnvelope> {
  const meeting = await db.meetings.get(meetingId)
  if (!meeting) throw new Error(`Meeting ${meetingId} not found`)
  const club = meeting.clubId ? await db.clubs.get(meeting.clubId) : undefined
  return {
    format: "tommy-export",
    version: 1,
    exportedAt: now,
    scope: "meeting",
    data: {
      clubs: club ? [club] : [],
      members: await db.members.toArray(),
      guests: await db.guests.toArray(),
      meetings: [meeting],
      timedRecords: await db.timedRecords.where("meetingId").equals(meetingId).toArray(),
      templates: [],
    },
  }
}

export class ImportError extends Error {}

/** Validates an export file. Throws ImportError with a readable message. */
export function parseExport(text: string): ExportEnvelope {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ImportError("This file is not valid JSON.")
  }
  const result = exportEnvelope.safeParse(json)
  if (!result.success) throw new ImportError("This is not a Tommy export file, or it is from an unsupported version.")
  return result.data
}

export type ImportMode = "copy" | "restore"

/**
 * "restore" replaces all data with the file. "copy" adds the file's meetings
 * under new ids, so nothing already on this device can be overwritten.
 */
export async function importExport(db: TommyDB, envelope: ExportEnvelope, mode: ImportMode, ids: Ids = () => crypto.randomUUID()) {
  const { data } = envelope
  if (mode === "restore") {
    await db.transaction(
      "rw",
      dataTables.map(name => db[name]),
      async () => {
        await Promise.all(dataTables.map(name => db[name].clear()))
        await db.clubs.bulkPut(data.clubs)
        await db.members.bulkPut(data.members)
        await db.guests.bulkPut(data.guests)
        await db.meetings.bulkPut(data.meetings)
        await db.timedRecords.bulkPut(data.timedRecords)
        await db.templates.bulkPut(data.templates)
        if (data.settings) await db.settings.put(data.settings, "app")
      },
    )
    return { meetings: data.meetings.length }
  }

  const copies = data.meetings.map(meeting => copyMeeting(meeting, data.timedRecords, ids))
  await db.transaction("rw", [db.clubs, db.members, db.guests, db.meetings, db.timedRecords, db.templates], async () => {
    // People and clubs are shared reference data: add what is missing, never overwrite.
    await db.clubs.bulkAdd(await missing(db.clubs.toCollection().primaryKeys(), data.clubs))
    await db.members.bulkAdd(await missing(db.members.toCollection().primaryKeys(), data.members))
    await db.guests.bulkAdd(await missing(db.guests.toCollection().primaryKeys(), data.guests))
    await db.templates.bulkAdd(await missing(db.templates.toCollection().primaryKeys(), data.templates))
    await db.meetings.bulkPut(copies.map(copy => copy.meeting))
    await db.timedRecords.bulkPut(copies.flatMap(copy => copy.records))
  })
  return { meetings: copies.length }
}

async function missing<T extends { id: string }>(existingKeys: Promise<unknown[]>, rows: T[]) {
  const existing = new Set(await existingKeys)
  return rows.filter(row => !existing.has(row.id))
}

function copyMeeting(meeting: Meeting, allRecords: TimedRecord[], ids: Ids) {
  const meetingId = ids()
  const itemIds = new Map(meeting.segments.flatMap(segment => segment.items.map(item => [item.id, ids()] as const)))
  const copy: Meeting = {
    ...meeting,
    id: meetingId,
    segments: meeting.segments.map(segment => ({
      ...segment,
      id: ids(),
      items: segment.items.map(item => ({ ...item, id: itemIds.get(item.id)!, evaluatesItemId: item.evaluatesItemId && itemIds.get(item.evaluatesItemId) })),
    })),
  }
  const records = allRecords
    .filter(record => record.meetingId === meeting.id && itemIds.has(record.agendaItemId))
    .map(record => ({ ...record, meetingId, agendaItemId: itemIds.get(record.agendaItemId)! }))
  return { meeting: copy, records }
}
