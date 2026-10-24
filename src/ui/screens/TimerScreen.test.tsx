// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultRules, profileFor } from "../../engine/profiles"
import { useAppData } from "../hooks"
import { repo } from "../runtime"
import { TimerScreen } from "./TimerScreen"

// A controllable clock and an isolated in-memory database replace the app runtime.
const clockState = vi.hoisted(() => ({ now: 1_000_000 }))
vi.mock("../runtime", async () => {
  const { TommyDB } = await import("../../storage/db")
  const { createRepository } = await import("../../storage/repository")
  const db = new TommyDB(`timer-screen-${Math.random()}`)
  const clock = () => clockState.now
  return { clock, db, repo: createRepository(db, { now: clock }), boot: async () => undefined }
})
const tone = vi.hoisted(() => vi.fn(() => true))
vi.mock("../../engine/audio", () => ({ playThresholdTone: tone, unlockAudio: vi.fn() }))

function Harness() {
  const data = useAppData()
  const [selected, setSelected] = useState<string>()
  if (!data?.meeting) return <p>Loading</p>
  return (
    <TimerScreen
      data={{ ...data, meeting: data.meeting }}
      readOnly={false}
      selectedId={selected}
      select={setSelected}
      notify={() => undefined}
      openMeeting={() => undefined}
    />
  )
}

const vibrate = vi.fn()
let user: ReturnType<typeof userEvent.setup>

async function setup(options: { running?: number } = {}) {
  const meeting = await repo.meetings.current()
  const speech = profileFor("Speaker", defaultRules)
  const ada = await repo.meetings.addItem(meeting.id, "prepared_speeches", { role: "Speaker", personName: "Ada Lovelace", timing: speech })
  await repo.meetings.addItem(meeting.id, "prepared_speeches", { role: "Speaker", personName: "Ben Okafor", timing: speech })
  if (options.running !== undefined) await repo.records.append(meeting.id, ada.id, { type: "start", at: clockState.now - options.running })
  render(<Harness />)
  await screen.findByRole("heading", { name: "Ada Lovelace" })
}

/** Moves the clock forward and lets the screen's next-second tick fire. */
async function advance(ms: number) {
  clockState.now += ms
  await act(() => vi.advanceTimersByTimeAsync(1_000))
}

const clockText = () => screen.getByRole("timer").getAttribute("aria-label")
const signalLabel = () => document.querySelector(".ts-signal-label")?.textContent
const announcement = () => screen.getByRole("status").textContent

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true })
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  clockState.now = 1_000_000
  vibrate.mockReset()
  tone.mockClear()
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true })
  await Promise.all(repo.db.tables.map(table => table.clear()))
  await repo.settings.update({ sound: true, vibration: true, silent: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Timer screen", () => {
  it("shows the person, their range and who is next", async () => {
    await setup()
    expect(screen.getByText("Speech 5:00 to 7:00")).toBeTruthy()
    expect(screen.getByText("Ben Okafor")).toBeTruthy()
    expect(signalLabel()).toBe("READY")
  })

  it("runs a speech: start, green with label, announcement and cue, stop, result, reasoned edit, next speaker", async () => {
    await setup()
    await user.click(screen.getByRole("button", { name: "Start" }))
    await screen.findByRole("button", { name: "Stop" })

    await advance(300_000)
    expect(signalLabel()).toBe("GREEN")
    expect(clockText()).toBe("5:00 elapsed. Signal green.")
    expect(announcement()).toBe("Green. Minimum time reached.")
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(tone).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Stop" }))
    expect(await screen.findByText(/Recorded 5:00 · Within time/)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Edit time" }))
    const dialog = screen.getByRole("dialog", { name: "Edit recorded time" })
    await user.clear(within(dialog).getByLabelText("Recorded time"))
    await user.type(within(dialog).getByLabelText("Recorded time"), "5:10")
    expect((within(dialog).getByRole("button", { name: "Save recorded time" }) as HTMLButtonElement).disabled).toBe(true)
    await user.type(within(dialog).getByLabelText("Reason for the edit"), "Started late")
    await user.click(within(dialog).getByRole("button", { name: "Save recorded time" }))
    expect(await screen.findByText(/Recorded 5:10 · Within time · edited/)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Next speaker" }))
    expect(await screen.findByRole("heading", { name: "Ben Okafor" })).toBeTruthy()
  })

  it("supports keyboard shortcuts: Space, 1/2/3, U and N", async () => {
    await setup()
    await user.keyboard(" ")
    await screen.findByRole("button", { name: "Stop" })
    await user.keyboard("1")
    await vi.waitFor(() => expect(clockText()).toMatch(/^0:05 /))
    await user.keyboard("3")
    await vi.waitFor(() => expect(clockText()).toMatch(/^0:35 /))
    await user.keyboard("u")
    await vi.waitFor(() => expect(clockText()).toMatch(/^0:05 /))
    await user.keyboard(" ")
    expect(await screen.findByText(/Recorded 0:05 · Under time/)).toBeTruthy()
    await user.keyboard("n")
    expect(await screen.findByRole("heading", { name: "Ben Okafor" })).toBeTruthy()
  })

  it("undo after an accidental stop resumes the speech", async () => {
    await setup()
    await user.click(screen.getByRole("button", { name: "Start" }))
    await advance(10_000)
    await user.click(await screen.findByRole("button", { name: "Stop" }))
    await screen.findByText(/Recorded 0:10/)
    await user.click(screen.getByRole("button", { name: "Undo" }))
    expect(await screen.findByRole("button", { name: "Stop" })).toBeTruthy()
    await advance(5_000)
    expect(clockText()).toMatch(/^0:15 /)
  })

  it("silent mode suppresses vibration and sound but still announces", async () => {
    await setup()
    await user.click(screen.getByRole("button", { name: "Silent" }))
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Silent" }).getAttribute("aria-pressed")).toBe("true"))
    await user.click(screen.getByRole("button", { name: "Start" }))
    await screen.findByRole("button", { name: "Stop" })
    await advance(300_000)
    expect(signalLabel()).toBe("GREEN")
    expect(announcement()).toBe("Green. Minimum time reached.")
    expect(vibrate).not.toHaveBeenCalled()
    expect(tone).not.toHaveBeenCalled()
  })

  it("opening a timer that is already past a threshold (reload) does not buzz", async () => {
    await setup({ running: 365_000 })
    await vi.waitFor(() => expect(signalLabel()).toBe("AMBER"))
    await advance(1_000)
    expect(vibrate).not.toHaveBeenCalled()
    expect(tone).not.toHaveBeenCalled()
  })

  it("keeps working when the browser refuses the screen wake lock", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Battery saver"))
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true })
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
    await setup()
    await user.click(screen.getByRole("button", { name: "Start" }))
    await screen.findByRole("button", { name: "Stop" })
    await advance(2_000)
    expect(request).toHaveBeenCalledWith("screen")
    expect(clockText()).toMatch(/^0:02 /)
    Reflect.deleteProperty(navigator, "wakeLock")
  })
})
