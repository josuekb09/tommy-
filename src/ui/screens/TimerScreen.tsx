import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Bell, BellOff, Check, ChevronRight, Maximize2, Minimize2, Pause, PencilLine, Play, RotateCcw, Square, Undo2, UserPlus } from "lucide-react"
import type { AgendaItem, Meeting, Segment, SegmentKind, Signal, TimedRecord, TimeResult } from "../../domain"
import { activityLabel, formatClock, parseClock, profileFor, rangeLabel, segmentLabels } from "../../engine/profiles"
import { signalRank, stateOf, type ActionInput, type Timer, type TimerState } from "../../engine/timing"
import { resultLabels } from "../../engine/report"
import { playThresholdTone, unlockAudio } from "../../engine/audio"
import { Sheet } from "../components"
import { useSecondTicks, useWakeLock, type AppData } from "../hooks"
import { repo } from "../runtime"
import { SignalIcon, signalAnnouncement, signalPresentation } from "../signals"
import { timerFor } from "../timers"

const timedKinds: SegmentKind[] = ["prepared_speeches", "table_topics", "evaluations"]
const sortedItems = (segment: Segment) => [...segment.items].sort((a, b) => a.order - b.order)
const timerStateOf = (record?: TimedRecord): TimerState => stateOf(record?.actions ?? [])
const rangeText = (item: AgendaItem) => `${activityLabel(item.role)} ${rangeLabel(item.timing)}`

type Props = {
  data: AppData & { meeting: Meeting }
  readOnly: boolean
  selectedId?: string
  select: (id?: string) => void
  notify: (message: string) => void
  openMeeting: () => void
}

