import { describe, expect, it } from "vitest"
import { profileFromRange } from "./range"

const full = (green: number, amber: number, red: number) => ({ profile: { green, amber, red } })
const redOnly = (red: number) => ({ profile: { red, redOnly: true } })

describe("profileFromRange: strings printed on real agendas", () => {
  it.each([
    ["5-7 min", full(300, 360, 420)],
    ["2-3 min", full(120, 150, 180)],
    ["4:00 5:00 6:00", full(240, 300, 360)],
    ["1:00 1:30 2:00", full(60, 90, 120)],
    ["15mins", redOnly(900)],
    // ToastED agendas print minutes:seconds:hundredths. This is 25 minutes, not 25 hours.
    ["25:00:00", redOnly(1500)],
    ["3:00", redOnly(180)],
  ])("%s", (text, expected) => expect(profileFromRange(text)).toEqual(expected))
})

describe("profileFromRange: other common ways of writing a range", () => {
  it.each([
    ["5-7", full(300, 360, 420)],
    ["5 – 7 min", full(300, 360, 420)],
    ["5 — 7 mins", full(300, 360, 420)],
    ["5 to 7 minutes", full(300, 360, 420)],
    ["(5'-7')", full(300, 360, 420)],
    ["4-6 mins", full(240, 300, 360)],
    ["8 to 10 minutes", full(480, 540, 600)],
    ["18-22 min", full(1080, 1200, 1320)],
    ["5:00 - 7:00", full(300, 360, 420)],
    ["5:00 7:00", full(300, 360, 420)],
    ["4:00 | 5:00 | 6:00", full(240, 300, 360)],
    ["2.5-3.5 min", full(150, 180, 210)],
    ["30-60 sec", full(30, 45, 60)],
    ["45-60 seconds", full(45, 52, 60)],
    ["7 min", redOnly(420)],
    ["1 minute", redOnly(60)],
    ["90 sec", redOnly(90)],
    ["Speech (5-7 min)", full(300, 360, 420)],
    ["2:00:00", redOnly(120)],
  ])("%s", (text, expected) => expect(profileFromRange(text)).toEqual(expected))
})

describe("profileFromRange: refuses to guess", () => {
  it.each([
    ["", "Empty."],
    ["   ", "Empty."],
    ["TBD", "No time found."],
    ["5", 'No unit: write it as minutes, e.g. "5 min".'],
    ["5 7", 'No unit: write it as minutes, e.g. "5 min".'],
    ["7-5 min", "Times must increase from green to red."],
    ["5-5 min", "Times must increase from green to red."],
    ["5:00 6:00 5:30", "Times must increase from green to red."],
    ["1-2 hours", "Hours are not a speaking time."],
    ["1:00 2:00 3:00 4:00", "Too many times: expected green, amber and red at most."],
    ["90 min", "Longer than 60 minutes."],
    ["5:75", '"5:75" is not a valid time.'],
    ["25:00:30", 'Cannot tell what "25:00:30" means.'],
    ["5-7 min 19:20", "Mixes clock times with other numbers."],
    ["1 min 30 sec", "Mixes minutes and seconds."],
    ["0-2 min", "Times must be greater than zero."],
    ["2.25-3 sec", "Times must be whole seconds."],
  ])("%j", (text, reason) => expect(profileFromRange(text)).toEqual({ profile: null, reason }))
})
