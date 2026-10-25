import Dexie, { type EntityTable, type Table } from "dexie"
import type { AppSettings, Club, Guest, Meeting, Member, TimedRecord, Template } from "../domain"
import type { ImportDraft } from "../engine/import/build"
import type { CorrectionSummary } from "../engine/import/review"

export type MetaRow = { key: string; value: unknown }

/**
 * One confirmed agenda scan: what was read and what the Timer confirmed.
 * Kept only on this device, to see where the scan needs correcting; never
 * exported or sent anywhere.
 */
export type ImportLogRow = {
  id: string
  meetingId: string
  confirmedAt: number
  model: string
  original: ImportDraft
  final: ImportDraft
  summary: CorrectionSummary
}

export class TommyDB extends Dexie {
  clubs!: EntityTable<Club, "id">
  members!: EntityTable<Member, "id">
  guests!: EntityTable<Guest, "id">
  meetings!: EntityTable<Meeting, "id">
  timedRecords!: EntityTable<TimedRecord, "agendaItemId">
  settings!: Table<AppSettings, string>
  templates!: EntityTable<Template, "id">
  meta!: EntityTable<MetaRow, "key">
  importLog!: EntityTable<ImportLogRow, "id">

  constructor(name = "tommy-v2") {
    super(name)
    this.version(1).stores({
      clubs: "id",
      members: "id, name",
      guests: "id, name",
      meetings: "id, date, status, updatedAt",
      timedRecords: "agendaItemId, meetingId",
      settings: "",
      templates: "id",
      meta: "key",
    })
    this.version(2).stores({ importLog: "id, meetingId, confirmedAt" })
  }
}

/** Every table that holds user data, in a fixed order for export and wipe. */
export const dataTables = ["clubs", "members", "guests", "meetings", "timedRecords", "settings", "templates"] as const
