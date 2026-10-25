import { useEffect, useMemo, useState } from "react"
import { Check, ChevronLeft, ChevronRight, Clock3, Copy, Minus, MonitorUp, Pause, Play, Printer, Share2, SkipForward, Square, Volume2, X } from "lucide-react"
import type { Meeting } from "../../domain"
import { formatClock } from "../../engine/profiles"
import { buildReport, shareText, shownTime, spokenReport, type LineStatus, type Report, type ReportLine } from "../../engine/report"
import type { AppData, Notify } from "../hooks"
import { useEnglishVoices, useReadAloud } from "../read-aloud"
import { repo } from "../runtime"

type Props = { data: AppData & { meeting: Meeting }; notify: Notify; openPrint: () => void }

/** The result in words with a matching icon, so it never relies on colour. */
export function StatusChip({ status, label }: { status: LineStatus; label: string }) {
  const Icon = status === "within" ? Check : status === "not_timed" ? Minus : status === "in_progress" ? Clock3 : X
  return (
    <span className={`status-chip status-${status}`}>
      <Icon size={16} aria-hidden="true" /> {label}
    </span>
  )
}

export function ReportScreen({ data, notify, openPrint }: Props) {
  const { meeting, records, rules, settings, club } = data
  const report = useMemo(() => buildReport(meeting, records, rules), [meeting, records, rules])
  const sentences = useMemo(() => spokenReport(report), [report])
  const reader = useReadAloud(sentences, settings.reportVoice)
  const voices = useEnglishVoices()
  const [presenting, setPresenting] = useState(false)
  const text = shareText(report, meeting, club?.name)
  const timedCount = report.groups.flatMap(group => group.lines).filter(line => line.time !== undefined).length
  const canShare = typeof navigator.share === "function"

  const copy = () =>
    navigator.clipboard
      .writeText(text)
      .then(() => notify("Report copied. Paste it into WhatsApp."))
      .catch(() => notify("Copy is not available in this browser"))
  const share = () => navigator.share({ title: "Timer's report", text }).catch(() => undefined)

  return (
    <section className="screen report-screen">
      <div className="screen-title">
        <div>
          <span className="eyebrow">{meeting.date}</span>
          <h1>Timer’s report</h1>
        </div>
      </div>
      <div className="report-actions">
        <button onClick={() => setPresenting(true)} disabled={!report.groups.length}>
          <MonitorUp size={18} aria-hidden="true" />
          Present
        </button>
        <button onClick={() => void copy()} disabled={!report.groups.length}>
          <Copy size={18} aria-hidden="true" />
          Copy for WhatsApp
        </button>
        {canShare && (
          <button onClick={() => void share()} disabled={!report.groups.length}>
            <Share2 size={18} aria-hidden="true" />
            Share
          </button>
        )}
        <button onClick={openPrint} disabled={!report.groups.length}>
          <Printer size={18} aria-hidden="true" />
          Print or PDF
        </button>
      </div>

      {reader.supported && report.groups.length > 0 && (
        <section className="read-aloud" aria-label="Read aloud">
          <div className="read-aloud-controls">
            {reader.status === "idle" ? (
              <button className="primary-button" onClick={reader.play}>
                <Volume2 size={18} aria-hidden="true" />
                Read aloud
              </button>
            ) : (
              <>
                {reader.status === "speaking" ? (
                  <button className="secondary-button" onClick={reader.pause}>
                    <Pause size={18} aria-hidden="true" />
                    Pause
                  </button>
                ) : (
                  <button className="secondary-button" onClick={reader.resume}>
                    <Play size={18} aria-hidden="true" />
                    Resume
                  </button>
                )}
                <button className="secondary-button" onClick={reader.skip}>
                  <SkipForward size={18} aria-hidden="true" />
                  Skip
                </button>
                <button className="secondary-button" onClick={reader.stop}>
                  <Square size={18} aria-hidden="true" />
                  Stop
                </button>
              </>
            )}
          </div>
          {reader.current && (
            <p className="read-aloud-now">
              {reader.index + 1} of {sentences.length}: {reader.current}
            </p>
          )}
          <label className="field-label">
            Voice
            <select value={settings.reportVoice ?? ""} onChange={event => void repo.settings.update({ reportVoice: event.target.value || undefined })}>
              <option value="">Browser default (English)</option>
              {voices.map(voice => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {report.style === "category" && <p className="report-note">Category style: times are left out when the report is read aloud, presented or shared.</p>}

      {report.groups.map(group => (
        <section className="log-group" key={group.key} aria-labelledby={`report-${group.key}`}>
          <h2 id={`report-${group.key}`}>{group.label}</h2>
          <div className="report-table">
            <div className="report-head">
              <span>Name</span>
              <span>Time</span>
              <span>Result</span>
            </div>
            {group.lines.map(line => (
              <ReportLineRow line={line} key={line.itemId} />
            ))}
          </div>
        </section>
      ))}

      {report.awards.length > 0 && <AwardsCard report={report} />}

      {!report.groups.length && (
        <div className="report-empty">
          <Clock3 size={28} aria-hidden="true" />
          <b>Nothing on the agenda yet</b>
          <p>Add people on the Meeting screen. Everyone appears here, with their time once they are timed.</p>
        </div>
      )}
      {report.groups.length > 0 && !timedCount && <p className="report-note">No times recorded yet. Stopped timers appear here.</p>}
      {presenting && <Presenter report={report} close={() => setPresenting(false)} />}
    </section>
  )
}

function ReportLineRow({ line }: { line: ReportLine }) {
  const ineligible = line.award && !line.award.eligible && line.time !== undefined
  return (
    <div className={`report-line line-${line.status}`}>
      <span>
        <b>{line.name}</b>
        {line.guest && <span className="person-chip guest">Guest</span>}
        <small>
          {line.roleLabel} · {line.range}
        </small>
        {line.edit && (
          <small className="report-edited">
            Edited: {line.edit.reason} (was {formatClock(line.edit.fromMs)})
          </small>
        )}
        {ineligible && <small className="report-ineligible">Not eligible for awards. {line.award!.reason}</small>}
      </span>
      <span className="time-edit">{line.time ?? <span aria-hidden="true">–</span>}</span>
      <StatusChip status={line.status} label={line.statusLabel} />
    </div>
  )
}

function AwardsCard({ report }: { report: Report }) {
  return (
    <section className="log-group awards" aria-labelledby="report-awards">
      <h2 id="report-awards">Award eligibility</h2>
      {report.awards.map(award => (
        <div className="award" key={award.category}>
          <h3>{award.label}</h3>
          <p>
            <Check size={16} aria-hidden="true" /> Eligible: {award.eligible.length ? award.eligible.map(line => line.name).join(", ") : "no one"}
          </p>
          {award.notEligible.length > 0 && (
            <ul>
              {award.notEligible.map(line => (
                <li key={line.itemId}>
                  <X size={14} aria-hidden="true" /> <b>{line.name}</b>: {line.award!.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  )
}

/** Large, one section at a time, for showing the report on the projector. Follows the club's report style. */
function Presenter({ report, close }: { report: Report; close: () => void }) {
  const slides = [
    ...report.groups.map(group => ({ label: group.label, lines: group.lines })),
    ...(report.awards.length ? [{ label: "Award eligibility", lines: [] }] : []),
  ]
  const [index, setIndex] = useState(0)
  const slide = slides[Math.min(index, slides.length - 1)]
  const go = (delta: number) => setIndex(i => Math.max(0, Math.min(slides.length - 1, i + delta)))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
      if (event.key === "ArrowRight" || event.key === "PageDown") go(1)
      if (event.key === "ArrowLeft" || event.key === "PageUp") go(-1)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })
  return (
    <div className="presenter" role="dialog" aria-modal="true" aria-labelledby="presenter-title">
      <header>
        <span>
          {Math.min(index, slides.length - 1) + 1} of {slides.length}
        </span>
        <h2 id="presenter-title">{slide.label}</h2>
        <button className="icon-button" aria-label="Close presenter view" onClick={close}>
          <X />
        </button>
      </header>
      {slide.lines.length ? (
        <ol className="presenter-lines">
          {slide.lines.map(line => (
            <li key={line.itemId}>
              <span className="presenter-name">{line.name}</span>
              <span className="presenter-time">{shownTime(line, report.style) ?? ""}</span>
              <StatusChip status={line.status} label={line.statusLabel} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="presenter-awards">
          {report.awards.map(award => (
            <li key={award.category}>
              <b>{award.label}</b>
              <span>{award.eligible.length ? award.eligible.map(line => line.name).join(", ") : "No one eligible"}</span>
            </li>
          ))}
        </ul>
      )}
      <footer>
        <button className="secondary-button" onClick={() => go(-1)} disabled={index === 0}>
          <ChevronLeft aria-hidden="true" />
          Previous
        </button>
        <button className="primary-button" onClick={() => go(1)} disabled={index >= slides.length - 1}>
          Next
          <ChevronRight aria-hidden="true" />
        </button>
      </footer>
    </div>
  )
}
