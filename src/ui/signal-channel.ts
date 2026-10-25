import type { Signal } from "../domain"
import type { ExplainCard } from "../engine/explain"
import type { ClockState, SignalDetails, SignalOutput } from "../engine/signal-output"

/** Everything a speaker view needs, sent as one message so a late window catches up at once. */
export type DisplayFrame = {
  v: 1
  seq: number
  sentAt: number
  signal: Signal
  details: SignalDetails
  clock: ClockState
  silent: boolean
  explanation: ExplainCard | null
}
type Message = { kind: "frame"; frame: DisplayFrame } | { kind: "hello" }

/** A same-device message channel between the Timer window and speaker windows. */
export interface FrameChannel {
  post(message: Message): void
  subscribe(listener: (message: Message) => void): () => void
  close(): void
}

const CHANNEL = "tommy-signal"

export function createBroadcastChannel(name = CHANNEL): FrameChannel {
  const channel = new BroadcastChannel(name)
  return {
    post: message => channel.postMessage(message),
    subscribe(listener) {
      const handler = (event: MessageEvent<Message>) => listener(event.data)
      channel.addEventListener("message", handler)
      return () => channel.removeEventListener("message", handler)
    },
    close: () => channel.close(),
  }
}

/**
 * Fallback for browsers without BroadcastChannel: other windows of the same
 * site receive a `storage` event whenever the key is written.
 */
export function createLocalStorageChannel(key = CHANNEL, storage: Storage = localStorage, target: Window = window): FrameChannel {
  return {
    post(message) {
      try {
        // A nonce makes every write a change, so repeated identical frames still fire events.
        storage.setItem(key, JSON.stringify({ message, nonce: Math.random() }))
      } catch {
        // Storage full or blocked: the speaker view will show "reconnecting".
      }
    },
    subscribe(listener) {
      const handler = (event: StorageEvent) => {
        if (event.key !== key || !event.newValue) return
        try {
          listener((JSON.parse(event.newValue) as { message: Message }).message)
        } catch {
          // Ignore anything that is not ours.
        }
      }
      target.addEventListener("storage", handler)
      return () => target.removeEventListener("storage", handler)
    },
    close: () => undefined,
  }
}

export const openFrameChannel = (): FrameChannel => (typeof BroadcastChannel === "function" ? createBroadcastChannel() : createLocalStorageChannel())

/**
 * The speaker view as a SignalOutput. It keeps the latest frame, sends it on
 * every change, repeats it every second as a heartbeat (so a speaker view can
 * tell when the link is lost), and answers a new window's hello at once.
 */
export function createBroadcastOutput(channel: FrameChannel, clock: () => number, heartbeatMs = 1_000): SignalOutput {
  let seq = 0
  let frame: DisplayFrame = {
    v: 1,
    seq,
    sentAt: clock(),
    signal: "none",
    details: { contest: false },
    clock: { elapsedMs: 0, at: clock(), running: false, visible: true },
    silent: false,
    explanation: null,
  }
  const send = (patch: Partial<DisplayFrame> = {}) => {
    frame = { ...frame, ...patch, seq: ++seq, sentAt: clock() }
    channel.post({ kind: "frame", frame })
  }
  const unsubscribe = channel.subscribe(message => message.kind === "hello" && send())
  const heartbeat = setInterval(() => send(), heartbeatMs)
  return {
    setSignal: (signal, details) => send({ signal, details }),
    setClock: state => send({ clock: state }),
    setSilent: silent => send({ silent }),
    showExplanation: explanation => send({ explanation }),
    close() {
      clearInterval(heartbeat)
      unsubscribe()
      channel.close()
    },
  }
}

/** How long without a frame before a speaker view says it is reconnecting. */
export const LINK_TIMEOUT_MS = 2_000
export const linkLost = (lastHeardAt: number | undefined, now: number) => lastHeardAt === undefined || now - lastHeardAt > LINK_TIMEOUT_MS
