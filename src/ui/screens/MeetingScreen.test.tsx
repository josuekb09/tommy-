// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultRules, profileFor } from "../../engine/profiles"
import { useAppData } from "../hooks"
import { repo } from "../runtime"
import { MeetingScreen } from "./MeetingScreen"

vi.mock("../runtime", async () => {
  const { TommyDB } = await import("../../storage/db")
  const { createRepository } = await import("../../storage/repository")
  const db = new TommyDB(`meeting-screen-${Math.random()}`)
  const clock = () => 1_000_000
  return { clock, db, repo: createRepository(db, { now: clock }), boot: async () => undefined }
})

const open = vi.fn()
function Harness() {
  const data = useAppData()
  if (!data?.meeting) return <p>Loading</p>
  return <MeetingScreen data={{ ...data, meeting: data.meeting }} readOnly={false} open={open} notify={() => undefined} />
}

let user: ReturnType<typeof userEvent.setup>
const dialog = () => screen.getByRole("dialog")
const section = (name: string) => screen.getByRole("region", { name })
const rowNames = (name: string) =>
  within(within(section(name)).getByRole("list", { name: `${name} order` }))
    .queryAllByRole("listitem")
    .map(li => li.querySelector("b")!.textContent)

async function addSpeaker(name: string) {
  await user.click(screen.getByRole("button", { name: "Add to Prepared speeches" }))
  await user.type(within(dialog()).getByLabelText("Name"), name)
  await user.click(within(dialog()).getByRole("button", { name: "Add to agenda" }))
  await screen.findByRole("button", { name: new RegExp(`^${name}`) })
}

