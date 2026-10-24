import { describe, expect, it } from "vitest"
import type { TimingAction, TimingProfile } from "../../domain"
import { appendAction, buildRecord, canUndo, elapsedAt, stateOf } from "./record"
import { resultFor, signalAt } from "./signal"

const speech: TimingProfile = { green: 300, amber: 360, red: 420, graceSeconds: 30, disqualifyEnabled: false }
const ids = { agendaItemId: "item", meetingId: "meeting" }
const elapsed = (actions: TimingAction[], now: number) => elapsedAt(stateOf(actions), now)

describe("timer replay", () => {
  it("derives elapsed time from timestamps across pause and resume", () => {
    const actions: TimingAction[] = [
      { type: "start", at: 1_000 },
      { type: "pause", at: 61_000 },
      { type: "resume", at: 100_000 },
    ]
    expect(elapsed(actions, 130_000)).toBe(90_000)
    expect(elapsed([...actions, { type: "stop", at: 160_000 }], 999_999)).toBe(120_000)
  })

  it("ignores a double-tapped Start instead of recording it", () => {
    const first = appendAction(undefined, ids, { type: "start", at: 0 }, speech)!
    expect(appendAction(first, ids, { type: "start", at: 200 }, speech)).toBeUndefined()
  })

  it("refuses to stop a timer that never started", () => {
    expect(appendAction(undefined, ids, { type: "stop", at: 0 }, speech)).toBeUndefined()
  })

  it("undo after an accidental stop resumes as if it never happened", () => {
    const actions: TimingAction[] = [
      { type: "start", at: 0 },
      { type: "stop", at: 10_000 },
      { type: "undo", at: 12_000 },
    ]
    expect(stateOf(actions).status).toBe("running")
    expect(elapsed(actions, 20_000)).toBe(20_000)
  })

  it("undo after an accidental reset restores the recorded time", () => {
    const actions: TimingAction[] = [
      { type: "start", at: 0 },
      { type: "stop", at: 300_000 },
      { type: "reset", at: 301_000 },
      { type: "undo", at: 302_000 },
    ]
    expect(stateOf(actions).status).toBe("stopped")
    expect(elapsed(actions, 999_999)).toBe(300_000)
  })

  it("records offsets, including negative ones, and never goes below zero", () => {
    const actions: TimingAction[] = [
      { type: "start", at: 0 },
      { type: "offset", at: 1_000, ms: 30_000 },
      { type: "offset", at: 2_000, ms: -5_000 },
    ]
    const record = buildRecord("i", "m", actions, speech)
    expect(record.offsetsMs).toEqual([30_000, -5_000])
    expect(elapsed(actions, 2_000)).toBe(27_000)
    expect(
      elapsed(
        [
          { type: "start", at: 0 },
          { type: "offset", at: 1_000, ms: -5_000 },
        ],
        1_000,
      ),
    ).toBe(0)
  })

  it("keeps the original value and reason when a stopped time is edited", () => {
    const actions: TimingAction[] = [
      { type: "start", at: 0 },
      { type: "stop", at: 400_000 },
      { type: "edit", at: 500_000, ms: 410_000, reason: "Started late" },
    ]
    const record = buildRecord("i", "m", actions, speech)
    expect(record.elapsedMs).toBe(410_000)
    expect(record.edits).toEqual([{ at: 500_000, fromMs: 400_000, toMs: 410_000, reason: "Started late" }])
    expect(record.actions).toHaveLength(3)
  })

  it("requires a reason for an edit and only allows editing a stopped time", () => {
    const stopped: TimingAction[] = [
      { type: "start", at: 0 },
      { type: "stop", at: 1_000 },
    ]
    const record = buildRecord("i", "m", stopped, speech)
    expect(appendAction(record, ids, { type: "edit", at: 2_000, ms: 5_000, reason: "  " }, speech)).toBeUndefined()
    const running = buildRecord("i", "m", [{ type: "start", at: 0 }], speech)
    expect(appendAction(running, ids, { type: "edit", at: 2_000, ms: 5_000, reason: "x" }, speech)).toBeUndefined()
  })

  it("restores a running timer exactly from its persisted actions", () => {
    const record = buildRecord("i", "m", [{ type: "start", at: 1_000 }], speech)
    expect(elapsed(record.actions, 1_000 + 123_456)).toBe(123_456)
  })

  it("reports whether undo is possible", () => {
    expect(canUndo([])).toBe(false)
    expect(canUndo([{ type: "start", at: 0 }])).toBe(true)
  })
})

describe("signals and results", () => {
  it("changes signal exactly at each threshold", () => {
    expect(signalAt(299_999, speech)).toBe("none")
    expect(signalAt(300_000, speech)).toBe("green")
    expect(signalAt(360_000, speech)).toBe("amber")
    expect(signalAt(420_000, speech)).toBe("red")
    expect(signalAt(450_000, speech)).toBe("red")
    expect(signalAt(450_001, speech)).toBe("overtime")
    expect(signalAt(450_001, { ...speech, disqualifyEnabled: true })).toBe("disqualified")
  })

  it("applies the within-time rule at the window edges", () => {
    expect(resultFor(269_999, speech, "grace")).toBe("under")
    expect(resultFor(270_000, speech, "grace")).toBe("within")
    expect(resultFor(450_000, speech, "grace")).toBe("within")
    expect(resultFor(450_001, speech, "grace")).toBe("over")
    expect(resultFor(299_999, speech, "strict")).toBe("under")
    expect(resultFor(420_001, speech, "strict")).toBe("over")
    expect(resultFor(450_001, { ...speech, disqualifyEnabled: true }, "grace")).toBe("disqualified")
  })
})
