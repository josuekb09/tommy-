import { describe, expect, it } from "vitest"
import { defaultRules } from "../profiles"
import type { Person } from "../people"
import { buildDraft, cleanName, draftToSegments, looksAlike, type DraftItem, type ImportDraft } from "./build"
import { extractionJsonSchema, rawAgenda } from "./extraction"
import { readRole } from "./roles"
import { capeTownSample, pinelandsSample, row, toastedSample } from "./samples"

const ctx = { rules: defaultRules }
const all = (draft: ImportDraft) => draft.segments.flatMap(segment => segment.items)
const byKey = (draft: ImportDraft) => new Map(all(draft).map(item => [item.key, item]))
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
const signals = (item: DraftItem) =>
  item.timed === false
    ? "untimed"
    : item.timing.redOnly
      ? `red ${clock(item.timing.red)}`
      : `${clock(item.timing.green)}/${clock(item.timing.amber)}/${clock(item.timing.red)}`
const pairs = (draft: ImportDraft) => {
  const items = byKey(draft)
  return all(draft)
    .filter(item => item.evaluatesKey)
    .map(item => `${item.role} ${item.personName} → ${items.get(item.evaluatesKey!)!.personName}`)
}
const flagsOf = (draft: ImportDraft) => all(draft).flatMap(item => item.flags.map(flag => `${item.personName || item.roleAsWritten}: ${flag.message}`))

describe("extraction schema", () => {
  it("is the JSON Schema subset Gemini accepts: nullable as type arrays, no anyOf, no 2^53 bounds", () => {
    const schema = extractionJsonSchema()
    const text = JSON.stringify(schema)
    expect(text).not.toContain("anyOf")
    expect(text).not.toContain("9007199254740991")
    expect(text).not.toContain("$schema")
    const line = (schema.properties as Record<string, { items: { properties: Record<string, { type: unknown; additionalProperties?: boolean }> } }>).lines.items
    expect(line.properties.person.type).toEqual(["string", "null"])
    expect(line.properties.speech.type).toEqual(["object", "null"])
    expect(line.properties.speech.additionalProperties).toBe(false)
  })

  it("validates every sample transcription", () => {
    for (const sample of [toastedSample, capeTownSample, pinelandsSample]) expect(rawAgenda.safeParse(sample).success).toBe(true)
  })
})

describe("printed roles", () => {
  it.each([
    ["Timekeeper", ["Timer"], false],
    ["Timekeepers Report", ["Timer"], true],
    ["Um, Er Counter", ["AhCounter"], false],
    ["Ah Counter", ["AhCounter"], false],
    ["Grammarian/Ah Counter", ["Grammarian", "AhCounter"], false],
    ["SAA calls Meeting to Order", ["SergeantAtArms"], false],
    ["Table Topics Master", ["TableTopicsMaster"], false],
    ["Toastmaster introduces Roleplayers", ["Toastmaster"], false],
    ["Role player reports", ["Toastmaster"], true],
    ["Evaluation Reports", ["Evaluator"], true],
    ["Prepared speeches", ["Speaker"], false],
    ["President makes announcements and closes meeting", ["President"], false],
    ["Club Business", ["Other"], false],
  ])("“%s”", (printed, roles, report) => {
    expect(readRole(printed)).toMatchObject({ roles, report, agendaOnly: false })
  })

  it("reads ordinals and agenda-only lines", () => {
    expect(readRole("3rd Speaker").ordinal).toBe(3)
    expect(readRole("Evaluator 2").ordinal).toBe(2)
    expect(readRole("30 min Break")).toMatchObject({ agendaOnly: true, title: "30 min Break" })
    expect(readRole("Social gathering").agendaOnly).toBe(true)
    expect(readRole("Arrivals").agendaOnly).toBe(true)
  })
})

describe("names", () => {
  it("keeps a home-club tag as a note and mends spacing after an apostrophe", () => {
    expect(cleanName("Lizo Ncapai (CT TM)")).toEqual({ name: "Lizo Ncapai", note: "(CT TM)" })
    expect(cleanName("Christen O' Reilly")).toEqual({ name: "Christen O'Reilly" })
    expect(cleanName(null)).toEqual({ name: "" })
  })

  it("spots two spellings of one person, but not two people who share a surname", () => {
    expect(looksAlike("Kabuya Tambwe", "Kambuya Tambwe")).toBe(true)
    expect(looksAlike("Kubaya Tambwe", "Kabuya Tambwe")).toBe(true)
    expect(looksAlike("Chris Adlam", "Kerri-Lea Adlam")).toBe(false)
    expect(looksAlike("Ed Stone", "Al Stone")).toBe(false)
  })
})

