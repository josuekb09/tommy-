// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reviewSample } from "../../engine/import/samples"
import { useAppData } from "../hooks"
import { repo } from "../runtime"
import { MeetingScreen } from "./MeetingScreen"

vi.mock("../runtime", async () => {
  const { TommyDB } = await import("../../storage/db")
  const { createRepository } = await import("../../storage/repository")
  const db = new TommyDB(`scan-review-${Math.random()}`)
  const clock = () => 1_000_000
  return { clock, db, repo: createRepository(db, { now: clock }), boot: async () => undefined }
})

const notify = vi.fn()
function Harness() {
  const data = useAppData()
  if (!data?.meeting) return <p>Loading</p>
  return <MeetingScreen data={{ ...data, meeting: data.meeting }} readOnly={false} open={() => undefined} notify={notify} />
}

let user: ReturnType<typeof userEvent.setup>
const fetchMock = vi.fn()
const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "agenda.jpg", { type: "image/jpeg" })

async function scanPhoto() {
  await user.click(screen.getByRole("button", { name: "New meeting" }))
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Scan a printed agenda/ }))
  const sheet = screen.getByRole("dialog", { name: "Scan an agenda" })
  // Before anything is sent, the sheet says where the photo goes.
  expect(within(sheet).getByText("Photos are sent to Google Gemini’s free service, which may use them to improve its products.")).toBeTruthy()
  await user.upload(within(sheet).getByLabelText("Agenda pages"), photo())
  await user.click(within(sheet).getByRole("button", { name: "Read the agenda" }))
}

beforeEach(async () => {
  user = userEvent.setup()
  notify.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  await Promise.all(repo.db.tables.map(table => table.clear()))
  await repo.meetings.current()
  vi.spyOn(window, "confirm").mockReturnValue(true)
  render(<Harness />)
  await screen.findByRole("heading", { name: "Meeting agenda" })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Agenda scan review", () => {
  it("shows what was read, and confirms only once every flagged row is fixed or kept", async () => {
    fetchMock.mockReturnValue(reply(200, { agenda: reviewSample, model: "test-model", usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 }, ms: 10 }))
    await scanPhoto()
    await screen.findByRole("heading", { name: "Check the agenda" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/parse-agenda")
    expect(JSON.parse(init.body).images[0].mimeType).toBe("image/jpeg")

    const status = screen.getByRole("status")
    expect(status.textContent).toBe("8 items read2 to check")
    const confirmButton = screen.getByRole("button", { name: "Use this agenda" }) as HTMLButtonElement
    expect(confirmButton.disabled).toBe(true)
    expect(screen.getByText("Name hard to read: check “Ada Lovel” on the photo.")).toBeTruthy()

    // Typing a missing name.
    await user.type(screen.getByLabelText("Name for Speaker (Speaker 2) at 19:20"), "Ben Byte")
    await user.tab()
    // Keeping a hard-to-read name as printed.
    await user.click(screen.getByRole("button", { name: "Keep as read" }))
    expect(status.textContent).toBe("8 items readNothing left to check")
    expect(screen.getByText("Kept as read: Name hard to read: check “Ada Lovel” on the photo.")).toBeTruthy()
    expect(confirmButton.disabled).toBe(false)

    await user.click(confirmButton)
    await screen.findByRole("heading", { name: "Meeting agenda" })
    expect(notify).toHaveBeenCalledWith("Agenda imported: 8 items")
    const meeting = await repo.meetings.current()
    expect(meeting.theme).toBe("Beginnings")
    const names = meeting.segments.flatMap(segment => segment.items).map(item => item.personName)
    expect(names).toEqual(expect.arrayContaining(["Ada Lovel", "Ben Byte", "Eve One"]))
    const [log] = await repo.imports.log()
    expect(log.summary).toMatchObject({ renamed: 1, suggestionsApplied: 0, flagsAccepted: 1 })
  })

  it("explains a failed scan and keeps the manual builder one tap away", async () => {
    fetchMock.mockReturnValue(reply(429, { error: "rate_limited", message: "busy", retryAfterSeconds: 30 }))
    await scanPhoto()
    expect((await screen.findByRole("alert")).textContent).toBe("Scan limit reached, try again in a minute, or build it by hand.")
    await user.click(screen.getByRole("button", { name: "Build it by hand instead" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("heading", { name: "Meeting agenda" })).toBeTruthy()
    expect(await repo.imports.log()).toEqual([])
  })

  it("discarding the scan leaves the current meeting as it was", async () => {
    const before = await repo.meetings.current()
    fetchMock.mockReturnValue(reply(200, { agenda: reviewSample, model: "test-model", usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 }, ms: 10 }))
    await scanPhoto()
    await screen.findByRole("heading", { name: "Check the agenda" })
    await user.click(screen.getByRole("button", { name: "Remove Ada Lovel" }))
    await user.click(screen.getByRole("button", { name: "Discard scan" }))
    expect(window.confirm).toHaveBeenCalled()
    await screen.findByRole("heading", { name: "Meeting agenda" })
    expect((await repo.meetings.current()).id).toBe(before.id)
    expect(await repo.db.meetings.count()).toBe(1)
  })
})
