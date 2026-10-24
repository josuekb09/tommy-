import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Download,
  ListOrdered,
  MonitorUp,
  Pause,
  PencilLine,
  Play,
  RotateCcw,
  Square,
  Undo2,
  UserPlus,
  Video,
} from "lucide-react"
import { isTimed, type AgendaItem, type Meeting, type SegmentKind, type Signal, type TimedRecord, type TimeResult } from "../../domain"
import { evaluatingLabel, nextGuestName, nextInOrder, participantTiming, personLabel, queueOf, segmentTitle, sortedItems } from "../../engine/agenda"
import { activityLabel, formatClock, parseClock, rangeLabel, roleLabels } from "../../engine/profiles"
import { resultFor, signalRank, stateOf, type ActionInput, type Timer, type TimerState } from "../../engine/timing"
import { resultLabels } from "../../engine/report"
import { playThresholdTone, unlockAudio } from "../../engine/audio"
import { Sheet, Toggle } from "../components"
import { canCast, castSpeakerView, downloadBackgrounds, openSpeakerWindow, openZoomWindow } from "../present"
import { useSecondTicks, useWakeLock, type AppData } from "../hooks"
import { peopleOf, PersonField, savePerson, type PersonChoice } from "../people"
import { repo } from "../runtime"
import { SignalIcon, signalAnnouncement, signalPresentation } from "../signals"
import { timerFor } from "../timers"

const timedKinds: SegmentKind[] = ["prepared_speeches", "table_topics", "evaluations"]
const timerStateOf = (record?: TimedRecord): TimerState => stateOf(record?.actions ?? [])
const rangeText = (item: AgendaItem) => `${activityLabel(item.role)} ${rangeLabel(item.timing)}`

type Props = {
  data: AppData & { meeting: Meeting }
  readOnly: boolean
  selectedId?: string
  select: (id?: string) => void
  notify: (message: string) => void
  openMeeting: () => void
  explaining: boolean
  setExplaining: (on: boolean) => void
}

