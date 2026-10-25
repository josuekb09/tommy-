import type { Signal, TimeResult, TimingAction, TimingProfile, WithinRule } from "../../domain"
import type { Clock } from "./clock"
import { applyAction, elapsedAt, replay, type TimerState } from "./record"
import { resultFor, signalAt } from "./signal"

/** An action as requested by a user. The timer stamps it with the clock. */
export type ActionInput = TimingAction extends infer A ? (A extends TimingAction ? Omit<A, "at"> : never) : never

export type TimerEvent =
  | { type: "started" | "paused" | "resumed" | "stopped" | "reset" | "undone"; at: number; elapsedMs: number }
  | { type: "offsetApplied"; at: number; elapsedMs: number; ms: number }
  | { type: "edited"; at: number; elapsedMs: number; fromMs: number; reason: string }
  | { type: "signalChanged"; at: number; elapsedMs: number; from: Signal; to: Signal }

const actionEvents: Record<Exclude<TimingAction["type"], "offset" | "edit">, TimerEvent["type"]> = {
  start: "started",
  pause: "paused",
  resume: "resumed",
  stop: "stopped",
  reset: "reset",
  undo: "undone",
}

/**
 * A portable timer: the action log plus the rules to interpret it. It holds
 * no timers of its own. The host (browser or firmware) calls `tick()` from
 * its render or main loop, and `dispatch()` for user actions, then persists
 * the returned action. Signal changes are reported only at those moments.
 */
export function createTimer(options: { clock: Clock; profile: TimingProfile; withinRule?: WithinRule; actions?: TimingAction[] }) {
  const { clock, profile, withinRule = "grace" } = options
  let actions: TimingAction[] = []
  let current = replay([])
  let lastSignal: Signal = "none"
  const listeners = new Set<(event: TimerEvent) => void>()
  const emit = (event: TimerEvent) => listeners.forEach(listener => listener(event))

  const signalFor = (state: TimerState, now: number): Signal => (state.status === "idle" ? "none" : signalAt(elapsedAt(state, now), profile))

  function emitSignal(now: number) {
    const signal = signalFor(current.state, now)
    if (signal === lastSignal) return
    const from = lastSignal
    lastSignal = signal
    emit({ type: "signalChanged", at: now, elapsedMs: elapsedAt(current.state, now), from, to: signal })
  }

  const timer = {
    /** Replaces the log silently, e.g. after a reload or a change from another tab. Emits nothing. */
    load(log: TimingAction[]) {
      actions = [...log]
      current = replay(actions)
      lastSignal = signalFor(current.state, clock())
    },
    get actions(): readonly TimingAction[] {
      return actions
    },
    state: () => current.state,
    elapsedMs: (now = clock()) => elapsedAt(current.state, now),
    signal: (now = clock()) => signalFor(current.state, now),
    result: (now = clock()): TimeResult => resultFor(elapsedAt(current.state, now), profile, withinRule),
    canUndo: () => current.history.length > 0,

    /**
     * Applies a user action stamped with the clock. Returns the action to
     * persist, or undefined when it had no effect (nothing to persist).
     */
    dispatch(input: ActionInput): TimingAction | undefined {
      const now = clock()
      // Every action time is an evaluation point: report the signal reached
      // just before the action (e.g. amber before Stop), then apply it.
      emitSignal(now)
      const action = { ...input, at: now } as TimingAction
      const next = applyAction(current, action)
      if (!next) return undefined
      const before = elapsedAt(current.state, now)
      actions = [...actions, action]
      current = next
      const elapsedMs = elapsedAt(current.state, now)
      if (action.type === "offset") emit({ type: "offsetApplied", at: now, elapsedMs, ms: action.ms })
      else if (action.type === "edit") emit({ type: "edited", at: now, elapsedMs, fromMs: before, reason: action.reason.trim() })
      else emit({ type: actionEvents[action.type], at: now, elapsedMs } as TimerEvent)
      emitSignal(now)
      return action
    },

    /** Re-evaluates the signal at the current time; call it from the host's loop. */
    tick() {
      emitSignal(clock())
    },

    on(listener: (event: TimerEvent) => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  timer.load(options.actions ?? [])
  return timer
}

export type Timer = ReturnType<typeof createTimer>
