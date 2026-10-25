import { expect, test, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { nav, openWithFakeClock } from "./helpers"

const sheet = (page: Page) => page.getByRole("dialog")

async function addPerson(page: Page, segment: string, name: string, fill: { time?: string; title?: string; project?: string; brief?: boolean } = {}) {
  await page.getByRole("button", { name: `Add to ${segment}` }).click()
  await sheet(page).getByLabel("Name", { exact: true }).fill(name)
  if (fill.title) await sheet(page).getByLabel("Title").fill(fill.title)
  if (fill.project) await sheet(page).getByLabel("Project / level").fill(fill.project)
  if (fill.time) {
    await sheet(page).getByLabel("Time on the agenda").fill(fill.time)
    await expect(sheet(page).getByRole("status")).toContainText(`Read from “${fill.time}”`)
  }
  if (fill.brief) await sheet(page).getByRole("switch", { name: "Add a 1:00 brief before the speech" }).click()
  await sheet(page).getByRole("button", { name: "Add to agenda" }).click()
  await expect(sheet(page)).toHaveCount(0)
}

/** Times whoever the Timer shows, then moves on with the same big button. */
async function timeCurrent(page: Page, name: string, ms: number, next: string) {
  await expect(page.locator("#timer-person")).toHaveText(name)
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.clock.runFor(ms)
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(page.getByText(/^Recorded \d/)).toBeVisible()
  await expect(page.locator(".ts-next")).toContainText(`Next: ${next}`)
  if (next !== "no one") await page.getByRole("button", { name: "Next speaker" }).click()
}

test("a meeting built by hand runs through the Timer in agenda order and every person reaches the report", async ({ page }) => {
  test.setTimeout(180_000)
  await openWithFakeClock(page)
  await nav(page, "Meeting")

  await addPerson(page, "Prepared speeches", "Ada Speaker", { time: "5-7", title: "Engines", project: "Level 1 · Ice Breaker" })
  await addPerson(page, "Prepared speeches", "Ben Speaker", { time: "4:00 5:00 6:00" })
  await expect(page.getByRole("region", { name: "Check the pairings" })).toContainText("No evaluator for Ada Speaker.")
  // Each evaluator is proposed for the next speech without one; Eva also gives a brief before Ada's speech.
  await addPerson(page, "Evaluations", "Eva Evaluator", { brief: true })
  await addPerson(page, "Evaluations", "Ed Evaluator")
  await expect(page.getByRole("region", { name: "Check the pairings" })).toHaveCount(0)
  await expect(page.getByText("Evaluating: Ada Speaker")).toHaveCount(2)
  await expect(page.getByText("Evaluating: Ben Speaker")).toHaveCount(1)

  // Table Topics: one tap per participant; a name is optional.
  await page.getByRole("button", { name: "Add participant" }).click()
  await expect(page.getByRole("button", { name: /^Guest 1/ })).toBeVisible()
  await page.getByRole("button", { name: "Add participant" }).click()
  await expect(page.getByRole("button", { name: /^Guest 2/ })).toBeVisible()
  await page.getByLabel("Participant").fill("Gia Guest")
  await page.getByRole("button", { name: "Add participant" }).click()
  await expect(page.getByRole("button", { name: /^Gia Guest/ })).toBeVisible()
  await expect(page.getByRole("region", { name: "Table Topics" }).locator(".person-chip.guest")).toHaveCount(3)

  await page.getByRole("button", { name: "Start meeting" }).click()
  await expect(page.locator(".ts-evaluating")).toHaveText("Evaluating: Ada Speaker")
  await timeCurrent(page, "Eva Evaluator", 50_000, "Ada Speaker")
  await timeCurrent(page, "Ada Speaker", 372_000, "Ben Speaker")
  await timeCurrent(page, "Ben Speaker", 290_000, "Guest 1")
  await timeCurrent(page, "Guest 1", 75_000, "Guest 2")
  await timeCurrent(page, "Guest 2", 95_000, "Gia Guest")
  await timeCurrent(page, "Gia Guest", 130_000, "Eva Evaluator")
  await timeCurrent(page, "Eva Evaluator", 150_000, "Ed Evaluator")
  await expect(page.locator(".ts-evaluating")).toHaveText("Evaluating: Ben Speaker")
  await timeCurrent(page, "Ed Evaluator", 195_000, "no one")
  await expect(page.getByRole("button", { name: "All recorded" })).toBeDisabled()

  await nav(page, "Report")
  const lines = await page.locator(".report-line").evaluateAll(rows => rows.map(row => (row as HTMLElement).innerText.replace(/\s+/g, " ").trim()))
  expect(lines).toEqual([
    "Ada Speaker Speaker · 5:00 to 7:00 6:12 Within time",
    "Ben Speaker Speaker · 4:00 to 6:00 4:50 Within time",
    "Eva Evaluator Evaluator brief · up to 1:00 0:50 Within time",
    "Eva Evaluator Evaluator · 2:00 to 3:00 2:30 Within time",
    "Ed Evaluator Evaluator · 2:00 to 3:00 3:15 Within time",
    "Guest 1 Guest Table Topics speaker · 1:00 to 2:00 1:15 Within time",
    "Guest 2 Guest Table Topics speaker · 1:00 to 2:00 1:35 Within time",
    "Gia Guest Guest Table Topics speaker · 1:00 to 2:00 Not eligible for awards. Over time: 2:10 is over the 2:00 limit. 2:10 Over time",
  ])
})

test("the agenda can be reordered by dragging, saved as a template and reused for a new meeting", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto("/")
  await nav(page, "Meeting")
  for (const name of ["Ada", "Ben", "Cy"]) await addPerson(page, "Prepared speeches", name)
  const order = () => page.getByRole("list", { name: "Prepared speeches order" }).locator("li b").allInnerTexts()

  // The builder with rows, pairing warnings and the Table Topics quick add is accessible.
  await page.getByRole("button", { name: "Add participant" }).click()
  await expect(page.getByRole("region", { name: "Check the pairings" })).toBeVisible()
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter(violation => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath("builder-360.png"), fullPage: true })

  // Drag Cy by the handle to the top.
  const handle = page.getByRole("list", { name: "Prepared speeches order" }).locator("li").nth(2).locator(".drag-handle")
  await page.getByRole("list", { name: "Prepared speeches order" }).scrollIntoViewIfNeeded()
  const top = (await page.getByRole("list", { name: "Prepared speeches order" }).locator("li").first().boundingBox())!
  const from = (await handle.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, top.y + 4, { steps: 8 })
  await page.mouse.up()
  await expect.poll(order).toEqual(["Cy", "Ada", "Ben"])

  await page.getByRole("button", { name: "Move Ben up" }).click()
  await expect.poll(order).toEqual(["Cy", "Ben", "Ada"])

  await page.getByRole("button", { name: "Save as template" }).click()
  await sheet(page).getByLabel("Template name").fill("Three speeches")
  await sheet(page).getByRole("button", { name: "Save template" }).click()
  await page.getByRole("button", { name: "New meeting" }).click()
  await sheet(page)
    .getByRole("button", { name: /^Three speeches/ })
    .click()
  await expect.poll(order).toEqual(["Speaker", "Speaker", "Speaker"])
  await expect(page.getByText("No name yet")).toHaveCount(3)
})

