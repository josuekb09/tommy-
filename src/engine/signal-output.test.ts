import { describe, expect, it } from "vitest"
import type { ClubRules, TimingProfile } from "../domain"
import { explainSignals } from "./explain"
import { builtInProfiles, defaultRules } from "./profiles"
import { createFakeDeviceOutput, createSignalPublisher, displayAt, type SignalSnapshot } from "./signal-output"

const speech: TimingProfile = { green: 300, amber: 360, red: 420, graceSeconds: 30, disqualifyEnabled: false }
const snapshot = (patch: Partial<SignalSnapshot> = {}): SignalSnapshot => ({
  signal: "none",
  details: { person: "Ada", activity: "Speech", range: "5:00 to 7:00", contest: false, profile: speech },
  clock: { elapsedMs: 0, at: 0, running: false, visible: true },
  clockKey: "a:0",
  silent: false,
  explanation: null,
  ...patch,
})

describe("signal publisher", () => {
  it("sends the full state once, then only what changed, to every output (e.g. the Tommy device)", () => {
    const device = createFakeDeviceOutput()
    const second = createFakeDeviceOutput()
    const publisher = createSignalPublisher([device.output, second.output])
    publisher.update(snapshot())
    expect(device.calls.map(call => call.method)).toEqual(["setSignal", "setClock", "setSilent", "showExplanation"])

    // A re-render with nothing new sends nothing.
    publisher.update(snapshot())
    expect(device.calls).toHaveLength(4)

    publisher.update(snapshot({ clockKey: "a:1", clock: { elapsedMs: 0, at: 10, running: true, visible: true } }))
    publisher.update(snapshot({ clockKey: "a:1", clock: { elapsedMs: 0, at: 10, running: true, visible: true }, signal: "green" }))
    publisher.update(snapshot({ clockKey: "a:1", clock: { elapsedMs: 0, at: 10, running: true, visible: true }, signal: "green", silent: true }))
    expect(device.calls.slice(4)).toEqual([
      { method: "setClock", args: [{ elapsedMs: 0, at: 10, running: true, visible: true }] },
      { method: "setSignal", args: ["green", snapshot().details] },
      { method: "setSilent", args: [true] },
    ])
    expect(second.calls).toEqual(device.calls)
  })

  it("closes every output", () => {
    const device = createFakeDeviceOutput()
    createSignalPublisher([device.output]).close()
    expect(device.calls).toEqual([{ method: "close", args: [] }])
  })
})

describe("display state", () => {
  const running = { signal: "none" as const, details: snapshot().details, clock: { elapsedMs: 10_000, at: 1_000, running: true, visible: true } }

  it("keeps the clock and colour advancing from the last baseline, so a quiet link never freezes the colour", () => {
    expect(displayAt(running, 1_000)).toEqual({ signal: "none", elapsedMs: 10_000 })
    expect(displayAt(running, 1_000 + 290_000)).toEqual({ signal: "green", elapsedMs: 300_000 })
    expect(displayAt(running, 1_000 + 350_000)).toEqual({ signal: "amber", elapsedMs: 360_000 })
  })

  it("holds the last state when the timer is not running", () => {
    const stopped = { ...running, signal: "red" as const, clock: { ...running.clock, running: false, elapsedMs: 425_000 } }
    expect(displayAt(stopped, 9_999_999)).toEqual({ signal: "red", elapsedMs: 425_000 })
  })
})

describe("explain the signals card", () => {
  const rules = (patch: Partial<ClubRules> = {}) => ({ ...defaultRules, ...patch })

  it("is written from the club's rules and profiles", () => {
    const card = explainSignals(rules(), builtInProfiles)
    expect(card.signals.map(entry => entry.signal)).toEqual(["green", "amber", "red", "overtime"])
    expect(card.rules).toEqual([
      "You have 30 seconds of grace after red (Table Topics has no grace period).",
      "Finishing up to 30 seconds before green or after red still counts as within time.",
    ])
    expect(card.examples).toEqual([
      { name: "Prepared speech", text: "green 5:00, amber 6:00, red 7:00" },
      { name: "Evaluation", text: "green 2:00, amber 2:30, red 3:00" },
      { name: "Table Topics", text: "green 1:00, amber 1:30, red 2:00" },
    ])
  })

  it("changes with the rules: grace length, no grace, red on exceeding, contest mode, edited profiles", () => {
    expect(explainSignals(rules({ graceSeconds: 15 }), builtInProfiles).rules[0]).toBe(
      "You have 15 seconds of grace after red (Table Topics has no grace period).",
    )
    const noGrace = explainSignals(rules({ graceEnabled: false }), builtInProfiles)
    expect(noGrace.rules).toEqual(["There is no grace period: red is the limit."])
    expect(noGrace.signals.map(entry => entry.signal)).toEqual(["green", "amber", "red"])
    expect(explainSignals(rules({ redAt: "exceed" }), builtInProfiles).signals[2].text).toBe("You have gone over your maximum time. Please close now.")
    const contest = explainSignals(rules({ contestMode: true }), builtInProfiles)
    expect(contest.signals.at(-1)?.signal).toBe("disqualified")
    expect(contest.rules.at(-1)).toMatch(/names are not shown/)
    const edited = builtInProfiles.map(profile => (profile.id === "speech" ? { ...profile, green: 240, amber: 330, red: 420 } : profile))
    expect(explainSignals(rules(), edited).examples[0].text).toBe("green 4:00, amber 5:30, red 7:00")
  })
})
