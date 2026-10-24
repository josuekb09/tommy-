import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Maximize2, Minimize2, Pause, PencilLine, Play, Plus, RotateCcw, Square, Undo2, UserPlus } from "lucide-react"
import type { Meeting, Segment, SegmentKind, Signal, TimedRecord } from "../../domain"
import { formatClock, parseClock, profileFor, roleLabels, segmentLabels } from "../../engine/profiles"
import { signalRank, stateOf, type ActionInput, type Timer, type TimerState } from "../../engine/timing"
import { resultLabels } from "../../engine/report"
import { playThresholdTone, unlockAudio } from "../../engine/audio"
import { Sheet } from "../components"
import { useSecondTicks, useWakeLock, type AppData } from "../hooks"
import { repo } from "../runtime"
import { timerFor } from "../timers"

export const signalText: Record<Signal, { label: string; hint: string; cue: string }> = {
  none: { label: "Ready", hint: "No signal yet", cue: "○ READY" },
  green: { label: "Green", hint: "Minimum time reached", cue: "● GREEN" },
  amber: { label: "Amber", hint: "Start wrapping up", cue: "▲ AMBER" },
  red: { label: "Red", hint: "Time limit reached", cue: "■ RED" },
  overtime: { label: "Overtime", hint: "Past the grace period", cue: "✕ OVERTIME" },
  disqualified: { label: "Disqualified", hint: "Outside the contest window", cue: "✕ DISQUALIFIED" },
}
/** CSS uses one red style for every signal past red. */
export const stateClass = (signal: Signal) => (signal === "none" ? "ready" : signal === "overtime" ? "disqualified" : signal)

const timedKinds: SegmentKind[] = ["prepared_speeches", "table_topics", "evaluations"]
const sortedItems = (segment: Segment) => [...segment.items].sort((a, b) => a.order - b.order)
const timerStateOf = (record?: TimedRecord): TimerState => stateOf(record?.actions ?? [])

