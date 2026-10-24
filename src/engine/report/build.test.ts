import { describe, expect, it } from "vitest"
import type { AgendaItem, AgendaRole, ClubRules, Meeting, SegmentKind, TimedRecord, TimingAction } from "../../domain"
import { defaultRules, profileFor } from "../profiles"
import { buildRecord, createWallClock } from "../timing"
import { buildReport, outsideReason, shareText, spokenDuration, spokenLine, spokenReport, type Report } from "./index"

const item = (id: string, role: AgendaRole, personName: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id,
  order: 0,
  role,
  personName,
  timing: profileFor(role, defaultRules),
  ...extra,
})
const meeting = (...segments: [SegmentKind, AgendaItem[]][]): Meeting => ({
  id: "m",
  date: "2026-10-24",
  theme: "Bridges",
  status: "live",
  createdAt: 0,
  updatedAt: 0,
  segments: segments.map(([kind, items]) => ({ id: kind, kind, items: items.map((it, order) => ({ ...it, order })) })),
})
const timed = (agenda: Meeting, id: string, ms: number, extra: TimingAction[] = []): TimedRecord => {
  const it = agenda.segments.flatMap(s => s.items).find(i => i.id === id)!
  return buildRecord(id, "m", [{ type: "start", at: 0 }, { type: "stop", at: ms }, ...extra], it.timing)
}
const summary = (report: Report) => report.groups.map(group => [group.label, group.lines.map(line => `${line.name} ${line.time ?? "-"} ${line.statusLabel}`)])

const agenda = meeting(
  ["opening", [item("tm", "Toastmaster", "Tess")]],
  [
    "prepared_speeches",
    [item("b1", "EvaluatorBrief", "Eva", { evaluatesItemId: "s1" }), item("s1", "Speaker", "Ada"), item("s2", "Speaker", "Ben"), item("s3", "Speaker", "Cy")],
  ],
  [
    "table_topics",
    [item("t1", "TableTopicsSpeaker", "Gia", { guest: true }), item("t2", "TableTopicsSpeaker", "Hal"), item("t3", "TableTopicsSpeaker", "Ivy")],
  ],
  ["evaluations", [item("e1", "Evaluator", "Eva", { evaluatesItemId: "s1" }), item("ge", "GeneralEvaluator", "Gus")]],
  ["reports", [item("tr", "Timer", "Tom")]],
)
const records = [
  timed(agenda, "b1", 50_000),
  timed(agenda, "s1", 372_000),
  timed(agenda, "s2", 465_000),
  timed(agenda, "t1", 75_000),
  timed(agenda, "t2", 30_000),
  timed(agenda, "e1", 200_000, [{ type: "edit", at: 1, ms: 150_000, reason: "Started late" }]),
  // Ivy was started and reset: skipped, so not timed.
  buildRecord(
    "t3",
    "m",
    [
      { type: "start", at: 0 },
      { type: "reset", at: 5_000 },
    ],
    agenda.segments[2].items[2].timing,
  ),
  // Gus is still speaking.
  buildRecord("ge", "m", [{ type: "start", at: 0 }], agenda.segments[3].items[1].timing),
]
const rules: Pick<ClubRules, "withinRule" | "reportStyle" | "tableTopicsGuestsEligible"> = defaultRules

describe("report builder", () => {
  const report = buildReport(agenda, records, rules)

  it("groups like a Timer's log, keeps agenda order, and lists everyone; no time is never 0:00", () => {
    expect(summary(report)).toEqual([
      ["Prepared speeches", ["Ada 6:12 Within time", "Ben 7:45 Over time", "Cy - Not timed"]],
      ["Evaluations", ["Eva 0:50 Within time", "Eva 2:30 Within time", "Gus - Still timing"]],
      ["Table Topics", ["Gia 1:15 Within time", "Hal 0:30 Under time", "Ivy - Not timed"]],
      ["Other", ["Tess - Not timed", "Tom - Not timed"]],
    ])
    const ada = report.groups[0].lines[0]
    expect(ada).toMatchObject({ roleLabel: "Speaker", range: "5:00 to 7:00", status: "within" })
  })

  it("keeps the latest edit and its reason", () => {
    const eva = report.groups[1].lines[1]
    expect(eva.edit).toMatchObject({ fromMs: 200_000, toMs: 150_000, reason: "Started late" })
  })

  it("explains in words why a time is outside the window, using the club's grace", () => {
    expect(report.groups[0].lines[1].reason).toBe("Over time: 7:45 is over the 7:30 limit (7:00 plus 30 seconds grace).")
    expect(report.groups[2].lines[1].reason).toBe("Under time: 0:30 is under the 1:00 minimum.")
    const strict = { ...rules, withinRule: "strict" as const }
    expect(outsideReason(450_000, agenda.segments[1].items[1], strict)).toBe("Over time: 7:30 is over the 7:00 limit.")
    expect(outsideReason(280_000, agenda.segments[1].items[1], rules)).toBeUndefined()
    expect(outsideReason(260_000, agenda.segments[1].items[1], rules)).toBe("Under time: 4:20 is under the 4:30 minimum (5:00 less 30 seconds grace).")
  })

  it("marks disqualified speakers, shows them, and gives the reason", () => {
    const contest = meeting(["prepared_speeches", [item("c1", "Speaker", "Dee", { timing: profileFor("Speaker", defaultRules, {}, "contest_international") })]])
    const result = buildReport(contest, [timed(contest, "c1", 451_000)], rules)
    const dee = result.groups[0].lines[0]
    expect([dee.time, dee.statusLabel]).toEqual(["7:31", "Disqualified"])
    expect(dee.award).toEqual({
      category: "speaker",
      eligible: false,
      reason: "Disqualified for time: 7:31 is over the 7:30 limit (7:00 plus 30 seconds grace).",
    })
  })

  it("decides award eligibility: within time only, briefs and other roles do not compete", () => {
    expect(report.awards.map(award => [award.label, award.eligible.map(l => l.name), award.notEligible.map(l => `${l.name}: ${l.award!.reason}`)])).toEqual([
      ["Best Speaker", ["Ada"], ["Ben: Over time: 7:45 is over the 7:30 limit (7:00 plus 30 seconds grace).", "Cy: Not timed."]],
      ["Best Table Topics", ["Gia"], ["Hal: Under time: 0:30 is under the 1:00 minimum.", "Ivy: Not timed."]],
      ["Best Evaluator", ["Eva"], []],
    ])
  })

  it("leaves guests out of Best Table Topics when the club says so", () => {
    const membersOnly = buildReport(agenda, records, { ...rules, tableTopicsGuestsEligible: false })
    const tableTopics = membersOnly.awards.find(award => award.category === "table_topics")!
    expect(tableTopics.eligible).toEqual([])
    expect(tableTopics.notEligible[0].award!.reason).toBe("Guest: this club's Table Topics award is for members only.")
  })
})

