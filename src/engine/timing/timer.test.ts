import { describe, expect, it } from "vitest"
import type { TimingProfile } from "../../domain"
import { createTimer, type TimerEvent } from "./timer"

const speech: TimingProfile = { green: 300, amber: 360, red: 420, graceSeconds: 30, disqualifyEnabled: false }
const tableTopics: TimingProfile = { green: 60, amber: 90, red: 120, graceSeconds: 0, disqualifyEnabled: false }

function setup(actions = [] as Parameters<typeof createTimer>[0]["actions"]) {
  let now = 0
  const timer = createTimer({ clock: () => now, profile: speech, actions })
  const events: TimerEvent[] = []
  timer.on(event => events.push(event))
  return { timer, events, at: (ms: number) => (now = ms) }
}

describe("timer events", () => {
  it("restoring a running timer after a refresh emits nothing, even past a threshold", () => {
    const { timer, events, at } = setup()
    at(400_000)
    timer.load([{ type: "start", at: 0 }])
    timer.tick()
    expect(events).toEqual([])
    expect(timer.signal()).toBe("amber")
    at(420_000)
    timer.tick()
    expect(events).toEqual([{ type: "signalChanged", at: 420_000, elapsedMs: 420_000, from: "amber", to: "red" }])
  })

  it("returns the stamped action to persist, and nothing for an ignored action", () => {
    const { timer, events, at } = setup()
    at(1_000)
    expect(timer.dispatch({ type: "start" })).toEqual({ type: "start", at: 1_000 })
    expect(timer.dispatch({ type: "start" })).toBeUndefined()
    expect(timer.actions).toEqual([{ type: "start", at: 1_000 }])
    expect(events.map(event => event.type)).toEqual(["started"])
  })

  it("reports a signal drop when an offset or undo takes the time back", () => {
    const { timer, events, at } = setup()
    timer.dispatch({ type: "start" })
    at(301_000)
    timer.tick()
    timer.dispatch({ type: "offset", ms: -5_000 })
    expect(events.slice(-2)).toEqual([
      { type: "offsetApplied", at: 301_000, elapsedMs: 296_000, ms: -5_000 },
      { type: "signalChanged", at: 301_000, elapsedMs: 296_000, from: "green", to: "none" },
    ])
  })

  it("signal progresses none→green→amber→red→overtime for Table Topics thresholds", () => {
    let now = 0
    const timer = createTimer({ clock: () => now, profile: tableTopics })
    timer.dispatch({ type: "start" })   // started at t=0
    expect(timer.signal()).toBe("none") // 0 ms elapsed
    now = 59_999
    expect(timer.signal()).toBe("none") // 59.999 s — just before green
    now = 60_000
    expect(timer.signal()).toBe("green") // 1:00 — exactly at green
    now = 90_000
    expect(timer.signal()).toBe("amber") // 1:30
    now = 120_000
    expect(timer.signal()).toBe("red")      // 2:00 exactly
    now = 120_001
    expect(timer.signal()).toBe("overtime") // 2:00.001 — past grace (graceSeconds=0)
  })

  it("stops notifying after unsubscribe", () => {
    const { timer, at } = setup()
    const seen: TimerEvent[] = []
    const off = timer.on(event => seen.push(event))
    off()
    at(5)
    timer.dispatch({ type: "start" })
    expect(seen).toEqual([])
  })
})