export function TimerScreen({ data, readOnly, selectedId, select, notify, openMeeting, explaining, setExplaining }: Props) {
  const { meeting, records, settings, rules } = data
  const recordFor = useMemo(() => new Map(records.map(record => [record.agendaItemId, record])), [records])
  const statusOf = (item: AgendaItem) => timerStateOf(recordFor.get(item.id)).status

  // Which segment and person are on screen: the selection, else whoever is timing, else the next to time.
  const segments = meeting.segments.filter(segment => timedKinds.includes(segment.kind) || segment.items.some(isTimed))
  const runningSegment = segments.find(segment => segment.items.some(item => statusOf(item) === "running"))
  const [segmentId, setSegmentId] = useState<string>()
  const segment = segments.find(s => s.id === segmentId) ?? segments.find(s => s.items.some(item => item.id === selectedId)) ?? runningSegment ?? segments[0]
  // Agenda-only lines (an intro with no time printed, a break) are never timed.
  const items = sortedItems(segment).filter(isTimed)
  const item =
    items.find(i => i.id === selectedId) ?? items.find(i => ["running", "paused"].includes(statusOf(i))) ?? items.find(i => statusOf(i) !== "stopped")
  // "Next" follows the meeting order across segments, as arranged on the Meeting screen.
  const next = nextInOrder(meeting, item?.id, i => isTimed(i) && statusOf(i) === "idle")
  const nextSegment = next && meeting.segments.find(s => s.items.some(i => i.id === next.id))

  const record = item && recordFor.get(item.id)
  const timer = item && timerFor(item, rules.withinRule, record?.actions)
  const state = timerStateOf(record)
  const status = state.status
  const now = useSecondTicks(status === "running", record?.actions)
  const elapsed = timer ? timer.elapsedMs(now) : 0
  const signal: Signal = timer ? timer.signal(now) : "none"
  const presentation = signalPresentation[signal]

  const [sheet, setSheet] = useState<"guest" | "edit" | "present" | "queue">()
  const announcement = useSignalEvents(timer, settings)
  useWakeLock(meeting.status === "live" || !!runningSegment)

  const act = async (input: ActionInput) => {
    if (!item || !timer || readOnly) return
    unlockAudio()
    // Keep this person on screen after Stop, until the Timer moves on.
    if (selectedId !== item.id) select(item.id)
    await dispatchAndSave(meeting.id, item.id, timer, input)
  }
  const goNext = () => {
    if (!next) return
    setSegmentId(undefined)
    select(next.id)
  }
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
    if (status === "stopped" && !confirm(`Reset ${item && personLabel(item)}'s recorded time? You can undo this.`)) return
    void act({ type: "reset" }).then(() => notify("Timer reset. Undo is available."))
  }
  const offset = (seconds: number) => void act({ type: "offset", ms: seconds * 1000 })
  const undo = () => void act({ type: "undo" })

  useKeyboardShortcuts(!sheet && !readOnly && !!item, {
    " ": primary,
    n: () => status !== "running" && status !== "paused" && goNext(),
    u: () => timer?.canUndo() && undo(),
    "1": () => status !== "idle" && offset(5),
    "2": () => status !== "idle" && offset(10),
    "3": () => status !== "idle" && offset(30),
  })

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
            {segmentTitle(s)}
          </button>
        ))}
      </div>

      <header className="ts-person">
        <h1 id="timer-person">{item ? personLabel(item) : `No one in ${segmentTitle(segment)}`}</h1>
        {item ? (
          <p className="ts-range">
            {item.guest && <span className="person-chip guest">Guest</span>}
            {rangeText(item)}
            {evaluatingLabel(meeting, item) && <span className="ts-evaluating">{evaluatingLabel(meeting, item)}</span>}
          </p>
        ) : (
          <button className="text-button ts-open-agenda" onClick={openMeeting}>
            Add people on the Meeting screen
          </button>
        )}
        <div className="ts-next-row">
          <p className="ts-next">
            Next: <b>{next ? personLabel(next) : "no one"}</b>
            {nextSegment && nextSegment.id !== segment.id && <> · {segmentTitle(nextSegment)}</>}
          </p>
          <button className="text-button ts-queue" onClick={() => setSheet("queue")}>
            <ListOrdered size={16} aria-hidden="true" />
            Queue
          </button>
        </div>
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
        <button className="ts-display-button" onClick={() => setSheet("present")} aria-label="Present to the speaker">
          <MonitorUp size={20} aria-hidden="true" />
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

      {sheet === "queue" && (
        <QueueSheet
          data={data}
          currentId={item?.id}
          close={() => setSheet(undefined)}
          choose={id => {
            setSegmentId(undefined)
            select(id)
            setSheet(undefined)
          }}
        />
      )}
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
      {sheet === "present" && (
        <PresentSheet
          close={() => setSheet(undefined)}
          notify={notify}
          explaining={explaining}
          setExplaining={setExplaining}
          showClock={settings.speakerClock}
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

/** Done (with times), on now and still to come, in agenda order. Tap anyone to jump to them. */
function QueueSheet({
  data,
  currentId,
  close,
  choose,
}: {
  data: AppData & { meeting: Meeting }
  currentId?: string
  close: () => void
  choose: (id: string) => void
}) {
  const { meeting, records, rules } = data
  const recordOf = (item: AgendaItem) => records.find(record => record.agendaItemId === item.id)
  const statusOf = (item: AgendaItem) => timerStateOf(recordOf(item)).status
  const segmentOf = (item: AgendaItem) => meeting.segments.find(segment => segment.items.some(i => i.id === item.id))!
  const all = queueOf(meeting, currentId, item => statusOf(item) === "stopped")
  const queue = { ...all, done: all.done.filter(isTimed), upcoming: all.upcoming.filter(isTimed) }
  const detail = (item: AgendaItem) => {
    const record = recordOf(item)
    const status = statusOf(item)
    if (status === "stopped" && record) return `${formatClock(record.elapsedMs)} · ${resultLabels[resultFor(record.elapsedMs, item.timing, rules.withinRule)]}`
    if (status === "running" || status === "paused") return status === "running" ? "Timing now" : "Paused"
    return rangeLabel(item.timing)
  }
  const groups: [string, AgendaItem[]][] = [
    ["On now", queue.current ? [queue.current] : []],
    ["Up next", queue.upcoming],
    ["Done", queue.done],
  ]
  return (
    <Sheet title="Meeting queue" eyebrow="Timer" onClose={close}>
      {groups.map(([title, items]) => (
        <section className="queue-group" key={title} aria-label={title}>
          <h3>
            {title} <small>{items.length}</small>
          </h3>
          {items.length ? (
            <ul>
              {items.map(item => (
                <li key={item.id}>
                  <button className={`queue-item ${statusOf(item)}`} onClick={() => choose(item.id)} aria-current={item.id === currentId ? "true" : undefined}>
                    <b>{personLabel(item)}</b>
                    <small>
                      {roleLabelsFor(item)} · {segmentTitle(segmentOf(item))} · {detail(item)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-queue">{title === "Done" ? "No one timed yet." : "No one."}</p>
          )}
        </section>
      ))}
    </Sheet>
  )
}

const roleLabelsFor = (item: AgendaItem) => (item.guest ? `${roleLabels[item.role]}, guest` : roleLabels[item.role])

function GuestSheet({ data, close, added }: { data: AppData & { meeting: Meeting }; close: () => void; added: (id: string, started: boolean) => void }) {
  const placeholder = nextGuestName(data.meeting)
  const people = useMemo(() => peopleOf(data.members, data.guests), [data.members, data.guests])
  const [person, setPerson] = useState<PersonChoice>({ name: "", guest: true })
  const add = async (start: boolean) => {
    const saved = person.name.trim() ? await savePerson(person) : { personName: placeholder, guest: true as const }
    const item = await repo.meetings.addItem(data.meeting.id, "table_topics", {
      role: "TableTopicsSpeaker",
      ...saved,
      ...participantTiming(data.meeting, data.rules, data.clubProfiles),
    })
    if (start) await dispatchAndSave(data.meeting.id, item.id, timerFor(item, data.rules.withinRule), { type: "start" })
    added(item.id, start)
  }
  return (
    <Sheet title="Add a guest" eyebrow="Table Topics" onClose={close}>
      <PersonField value={person} onChange={setPerson} people={people} placeholder={placeholder} />
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

/** Everything for showing the signal to the speaker: second screen, video calls, the explanation card. */
function PresentSheet({
  close,
  notify,
  explaining,
  setExplaining,
  showClock,
}: {
  close: () => void
  notify: (message: string) => void
  explaining: boolean
  setExplaining: (on: boolean) => void
  showClock: boolean
}) {
  const [help, setHelp] = useState("")
  const present = async () => {
    const result = await openSpeakerWindow()
    if (result === "blocked") return setHelp("The browser blocked the new window. Allow pop-ups for Tommy, then try again.")
    if (result === "second-screen") return notify("Speaker view opened on the other screen")
    setHelp("Drag the speaker window to the projector or second screen, then press Full screen in that window.")
  }
  return (
    <Sheet title="Present to the speaker" eyebrow="Speaker view" onClose={close}>
      <div className="present-actions">
        <button className="primary-button" onClick={() => void present()}>
          <MonitorUp aria-hidden="true" />
          Open speaker view
        </button>
        {canCast() && (
          <button className="secondary-button" onClick={() => void castSpeakerView().catch(() => setHelp("No display was chosen."))}>
            <MonitorUp aria-hidden="true" />
            Cast to a display
          </button>
        )}
        <button
          className="secondary-button"
          onClick={() => (openZoomWindow() ? notify("Share the Zoom view window in your call") : setHelp("Allow pop-ups for Tommy, then try again."))}
        >
          <Video aria-hidden="true" />
          Zoom or Teams view (16:9)
        </button>
        <button className="secondary-button" onClick={() => void downloadBackgrounds().then(() => notify("Backgrounds downloaded"))}>
          <Download aria-hidden="true" />
          Download backgrounds (PNG)
        </button>
      </div>
      {help && (
        <p className="present-help" role="status">
          {help}
        </p>
      )}
      <Toggle label="Show 'Explain the signals' on the speaker view" value={explaining} onChange={setExplaining} />
      <Toggle label="Show the clock to the speaker" value={showClock} onChange={value => void repo.settings.update({ speakerClock: value })} />
    </Sheet>
  )
}
