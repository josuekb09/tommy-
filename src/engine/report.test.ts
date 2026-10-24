import { describe, expect, it } from "vitest"
import type { Meeting } from "../domain"
import { defaultRules, profileFor } from "./profiles"
import { reportRows, reportText } from "./report"
import { buildRecord, createWallClock } from "./timing"

const speech = profileFor("Speaker", defaultRules)
const meeting: Meeting = {
  id: "m",
  date: "2026-10-24",
  status: "live",
  createdAt: 0,
  updatedAt: 0,
  segments: [
    {
      id: "s",
      kind: "prepared_speeches",
      items: [
        { id: "b", order: 1, role: "Speaker", personName: "Ben", timing: speech },
        { id: "a", order: 0, role: "Speaker", personName: "Ada", timing: speech },
        { id: "c", order: 2, role: "Speaker", personName: "Cy", timing: speech },
      ],
    },
  ],
}

describe("report rows", () => {
  it("lists stopped items in agenda order with their result and edit reason", () => {
    const records = [
      buildRecord(
        "a",
        "m",
        [
          { type: "start", at: 0 },
          { type: "stop", at: 372_000 },
        ],
        speech,
      ),
      buildRecord(
        "b",
        "m",
        [
          { type: "start", at: 0 },
          { type: "stop", at: 200_000 },
          { type: "edit", at: 1, ms: 265_000, reason: "Late start" },
        ],
        speech,
      ),
      buildRecord("c", "m", [{ type: "start", at: 0 }], speech),
    ]
    const rows = reportRows(meeting, records, defaultRules)
    expect(rows.map(row => [row.name, row.time, row.result, row.edit?.reason])).toEqual([
      ["Ada", "6:12", "within", undefined],
      ["Ben", "4:25", "under", "Late start"],
    ])
    expect(reportText(rows)).toBe("Ada (Speaker): 6:12, within time\nBen (Speaker): 4:25, under time [edited: Late start]")
  })
})

describe("wall clock", () => {
  it("never runs backwards when the system clock is corrected", () => {
    const readings = [1_000, 2_000, 1_500, 2_500]
    const clock = createWallClock(() => readings.shift()!)
    expect([clock(), clock(), clock(), clock()]).toEqual([1_000, 2_000, 2_000, 2_500])
  })
})