beforeEach(async () => {
  user = userEvent.setup()
  open.mockReset()
  await Promise.all(repo.db.tables.map(table => table.clear()))
  await repo.meetings.current()
  vi.spyOn(window, "confirm").mockReturnValue(true)
  render(<Harness />)
  await screen.findByRole("heading", { name: "Meeting agenda" })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Meeting screen", () => {
  it("reads the time the agenda prints, live, and explains what it cannot read", async () => {
    await user.click(screen.getByRole("button", { name: "Add to Prepared speeches" }))
    const preview = within(dialog()).getByRole("status")
    expect(preview.textContent).toContain("Green 5:00 · Amber 6:00 · Red 7:00")
    expect(preview.textContent).toContain("Preset: Prepared speech")
    const field = within(dialog()).getByLabelText("Time on the agenda")
    await user.type(field, "4:00 5:00 6:00")
    expect(preview.textContent).toContain("Green 4:00 · Amber 5:00 · Red 6:00")
    await user.clear(field)
    await user.type(field, "5")
    expect(preview.textContent).toContain("Tommy can’t read “5”: No unit")
    expect(field.getAttribute("aria-invalid")).toBe("true")
    await user.type(within(dialog()).getByLabelText("Name"), "Ada")
    expect((within(dialog()).getByRole("button", { name: "Add to agenda" }) as HTMLButtonElement).disabled).toBe(true)
    // Picking a preset replaces the unreadable text.
    await user.selectOptions(within(dialog()).getByLabelText("Preset"), "speech_8_10")
    expect((field as HTMLInputElement).value).toBe("")
    expect(preview.textContent).toContain("Green 8:00 · Amber 9:00 · Red 10:00")
    // Picking a role proposes that role's timing.
    await user.selectOptions(within(dialog()).getByLabelText("Role"), "EvaluatorBrief")
    expect(preview.textContent).toContain("Red at 1:00")
  })

  it("pairs a new evaluator with the first speech that has none, and warns without blocking", async () => {
    await addSpeaker("Ada")
    await addSpeaker("Ben")
    expect(screen.getByRole("region", { name: "Check the pairings" }).textContent).toContain("No evaluator for Ada.No evaluator for Ben.")
    await user.click(screen.getByRole("button", { name: "Add to Evaluations" }))
    expect((within(dialog()).getByLabelText("Evaluating") as HTMLSelectElement).selectedOptions[0].textContent).toBe("Speech 1: Ada")
    await user.type(within(dialog()).getByLabelText("Name"), "Eva")
    await user.click(within(dialog()).getByRole("switch", { name: "Add a 1:00 brief before the speech" }))
    await user.click(within(dialog()).getByRole("button", { name: "Add to agenda" }))
    // The brief and the evaluation are two items for one person, the brief just before the speech.
    await waitFor(() => expect(rowNames("Prepared speeches")).toEqual(["Eva", "Ada", "Ben"]))
    expect(within(section("Evaluations")).getByText("Evaluating: Ada")).toBeTruthy()
    expect(within(section("Prepared speeches")).getByText("Evaluating: Ada")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Check the pairings" }).textContent).toMatch(/^Check the pairingsNo evaluator for Ben\.You can still start/)
    await user.click(screen.getByRole("button", { name: "Start meeting" }))
    // Starting marks the meeting live first, then opens the Timer.
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.any(String)))
  })

  it("suggests similar club members but only links one the Timer picks", async () => {
    await repo.members.add("Josué Kabuya")
    await user.click(screen.getByRole("button", { name: "Add to Prepared speeches" }))
    await user.type(within(dialog()).getByLabelText("Name"), "Kubaya")
    const suggestion = within(dialog()).getByRole("button", { name: /Did you mean Josué Kabuya/ })
    expect(within(dialog()).getByRole("group", { name: "Add Kubaya as" })).toBeTruthy()
    await user.click(suggestion)
    expect((within(dialog()).getByLabelText("Name") as HTMLInputElement).value).toBe("Josué Kabuya")
    expect(within(dialog()).getByText("Club member")).toBeTruthy()
    await user.click(within(dialog()).getByRole("button", { name: "Add to agenda" }))
    await screen.findByRole("button", { name: /^Josué Kabuya/ })
    const members = await repo.members.list()
    expect(members.map(m => m.name)).toEqual(["Josué Kabuya"])
    const meeting = await repo.meetings.current()
    expect(meeting.segments[1].items[0].personId).toBe(members[0].id)
  })

  it("reorders with the up and down buttons and moves whole sections", async () => {
    await addSpeaker("Ada")
    await addSpeaker("Ben")
    await addSpeaker("Cy")
    await user.click(screen.getByRole("button", { name: "Move Cy up" }))
    await waitFor(() => expect(rowNames("Prepared speeches")).toEqual(["Ada", "Cy", "Ben"]))
    expect((screen.getByRole("button", { name: "Move Ada up" }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole("button", { name: "Move Ada down" }))
    await waitFor(() => expect(rowNames("Prepared speeches")).toEqual(["Cy", "Ada", "Ben"]))
    await user.click(screen.getByRole("button", { name: "Move Evaluations earlier" }))
    await waitFor(async () => expect((await repo.meetings.current()).segments.map(s => s.kind).slice(2, 4)).toEqual(["evaluations", "table_topics"]))
  })

  it("duplicates the last item of a section as an empty slot", async () => {
    await addSpeaker("Ada")
    await user.click(screen.getByRole("button", { name: "Add another speaker" }))
    await waitFor(() => expect(rowNames("Prepared speeches")).toEqual(["Ada", "Speaker"]))
    const [, copy] = (await repo.meetings.current()).segments[1].items
    expect([copy.personName, copy.role, copy.profileId]).toEqual(["", "Speaker", "speech"])
  })

  it("adds a Table Topics participant with one tap, marked as a guest", async () => {
    await user.click(screen.getByRole("button", { name: "Add participant" }))
    await user.click(screen.getByRole("button", { name: "Add participant" }))
    await waitFor(() => expect(rowNames("Table Topics")).toEqual(["Guest 1", "Guest 2"]))
    expect(within(section("Table Topics")).getAllByText("Guest", { selector: ".person-chip" })).toHaveLength(2)
    await user.type(screen.getByLabelText("Participant"), "Gia Guest")
    await user.click(screen.getByRole("button", { name: "Add participant" }))
    await waitFor(() => expect(rowNames("Table Topics")).toEqual(["Guest 1", "Guest 2", "Gia Guest"]))
    expect((await repo.guests.list()).map(g => g.name)).toEqual(["Gia Guest"])
  })

  it("starts a new meeting from a built-in template, and edits a slot to fill in the name", async () => {
    await user.click(screen.getByRole("button", { name: "New meeting" }))
    await user.click(within(dialog()).getByRole("button", { name: /ToastED format/ }))
    await waitFor(() =>
      expect(rowNames("Prepared speeches")).toEqual(["Evaluator brief", "Speaker", "Evaluator brief", "Speaker", "Evaluator brief", "Speaker"]),
    )
    await user.click(screen.getAllByRole("button", { name: "Edit Speaker" })[0])
    await user.type(within(dialog()).getByLabelText("Name"), "Ada")
    await user.click(within(dialog()).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(rowNames("Prepared speeches")[1]).toBe("Ada"))
    expect(
      within(section("Evaluations"))
        .getAllByText(/^Evaluating: /)
        .map(e => e.textContent),
    ).toEqual(["Evaluating: Ada", "Evaluating: Speaker", "Evaluating: Speaker"])
  })

  it("saves the meeting as a template", async () => {
    const meeting = await repo.meetings.current()
    await repo.meetings.addItem(meeting.id, "prepared_speeches", { role: "Speaker", personName: "Ada", timing: profileFor("Speaker", defaultRules) })
    await user.click(screen.getByRole("button", { name: "Save as template" }))
    await user.clear(within(dialog()).getByLabelText("Template name"))
    await user.type(within(dialog()).getByLabelText("Template name"), "Tuesday")
    await user.click(within(dialog()).getByRole("button", { name: "Save template" }))
    await waitFor(async () => expect((await repo.templates.list()).map(t => t.name)).toEqual(["Tuesday"]))
    await user.click(screen.getByRole("button", { name: "New meeting" }))
    expect(within(dialog()).getByRole("button", { name: /^TuesdaySaved template · 1 speech$/ })).toBeTruthy()
  })

  it("ends a meeting as view-only, lists it under Past meetings, and switches back to reopen it", async () => {
    await addSpeaker("Ada")
    const first = await repo.meetings.current()
    await repo.meetings.update(first.id, current => ({ ...current, theme: "Harvest" }))
    await user.click(screen.getByRole("button", { name: "End meeting" }))
    await screen.findByRole("button", { name: "Reopen meeting" })
    expect((await repo.meetings.current()).status).toBe("finished")
    // The agenda of an ended meeting cannot be changed by mistake.
    expect(screen.queryByRole("button", { name: "Start meeting" })).toBeNull()
    expect((screen.getByLabelText("Theme") as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Add to Prepared speeches" }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole("button", { name: "New meeting" }))
    await user.click(within(dialog()).getByRole("button", { name: /ToastED format/ }))
    const past = await screen.findByRole("region", { name: "Past meetings" })
    const entry = await within(past).findByRole("button", { name: new RegExp(`^${first.date} · Harvest`) })
    expect(entry.textContent).toContain("Ended · 1 item")
    expect((await repo.meetings.current()).id).not.toBe(first.id)

    await user.click(entry)
    await waitFor(async () => expect((await repo.meetings.current()).id).toBe(first.id))
    await user.click(await screen.findByRole("button", { name: "Reopen meeting" }))
    await screen.findByRole("button", { name: "End meeting" })
    expect((await repo.meetings.current()).status).toBe("live")
    expect(rowNames("Prepared speeches")).toEqual(["Ada"])
  })
})
