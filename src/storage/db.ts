import Dexie, { type EntityTable, type Table } from "dexie"
import type { AppSettings, Club, Guest, Meeting, Member, TimedRecord, Template } from "../domain"

export type MetaRow = { key: string; value: unknown }

export class TommyDB extends Dexie {
  clubs!: EntityTable<Club, "id">
  members!: EntityTable<Member, "id">
  guests!: EntityTable<Guest, "id">
  meetings!: EntityTable<Meeting, "id">
  timedRecords!: EntityTable<TimedRecord, "agendaItemId">
  settings!: Table<AppSettings, string>
  templates!: EntityTable<Template, "id">
  meta!: EntityTable<MetaRow, "key">

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
  }
}

/** Every table that holds user data, in a fixed order for export and wipe. */
export const dataTables = ["clubs", "members", "guests", "meetings", "timedRecords", "settings", "templates"] as const
