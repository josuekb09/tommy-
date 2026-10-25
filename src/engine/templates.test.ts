import { describe, expect, it } from "vitest"
import type { Meeting } from "../domain"
import { agendaWarnings, orderedItems } from "./agenda"
import { defaultRules, profileFor } from "./profiles"
import { buildDraft, draftToSegments } from "./import/build"
import type { RawAgenda } from "./import/extraction"
import { capeTownSample, pinelandsSample, toastedSample } from "./import/samples"
import { builtInTemplates, segmentKinds, segmentsFromTemplate, templateFromMeeting } from "./templates"

const counter = () => {
  let n = 0
  return () => `new-${++n}`
}
const asMeeting = (segments: Meeting["segments"]): Meeting => ({ id: "m", date: "2026-10-24", status: "draft", createdAt: 0, updatedAt: 0, segments })

describe("built-in templates", () => {
  it("ships ToastED, Cape Town and Pinelands", () => {
    expect(builtInTemplates.map(t => t.name)).toEqual(["ToastED", "Cape Town", "Pinelands"])
  })

  it.each(builtInTemplates.map(t => [t.name, t] as const))("%s has roles and timings only, every segment, and complete pairings", (_, template) => {
    const items = template.segments.flatMap(segment => segment.items)
    expect(items.every(item => item.personName === "" && !item.personId && !item.guest)).toBe(true)
    expect(items.some(item => item.role === "TableTopicsSpeaker")).toBe(false)
    // Every kind is there (a kind may repeat, e.g. two "other" blocks).
    expect([...new Set(template.segments.map(s => s.kind))].sort()).toEqual([...segmentKinds].sort())
    expect(agendaWarnings(asMeeting(template.segments))).toEqual([])
  })

  // The speeches, briefs, evaluations and Table Topics of each built-in must
  // match what the club's real agenda says, read through the import clean-up.
  const signature = (segments: Meeting["segments"]) => {
    const items = orderedItems(asMeeting(segments))
    const keyRoles = new Set(["Speaker", "EvaluatorBrief", "Evaluator", "GeneralEvaluator", "TableTopicsMaster"])
    const kept = items.filter(item => keyRoles.has(item.role))
    const speeches = kept.filter(item => item.role === "Speaker").map(item => item.id)
    return kept.map(item => {
      const kind = segments.find(segment => segment.items.includes(item))!.kind
      const timing =
        item.timed === false ? "untimed" : item.timing.redOnly ? `up to ${item.timing.red}` : `${item.timing.green}-${item.timing.amber}-${item.timing.red}`
      const pairs = item.evaluatesItemId ? ` → speech ${speeches.indexOf(item.evaluatesItemId) + 1}` : ""
      return `${kind} ${item.role} ${timing}${pairs}`
    })
  }
  const fromSample = (sample: RawAgenda) => {
    let n = 0
    return draftToSegments(buildDraft(sample, { rules: defaultRules, people: [] }), () => `d-${++n}`)
  }
  it.each([
    ["ToastED", toastedSample],
    ["Cape Town", capeTownSample],
    ["Pinelands", pinelandsSample],
  ] as const)("%s matches the club's real agenda: order, timings and pairings", (name, sample) => {
    const template = builtInTemplates.find(t => t.name === name)!
    expect(signature(template.segments)).toEqual(signature(fromSample(sample)))
  })

  it("ToastED: a 1:00 brief just before each speech, and no General Evaluator", () => {
    const [toasted] = builtInTemplates
    expect(signature(toasted.segments)).toEqual([
      "prepared_speeches EvaluatorBrief up to 60 → speech 1",
      "prepared_speeches Speaker 240-300-360",
      "prepared_speeches EvaluatorBrief up to 60 → speech 2",
      "prepared_speeches Speaker 300-360-420",
      "prepared_speeches EvaluatorBrief up to 60 → speech 3",
      "prepared_speeches Speaker 300-360-420",
      "table_topics TableTopicsMaster untimed",
      "evaluations Evaluator 120-150-180 → speech 1",
      "evaluations Evaluator 120-150-180 → speech 2",
      "evaluations Evaluator 120-150-180 → speech 3",
    ])
  })

  it("Cape Town runs evaluations before Table Topics; Pinelands has no Table Topics on its agenda", () => {
    const kinds = builtInTemplates[1].segments.map(s => s.kind)
    expect(kinds.indexOf("evaluations")).toBeLessThan(kinds.indexOf("table_topics"))
    const pinelands = builtInTemplates[2]
    expect(pinelands.segments.find(s => s.kind === "table_topics")!.items).toEqual([])
    expect(pinelands.segments.at(-1)!.kind).toBe("table_topics")
  })
})

