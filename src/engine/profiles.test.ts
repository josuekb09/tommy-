import { describe, expect, it } from "vitest"
import type { ClubRules } from "../domain"
import { builtInProfiles, defaultRules, definitionFromRange, profileFor, profileLibrary, rangeLabel, resolveProfile, rulesOf } from "./profiles"
import { profileFromRange } from "./range"
import { resultFor, signalAt } from "./timing"

const rules = (patch: Partial<ClubRules> = {}): ClubRules => ({ ...defaultRules, ...patch })
const builtIn = (id: string) => builtInProfiles.find(profile => profile.id === id)!

describe("built-in Toastmasters profiles", () => {
  it.each([
    ["speech", 300, 360, 420],
    ["ice_breaker", 240, 300, 360],
    ["evaluation", 120, 150, 180],
    ["table_topics", 60, 90, 120],
    ["educational", 600, 900, 1200],
    ["speech_8_10", 480, 540, 600],
    ["speech_18_22", 1080, 1200, 1320],
  ])("%s is %i / %i / %i seconds", (id, green, amber, red) => expect(builtIn(id)).toMatchObject({ green, amber, red }))

  it.each([
    ["evaluator_brief", 60],
    ["timer_report", 120],
    ["ah_counter_report", 120],
    ["grammarian_report", 120],
  ])("%s is red only at %i seconds", (id, red) => expect(builtIn(id)).toMatchObject({ red, redOnly: true }))

  it("maps roles to their default profile", () => {
    expect(profileFor("Speaker", defaultRules)).toMatchObject({ green: 300, red: 420, graceSeconds: 30 })
    expect(profileFor("Timer", defaultRules)).toMatchObject({ red: 120, redOnly: true })
    expect(profileFor("TableTopicsSpeaker", defaultRules)).toMatchObject({ green: 60, red: 120, graceSeconds: 0 })
  })
})

describe("club rules applied to profiles", () => {
  const speech = builtIn("speech")

  it("grace on by default, off when disabled, and not for Table Topics unless the club opts in", () => {
    expect(resolveProfile(speech, rules()).graceSeconds).toBe(30)
    expect(resolveProfile(speech, rules({ graceEnabled: false })).graceSeconds).toBe(0)
    expect(resolveProfile(speech, rules({ graceSeconds: 15 })).graceSeconds).toBe(15)
    expect(resolveProfile(builtIn("table_topics"), rules()).graceSeconds).toBe(0)
    expect(resolveProfile(builtIn("table_topics"), rules({ graceAppliesToTableTopics: true })).graceSeconds).toBe(30)
  })

  it("amber rule: printed, midpoint, or a fixed time before red", () => {
    const uneven = { ...speech, amber: 400 }
    expect(resolveProfile(uneven, rules()).amber).toBe(400)
    expect(resolveProfile(uneven, rules({ amberRule: "midpoint" })).amber).toBe(360)
    expect(resolveProfile(speech, rules({ amberRule: "beforeRed", amberBeforeRedSeconds: 30 })).amber).toBe(390)
    // Never before green.
    expect(resolveProfile(builtIn("table_topics"), rules({ amberRule: "beforeRed", amberBeforeRedSeconds: 300 })).amber).toBe(60)
  })

  it("red on reaching versus exceeding the maximum", () => {
    const reach = resolveProfile(speech, rules())
    const exceed = resolveProfile(speech, rules({ redAt: "exceed" }))
    expect(signalAt(420_000, reach)).toBe("red")
    expect(signalAt(420_000, exceed)).toBe("amber")
    expect(signalAt(420_001, exceed)).toBe("red")
  })

  it("overtime behaviour: flashing overtime after grace, or stay on red", () => {
    expect(signalAt(450_001, resolveProfile(speech, rules()))).toBe("overtime")
    expect(signalAt(3_600_000, resolveProfile(speech, rules({ overtime: "never" })))).toBe("red")
  })

  it("red-on-exceed without grace keeps red as the last signal", () => {
    const tableTopics = resolveProfile(builtIn("table_topics"), rules({ redAt: "exceed" }))
    expect(signalAt(120_001, tableTopics)).toBe("red")
    expect(signalAt(600_000, tableTopics)).toBe("red")
  })

  it("contest mode disqualifies outside the grace window", () => {
    const profile = resolveProfile(speech, rules({ contestMode: true }))
    expect(resultFor(269_999, profile, "grace")).toBe("disqualified")
    expect(resultFor(270_000, profile, "grace")).toBe("within")
    expect(resultFor(450_000, profile, "grace")).toBe("within")
    expect(resultFor(450_001, profile, "grace")).toBe("disqualified")
    expect(signalAt(450_001, profile)).toBe("disqualified")
  })

  it("contest profiles keep the 30-second window even if the club's rule is strict", () => {
    const international = resolveProfile(builtIn("contest_international"), rules({ withinRule: "strict", graceEnabled: false }))
    expect(resultFor(269_999, international, "strict")).toBe("disqualified")
    expect(resultFor(270_000, international, "strict")).toBe("within")
    expect(resultFor(450_000, international, "strict")).toBe("within")
    expect(resultFor(450_001, international, "strict")).toBe("disqualified")
  })

  it("the Table Topics contest window is 1:00 to 2:30", () => {
    const tableTopics = resolveProfile(builtIn("contest_table_topics"), rules())
    expect(resultFor(59_999, tableTopics, "grace")).toBe("disqualified")
    expect(resultFor(60_000, tableTopics, "grace")).toBe("within")
    expect(resultFor(150_000, tableTopics, "grace")).toBe("within")
    expect(resultFor(150_001, tableTopics, "grace")).toBe("disqualified")
  })
})

describe("red-only profiles", () => {
  const report = resolveProfile(builtIn("timer_report"), rules())

  it("show nothing until red and have no minimum time", () => {
    expect(signalAt(0, report)).toBe("none")
    expect(signalAt(119_999, report)).toBe("none")
    expect(signalAt(120_000, report)).toBe("red")
    expect(signalAt(150_001, report)).toBe("overtime")
    expect(resultFor(5_000, report, "grace")).toBe("within")
    expect(resultFor(150_001, report, "grace")).toBe("over")
    expect(rangeLabel(report)).toBe("up to 2:00")
  })
})

describe("the club's profile library", () => {
  it("applies the club's edits to built-ins and lists custom profiles last", () => {
    const parsed = profileFromRange("8 to 10 minutes")
    const custom = definitionFromRange(parsed.profile!, "Keynote", "custom-1")
    const library = profileLibrary({ speech: { ...builtIn("speech"), green: 240 }, "custom-1": custom })
    expect(library.find(profile => profile.id === "speech")!.green).toBe(240)
    expect(library.at(-1)).toEqual({ id: "custom-1", name: "Keynote", category: "custom", green: 480, amber: 540, red: 600 })
    expect(profileFor("Speaker", defaultRules, { "custom-1": custom }, "custom-1")).toMatchObject({ green: 480, red: 600 })
  })

  it("fills in rules a club saved before they existed", () => {
    expect(rulesOf({ defaultRules: { graceSeconds: 20 } as ClubRules })).toEqual({ ...defaultRules, graceSeconds: 20 })
  })
})