describe("spoken report", () => {
  const report = buildReport(agenda, records, rules)

  it("says times the way people do", () => {
    expect(spokenDuration(372_000)).toBe("6 minutes 12 seconds")
    expect(spokenDuration(360_000)).toBe("6 minutes")
    expect(spokenDuration(61_000)).toBe("1 minute 1 second")
    expect(spokenDuration(45_900)).toBe("45 seconds")
  })

  it("reads one line per person, and leaves times out in category style", () => {
    const benjamin = { ...report.groups[0].lines[0], name: "Benjamin Grossier" }
    expect(spokenLine(benjamin, "exact")).toBe("Benjamin Grossier, 6 minutes 12 seconds, within time")
    expect(spokenLine(benjamin, "category")).toBe("Benjamin Grossier, within time")
    expect(spokenLine(report.groups[0].lines[2], "exact")).toBe("Cy, not timed")
  })

  it("is a list of sentences with section names and award eligibility", () => {
    expect(spokenReport(report)).toEqual([
      "Timer's report.",
      "Prepared speeches.",
      "Ada, 6 minutes 12 seconds, within time.",
      "Ben, 7 minutes 45 seconds, over time.",
      "Cy, not timed.",
      "Evaluations.",
      "Eva, 50 seconds, within time.",
      "Eva, 2 minutes 30 seconds, within time.",
      "Gus, still timing.",
      "Table Topics.",
      "Gia, 1 minute 15 seconds, within time.",
      "Hal, 30 seconds, under time.",
      "Ivy, not timed.",
      "Other.",
      "Tess, not timed.",
      "Tom, not timed.",
      "Eligible for Best Speaker: Ada.",
      "Eligible for Best Table Topics: Gia.",
      "Eligible for Best Evaluator: Eva.",
    ])
  })
})

describe("share text", () => {
  it("is plain lines that read well with no formatting: no tables, no 0:00", () => {
    const report = buildReport(meeting(...agenda.segments.slice(1, 3).map(s => [s.kind, s.items] as [SegmentKind, AgendaItem[]])), records, rules)
    expect(shareText(report, agenda, "Riverside Toastmasters")).toBe(
      [
        "*Timer's report*",
        "Riverside Toastmasters, Saturday 24 October 2026",
        "Theme: Bridges",
        "",
        "*Prepared speeches*",
        "- Ada, speaker: 6:12, within time (range 5:00 to 7:00)",
        "- Ben, speaker: 7:45, over time (range 5:00 to 7:00)",
        "- Cy, speaker: Not timed (range 5:00 to 7:00)",
        "",
        "*Evaluations*",
        "- Eva, evaluator brief: 0:50, within time (range up to 1:00)",
        "",
        "*Table Topics*",
        "- Gia (guest), table topics speaker: 1:15, within time (range 1:00 to 2:00)",
        "- Hal, table topics speaker: 0:30, under time (range 1:00 to 2:00)",
        "- Ivy, table topics speaker: Not timed (range 1:00 to 2:00)",
        "",
        "*Award eligibility*",
        "Best Speaker: Ada",
        "- Not eligible: Ben. Over time: 7:45 is over the 7:30 limit (7:00 plus 30 seconds grace).",
        "- Not eligible: Cy. Not timed.",
        "Best Table Topics: Gia",
        "- Not eligible: Hal. Under time: 0:30 is under the 1:00 minimum.",
        "- Not eligible: Ivy. Not timed.",
      ].join("\n"),
    )
  })

  it("leaves times out in category style and marks edits", () => {
    const report = buildReport(agenda, records, { ...rules, reportStyle: "category" })
    const text = shareText(report, { date: "2026-10-24" })
    expect(text).toContain("- Ada, speaker: Within time (range 5:00 to 7:00)")
    expect(text).toContain("- Eva, evaluator: Within time (range 2:00 to 3:00; edited: Started late)")
    expect(text).not.toMatch(/\d:\d\d, /)
  })
})

describe("wall clock", () => {
  it("never runs backwards when the system clock is corrected", () => {
    const readings = [1_000, 2_000, 1_500, 2_500]
    const clock = createWallClock(() => readings.shift()!)
    expect([clock(), clock(), clock(), clock()]).toEqual([1_000, 2_000, 2_000, 2_500])
  })
})
