import { useEffect, useState } from "react"
import { Maximize2, WifiOff } from "lucide-react"
import type { ExplainCard } from "../../engine/explain"
import { formatClock } from "../../engine/profiles"
import { displayAt } from "../../engine/signal-output"
import { clock } from "../runtime"
import { linkLost, openFrameChannel, type DisplayFrame } from "../signal-channel"
import { SignalIcon, signalPresentation } from "../signals"

/** Follows the Timer window's frames. Re-renders four times a second to advance the clock locally. */
function useDisplayFeed() {
  const [feed, setFeed] = useState<{ frame?: DisplayFrame; heardAt?: number }>({})
  const [, setTick] = useState(0)
  useEffect(() => {
    const channel = openFrameChannel()
    const unsubscribe = channel.subscribe(message => {
      if (message.kind === "frame") setFeed({ frame: message.frame, heardAt: clock() })
    })
    channel.post({ kind: "hello" })
    const id = setInterval(() => setTick(tick => tick + 1), 250)
    return () => {
      clearInterval(id)
      unsubscribe()
      channel.close()
    }
  }, [])
  return feed
}

/**
 * The view that faces the speaker, in its own window. "speaker" is the
 * full-screen card replacement; "zoom" is a clean 16:9 frame for screen
 * sharing or a virtual camera.
 */
export function SpeakerView({ mode }: { mode: "speaker" | "zoom" }) {
  const { frame, heardAt } = useDisplayFeed()
  const now = clock()
  const lost = linkLost(heardAt, now)
  const display = frame ? displayAt(frame, now) : { signal: "none" as const, elapsedMs: 0 }
  const { label } = signalPresentation[display.signal]
  const showName = frame && !frame.details.contest && frame.details.person

  useEffect(() => {
    document.title = mode === "zoom" ? "Tommy – Zoom view" : "Tommy – Speaker view"
  }, [mode])

  if (frame?.explanation && mode === "speaker") return <ExplainCardView card={frame.explanation} lost={lost} />

  return (
    <main className={`sv-root sv-${mode}`}>
      <section className={`sv-stage signal-${display.signal}`} aria-label={`Signal ${label.toLowerCase()}`}>
        {/* Re-mounted on every signal change so the flash animation plays once. */}
        <div key={display.signal} className="sv-flash" aria-hidden="true" />
        <div className="sv-signal">
          <SignalIcon signal={display.signal} size={mode === "zoom" ? 220 : 120} />
          <span className="sv-word">{frame ? label : "WAITING"}</span>
        </div>
        {frame?.clock.visible && <div className="sv-clock">{formatClock(display.elapsedMs)}</div>}
        {mode === "speaker" && frame && (
          <p className="sv-who">
            {showName ? `${frame.details.person} · ` : ""}
            {frame.details.activity ? `${frame.details.activity} ${frame.details.range ?? ""}` : ""}
          </p>
        )}
        {!frame && mode === "speaker" && <p className="sv-who">Waiting for the Timer…</p>}
      </section>
      {lost && frame && (
        <p className="sv-badge" role="status">
          <WifiOff size={18} aria-hidden="true" />
          Reconnecting…
        </p>
      )}
      {mode === "speaker" && <FullscreenButton />}
    </main>
  )
}

function FullscreenButton() {
  const [full, setFull] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const update = () => setFull(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", update)
    return () => document.removeEventListener("fullscreenchange", update)
  }, [])
  if (full || !document.fullscreenEnabled) return null
  return (
    <button className="sv-fullscreen" onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}>
      <Maximize2 size={20} aria-hidden="true" />
      Full screen
    </button>
  )
}

export function ExplainCardView({ card, lost }: { card: ExplainCard; lost?: boolean }) {
  return (
    <main className="sv-root sv-explain">
      <h1>{card.title}</h1>
      <ul className="sv-explain-signals">
        {card.signals.map(entry => (
          <li key={entry.signal} className={`signal-${entry.signal}`}>
            <SignalIcon signal={entry.signal} size={44} />
            <b>{signalPresentation[entry.signal].label}</b>
            <span>{entry.text}</span>
          </li>
        ))}
      </ul>
      <ul className="sv-explain-rules">
        {card.rules.map(rule => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <dl className="sv-explain-examples">
        {card.examples.map(example => (
          <div key={example.name}>
            <dt>{example.name}</dt>
            <dd>{example.text}</dd>
          </div>
        ))}
      </dl>
      {lost && (
        <p className="sv-badge" role="status">
          <WifiOff size={18} aria-hidden="true" />
          Reconnecting…
        </p>
      )}
    </main>
  )
}
