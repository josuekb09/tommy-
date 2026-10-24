import { describe, expect, it } from "vitest"
import type { Signal, TimeEdit, TimeResult, TimerStatus, TimingAction, TimingProfile, WithinRule } from "../../domain"
import vectors from "../../../test-vectors/timing.json"
import { createTimer, type ActionInput, type TimerEvent } from "./timer"

/** The file format documented in docs/TIMING_SPEC.md. */
type Checkpoint = { at: number; status: TimerStatus; elapsedMs: number; signal: Signal; result?: TimeResult; offsetsMs?: number[]; edits?: TimeEdit[] }
type Scenario = {
  name: string
  description?: string
  profile: string
  withinRule?: WithinRule
  actions: TimingAction[]
  ignored?: number[]
  expect: Checkpoint[]
  events?: TimerEvent[]
}
type VectorFile = { format: "tommy-timing-vectors"; version: 1; profiles: Record<string, TimingProfile>; scenarios: Scenario[] }

const file = vectors as VectorFile

/**
 * Reference runner. Firmware runners must follow the same procedure:
 * walk actions and checkpoints in time order (an action before a checkpoint
 * at the same time), dispatch each action, tick at each checkpoint.
 */
function run(scenario: Scenario) {
  let now = 0
  const timer = createTimer({ clock: () => now, profile: file.profiles[scenario.profile], withinRule: scenario.withinRule ?? "grace" })
  const events: TimerEvent[] = []
  timer.on(event => events.push(event))
  const ignored: number[] = []
  const observed: Checkpoint[] = []
  const timeline = [
    ...scenario.actions.map((action, index) => ({ at: action.at, order: 0, index, action })),
    ...scenario.expect.map((checkpoint, index) => ({ at: checkpoint.at, order: 1, index, checkpoint })),
  ].sort((a, b) => a.at - b.at || a.order - b.order || a.index - b.index)

  for (const point of timeline) {
    now = point.at
    if ("action" in point) {
      const { at: _at, ...input } = point.action
      if (!timer.dispatch(input as ActionInput)) ignored.push(point.index)
      continue
    }
    timer.tick()
    const state = timer.state()
    const expected = point.checkpoint
    observed.push({
      at: now,
      status: state.status,
      elapsedMs: timer.elapsedMs(),
      signal: timer.signal(),
      ...(expected.result && { result: timer.result() }),
      ...(expected.offsetsMs && { offsetsMs: state.offsetsMs }),
      ...(expected.edits && { edits: state.edits }),
    })
  }
  return { ignored, observed, events }
}

describe("shared timing test vectors", () => {
  it("is a supported vector file", () => {
    expect(file.format).toBe("tommy-timing-vectors")
    expect(file.version).toBe(1)
    expect(new Set(file.scenarios.map(s => s.name)).size).toBe(file.scenarios.length)
  })

  for (const scenario of file.scenarios) {
    it(scenario.name, () => {
      const { ignored, observed, events } = run(scenario)
      expect(observed).toEqual(scenario.expect)
      expect(ignored).toEqual(scenario.ignored ?? [])
      if (scenario.events) expect(events).toEqual(scenario.events)
    })
  }
})
