import { ArrowLeft, Printer } from "lucide-react"
import type { Meeting, TimingProfile } from "../../domain"
import { orderedItems } from "../../engine/agenda"
import { formatClock } from "../../engine/profiles"
import { buildReport, longDate } from "../../engine/report"
import type { AppData } from "../hooks"

const clock = (seconds: number) => formatClock(seconds * 1000)
const signals = (timing: TimingProfile) => (timing.redOnly ? ["–", "–", clock(timing.red)] : [clock(timing.green), clock(timing.amber), clock(timing.red)])

/**
 * The traditional Timer's log, laid out for paper: one table per section with
 * the green, amber and red times, the recorded time and the result. Printing
 * (or "Save as PDF") uses the browser, so no PDF library is needed. Times are
 * always exact here: the log is the record.
 */
export function PrintLog({ data, back }: { data: AppData & { meeting: Meeting }; back: () => void }) {
  const { meeting, records, rules, club } = data
  const report = buildReport(meeting, records, { ...rules, reportStyle: "exact" })
  const items = new Map(orderedItems(meeting).map(item => [item.id, item]))
  const timer = orderedItems(meeting)
    .find(item => item.role === "Timer")
    ?.personName.trim()
  return (
    <div className="print-view">
      <div className="print-toolbar">
        <button className="secondary-button" onClick={back}>
          <ArrowLeft size={18} aria-hidden="true" />
          Back to the report
        </button>
        <button className="primary-button" onClick={() => window.print()}>
          <Printer size={18} aria-hidden="true" />
          Print or save as PDF
        </button>
      </div>
      <article className="timer-log">
        <header>
          <h1>Timer’s log</h1>
          <p>{[club?.name, longDate(meeting.date), meeting.theme && `Theme: ${meeting.theme}`].filter(Boolean).join(" · ")}</p>
        </header>
        {report.groups.map(group => (
          <section key={group.key}>
            <h2>{group.label}</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Green</th>
                  <th scope="col">Amber</th>
                  <th scope="col">Red</th>
                  <th scope="col">Time</th>
                  <th scope="col">Result</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map(line => {
                  const [green, amber, red] = signals(items.get(line.itemId)!.timing)
                  const notes = [
                    line.guest && "Guest",
                    line.edit && `Edited from ${formatClock(line.edit.fromMs)}: ${line.edit.reason}`,
                    line.award && !line.award.eligible && line.time !== undefined && `Not eligible for awards. ${line.award.reason}`,
                  ].filter(Boolean)
                  return (
                    <tr key={line.itemId}>
                      <th scope="row">{line.name}</th>
                      <td>{line.roleLabel}</td>
                      <td>{green}</td>
                      <td>{amber}</td>
                      <td>{red}</td>
                      <td className="log-time">{line.time ?? "Not timed"}</td>
                      <td>{line.time === undefined ? "" : line.statusLabel}</td>
                      <td>{notes.join(" · ")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ))}
        {report.awards.length > 0 && (
          <section>
            <h2>Award eligibility</h2>
            <ul className="log-awards">
              {report.awards.map(award => (
                <li key={award.category}>
                  <b>{award.label}:</b> {award.eligible.length ? award.eligible.map(line => line.name).join(", ") : "no one eligible"}
                </li>
              ))}
            </ul>
          </section>
        )}
        <footer className="log-sign">
          <span>Timer: {timer || "________________________"}</span>
          <span>Signature: ________________________</span>
        </footer>
      </article>
    </div>
  )
}