export function TimerScreen({
  data,
  readOnly,
  selectedId,
  select,
  notify,
  openMeeting,
}: {
  data: AppData & { meeting: Meeting }
  readOnly: boolean
  selectedId?: string
  select: (id?: string) => void
  notify: (message: string) => void
  openMeeting: () => void
}) {
  const { meeting, records, settings, rules } = data
  const recordFor = useMemo(() => new Map(records.map(record => [record.agendaItemId, record])), [records])
  const segments = meeting.segments.filter(segment => timedKinds.includes(segment.kind) || segment.items.length)
  const selectedSegment = segments.find(segment => segment.items.some(item => item.id === selectedId))
  const runningSegment = segments.find(segment => segment.items.some(item => timerStateOf(recordFor.get(item.id)).status === "running"))
  const [segmentId, setSegmentId] = useState<string>()
  const segment = segments.find(s => s.id === segmentId) ?? selectedSegment ?? runningSegment ?? segments[0]
  const items = sortedItems(segment)
  const item =
    items.find(i => i.id === selectedId) ??
    items.find(i => ["running", "paused"].includes(timerStateOf(recordFor.get(i.id)).status)) ??
    items.find(i => timerStateOf(recordFor.get(i.id)).status !== "stopped")
  const record = item && recordFor.get(item.id)
  const timer = item && timerFor(item, rules.withinRule, record?.actions)
  const state = timerStateOf(record)
  const running = state.status === "running"
  const now = useSecondTicks(running, record?.actions)
  const elapsed = timer ? timer.elapsedMs(now) : 0
  const signal: Signal = timer ? timer.signal(now) : "none"
  const upNext = items.filter(i => i.id !== item?.id && timerStateOf(recordFor.get(i.id)).status !== "stopped")
  const [sheet, setSheet] = useState<"guest" | "edit">()
  const [display, setDisplay] = useState(false)
  const anyRunning = !!runningSegment

  useWakeLock(anyRunning || display)
  useThresholdCues(timer, settings)

  const act = async (input: ActionInput) => {
    if (!item || !timer || readOnly) return
    unlockAudio()
    await dispatchAndSave(meeting.id, item.id, timer, input)
  }
  const primary = () => {
    if (state.status === "idle") {
      // Only one speaker runs at a time: starting someone pauses whoever is running.
      const other = meeting.segments.flatMap(s => s.items).find(i => i.id !== item?.id && timerStateOf(recordFor.get(i.id)).status === "running")
      if (other) void dispatchAndSave(meeting.id, other.id, timerFor(other, rules.withinRule, recordFor.get(other.id)?.actions), { type: "pause" })
      return act({ type: "start" })
    }
    if (state.status === "running") return act({ type: "pause" })
    if (state.status === "paused") return act({ type: "resume" })
  }
  const reset = () => {
    if (state.status === "stopped" && !confirm(`Reset ${item?.personName}'s recorded time? You can undo this.`)) return
    void act({ type: "reset" }).then(() => notify("Timer reset. Undo is available."))
  }
  const selectSegment = (next: Segment) => {
    setSegmentId(next.id)
    select(undefined)
  }

  if (display) return <SpeakerDisplay elapsed={elapsed} signal={signal} exit={() => setDisplay(false)} />

  const info = signalText[signal]
  const stopped = state.status === "stopped"
  return (
    <section className={`screen timer-screen state-${stateClass(signal)}`}>
      <div className="segment-tabs" role="tablist" aria-label="Meeting segments">
        {segments.map(s => (
          <button key={s.id} role="tab" aria-selected={s.id === segment.id} className={s.id === segment.id ? "selected" : ""} onClick={() => selectSegment(s)}>
            {segmentLabels[s.kind]}
          </button>
        ))}
      </div>
      <div className="speaker-card">
        <div className="speaker-meta">
          <span className="eyebrow">{!item ? "Ready when you are" : state.status === "idle" ? "Ready to time" : stopped ? "Recorded" : "Now timing"}</span>
          <span className={`status-dot ${state.status}`}>{state.status === "idle" ? "Queued" : state.status}</span>
        </div>
        <h1>{item?.personName || "Add someone to this segment"}</h1>
        <p>
          {item
            ? `${roleLabels[item.role]} · ${formatClock(item.timing.green * 1000)} to ${formatClock(item.timing.red * 1000)}`
            : `${items.length} in ${segmentLabels[segment.kind]}`}
        </p>
        {item && (
          <div className="thresholds">
            <span>
              <b>G</b>
              {formatClock(item.timing.green * 1000)}
            </span>
            <span>
              <b>A</b>
              {formatClock(item.timing.amber * 1000)}
            </span>
            <span>
              <b>R</b>
              {formatClock(item.timing.red * 1000)}
            </span>
          </div>
        )}
      </div>
      <div className="timer-panel">
        <div className="timer-state">
          <i className={`signal ${stateClass(signal)}`} aria-hidden="true" />
          <div>
            <b>{info.label}</b>
            <small>{info.hint}</small>
          </div>
          <button className="display-button" onClick={() => setDisplay(true)} aria-label="Open speaker display">
            <Maximize2 size={20} />
          </button>
        </div>
        <div
          className="progress-ring"
          style={{ "--progress": `${item ? Math.min(100, (elapsed / (item.timing.red * 1000)) * 100) : 0}%` } as React.CSSProperties}
        >
          <div className="timer-number">{formatClock(elapsed)}</div>
        </div>
        {settings.signalPatterns && (
          <div className="pattern-cue" aria-hidden="true">
            {info.cue}
          </div>
        )}
        <p className="visually-hidden" role="status" aria-live="assertive">
          {state.status === "idle" ? "" : `${info.label}. ${info.hint}.`}
        </p>
      </div>
      {stopped && item && (
        <div className="recorded-summary">
          <span>
            Recorded {formatClock(elapsed)} · {resultLabels[timer!.result(now)]}
            {record?.edits.length ? " · edited" : ""}
          </span>
          <button className="secondary-button" onClick={() => setSheet("edit")} disabled={readOnly}>
            <PencilLine size={18} />
            Edit time
          </button>
          {upNext[0] && (
            <button className="primary-button" onClick={() => select(upNext[0].id)}>
              Next speaker
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      )}
      <div className="timer-actions">
        <button className="primary-button timer-primary" onClick={() => void primary()} disabled={!item || stopped || readOnly}>
          {running ? (
            <>
              <Pause />
              Pause
            </>
          ) : (
            <>
              <Play />
              {state.status === "paused" ? "Resume" : "Start"}
            </>
          )}
        </button>
        <button
          className="secondary-button stop"
          onClick={() => void act({ type: "stop" })}
          disabled={!item || readOnly || (state.status !== "running" && state.status !== "paused")}
        >
          <Square />
          Stop
        </button>
      </div>
      <div className="catchups">
        <span>Adjust</span>
        {[5, 10, 30, -5].map(seconds => (
          <button
            key={seconds}
            onClick={() => void act({ type: "offset", ms: seconds * 1000 })}
            disabled={!item || readOnly || state.status === "idle"}
            aria-label={`${seconds > 0 ? "Add" : "Subtract"} ${Math.abs(seconds)} seconds`}
          >
            {seconds > 0 ? `+${seconds}` : `−${-seconds}`} s
          </button>
        ))}
      </div>
      <div className="timer-footer">
        <button onClick={reset} disabled={!item || readOnly || state.status === "idle"}>
          <RotateCcw size={16} />
          Reset
        </button>
        <button onClick={() => void act({ type: "undo" })} disabled={!timer || readOnly || !timer.canUndo()}>
          <Undo2 size={16} />
          Undo
        </button>
      </div>
      <section className="up-next">
        <div className="section-head">
          <div>
            <span className="eyebrow">Up next</span>
            <h2>{upNext[0]?.personName || "No one queued"}</h2>
            {upNext[0] && <p className="next-role">{roleLabels[upNext[0].role]}</p>}
          </div>
          <button className="text-button" onClick={openMeeting}>
            Agenda
            <ChevronRight size={16} />
          </button>
        </div>
        {upNext.slice(0, 2).map(next => (
          <button className="queue-preview" key={next.id} onClick={() => select(next.id)}>
            <span className="initials">{initials(next.personName)}</span>
            <span>
              <b>{next.personName}</b>
              <small>{roleLabels[next.role]}</small>
            </span>
            <ChevronRight className="push" size={18} />
          </button>
        ))}
        {segment.kind === "table_topics" ? (
          <button className="primary-button add-empty" onClick={() => setSheet("guest")} disabled={readOnly}>
            <UserPlus />
            Add guest
          </button>
        ) : (
          !upNext.length && (
            <button className="primary-button add-empty" onClick={openMeeting}>
              <Plus />
              Add to agenda
            </button>
          )
        )}
      </section>
      {sheet === "guest" && (
        <GuestSheet
          data={data}
          close={() => setSheet(undefined)}
          added={(id, start) => {
            select(id)
            setSheet(undefined)
            notify(start ? "Guest added and timing started" : "Guest added to Table Topics")
          }}
        />
      )}
      {sheet === "edit" && item && (
        <EditSheet
          elapsed={elapsed}
          close={() => setSheet(undefined)}
          save={(ms, reason) =>
            void act({ type: "edit", ms, reason }).then(() => {
              setSheet(undefined)
              notify("Recorded time edited")
            })
          }
        />
      )}
    </section>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map(part => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase()

/** Applies an action through the engine (which emits events), then persists it. */
async function dispatchAndSave(meetingId: string, itemId: string, timer: Timer, input: ActionInput) {
  const action = timer.dispatch(input)
  if (action) await repo.records.append(meetingId, itemId, action)
}

/**
 * Vibrates and beeps when the engine reports that a running timer moved up to
 * a higher signal. Loading a stored timer (reload, selection) emits nothing.
 */
function useThresholdCues(timer: Timer | undefined, settings: AppData["settings"]) {
  useEffect(() => {
    if (!timer) return
    return timer.on(event => {
      if (event.type !== "signalChanged" || timer.state().status !== "running" || signalRank(event.to) <= signalRank(event.from)) return
      if (settings.vibration) navigator.vibrate?.([90, 50, 90])
      if (settings.sound) playThresholdTone()
    })
  }, [timer, settings.vibration, settings.sound])
  // Renders happen on whole seconds of elapsed time; let the engine evaluate each one.
  useEffect(() => timer?.tick())
}

function GuestSheet({ data, close, added }: { data: AppData & { meeting: Meeting }; close: () => void; added: (id: string, started: boolean) => void }) {
  const tableTopics = data.meeting.segments.find(segment => segment.kind === "table_topics")
  const placeholder = `Guest ${(tableTopics?.items.length ?? 0) + 1}`
  const [name, setName] = useState("")
  const add = async (start: boolean) => {
    const personName = name.trim() || placeholder
    if (name.trim()) await repo.guests.add(personName)
    const item = await repo.meetings.addItem(data.meeting.id, "table_topics", {
      role: "TableTopicsSpeaker",
      personName,
      timing: profileFor("TableTopicsSpeaker", data.rules, data.settings.profileOverrides),
    })
    if (start) await dispatchAndSave(data.meeting.id, item.id, timerFor(item, data.rules.withinRule), { type: "start" })
    added(item.id, start)
  }
  return (
    <Sheet title="Add a guest" eyebrow="Table Topics" onClose={close}>
      <label className="field-label">
        Name
        <input value={name} onChange={event => setName(event.target.value)} placeholder={placeholder} list="guest-names" />
      </label>
      <datalist id="guest-names">
        {data.guests.map(guest => (
          <option key={guest.id} value={guest.name} />
        ))}
      </datalist>
      <div className="sheet-actions">
        <button className="secondary-button sheet-submit" onClick={() => void add(false)}>
          <Plus />
          Add guest
        </button>
        <button className="primary-button sheet-submit" onClick={() => void add(true)}>
          <Play />
          Add and start
        </button>
      </div>
    </Sheet>
  )
}

function EditSheet({ elapsed, close, save }: { elapsed: number; close: () => void; save: (ms: number, reason: string) => void }) {
  const [time, setTime] = useState(formatClock(elapsed))
  const [reason, setReason] = useState("")
  const ms = parseClock(time)
  const valid = ms !== undefined && reason.trim().length > 0
  return (
    <Sheet title="Edit recorded time" eyebrow="Timer log" onClose={close}>
      <label className="field-label">
        Time (m:ss)
        <input aria-label="Recorded time" inputMode="numeric" value={time} onChange={event => setTime(event.target.value)} placeholder="5:30" />
      </label>
      <label className="field-label">
        Reason
        <input aria-label="Reason for the edit" value={reason} onChange={event => setReason(event.target.value)} placeholder="e.g. Timer started late" />
      </label>
      {ms === undefined && <p className="disabled-reason">Enter the time as m:ss, for example 5:30.</p>}
      <p className="disabled-reason">The original time ({formatClock(elapsed)}) is kept in the log.</p>
      <button className="primary-button sheet-submit" disabled={!valid} onClick={() => valid && save(ms, reason)}>
        Save recorded time
      </button>
    </Sheet>
  )
}

function SpeakerDisplay({ elapsed, signal, exit }: { elapsed: number; signal: Signal; exit: () => void }) {
  const info = signalText[signal]
  return (
    <button className={`speaker-display state-${stateClass(signal)}`} onClick={exit} aria-label="Exit speaker display">
      <span>{formatClock(elapsed)}</span>
      <small>{info.cue} · Tap to exit</small>
      <Minimize2 />
    </button>
  )
}
