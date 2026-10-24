import type { Signal, TimeEdit, TimedRecord, TimerStatus, TimingAction, TimingProfile } from "../../domain"
import { signalAt } from "./signal"

/** Timer state derived by replaying actions. Pure data, no clock reads. */
export type TimerState = {
  status: TimerStatus
  /** Start of the interval currently running, if any. */
  runningSince?: number
  /** Sum of completed running intervals. */
  intervalsMs: number
  offsetsMs: number[]
  /** Set by a manual edit of a stopped time; replaces the computed value. */
  overrideMs?: number
  edits: TimeEdit[]
  startedAt?: number
  stoppedAt?: number
}

export const initialState: TimerState = { status: "idle", intervalsMs: 0, offsetsMs: [], edits: [] }

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export function elapsedAt(state: TimerState, now: number): number {
  if (state.overrideMs !== undefined) return state.overrideMs
  const running = state.status === "running" && state.runningSince !== undefined ? Math.max(0, now - state.runningSince) : 0
  return Math.max(0, state.intervalsMs + running + sum(state.offsetsMs))
}

/**
 * Applies one non-undo action. Returns undefined when the action is not valid
 * in the current state (double-tapped Start, Stop before Start, …) so callers
 * can ignore it instead of recording a no-op.
 */
export function step(state: TimerState, action: Exclude<TimingAction, { type: "undo" }>): TimerState | undefined {
  switch (action.type) {
    case "start":
      return state.status === "idle" ? { ...state, status: "running", runningSince: action.at, startedAt: action.at } : undefined
    case "resume":
      return state.status === "paused" ? { ...state, status: "running", runningSince: action.at } : undefined
    case "pause":
      return state.status === "running" ? { ...closeInterval(state, action.at), status: "paused" } : undefined
    case "stop":
      if (state.status !== "running" && state.status !== "paused") return undefined
      return { ...closeInterval(state, action.at), status: "stopped", stoppedAt: action.at }
    case "reset":
      return state.status === "idle" && !state.offsetsMs.length ? undefined : initialState
    case "offset": {
      if (state.status === "idle" || !Number.isInteger(action.ms)) return undefined
      // A negative offset can only take the time down to zero; the amount that
      // was actually applied is what gets recorded.
      const ms = Math.max(action.ms, -elapsedAt(state, action.at))
      if (ms === 0) return undefined
      const next = { ...state, offsetsMs: [...state.offsetsMs, ms] }
      return state.overrideMs === undefined ? next : { ...next, overrideMs: state.overrideMs + ms }
    }
    case "edit": {
      const reason = action.reason.trim()
      if (state.status !== "stopped" || !reason || !Number.isInteger(action.ms) || action.ms < 0) return undefined
      const fromMs = elapsedAt(state, action.at)
      return { ...state, overrideMs: action.ms, edits: [...state.edits, { at: action.at, fromMs, toMs: action.ms, reason }] }
    }
  }
}

function closeInterval(state: TimerState, at: number): TimerState {
  if (state.status !== "running" || state.runningSince === undefined) return state
  return { ...state, intervalsMs: state.intervalsMs + Math.max(0, at - state.runningSince), runningSince: undefined }
}

type Replay = { state: TimerState; history: TimerState[] }

/** Applies one action, including undo, to a replay. Returns undefined if it has no effect. */
export function applyAction(replay: Replay, action: TimingAction): Replay | undefined {
  if (action.type === "undo") {
    if (!replay.history.length) return undefined
    return { state: replay.history[replay.history.length - 1], history: replay.history.slice(0, -1) }
  }
  const next = step(replay.state, action)
  return next ? { state: next, history: [...replay.history, replay.state] } : undefined
}

export function replay(actions: TimingAction[]): Replay {
  let current: Replay = { state: initialState, history: [] }
  for (const action of actions) current = applyAction(current, action) ?? current
  return current
}

export const stateOf = (actions: TimingAction[]) => replay(actions).state
export const canUndo = (actions: TimingAction[]) => replay(actions).history.length > 0

/** Builds the stored record, refreshing every cached field from the action log. */
export function buildRecord(
  agendaItemId: string,
  meetingId: string,
  actions: TimingAction[],
  profile: TimingProfile,
  extra: Pick<TimedRecord, "legacy"> = {},
): TimedRecord {
  const state = stateOf(actions)
  const lastAt = actions.length ? actions[actions.length - 1].at : 0
  const elapsedMs = elapsedAt(state, lastAt)
  const signalReached: Signal = state.status === "idle" ? "none" : signalAt(elapsedMs, profile)
  return {
    agendaItemId,
    meetingId,
    actions,
    status: state.status,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt,
    elapsedMs,
    offsetsMs: state.offsetsMs,
    edits: state.edits,
    signalReached,
    ...extra,
  }
}

/**
 * Appends an action to a record. Returns undefined when the action would not
 * change anything, so no meaningless entries reach storage.
 */
export function appendAction(
  record: TimedRecord | undefined,
  ids: { agendaItemId: string; meetingId: string },
  action: TimingAction,
  profile: TimingProfile,
): TimedRecord | undefined {
  const actions = record?.actions ?? []
  if (!applyAction(replay(actions), action)) return undefined
  return buildRecord(ids.agendaItemId, ids.meetingId, [...actions, action], profile, { legacy: record?.legacy })
}