export function TimerScreen({ data, readOnly, selectedId, select, notify, openMeeting }: Props) {
  const { meeting, records, settings, rules } = data
  const recordFor = useMemo(() => new Map(records.map(record => [record.agendaItemId, record])), [records])
  const statusOf = (item: AgendaItem) => timerStateOf(recordFor.get(item.id)).status

  // Which segment and person are on screen: the selection, else whoever is timing, else the next to time.
  const segments = meeting.segments.filter(segment => timedKinds.includes(segment.kind) || segment.items.length)
  const runningSegment = segments.find(segment => segment.items.some(item => statusOf(item) === "running"))
  const [segmentId, setSegmentId] = useState<string>()
  const segment = segments.find(s => s.id === segmentId) ?? segments.find(s => s.items.some(item => item.id === selectedId)) ?? runningSegment ?? segments[0]
  const items = sortedItems(segment)
  const item =
    items.find(i => i.id === selectedId) ?? items.find(i => ["running", "paused"].includes(statusOf(i))) ?? items.find(i => statusOf(i) !== "stopped")
  const upNext = items.filter(i => i.id !== item?.id && statusOf(i) === "idle")
  const next = upNext[0]

  const record = item && recordFor.get(item.id)
  const timer = item && timerFor(item, rules.withinRule, record?.actions)
  const state = timerStateOf(record)
  const status = state.status
  const now = useSecondTicks(status === "running", record?.actions)
  const elapsed = timer ? timer.elapsedMs(now) : 0
  const signal: Signal = timer ? timer.signal(now) : "none"
  const presentation = signalPresentation[signal]

  const [sheet, setSheet] = useState<"guest" | "edit">()
  const [display, setDisplay] = useState(false)
  const announcement = useSignalEvents(timer, settings)
  useWakeLock(meeting.status === "live" || !!runningSegment || display)

  const act = async (input: ActionInput) => {
    if (!item || !timer || readOnly) return
    unlockAudio()
    // Keep this person on screen after Stop, until the Timer moves on.
    if (selectedId !== item.id) select(item.id)
    await dispatchAndSave(meeting.id, item.id, timer, input)
  }
  const goNext = () => next && select(next.id)
  /** Start, then Stop, then move on: the one button the Timer's thumb rests on. */
  const primary = () => {
    if (status === "idle") {
      // Only one speaker runs at a time: starting someone pauses whoever is running.
      const other = meeting.segments.flatMap(s => s.items).find(i => i.id !== item?.id && statusOf(i) === "running")
      if (other) void dispatchAndSave(meeting.id, other.id, timerFor(other, rules.withinRule, recordFor.get(other.id)?.actions), { type: "pause" })
      return void act({ type: "start" })
    }
    if (status === "running" || status === "paused") return void act({ type: "stop" })
    goNext()
  }
  const reset = () => {
    if (status === "stopped" && !confirm(`Reset ${item?.personName}'s recorded time? You can undo this.`)) return
    void act({ type: "reset" }).then(() => notify("Timer reset. Undo is available."))
  }
  const offset = (seconds: number) => void act({ type: "offset", ms: seconds * 1000 })
  const undo = () => void act({ type: "undo" })

  useKeyboardShortcuts(!sheet && !display && !readOnly && !!item, {
    " ": primary,
    n: () => status !== "running" && status !== "paused" && goNext(),
    u: () => timer?.canUndo() && undo(),
    "1": () => status !== "idle" && offset(5),
    "2": () => status !== "idle" && offset(10),
    "3": () => status !== "idle" && offset(30),
  })

  if (display) return <SpeakerDisplay elapsed={elapsed} signal={signal} exit={() => setDisplay(false)} />

  const stopped = status === "stopped"
  const result: TimeResult | undefined = stopped && timer ? timer.result(now) : undefined
  const primaryLabel = status === "idle" ? "Start" : status === "running" || status === "paused" ? "Stop" : next ? "Next speaker" : "All recorded"

  return (
    <section className="screen ts-screen" aria-labelledby="timer-person">
      <div className="segment-tabs" role="tablist" aria-label="Meeting segments">
        {segments.map(s => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === segment.id}
            className={s.id === segment.id ? "selected" : ""}
            onClick={() => {
              setSegmentId(s.id)
              select(undefined)
            }}
          >
            {segmentLabels[s.kind]}
          </button>
        ))}
      </div>

      <header className="ts-person">
        <h1 id="timer-person">{item?.personName || `No one in ${segmentLabels[segment.kind]}`}</h1>
        {item ? (
          <p className="ts-range">{rangeText(item)}</p>
        ) : (
          <button className="text-button ts-open-agenda" onClick={openMeeting}>
            Add people on the Meeting screen
          </button>
        )}
        <p className="ts-next">
          Next: <b>{next?.personName ?? "no one"}</b>
        </p>
      </header>

      <div className={`ts-stage signal-${signal}`} role="timer" aria-label={`${formatClock(elapsed)} elapsed. Signal ${presentation.label.toLowerCase()}.`}>
        <div className="ts-signal">
          <SignalIcon signal={signal} size={30} />
          <span className="ts-signal-label">{presentation.label}</span>
        </div>
        <div className="ts-clock" aria-hidden="true">
          {formatClock(elapsed)}
        </div>
        {result ? (
          // After Stop the hint line becomes the result, so nothing pushes the controls down.
          <p className={`ts-hint ts-result result-${result}`}>
            <Check size={18} aria-hidden="true" />
            Recorded {formatClock(elapsed)} · {resultLabels[result]}
            {record?.edits.length ? " · edited" : ""}
          </p>
        ) : (
          <p className="ts-hint" aria-hidden="true">
            {status === "paused" ? "Paused" : presentation.hint}
          </p>
        )}
        <button className="ts-display-button" onClick={() => setDisplay(true)} aria-label="Open speaker display">
          <Maximize2 size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="visually-hidden" role="status" aria-live="assertive" aria-atomic="true">
        {announcement}
      </p>

      <div className="ts-controls">
        <div className="ts-adjust" role="group" aria-label="Adjust time">
          {[5, 10, 30, -5].map(seconds => (
            <button
              key={seconds}
              onClick={() => offset(seconds)}
              disabled={!item || readOnly || status === "idle"}
              aria-label={`${seconds > 0 ? "Add" : "Subtract"} ${Math.abs(seconds)} seconds`}
            >
              {seconds > 0 ? `+${seconds}` : `−${-seconds}`} s
            </button>
          ))}
        </div>
        <div className="ts-secondary">
          <button onClick={undo} disabled={!timer || readOnly || !timer.canUndo()}>
            <Undo2 size={18} aria-hidden="true" />
            Undo
          </button>
          <button onClick={reset} disabled={!item || readOnly || status === "idle"}>
            <RotateCcw size={18} aria-hidden="true" />
            Reset
          </button>
          {stopped ? (
            <button onClick={() => setSheet("edit")} disabled={readOnly}>
              <PencilLine size={18} aria-hidden="true" />
              Edit time
            </button>
          ) : (
            <button
              onClick={() => void act({ type: status === "paused" ? "resume" : "pause" })}
              disabled={!item || readOnly || (status !== "running" && status !== "paused")}
            >
              {status === "paused" ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
              {status === "paused" ? "Resume" : "Pause"}
            </button>
          )}
          <button aria-pressed={settings.silent} onClick={() => void repo.settings.update({ silent: !settings.silent })}>
            {settings.silent ? <BellOff size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
            Silent
          </button>
        </div>
        {segment.kind === "table_topics" && (
          <button className="secondary-button ts-guest" onClick={() => setSheet("guest")} disabled={readOnly}>
            <UserPlus size={18} aria-hidden="true" />
            Add guest
          </button>
        )}
        <button className={`ts-primary ts-primary-${status}`} onClick={primary} disabled={!item || readOnly || (stopped && !next)}>
          {status === "idle" ? <Play aria-hidden="true" /> : stopped ? <ChevronRight aria-hidden="true" /> : <Square aria-hidden="true" />}
          {primaryLabel}
        </button>
      </div>

      {sheet === "guest" && (
        <GuestSheet
          data={data}
          close={() => setSheet(undefined)}
          added={(id, started) => {
            select(id)
            setSheet(undefined)
            notify(started ? "Guest added and timing started" : "Guest added to Table Topics")
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

/** Applies an action through the engine (which emits events), then persists it. */
async function dispatchAndSave(meetingId: string, itemId: string, timer: Timer, input: ActionInput) {
  const action = timer.dispatch(input)
  if (action) await repo.records.append(meetingId, itemId, action)
}

/**
 * Reacts to the engine's signalChanged events: announces every change to
 * screen readers, and vibrates or beeps when a running timer moves up a
 * signal (unless silent). Loading a stored timer emits nothing, so a reload
 * or selecting a recorded speaker never buzzes. Returns the announcement.
 */
function useSignalEvents(timer: Timer | undefined, settings: AppData["settings"]) {
  const [announcement, setAnnouncement] = useState("")
  const cues = useRef(settings)
  useEffect(() => {
    cues.current = settings
  }, [settings])
  useEffect(() => {
    if (!timer) return
    return timer.on(event => {
      if (event.type !== "signalChanged") return
      setAnnouncement(signalAnnouncement(event.to))
      const { silent, vibration, sound } = cues.current
      if (silent || timer.state().status !== "running" || signalRank(event.to) <= signalRank(event.from)) return
      if (vibration) navigator.vibrate?.([90, 50, 90])
      if (sound) playThresholdTone()
    })
  }, [timer])
  // Renders happen on whole seconds of elapsed time; let the engine evaluate each one.
  useEffect(() => timer?.tick())
  return announcement
}

/** Single-key shortcuts for laptops. Ignored while typing or with modifier keys. */
function useKeyboardShortcuts(enabled: boolean, handlers: Record<string, () => unknown>) {
  const latest = useRef(handlers)
  useLayoutEffect(() => {
    latest.current = handlers
  })
  // Layout effects run right after the screen updates, so no key press can arrive before the listener.
  useLayoutEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return
      const handler = latest.current[event.key.toLowerCase()]
      if (!handler) return
      event.preventDefault() // Space must not also click the focused button or scroll the page.
      handler()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [enabled])
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
      profileId: "table_topics",
      timing: profileFor("TableTopicsSpeaker", data.rules, data.clubProfiles),
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
          <UserPlus aria-hidden="true" />
          Add guest
        </button>
        <button className="primary-button sheet-submit" onClick={() => void add(true)}>
          <Play aria-hidden="true" />
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

/** Temporary full-screen view; phase 5 replaces it with the synced speaker display. */
function SpeakerDisplay({ elapsed, signal, exit }: { elapsed: number; signal: Signal; exit: () => void }) {
  return (
    <button className={`speaker-display signal-${signal}`} onClick={exit} aria-label="Exit speaker display">
      <span>{formatClock(elapsed)}</span>
      <small>
        <SignalIcon signal={signal} size={22} /> {signalPresentation[signal].label} · Tap to exit
      </small>
      <Minimize2 aria-hidden="true" />
    </button>
  )
}
