import { describe, expect, it } from "vitest"
import type { AgendaItem, AgendaRole, Meeting, SegmentKind } from "../domain"
import {
  agendaWarnings,
  duplicateLast,
  participantTiming,
  segmentTitle,
  timedItems,
  evaluatingLabel,
  insertItem,
  moveItem,
  moveSegment,
  nextInOrder,
  orderedItems,
  personLabel,
  queueOf,
} from "./agenda"
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

describe("duplicate the last item", () => {
  const m = meeting(
    ["prepared_speeches", [item("s1", "Speaker", "Ada"), item("s2", "Speaker", "Ben", { speechTitle: "Bridges", profileId: "speech_8_10", personId: "p" })]],
    ["evaluations", [item("e1", "Evaluator", "Eva", { evaluatesItemId: "s1", profileId: "evaluation" })]],
    ["reports", []],
  )

  it("copies the role, profile and timing, never the person or title", () => {
    expect(duplicateLast(m, "prepared_speeches")).toEqual({ role: "Speaker", personName: "", profileId: "speech_8_10", timing: m.segments[0].items[1].timing })
  })

  it("pairs a copied evaluator with the next speech that has no evaluator", () => {
    expect(duplicateLast(m, "evaluations")?.evaluatesItemId).toBe("s2")
    const full = meeting(
      ...m.segments.map(
        s => [s.kind, s.id === "evaluations" ? [...s.items, item("e2", "Evaluator", "Ed", { evaluatesItemId: "s2" })] : s.items] as [SegmentKind, AgendaItem[]],
      ),
    )
    expect(duplicateLast(full, "evaluations")?.evaluatesItemId).toBeUndefined()
  })

  it("has nothing to copy in an empty segment", () => {
    expect(duplicateLast(m, "reports")).toBeUndefined()
  })
})

describe("queue", () => {
  const m = meeting(
    ["prepared_speeches", [item("s1", "Speaker", "Ada"), item("s2", "Speaker", "Ben")]],
    ["table_topics", [item("t1", "TableTopicsSpeaker", "Gia")]],
    ["evaluations", [item("e1", "Evaluator", "Eva")]],
  )
  const done = (ids: string[]) => (i: AgendaItem) => ids.includes(i.id)
  const ids = (items: AgendaItem[]) => items.map(i => i.id)

  it("splits the meeting into done, on now and still to come, in agenda order", () => {
    const queue = queueOf(m, "t1", done(["s1", "s2"]))
    expect([ids(queue.done), queue.current?.id, ids(queue.upcoming)]).toEqual([["s1", "s2"], "t1", ["e1"]])
  })

  it("keeps a skipped person in the upcoming list", () => {
    const queue = queueOf(m, "e1", done(["s1", "t1"]))
    expect([ids(queue.done), ids(queue.upcoming)]).toEqual([["s1", "t1"], ["s2"]])
    expect(queueOf(m, undefined, done([])).current).toBeUndefined()
  })
})

describe("agenda-only lines and imported segments", () => {
  const m = meeting(
    ["opening", [item("intro", "Grammarian", "Gus", { timed: false }), item("tm", "Toastmaster", "Tess")]],
    ["prepared_speeches", [item("s1", "Speaker", "Ada")]],
    ["table_topics", [item("ttm", "TableTopicsMaster", "Tia", { timed: false })]],
  )

  it("leaves agenda-only lines out of what the Timer times", () => {
    expect(timedItems(m).map(i => i.id)).toEqual(["tm", "s1"])
  })

  it("uses a printed segment title and the printed Table Topics timing", () => {
    expect(segmentTitle({ kind: "other", title: "Closing" })).toBe("Closing")
    expect(segmentTitle({ kind: "reports" })).toBe("Reports")
    expect(participantTiming(m, defaultRules)).toMatchObject({ profileId: "table_topics", timing: { green: 60, red: 120 } })
    const printed = { ...profileFor("TableTopicsSpeaker", defaultRules), red: 150 }
    const withPrinted = { ...m, segments: m.segments.map(s => (s.kind === "table_topics" ? { ...s, participantTiming: printed } : s)) }
    expect(participantTiming(withPrinted, defaultRules)).toEqual({ timing: printed })
  })
})
