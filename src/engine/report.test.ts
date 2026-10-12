import { describe, expect, it } from "vitest"
import { reportRows } from "./report"
import { defaultSettings, presets, type Segment, type Turn } from "./types"

describe("report engine", () => {
  it("groups only the requested segment's completed turns with stable IDs", () => {
    const segment: Segment = {
      id: "s",
      type: "evaluations",
      turns: [{ id: "t", name: "Eva", role: "Evaluation", thresholds: presets.Evaluation, status: "done", elapsedMs: 145000 }]
    }
    expect(reportRows(segment, defaultSettings)).toEqual([
      { id: "t", name: "Eva", role: "Evaluation", time: "2:25", within: true, edited: false }
    ])
  })

  it("preserves distinct identities for turns sharing the exact same name and role", () => {
    const turn1: Turn = {
      id: "turn-1",
      name: "Taylor Brooks",
      role: "Table Topics",
      thresholds: presets["Table Topics"],
      status: "done",
      elapsedMs: 75000
    }
    const turn2: Turn = {
      id: "turn-2",
      name: "Taylor Brooks",
      role: "Table Topics",
      thresholds: presets["Table Topics"],
      status: "done",
      elapsedMs: 110000
    }
    const segment: Segment = {
      id: "tt-seg",
      type: "tableTopics",
      turns: [turn1, turn2]
    }

    const rows = reportRows(segment, defaultSettings)
    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe("turn-1")
    expect(rows[0].time).toBe("1:15")
    expect(rows[1].id).toBe("turn-2")
    expect(rows[1].time).toBe("1:50")

    // Editing turn-1 by ID must not modify turn-2
    const editedTurn1: Turn = { ...turn1, elapsedMs: 90000, edited: true }
    const updatedTurns = segment.turns.map(t => t.id === editedTurn1.id ? editedTurn1 : t)
    const updatedRows = reportRows({ ...segment, turns: updatedTurns }, defaultSettings)
    expect(updatedRows[0].time).toBe("1:30")
    expect(updatedRows[0].edited).toBe(true)
    expect(updatedRows[1].time).toBe("1:50")
    expect(updatedRows[1].edited).toBe(false)
  })
})
