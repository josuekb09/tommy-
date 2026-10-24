import { useEffect, useRef, useState } from "react"

export type ReadAloudStatus = "idle" | "speaking" | "paused"

const synth = () => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : undefined)

/** English voices the browser offers, refreshed when it finishes loading them. */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => synth()?.getVoices().filter(isEnglish) ?? [])
  useEffect(() => {
    const speech = synth()
    if (!speech) return
    const load = () => setVoices(speech.getVoices().filter(isEnglish))
    load()
    speech.addEventListener?.("voiceschanged", load)
    return () => speech.removeEventListener?.("voiceschanged", load)
  }, [])
  return voices
}
const isEnglish = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().startsWith("en")

/**
 * Reads sentences aloud one at a time, so the Timer can pause, resume, skip
 * to the next line or stop. Each run has a number: a cancelled utterance
 * that reports "end" late can never move a newer run along.
 */
export function useReadAloud(sentences: string[], voiceURI?: string) {
  const [state, setState] = useState<{ status: ReadAloudStatus; index: number }>({ status: "idle", index: 0 })
  const run = useRef(0)
  const latest = useRef({ sentences, voiceURI })
  useEffect(() => {
    latest.current = { sentences, voiceURI }
  })
  useEffect(
    () => () => {
      run.current++
      synth()?.cancel()
    },
    [],
  )

  const speakFrom = (start: number) => {
    const speech = synth()
    if (!speech) return
    const id = ++run.current
    speech.cancel()
    speech.resume() // a paused engine stays paused after cancel in some browsers
    const next = (index: number) => {
      if (id !== run.current) return
      const { sentences: all, voiceURI: uri } = latest.current
      if (index >= all.length) return setState({ status: "idle", index: 0 })
      setState({ status: "speaking", index })
      const utterance = new SpeechSynthesisUtterance(all[index])
      utterance.lang = "en"
      const voice = uri ? speech.getVoices().find(v => v.voiceURI === uri) : undefined
      if (voice) {
        utterance.voice = voice
        utterance.lang = voice.lang
      }
      utterance.onend = () => next(index + 1)
      utterance.onerror = () => next(index + 1)
      speech.speak(utterance)
    }
    next(start)
  }

  return {
    supported: !!synth(),
    status: state.status,
    index: state.index,
    current: state.status === "idle" ? undefined : sentences[state.index],
    play: () => speakFrom(0),
    pause: () => {
      synth()?.pause()
      setState(s => ({ ...s, status: "paused" }))
    },
    resume: () => {
      synth()?.resume()
      setState(s => ({ ...s, status: "speaking" }))
    },
    skip: () => speakFrom(state.index + 1),
    stop: () => {
      run.current++
      synth()?.cancel()
      setState({ status: "idle", index: 0 })
    },
  }
}