test("Timer forgives mistakes: accidental Stop can Resume, Re-time starts over, Back returns to the previous speaker, and a mid-meeting reload loses nothing", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 360, height: 740 })
  await openWithFakeClock(page)
  await nav(page, "Meeting")

  await addPerson(page, "Prepared speeches", "Ada Speaker", { time: "5-7" })
  await addPerson(page, "Prepared speeches", "Ben Speaker", { time: "5-7" })
  await page.getByRole("button", { name: "Start meeting" }).click()

  // Scenario 1: pressing Stop instead of Pause. Resume carries on from where it stopped;
  // the stopped gap is not counted.
  await expect(page.locator("#timer-person")).toHaveText("Ada Speaker")
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.clock.runFor(300_000)
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(page.getByText(/^Recorded 5:00/)).toBeVisible()
  // 20 seconds pass while the Timer realises the speaker is still going.
  await page.clock.runFor(20_000)
  await page.getByRole("button", { name: "Resume", exact: true }).click()
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible()
  await expect(page.getByRole("timer")).toHaveAttribute("aria-label", /^5:0\d /)
  await page.clock.runFor(60_000)
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(page.getByText(/^Recorded 6:00/)).toBeVisible()

  // Scenario 2: mid-meeting reload. The recorded time survives.
  await page.reload()
  await expect(page.locator("#timer-person")).toHaveText("Ada Speaker")
  await expect(page.getByText(/^Recorded 6:00/)).toBeVisible()

  // Scenario 3: edit the recorded time with a reason.
  await page.getByRole("button", { name: "Edit time", exact: true }).click()
  const dialog = sheet(page)
  await dialog.getByRole("textbox", { name: "Recorded time" }).fill("6:05")
  await dialog.getByRole("textbox", { name: "Reason for the edit" }).fill("Started 5 s late")
  await dialog.getByRole("button", { name: "Save recorded time" }).click()
  await expect(page.getByText(/^Recorded 6:05.*edited/)).toBeVisible()

  // Scenario 4: move to next, then Back.
  await page.getByRole("button", { name: "Next speaker" }).click()
  await expect(page.locator("#timer-person")).toHaveText("Ben Speaker")
  await page.getByRole("button", { name: /^Go back to Ada Speaker/ }).click()
  await expect(page.locator("#timer-person")).toHaveText("Ada Speaker")
  await expect(page.getByText(/^Recorded 6:05.*edited/)).toBeVisible()

  // Scenario 5: Re-time clears the recorded value, with a confirm.
  page.on("dialog", confirm => void confirm.accept())
  await page.getByRole("button", { name: "Re-time", exact: true }).click()
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible()
})

test("a member's other spellings are edited in Settings and find them when building the agenda", async ({ page }) => {
  await page.goto("/")
  await nav(page, "Settings")
  await page.getByLabel("New member").fill("Josué Kabuya")
  await page.getByRole("button", { name: "Add member" }).click()
  await page.getByRole("button", { name: "Edit Josué Kabuya" }).click()
  await page.getByLabel("Other spellings").fill("JK, Josue")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Also: JK, Josue")).toBeVisible()

  await nav(page, "Meeting")
  await page.getByRole("button", { name: "Add to Prepared speeches" }).click()
  await sheet(page).getByLabel("Name", { exact: true }).fill("JK")
  await sheet(page)
    .getByRole("button", { name: /Use Josué Kabuya/ })
    .click()
  await expect(sheet(page).getByText("Club member")).toBeVisible()
  await sheet(page).getByRole("button", { name: "Add to agenda" }).click()
  await page.getByRole("button", { name: "Add another speaker" }).click()
  await expect(page.getByRole("list", { name: "Prepared speeches order" }).locator("li b")).toHaveText(["Josué Kabuya", "Speaker"])
})
