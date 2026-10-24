import type { Signal, TimingProfile } from "../domain"
import type { ExplainCard } from "./explain"
import { signalAt } from "./timing"

/** Who and what is being timed, as an output may show it. Names are left out in contest mode. */
export type SignalDetails = {
  person?: string
  activity?: string
  range?: string
  contest: boolean
  /** Lets an output keep computing the signal itself if updates stop arriving. */
  profile?: TimingProfile
}

/** A clock baseline: elapsed time at `at`, and whether it keeps counting from there. */
export type ClockState = { elapsedMs: number; at: number; running: boolean; visible: boolean }

/**
 * Anything that shows the signal to the speaker: the speaker view window
 * today, the Tommy device (LED ring, screen, speaker) later. Outputs are told
 * only about changes; between changes they derive the clock from the baseline.
 */
export interface SignalOutput {
  setSignal(signal: Signal, details: SignalDetails): void
  setClock(clock: ClockState): void
  setSilent(silent: boolean): void
  /** Shows the "Explain the signals" card instead of the signal; null returns to the signal. */
  showExplanation(card: ExplainCard | null): void
  close(): void
}

export type SignalSnapshot = {
  signal: Signal
  details: SignalDetails
  clock: ClockState
  /** Changes whenever the timer's action log or selected item changes. */
  clockKey: string
  silent: boolean
  explanation: ExplainCard | null
}

/** Sends each kind of change to every output, and only when it actually changed. */
export function createSignalPublisher(outputs: SignalOutput[]) {
  let last: SignalSnapshot | undefined
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  return {
    update(next: SignalSnapshot) {
      const previous = last
      last = next
      for (const output of outputs) {
        if (!previous || previous.signal !== next.signal || !same(previous.details, next.details)) output.setSignal(next.signal, next.details)
        if (!previous || previous.clockKey !== next.clockKey || previous.clock.running !== next.clock.running || previous.clock.visible !== next.clock.visible)
          output.setClock(next.clock)
        if (!previous || previous.silent !== next.silent) output.setSilent(next.silent)
        if (!previous || !same(previous.explanation, next.explanation)) output.showExplanation(next.explanation)
      }
    },
    close: () => outputs.forEach(output => output.close()),
  }
}

/** What a display shows at `now`, derived from the last state it received. */
export function displayAt(state: { signal: Signal; details: SignalDetails; clock: ClockState }, now: number) {
  const { clock, details } = state
  const elapsedMs = clock.running ? clock.elapsedMs + Math.max(0, now - clock.at) : clock.elapsedMs
  // While running, recompute from the profile so the colour keeps advancing even if updates stop.
  const signal = clock.running && details.profile ? signalAt(elapsedMs, details.profile) : state.signal
  return { signal, elapsedMs }
}

/** An output that records every call. Stands in for the Tommy device in tests. */
export function createFakeDeviceOutput() {
  const calls: { method: keyof SignalOutput; args: unknown[] }[] = []
  const record =
    (method: keyof SignalOutput) =>
    (...args: unknown[]) =>
      void calls.push({ method, args })
  const output: SignalOutput = {
    setSignal: record("setSignal"),
    setClock: record("setClock"),
    setSilent: record("setSilent"),
    showExplanation: record("showExplanation"),
    close: record("close"),
  }
  return { output, calls }
}
