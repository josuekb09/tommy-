import { expect, it } from "vitest"
import { reportRows } from "./report"
import { defaultSettings, presets, type Segment } from "./types"
it("groups only the requested segment's completed turns", () => { const segment: Segment = { id: "s", type: "evaluations", turns: [{ id: "t", name: "Eva", role: "Evaluation", thresholds: presets.Evaluation, status: "done", elapsedMs: 145000 }] }; expect(reportRows(segment, defaultSettings)).toEqual([{ name: "Eva", role: "Evaluation", time: "2:25", within: true, edited: false }]) })
