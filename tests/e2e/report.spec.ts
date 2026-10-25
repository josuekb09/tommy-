import { expect, test, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { nav, openWithFakeClock } from "./helpers"

const sheet = (page: Page) => page.getByRole("dialog")
const lineOf = (page: Page, name: string) => page.locator(".report-line", { has: page.getByText(name, { exact: true }) })

async function addPerson(page: Page, segment: string, name: string) {
  await page.getByRole("button", { name: `Add to ${segment}` }).click()
  await sheet(page).getByLabel("Name", { exact: true }).fill(name)
  await sheet(page).getByRole("button", { name: "Add to agenda" }).click()
  await expect(sheet(page)).toHaveCount(0)
}

async function time(page: Page, name: string, ms: number) {
  await expect(page.locator("#timer-person")).toHaveText(name)
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.clock.runFor(ms)
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(page.getByText(/^Recorded \d/)).toBeVisible()
}

test("the Timer's report: groups, Not timed, award eligibility with reasons, WhatsApp text, presenter and printable log", async ({ page, context }) => {
  test.setTimeout(180_000)
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await openWithFakeClock(page)
  await nav(page, "Meeting")
  for (const name of ["Ada Speaker", "Ben Speaker", "Cy Speaker"]) await addPerson(page, "Prepared speeches", name)
  await addPerson(page, "Evaluations", "Eva Evaluator")
  await page.getByRole("button", { name: "Add participant" }).click()

  await page.getByRole("button", { name: "Start meeting" }).click()
  await time(page, "Ada Speaker", 372_000)
  await page.getByRole("button", { name: "Next speaker" }).click()
  await time(page, "Ben Speaker", 465_000)
  // Cy is skipped: jump straight to the Table Topics guest from the queue.
  await page.getByRole("button", { name: "Queue" }).click()
  await sheet(page)
    .getByRole("region", { name: "Up next" })
    .getByRole("button", { name: /^Guest 1/ })
    .click()
  await time(page, "Guest 1", 75_000)
  await page.getByRole("button", { name: "Queue" }).click()
  await sheet(page)
    .getByRole("button", { name: /^Eva Evaluator/ })
    .click()
  await time(page, "Eva Evaluator", 150_000)

  await nav(page, "Report")
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Prepared speeches", "Evaluations", "Table Topics", "Award eligibility"])
  await expect(lineOf(page, "Ada Speaker")).toContainText("6:12")
  await expect(lineOf(page, "Ada Speaker")).toContainText("Within time")
  await expect(lineOf(page, "Ben Speaker")).toContainText("Not eligible for awards. Over time: 7:45 is over the 7:30 limit (7:00 plus 30 seconds grace).")
  await expect(lineOf(page, "Cy Speaker")).toContainText("Not timed")
  await expect(lineOf(page, "Cy Speaker")).not.toContainText("0:00")
  const award = (label: string) =>
    page.getByRole("region", { name: "Award eligibility" }).locator(".award", { has: page.getByRole("heading", { name: label }) })
  await expect(award("Best Speaker")).toContainText("Eligible: Ada Speaker")
  await expect(award("Best Speaker")).toContainText("Cy Speaker: Not timed.")
  await expect(award("Best Table Topics")).toContainText("Eligible: Guest 1")
  await expect(award("Best Evaluator")).toContainText("Eligible: Eva Evaluator")

  // Members-only Table Topics award: the guest stays on the report but is not eligible, and says why.
  await nav(page, "Settings")
  await page.getByRole("switch", { name: "Guests can be Best Table Topics" }).click()
  await nav(page, "Report")
  await expect(award("Best Table Topics")).toContainText("Eligible: no one")
  await expect(award("Best Table Topics")).toContainText("Guest 1: Guest: this club's Table Topics award is for members only.")

  await page.getByRole("button", { name: "Copy for WhatsApp" }).click()
  // The operating system's clipboard may hand back Windows line endings.
  const text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")
  expect(text.split("\n").slice(2, 8)).toEqual([
    "",
    "*Prepared speeches*",
    "- Ada Speaker, speaker: 6:12, within time (range 5:00 to 7:00)",
    "- Ben Speaker, speaker: 7:45, over time (range 5:00 to 7:00)",
    "- Cy Speaker, speaker: Not timed (range 5:00 to 7:00)",
    "",
  ])
  expect(text).not.toMatch(/[|\t]/)

  await page.setViewportSize({ width: 360, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath("report-360.png"), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 720 })

  await page.getByRole("button", { name: "Present" }).click()
  await expect(page.getByRole("dialog", { name: "Prepared speeches" })).toContainText("Ben Speaker7:45 Over time")
  await page.screenshot({ path: test.info().outputPath("presenter.png") })
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("dialog", { name: "Evaluations" })).toBeVisible()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Print or PDF" }).click()
  await expect(page).toHaveURL(/#\/print$/)
  await expect(page.getByRole("heading", { name: "Timer’s log" })).toBeVisible()
  const cy = page.getByRole("row", { name: /^Cy Speaker/ })
  await expect(cy.getByRole("cell")).toHaveText(["Speaker", "5:00", "6:00", "7:00", "Not timed", "", ""])
  await expect(page.getByRole("row", { name: /^Ben Speaker/ })).toContainText("Not eligible for awards.")
  await page.emulateMedia({ media: "print" })
  await page.screenshot({ path: test.info().outputPath("print-log.png"), fullPage: true })
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden()
  await expect(page.locator(".bottom-nav")).toHaveCount(0)
  await page.emulateMedia({ media: "screen" })

  await page.clock.resume()
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter(violation => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([])
  await page.getByRole("button", { name: "Back to the report" }).click()
  await expect(page.getByRole("heading", { name: "Timer’s report" })).toBeVisible()
  const reportAxe = await new AxeBuilder({ page }).analyze()
  expect(reportAxe.violations.filter(violation => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([])
})