describe("ToastED: two pages, red-only rows, briefs before speeches", () => {
  const draft = buildDraft(toastedSample, ctx)
  const items = all(draft)
  const find = (time: string) => items.find(item => item.plannedStart === time)!

  it("keeps the printed order across both pages, with repeated segments", () => {
    expect(draft.segments.map(s => s.title ?? s.kind)).toEqual([
      "Arrivals",
      "opening",
      "prepared_speeches",
      "Educational",
      "reports",
      "30 min Break",
      "opening",
      "table_topics",
      "reports",
      "evaluations",
      "reports",
      "Closing",
    ])
    expect(items).toHaveLength(36)
  })

  it("reads red-only times, 25:00:00 as 25 minutes, and the Educational as 10/15/20", () => {
    expect(signals(find("18:18"))).toBe("red 25:00")
    expect(signals(find("18:48"))).toBe("red 2:00")
    expect(signals(find("19:20"))).toBe("10:00/15:00/20:00")
    expect(signals(find("18:58"))).toBe("4:00/5:00/6:00")
    expect(signals(items[0])).toBe("untimed")
  })

  it("turns each 1-minute evaluator slot before a speech into a brief, and pairs the evaluations by number", () => {
    expect(pairs(draft)).toEqual([
      "EvaluatorBrief Michaela Geldhof → Kim Austen",
      "EvaluatorBrief Titus Magua → Christina Thomas",
      "EvaluatorBrief Andrea Baptista → Chris Adlam",
      "Evaluator Michaela Geldhof → Kim Austen",
      "Evaluator Titus Magua → Christina Thomas",
      "Evaluator Andrea Baptista → Chris Adlam",
    ])
  })

  it("uses the Table Topics Master's range for each participant and does not time the Master", () => {
    const tableTopics = draft.segments.find(s => s.kind === "table_topics")!
    expect([tableTopics.participantTiming?.green, tableTopics.participantTiming?.red]).toEqual([60, 120])
    expect(find("20:17").timed).toBe(false)
  })

  it("keeps the printed role and speech details, and raises no flags on a clean sheet", () => {
    expect(find("18:50")).toMatchObject({ role: "AhCounter", roleAsWritten: "Um, Er Counter" })
    expect(find("18:58")).toMatchObject({ speechTitle: "Say Yes To Adventure", pathwaysProject: "Level 1 · #1 · Icebreaker" })
    expect(flagsOf(draft)).toEqual([])
  })
})

describe("Cape Town: timings aligned by start time, a guest speaker, five evaluations", () => {
  const draft = buildDraft(capeTownSample, ctx)
  const items = all(draft)

  it("pairs evaluators by speech number and marks the special guest", () => {
    expect(pairs(draft)).toEqual([
      "Evaluator John Hambleton → Ruben Pretorius",
      "Evaluator Chris Adlam → Jan-Hendrik Esterhuyse",
      "Evaluator Wayne Robinson → Lizo Ncapai",
      "Evaluator Reggie Davidson → Tehzeen Anjarwalla",
      "Evaluator Aletta Rochat → Robert Rouessart",
    ])
    expect(items.find(i => i.personName === "Jan-Hendrik Esterhuyse" && i.role === "Speaker")?.guest).toBe(true)
  })

  it("does not time intros and reports with no printed time, and puts Table Topics after the evaluations", () => {
    expect(items.filter(i => i.timed === false).map(i => `${i.roleAsWritten} ${i.event}`)).toEqual([
      "Grammarian Introduction",
      "Ah Counter Introduction",
      "Timer Introduction",
      "Timer Timer",
      "Break Break",
      "Table Topics Master Let the Fun Begin",
      "Timer Timer",
      "Ah Counter Ah Counter",
      "Grammarian Grammarian",
      "President Awards, thanks, guest comments",
    ])
    const kinds = draft.segments.map(s => s.kind)
    expect(kinds.indexOf("evaluations")).toBeLessThan(kinds.indexOf("table_topics"))
    expect(flagsOf(draft)).toEqual([])
  })

  it("flags times that do not fit between the start times (the column read one row off)", () => {
    const shifted = structuredClone(capeTownSample)
    const times = shifted.lines.slice(0, 4).map(line => line.timing)
    shifted.lines.slice(0, 4).forEach((line, i) => (line.timing = times[i - 1] ?? null))
    shifted.lines[1].timing = "5:00 6:00 7:00"
    const flags = flagsOf(buildDraft(shifted, ctx))
    expect(flags).toContain("Shukri Wiener: Doesn’t fit the schedule: 7:00 printed for a 3:00 slot (19:02 to 19:05). The time may belong to another row.")
  })
})

