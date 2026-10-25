import { Ban, Circle, OctagonX, Square, Triangle, type LucideIcon } from "lucide-react"
import type { Signal } from "../domain"

/**
 * How each signal is presented. Every signal has a word, a distinct shape and
 * (in CSS) a distinct pattern, so none of them relies on colour alone.
 */
export const signalPresentation: Record<Signal, { label: string; hint: string; Icon: LucideIcon; filled: boolean }> = {
  none: { label: "READY", hint: "No signal yet", Icon: Circle, filled: false },
  green: { label: "GREEN", hint: "Minimum time reached", Icon: Circle, filled: true },
  amber: { label: "AMBER", hint: "Start wrapping up", Icon: Triangle, filled: true },
  red: { label: "RED", hint: "Time limit reached", Icon: Square, filled: true },
  overtime: { label: "OVERTIME", hint: "Past the grace period", Icon: OctagonX, filled: false },
  disqualified: { label: "DISQUALIFIED", hint: "Outside the contest window", Icon: Ban, filled: false },
}

export function SignalIcon({ signal, size = 28 }: { signal: Signal; size?: number }) {
  const { Icon, filled } = signalPresentation[signal]
  return <Icon size={size} aria-hidden="true" fill={filled ? "currentColor" : "none"} strokeWidth={2.5} />
}

/** Sentence read by screen readers when the signal changes. */
export const signalAnnouncement = (signal: Signal) => {
  const { label, hint } = signalPresentation[signal]
  return `${label[0]}${label.slice(1).toLowerCase()}. ${hint}.`
}
