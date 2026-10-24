import type { Report, ReportLine } from "./build"
import { shownTime } from "./build"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** "6 minutes 12 seconds", "6 minutes", "45 seconds": how a time is said aloud. */
export function spokenDuration(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (!minutes) return plural(seconds, "second")
  return seconds ? `${plural(minutes, "minute")} ${plural(seconds, "second")}` : plural(minutes, "minute")
}

/** "Benjamin Grossier, 6 minutes 12 seconds, within time". Category style leaves the time out. */
export function spokenLine(line: ReportLine, style: Report["style"]): string {
  const time = shownTime(line, style)
  return [line.name, time !== undefined && line.elapsedMs !== undefined ? spokenDuration(line.elapsedMs) : undefined, line.statusLabel.toLowerCase()]
    .filter(Boolean)
    .join(", ")
}

const names = (lines: ReportLine[]) => {
  const all = lines.map(line => line.name)
  return all.length < 2 ? all.join("") : `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`
}

/** Everything to read aloud, one sentence per entry, so it can be paused and skipped line by line. */
export function spokenReport(report: Report): string[] {
  const sentences = ["Timer's report."]
  for (const group of report.groups) {
    sentences.push(`${group.label}.`)
    for (const line of group.lines) sentences.push(`${spokenLine(line, report.style)}.`)
  }
  for (const award of report.awards) {
    sentences.push(award.eligible.length ? `Eligible for ${award.label}: ${names(award.eligible)}.` : `No one is eligible for ${award.label}.`)
  }
  return sentences
}