describe("Pinelands: free layout, no Table Topics, “X for Y” evaluators, one person spelled two ways", () => {
  const draft = buildDraft(pinelandsSample, ctx)
  const items = all(draft)

  it("creates no Table Topics and keeps Grammarian/Ah Counter as one slot", () => {
    expect(draft.segments.some(s => s.kind === "table_topics")).toBe(false)
    const both = items.filter(i => i.personName === "Diana Bresendale")
    expect(both.map(i => [i.role, i.extraRoles])).toEqual([
      ["Grammarian", ["AhCounter"]],
      ["Grammarian", ["AhCounter"]],
    ])
  })

  it("pairs “X for Y”, cleans names and applies the group heading time to each evaluation", () => {
    expect(pairs(draft)).toEqual([
      "Evaluator Peter Ahmed → May Khine Kyaw",
      "Evaluator Jonathan Pillay → Christen O'Reilly",
      "Evaluator Jan-Hendrik Esterhuyse → Lizo Ncapai",
    ])
    expect(items.filter(i => i.role === "Evaluator").map(signals)).toEqual(["2:00/2:30/3:00", "2:00/2:30/3:00", "2:00/2:30/3:00"])
    expect(items.filter(i => i.role === "Speaker").map(signals)).toEqual(["5:00/6:00/7:00", "5:00/6:00/7:00", "5:00/6:00/7:00"])
    expect(items.find(i => i.personName === "Lizo Ncapai")?.note).toBe("(CT TM)")
  })

  it("suggests, never merges, the other spelling of the same person", () => {
    const kambuya = items.find(i => i.personName === "Kambuya Tambwe")!
    expect(kambuya.flags).toEqual([
      {
        field: "person",
        message: "Spelled “Kambuya Tambwe” here and “Kabuya Tambwe” elsewhere on this sheet.",
        suggestion: { label: "Use “Kabuya Tambwe”", patch: { personName: "Kabuya Tambwe" } },
      },
    ])
    expect(flagsOf(draft)).toHaveLength(1)
  })

  it("matches the club roster through aliases as a suggestion, and links only an identical name", () => {
    const people: Person[] = [
      { id: "m1", name: "Josue Kabuya", aliases: ["Kabuya Tambwe"], kind: "member" },
      { id: "m2", name: "Lucille Meyer", kind: "member" },
    ]
    const withRoster = all(buildDraft(pinelandsSample, { ...ctx, people }))
    expect(withRoster.find(i => i.personName === "Lucille Meyer")?.personId).toBe("m2")
    const kabuya = withRoster.find(i => i.personName === "Kabuya Tambwe")!
    expect(kabuya.personId).toBeUndefined()
    expect(kabuya.flags[0]).toMatchObject({
      message: "Looks like Josue Kabuya (club member).",
      suggestion: { patch: { personName: "Josue Kabuya", personId: "m1" } },
    })
  })
})

describe("never invents", () => {
  it("drops nameless Table Topics speaker rows and flags missing or unreadable names", () => {
    const draft = buildDraft(
      {
        ...pinelandsSample,
        lines: [
          row(1, "19:00", "1st Speaker", null, null, "5-7 min", { personUnreadable: "smudged", confidence: { person: 0.2 } }),
          row(1, "19:07", "Table Topics Speakers", null, "Guests", null),
          row(1, "19:20", "2nd Speaker", "Ada Lovelace", null, "5-7 min", { confidence: { person: 0.5 } }),
          row(1, "19:27", "1st Evaluator", null, null, "2:00 2:30 3:00"),
        ],
      },
      ctx,
    )
    expect(all(draft).map(i => i.personName)).toEqual(["", "Ada Lovelace", ""])
    expect(flagsOf(draft)).toEqual([
      "1st Speaker: Name can’t be read (smudged).",
      "Ada Lovelace: Name hard to read: check “Ada Lovelace” on the photo.",
      "1st Evaluator: No name on the agenda.",
    ])
  })

  it("explains an unreadable time and falls back to the club preset only for speeches and evaluations", () => {
    const draft = buildDraft(
      { ...pinelandsSample, lines: [row(1, "19:00", "1st Speaker", "Ada", null, "5"), row(1, "19:10", "Grammarian", "Gus", null, "abc")] },
      ctx,
    )
    expect(flagsOf(draft)).toEqual([
      'Ada: Tommy can’t read the time “5”: No unit: write it as minutes, e.g. "5 min".',
      "Gus: Tommy can’t read the time “abc”: No time found.",
    ])
    expect(all(draft).map(signals)).toEqual(["5:00/6:00/7:00", "untimed"])
  })

  it("reports a sheet it could not read", () => {
    expect(buildDraft({ ...pinelandsSample, readable: false, problem: "Too blurry", lines: [] }, ctx).problems).toEqual(["Too blurry"])
  })
})

describe("confirmed draft", () => {
  it("becomes meeting segments with fresh ids, pairings following them, and no review data", () => {
    let n = 0
    const segments = draftToSegments(buildDraft(toastedSample, ctx), () => `id-${++n}`)
    const items = segments.flatMap(s => s.items)
    const brief = items.find(i => i.role === "EvaluatorBrief")!
    expect(items.find(i => i.id === brief.evaluatesItemId)?.personName).toBe("Kim Austen")
    expect(items.some(i => "flags" in i || "key" in i || "source" in i)).toBe(false)
    expect(new Set(items.map(i => i.id)).size).toBe(items.length)
  })
})
