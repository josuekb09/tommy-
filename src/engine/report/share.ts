import type { Meeting } from "../../domain"
import type { Report, ReportLine } from "./build"
import { shownTime } from "./build"

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "Saturday 24 October 2026", the same in every browser (Intl output differs between versions). */
export function longDate(date: string) {
  const [y, m, d] = date.split("-").map(Number)
  return `${weekdays[new Date(y, m - 1, d).getDay()]} ${d} ${months[m - 1]} ${y}`
}

function shareLine(line: ReportLine, style: Report["style"]): string {
  const time = shownTime(line, style)
  const who = `${line.name}${line.guest ? " (guest)" : ""}, ${line.roleLabel.toLowerCase()}`
  const result = time ? `${time}, ${line.statusLabel.toLowerCase()}` : line.statusLabel
  const notes = [`range ${line.range}`, line.edit && `edited: ${line.edit.reason}`].filter(Boolean).join("; ")
  return `- ${who}: ${result} (${notes})`
}

/**
 * The report as plain lines for WhatsApp, email or a text message. Section
 * headings use WhatsApp's *bold*, which still reads cleanly where it is not
 * rendered. No tables, no other formatting.
 */
export function shareText(report: Report, meeting: Pick<Meeting, "date" | "theme">, clubName?: string): string {
  const out = [`*Timer's report*`, [clubName, longDate(meeting.date)].filter(Boolean).join(", ")]
  if (meeting.theme) out.push(`Theme: ${meeting.theme}`)
  for (const group of report.groups) {
    out.push("", `*${group.label}*`, ...group.lines.map(line => shareLine(line, report.style)))
  }
  if (report.awards.length) {
    out.push("", "*Award eligibility*")
    for (const award of report.awards) {
      out.push(`${award.label}: ${award.eligible.length ? award.eligible.map(line => line.name).join(", ") : "no one eligible"}`)
      for (const line of award.notEligible) out.push(`- Not eligible: ${line.name}. ${line.award!.reason}`)
    }
  }
  return out.join("\n")
}
