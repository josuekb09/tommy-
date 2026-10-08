import { describe, expect, it } from "vitest"
import { addOffset, crossed, elapsed, pause, start, stateAt, stop, withinTime } from "./timer"
import { defaultSettings, presets, type Turn } from "./types"
const turn: Turn = { id: "1", name: "A", role: "Speech", thresholds: presets.Speech, status: "queued", elapsedMs: 0 }
const clock = (n: number) => ({ now: () => n })
describe("timer engine", () => {
 it("fires each threshold exactly at its boundary", () => { expect(crossed(299999, 300000, presets.Speech)).toEqual(["green"]); expect(crossed(300000, 360000, presets.Speech)).toEqual(["yellow"]); expect(stateAt(420000, presets.Speech)).toBe("red") })
 it("pauses and resumes from timestamps", () => { const running = start(turn, clock(100)); const paused = pause(running, clock(1100)); expect(paused.elapsedMs).toBe(1000); expect(elapsed(start(paused, clock(5000)), clock(7000))).toBe(3000) })
 it("adds catch-up offset", () => expect(addOffset(turn, 10000).elapsedMs).toBe(10000))
 it("recomputes after refresh while running", () => expect(elapsed(start(turn, clock(1000)), clock(4500))).toBe(3500))
 it("uses the configured within-time tolerance", () => { expect(withinTime(270000, presets.Speech, defaultSettings)).toBe(true); expect(withinTime(269000, presets.Speech, defaultSettings)).toBe(false) })
 it("stops with frozen elapsed time", () => expect(stop(start(turn, clock(0)), clock(2000)).elapsedMs).toBe(2000))
})
