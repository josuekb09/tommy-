import type { AgendaRole, ClubRules, Meeting, SegmentKind, TimeEdit, TimedRecord, TimeResult } from "../domain"
import { formatClock, roleLabels } from "./profiles"
import { resultFor } from "./timing"

export type ReportRow = {
  itemId: string
  segment: SegmentKind
  name: string
  role: AgendaRole
  elapsedMs: number
  time: string
  result: TimeResult
  /** The latest manual edit, if the time was corrected. */
  edit?: TimeEdit
}

export const resultLabels: Record<TimeResult, string> = { under: "Under time", within: "Within time", over: "Over time", disqualified: "Disqualified" }

/** Rows for every agenda item with a stopped time, in agenda order. */
export function reportRows(meeting: Meeting, records: TimedRecord[], rules: Pick<ClubRules, "withinRule">): ReportRow[] {
  const byItem = new Map(records.map(record => [record.agendaItemId, record]))
  return meeting.segments.flatMap(segment =>
    [...segment.items]
      .sort((a, b) => a.order - b.order)
      .flatMap(item => {
        const record = byItem.get(item.id)
        if (record?.status !== "stopped") return []
        return [
          {
            itemId: item.id,
            segment: segment.kind,
            name: item.personName,
            role: item.role,
            elapsedMs: record.elapsedMs,
            time: formatClock(record.elapsedMs),
            result: resultFor(record.elapsedMs, item.timing, rules.withinRule),
            edit: record.edits.at(-1),
          },
        ]
      }),
  )
}

export const reportText = (rows: ReportRow[]) =>
  rows
    .map(
      row => `${row.name} (${roleLabels[row.role]}): ${row.time}, ${resultLabels[row.result].toLowerCase()}${row.edit ? ` [edited: ${row.edit.reason}]` : ""}`,
    )
    .join("\n")
