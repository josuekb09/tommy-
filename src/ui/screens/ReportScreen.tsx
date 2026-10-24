import { Check, Clock3, ClipboardList, Copy, Volume2, X } from "lucide-react"
import type { Meeting } from "../../domain"
import { segmentLabels } from "../../engine/profiles"
import { reportRows, reportText, resultLabels, type ReportRow } from "../../engine/report"
import type { AppData } from "../hooks"

const spoken = (row: ReportRow) => {
  const total = Math.floor(row.elapsedMs / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${row.name}, ${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"}, ${resultLabels[row.result].toLowerCase()}`
}

export function ReportScreen({ data, notify }: { data: AppData & { meeting: Meeting }; notify: (message: string) => void }) {
  const rows = reportRows(data.meeting, data.records, data.rules)
  const groups = data.meeting.segments.map(segment => ({ segment, rows: rows.filter(row => row.segment === segment.kind) })).filter(group => group.rows.length)
  const copy = () =>
    navigator.clipboard
      .writeText(reportText(rows))
      .then(() => notify("Report copied"))
      .catch(() => notify("Copy is not available in this browser"))
  const readAloud = () => {
    if (!("speechSynthesis" in window)) return notify("Read aloud is not available in this browser")
    const utterance = new SpeechSynthesisUtterance(rows.map(spoken).join(". "))
    utterance.lang = "en"
    speechSynthesis.speak(utterance)
  }
  return (
    <section className="screen report-screen">
      <div className="screen-title">
        <div>
          <span className="eyebrow">{data.meeting.date}</span>
          <h1>Timer’s report</h1>
        </div>
      </div>
      <div className="report-actions">
        <button onClick={readAloud} disabled={!rows.length}>
          <Volume2 size={18} />
          Read aloud
        </button>
        <button onClick={() => void copy()} disabled={!rows.length}>
          <Copy size={18} />
          Copy
        </button>
        <button onClick={() => window.print()} disabled={!rows.length}>
          <ClipboardList size={18} />
          Print or PDF
        </button>
      </div>
      {groups.map(({ segment, rows }) => (
        <section className="log-group" key={segment.id}>
          <h2>{segmentLabels[segment.kind]}</h2>
          <div className="report-table">
            <div className="report-head">
              <span>Name</span>
              <span>Time</span>
              <span>Result</span>
            </div>
            {rows.map(row => (
              <div className="report-line" key={row.itemId}>
                <span>
                  <b>{row.name}</b>
                  {row.guest && <span className="person-chip guest">Guest</span>}
                  {row.edit && <small>Edited: {row.edit.reason}</small>}
                </span>
                <span className="time-edit">{row.time}</span>
                <span className={row.result === "within" ? "within yes" : "within no"}>
                  {row.result === "within" ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />} {resultLabels[row.result]}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!rows.length && (
        <div className="report-empty">
          <Clock3 size={28} />
          <b>No times recorded</b>
          <p>Stopped timers appear here.</p>
        </div>
      )}
    </section>
  )
}
