import { describe, expect, it } from "vitest"
import type { AgendaItem, AgendaRole, Meeting, SegmentKind } from "../domain"
import { agendaWarnings, evaluatingLabel, insertItem, moveItem, moveSegment, nextInOrder, orderedItems, personLabel } from "./agenda"
import { defaultRules, profileFor } from "./profiles"

const item = (id: string, role: AgendaRole, personName: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id,
  order: 0,
  role,
  personName,
  timing: profileFor(role, defaultRules),
  ...extra,
})

function meeting(...segments: [SegmentKind, AgendaItem[]][]): Meeting {
  return {
    id: "m",
    date: "2026-10-24",
    status: "draft",
    createdAt: 0,
    updatedAt: 0,
    segments: segments.map(([kind, items]) => ({ id: kind, kind, items: items.map((it, order) => ({ ...it, order })) })),
  }
}

const names = (m: Meeting) => orderedItems(m).map(personLabel)

describe("meeting order", () => {
  const m = meeting(
    ["prepared_speeches", [item("s1", "Speaker", "Ada"), item("s2", "Speaker", "Ben")]],
    ["table_topics", [item("t1", "TableTopicsSpeaker", "Gia", { guest: true })]],
    ["evaluations", [item("e1", "Evaluator", "Eva", { evaluatesItemId: "s1" })]],
  )

  it("runs segment by segment, items by their order", () => {
    expect(names(m)).toEqual(["Ada", "Ben", "Gia", "Eva"])
  })

  it("moves an item within its segment and renumbers", () => {
    const moved = moveItem(m, "s2", 0)
    expect(names(moved)).toEqual(["Ben", "Ada", "Gia", "Eva"])
    expect(moved.segments[0].items.map(i => i.order)).toEqual([0, 1])
    expect(names(moveItem(m, "s1", 99))).toEqual(["Ben", "Ada", "Gia", "Eva"])
  })

  it("moves a whole segment, and ignores a move past either end", () => {
    expect(names(moveSegment(m, "evaluations", -1))).toEqual(["Ada", "Ben", "Eva", "Gia"])
    expect(moveSegment(m, "prepared_speeches", -1)).toBe(m)
    expect(moveSegment(m, "evaluations", 1)).toBe(m)
  })

  it("inserts just before another item, or at the end", () => {
    const brief = item("b1", "EvaluatorBrief", "Eva", { evaluatesItemId: "s2" })
    expect(names(insertItem(m, "prepared_speeches", brief, "s2"))).toEqual(["Ada", "Eva", "Ben", "Gia", "Eva"])
    expect(names(insertItem(m, "prepared_speeches", brief))).toEqual(["Ada", "Ben", "Eva", "Gia", "Eva"])
  })

  it("finds who is next across segments, wrapping back to anyone skipped", () => {
    const waiting = (done: string[]) => (i: AgendaItem) => !done.includes(i.id)
    expect(nextInOrder(m, undefined, waiting([]))?.id).toBe("s1")
    expect(nextInOrder(m, "s2", waiting(["s1", "s2"]))?.id).toBe("t1")
    expect(nextInOrder(m, "t1", waiting(["s1", "s2", "t1"]))?.id).toBe("e1")
    expect(nextInOrder(m, "e1", waiting(["s2", "t1", "e1"]))?.id).toBe("s1")
    expect(nextInOrder(m, "e1", waiting(["s1", "s2", "t1", "e1"]))).toBeUndefined()
  })

  it("labels an empty template slot by its role", () => {
    expect(personLabel(item("x", "Evaluator", "  "))).toBe("Evaluator")
  })
})

describe("evaluator pairing", () => {
  it("shows who an evaluator and their brief are evaluating", () => {
    const m = meeting(
      ["prepared_speeches", [item("b1", "EvaluatorBrief", "Eva", { evaluatesItemId: "s1" }), item("s1", "Speaker", "Ada")]],
      ["evaluations", [item("e1", "Evaluator", "Eva", { evaluatesItemId: "s1" })]],
    )
    expect(evaluatingLabel(m, orderedItems(m)[0])).toBe("Evaluating: Ada")
    expect(evaluatingLabel(m, orderedItems(m)[2])).toBe("Evaluating: Ada")
    expect(evaluatingLabel(m, orderedItems(m)[1])).toBeUndefined()
    // Brief and evaluation are two items for one person.
    expect(agendaWarnings(m)).toEqual([])
  })

  it("warns about unpaired evaluators, speakers without one, double pairings and a brief by someone else", () => {
    const m = meeting(
      [
        "prepared_speeches",
        [
          item("s1", "Speaker", "Ada"),
          item("s2", "Speaker", "Ben"),
          item("b3", "EvaluatorBrief", "Zed", { evaluatesItemId: "s3" }),
          item("s3", "Speaker", "Cy"),
        ],
      ],
      [
        "evaluations",
        [
          item("e1", "Evaluator", "Eva", { evaluatesItemId: "s1" }),
          item("e2", "Evaluator", "Ed", { evaluatesItemId: "s1" }),
          item("e3", "Evaluator", "Flo"),
          item("e4", "Evaluator", "Gus", { evaluatesItemId: "removed" }),
          item("e5", "Evaluator", "Hal", { evaluatesItemId: "s3" }),
        ],
      ],
    )
    expect(agendaWarnings(m).map(w => w.message)).toEqual([
      "Flo (evaluator) is not paired with a speaker.",
      "Gus (evaluator) is not paired with a speaker.",
      "Ada has 2 evaluators: Eva and Ed.",
      "No evaluator for Ben.",
      "The brief before Cy's speech is by Zed, but Hal evaluates it.",
    ])
  })
})
