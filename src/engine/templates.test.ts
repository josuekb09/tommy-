import { describe, expect, it } from "vitest"
import type { Meeting } from "../domain"
import { agendaWarnings, orderedItems } from "./agenda"
import { defaultRules, profileFor } from "./profiles"
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
    expect([...template.segments.map(s => s.kind)].sort()).toEqual([...segmentKinds].sort())
    expect(agendaWarnings(asMeeting(template.segments))).toEqual([])
  })

  it("ToastED: a 1:00 brief before each speech, the evaluation later, timings as printed", () => {
    const [toasted] = builtInTemplates
    const order = orderedItems(asMeeting(toasted.segments)).map(
      item => `${item.role} ${item.timing.redOnly ? `up to ${item.timing.red}` : `${item.timing.green}-${item.timing.red}`}`,
    )
    expect(order).toEqual([
      "President up to 120",
      "EvaluatorBrief up to 60",
      "Speaker 240-360",
      "EvaluatorBrief up to 60",
      "Speaker 300-420",
      "EvaluatorBrief up to 60",
      "Speaker 300-420",
      "Other up to 900",
      "Evaluator 120-180",
      "Evaluator 120-180",
      "Evaluator 120-180",
      "GeneralEvaluator up to 300",
      "Timer up to 60",
      "AhCounter up to 60",
      "Grammarian up to 60",
    ])
  })

  it("Cape Town runs evaluations before Table Topics", () => {
    const kinds = builtInTemplates[1].segments.map(s => s.kind)
    expect(kinds.indexOf("evaluations")).toBeLessThan(kinds.indexOf("table_topics"))
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
