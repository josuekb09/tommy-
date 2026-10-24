import { useEffect, useRef } from "react"
import type { AgendaItem, Meeting, TimedRecord } from "../domain"
import type { ExplainCard } from "../engine/explain"
import { activityLabel, rangeLabel } from "../engine/profiles"
import { createSignalPublisher, type SignalOutput, type SignalSnapshot } from "../engine/signal-output"
import { elapsedAt, signalAt, stateOf } from "../engine/timing"
import type { AppData } from "./hooks"
import { clock } from "./runtime"
import { createBroadcastOutput, openFrameChannel } from "./signal-channel"

/** Who the speaker view is about: whoever is running, else paused, else the Timer's selection. */
export function liveItem(meeting: Meeting, records: TimedRecord[], selectedId?: string): AgendaItem | undefined {
  const items = meeting.segments.flatMap(segment => segment.items)
  const status = (item: AgendaItem) => stateOf(records.find(record => record.agendaItemId === item.id)?.actions ?? []).status
  return items.find(item => status(item) === "running") ?? items.find(item => status(item) === "paused") ?? items.find(item => item.id === selectedId)
}

/** What the speaker should see right now. Names never leave this function in contest mode. */
export function speakerSnapshot(
  data: AppData & { meeting: Meeting },
  selectedId: string | undefined,
  explanation: ExplainCard | null,
  now: number,
): SignalSnapshot {
  const { settings, rules } = data
  const visible = settings.speakerClock
  const item = liveItem(data.meeting, data.records, selectedId)
  if (!item) {
    return {
      signal: "none",
      details: { contest: rules.contestMode },
      clock: { elapsedMs: 0, at: now, running: false, visible },
      clockKey: "none",
      silent: settings.silent,
      explanation,
    }
  }
  const actions = data.records.find(record => record.agendaItemId === item.id)?.actions ?? []
  const state = stateOf(actions)
  const elapsedMs = elapsedAt(state, now)
  const contest = rules.contestMode || item.timing.disqualifyEnabled
  return {
    signal: state.status === "idle" ? "none" : signalAt(elapsedMs, item.timing),
    details: {
      contest,
      activity: activityLabel(item.role),
      range: rangeLabel(item.timing),
      profile: item.timing,
      ...(!contest && { person: item.personName }),
    },
    clock: { elapsedMs, at: now, running: state.status === "running", visible },
    clockKey: `${item.id}:${actions.length}`,
    silent: settings.silent,
    explanation,
  }
}

/**
 * Publishes the live signal to every output for as long as the Timer app is
 * open, whichever screen the Timer is on. Extra outputs (the Tommy device,
 * later) are passed in; the speaker view output is always included.
 */
export function useSpeakerFeed(
  data: (AppData & { meeting: Meeting }) | undefined,
  selectedId: string | undefined,
  explanation: ExplainCard | null,
  extraOutputs: SignalOutput[] = [],
) {
  const latest = useRef({ data, selectedId, explanation })
  const publish = useRef<() => void>(() => undefined)
  useEffect(() => {
    const publisher = createSignalPublisher([createBroadcastOutput(openFrameChannel(), clock), ...extraOutputs])
    publish.current = () => {
      const { data, selectedId, explanation } = latest.current
      if (data) publisher.update(speakerSnapshot(data, selectedId, explanation, clock()))
    }
    // Frequent enough that thresholds reach outputs promptly; the publisher sends only changes.
    const id = setInterval(() => publish.current(), 250)
    return () => {
      clearInterval(id)
      publish.current = () => undefined
      publisher.close()
    }
    // Outputs are fixed for the lifetime of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Publish as soon as anything changes, not only on the next interval.
  useEffect(() => {
    latest.current = { data, selectedId, explanation }
    publish.current()
  }, [data, selectedId, explanation])
}
