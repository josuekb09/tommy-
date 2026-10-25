// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultRules, profileFor } from "../../engine/profiles"
import { useAppData } from "../hooks"
import { repo } from "../runtime"
import { ReportScreen } from "./ReportScreen"

vi.mock("../runtime", async () => {
  const { TommyDB } = await import("../../storage/db")
  const { createRepository } = await import("../../storage/repository")
  const db = new TommyDB(`report-screen-${Math.random()}`)
  const clock = () => 1_000_000
  return { clock, db, repo: createRepository(db, { now: clock }), boot: async () => undefined }
})

/** A speech engine that speaks only when the test says a sentence has finished. */
class FakeUtterance {
  lang = ""
  voice: unknown = null
  onend?: () => void
  onerror?: () => void
  constructor(public text: string) {}
}
const voices = [
  { name: "Daniel", lang: "en-GB", voiceURI: "daniel" },
  { name: "Amélie", lang: "fr-FR", voiceURI: "amelie" },
  { name: "Samantha", lang: "en-US", voiceURI: "samantha" },
]
const synth = {
  spoken: [] as FakeUtterance[],
  current: undefined as FakeUtterance | undefined,
  paused: false,
  speak(u: FakeUtterance) {
    this.spoken.push(u)
    this.current = u
  },
  // Browsers report the cancelled sentence as interrupted.
  cancel() {
    const c = this.current
    this.current = undefined
    c?.onerror?.()
  },
  pause() {
    this.paused = true
  },
  resume() {
    this.paused = false
  },
  getVoices: () => voices,
  addEventListener() {},
  removeEventListener() {},
  finish() {
    const c = this.current
    this.current = undefined
    act(() => c?.onend?.())
  },
}

const open = vi.fn()
function Harness() {
  const data = useAppData()
  if (!data?.meeting) return <p>Loading</p>
  return <ReportScreen data={{ ...data, meeting: data.meeting }} notify={() => undefined} openPrint={open} />
}

let user: ReturnType<typeof userEvent.setup>
const writeText = vi.fn(async () => undefined)

async function timed(meetingId: string, itemId: string, ms: number) {
  await repo.records.append(meetingId, itemId, { type: "start", at: 0 })
  await repo.records.append(meetingId, itemId, { type: "stop", at: ms })
}

beforeEach(async () => {
  user = userEvent.setup()
  synth.spoken = []
  synth.current = undefined
  Object.assign(window, { speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance })
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  writeText.mockClear()
  await Promise.all(repo.db.tables.map(table => table.clear()))
  const meeting = await repo.meetings.current()
  const speech = profileFor("Speaker", defaultRules)
  const ada = await repo.meetings.addItem(meeting.id, "prepared_speeches", { role: "Speaker", personName: "Ada Lovelace", timing: speech })
  const ben = await repo.meetings.addItem(meeting.id, "prepared_speeches", { role: "Speaker", personName: "Ben Okafor", timing: speech })
  await repo.meetings.addItem(meeting.id, "prepared_speeches", { role: "Speaker", personName: "Cy Young", timing: speech })
  const gia = await repo.meetings.addItem(meeting.id, "table_topics", {
    role: "TableTopicsSpeaker",
    personName: "Gia",
    guest: true,
    timing: profileFor("TableTopicsSpeaker", defaultRules),
  })
  await timed(meeting.id, ada.id, 372_000)
  await timed(meeting.id, ben.id, 465_000)
  await timed(meeting.id, gia.id, 75_000)
  render(<Harness />)
  await screen.findByText("Ada Lovelace")
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const line = (name: string) => screen.getByText(name, { selector: ".report-line b" }).closest(".report-line")!.textContent

describe("Timer's report screen", () => {
  it("lists everyone, says Not timed instead of 0:00, and gives reasons for ineligibility", () => {
    expect(line("Ada Lovelace")).toBe("Ada LovelaceSpeaker · 5:00 to 7:006:12 Within time")
    expect(line("Ben Okafor")).toBe(
      "Ben OkaforSpeaker · 5:00 to 7:00Not eligible for awards. Over time: 7:45 is over the 7:30 limit (7:00 plus 30 seconds grace).7:45 Over time",
    )
    expect(line("Cy Young")).toBe("Cy YoungSpeaker · 5:00 to 7:00– Not timed")
    expect(line("Cy Young")).not.toContain("0:00 ")
    const awards = screen.getByRole("region", { name: "Award eligibility" })
    expect(within(awards).getByText("Best Speaker").parentElement!.textContent).toContain("Eligible: Ada Lovelace")
    expect(within(awards).getByText("Best Table Topics").parentElement!.textContent).toContain("Eligible: Gia")
  })

  it("reads aloud line by line with pause, skip and stop, in the chosen English voice", async () => {
    const voice = screen.getByLabelText("Voice") as HTMLSelectElement
    expect([...voice.options].map(o => o.textContent)).toEqual(["Browser default (English)", "Daniel (en-GB)", "Samantha (en-US)"])
    await user.selectOptions(voice, "samantha")
    await waitFor(async () => expect((await repo.settings.get()).reportVoice).toBe("samantha"))
    // The screen reads the voice from live data: wait until it shows the new choice.
    await waitFor(() => expect((screen.getByLabelText("Voice") as HTMLSelectElement).value).toBe("samantha"))

    await user.click(screen.getByRole("button", { name: "Read aloud" }))
    expect(synth.current?.text).toBe("Timer's report.")
    expect(synth.current?.lang).toBe("en-US")
    synth.finish()
    synth.finish()
    expect(synth.current?.text).toBe("Ada Lovelace, 6 minutes 12 seconds, within time.")
    expect(screen.getByText(/^3 of \d+: Ada Lovelace/)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Pause" }))
    expect(synth.paused).toBe(true)
    await user.click(screen.getByRole("button", { name: "Resume" }))
    expect(synth.paused).toBe(false)

    // Skip: the interrupted sentence must not also move the reading on.
    await user.click(screen.getByRole("button", { name: "Skip" }))
    expect(synth.current?.text).toBe("Ben Okafor, 7 minutes 45 seconds, over time.")
    synth.finish()
    expect(synth.current?.text).toBe("Cy Young, not timed.")

    await user.click(screen.getByRole("button", { name: "Stop" }))
    expect(synth.current).toBeUndefined()
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeTruthy()
  })

  it("copies plain WhatsApp text and presents one section at a time", async () => {
    await user.click(screen.getByRole("button", { name: "Copy for WhatsApp" }))
    const text = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(text).toContain("*Prepared speeches*\n- Ada Lovelace, speaker: 6:12, within time (range 5:00 to 7:00)")
    expect(text).toContain("- Cy Young, speaker: Not timed (range 5:00 to 7:00)")
    expect(text).toContain("- Gia (guest), table topics speaker: 1:15, within time (range 1:00 to 2:00)")

    await user.click(screen.getByRole("button", { name: "Present" }))
    const presenter = screen.getByRole("dialog", { name: "Prepared speeches" })
    expect(within(presenter).getByText("1 of 3")).toBeTruthy()
    await user.click(within(presenter).getByRole("button", { name: "Next" }))
    expect(screen.getByRole("dialog", { name: "Table Topics" })).toBeTruthy()
    await user.keyboard("{ArrowRight}")
    expect(within(screen.getByRole("dialog", { name: "Award eligibility" })).getByText("Ada Lovelace")).toBeTruthy()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Print or PDF" }))
    expect(open).toHaveBeenCalled()
  })
})
