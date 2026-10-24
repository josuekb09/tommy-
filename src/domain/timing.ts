/** Thresholds are whole seconds of elapsed speaking time. */
export type TimingProfile = {
  green: number
  amber: number
  red: number
  /** Seconds either side of the green–red window that still count as qualified. */
  graceSeconds: number
  /** Contest rule: outside the grace window the speaker is disqualified for time. */
  disqualifyEnabled: boolean
}

export type Signal = "none" | "green" | "amber" | "red" | "overtime" | "disqualified"
export type TimeResult = "under" | "within" | "over" | "disqualified"

export type TimerStatus = "idle" | "running" | "paused" | "stopped"

/**
 * One user action on a timer. Actions are appended, never rewritten: the
 * record's state is always derived by replaying them, so no recorded time can
 * be silently lost. `at` is a millisecond timestamp from the injected clock.
 */
export type TimingAction =
  | { type: "start"; at: number }
  | { type: "pause"; at: number }
  | { type: "resume"; at: number }
  | { type: "stop"; at: number }
  | { type: "reset"; at: number }
  | { type: "offset"; at: number; ms: number }
  | { type: "edit"; at: number; ms: number; reason: string }
  /** Cancels the most recent action that has not already been undone. */
  | { type: "undo"; at: number }

export type TimeEdit = { at: number; fromMs: number; toMs: number; reason: string }

export type TimedRecord = {
  agendaItemId: string
  meetingId: string
  /** Source of truth. Every field below is derived from it and cached for queries. */
  actions: TimingAction[]
  status: TimerStatus
  startedAt?: number
  stoppedAt?: number
  elapsedMs: number
  offsetsMs: number[]
  edits: TimeEdit[]
  signalReached: Signal
  /** Set when the record was converted from the version 1 database. */
  legacy?: boolean
}