describe("templates from meetings", () => {
  const speech = profileFor("Speaker", defaultRules)
  const meeting = asMeeting([
    {
      id: "p",
      kind: "prepared_speeches",
      items: [
        {
          id: "s1",
          order: 0,
          role: "Speaker",
          personName: "Ada",
          personId: "mem-1",
          speechTitle: "Engines",
          pathwaysProject: "Level 1",
          profileId: "speech",
          timing: speech,
        },
      ],
    },
    {
      id: "t",
      kind: "table_topics",
      items: [
        {
          id: "t1",
          order: 0,
          role: "TableTopicsSpeaker",
          personName: "Gia",
          guest: true,
          profileId: "table_topics",
          timing: profileFor("TableTopicsSpeaker", defaultRules),
        },
      ],
    },
    {
      id: "e",
      kind: "evaluations",
      items: [{ id: "e1", order: 0, role: "Evaluator", personName: "Eva", evaluatesItemId: "s1", timing: { ...speech, green: 100, amber: 110, red: 120 } }],
    },
  ])

  it("keeps order, roles, timings and pairings, and drops names, titles, projects and Table Topics participants", () => {
    const template = templateFromMeeting(meeting, "Our club", "tpl")
    expect(template.segments.map(s => s.items)).toEqual([
      [{ id: "s1", order: 0, role: "Speaker", personName: "", profileId: "speech", timing: speech }],
      [],
      [{ id: "e1", order: 0, role: "Evaluator", personName: "", evaluatesItemId: "s1", timing: { ...speech, green: 100, amber: 110, red: 120 } }],
    ])
  })

  it("a new meeting from a template gets fresh ids, pairings follow them, and timings use the club's current rules", () => {
    const template = templateFromMeeting(meeting, "Our club", "tpl")
    const segments = segmentsFromTemplate(template, counter(), { ...defaultRules, graceEnabled: false })
    const items = segments.flatMap(s => s.items)
    const [s1, e1] = items
    expect(s1.id).not.toBe("s1")
    expect(e1.evaluatesItemId).toBe(s1.id)
    expect(items.every(item => item.timing.graceSeconds === 0)).toBe(true)
    // A typed timing keeps its thresholds; a library one follows the library.
    expect([e1.timing.green, e1.timing.red]).toEqual([100, 120])
    expect(segments.map(s => s.kind)).toEqual(["prepared_speeches", "table_topics", "evaluations", "opening", "reports", "other"])
  })
})

describe("templates keep the shape of an imported agenda", () => {
  it("keeps segment titles, agenda-only lines, printed roles and the Table Topics timing, and no names or start times", () => {
    const printed = { ...profileFor("TableTopicsSpeaker", defaultRules), red: 150 }
    const imported = asMeeting([
      {
        id: "o",
        kind: "other",
        title: "Closing",
        items: [
          {
            id: "p",
            order: 0,
            role: "President",
            personName: "Pat",
            timing: profileFor("President", defaultRules),
            timed: false,
            roleAsWritten: "President",
            event: "Awards",
            plannedStart: "20:57",
            note: "(CT TM)",
          },
        ],
      },
      { id: "t", kind: "table_topics", participantTiming: printed, items: [] },
    ])
    const template = templateFromMeeting(imported, "Ours", "tpl")
    expect(template.segments[0]).toMatchObject({ title: "Closing", items: [{ personName: "", timed: false, roleAsWritten: "President", event: "Awards" }] })
    expect(template.segments[0].items[0]).not.toHaveProperty("plannedStart")
    expect(template.segments[0].items[0]).not.toHaveProperty("note")
    const segments = segmentsFromTemplate(template, counter(), { ...defaultRules, graceAppliesToTableTopics: true })
    expect(segments[0].title).toBe("Closing")
    expect([segments[1].participantTiming?.red, segments[1].participantTiming?.graceSeconds]).toEqual([150, 30])
  })
})
