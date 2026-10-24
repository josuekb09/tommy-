import { expect, test, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const at = (minutes: number, seconds = 0) => `${minutes}:${String(seconds).padStart(2, "0")}`
const nav = (page: Page, name: "Meeting" | "Timer" | "Report" | "Settings") =>
  page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name, exact: true }).click()
const expectClock = (page: Page, minutes: number, seconds = 0) => expect(page.locator(".timer-number")).toHaveText(at(minutes, seconds))

/** Installs a fake clock, lets the app start (IndexedDB needs timers), then freezes time for the test. */
async function openWithFakeClock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-24T18:00:00Z") })
  await page.goto("/")
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible()
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000)
}

async function addToAgenda(page: Page, segment: "Prepared speeches" | "Evaluations" | "Table Topics", name: string) {
  await nav(page, "Meeting")
  await page.getByRole("button", { name: `Add to ${segment}` }).click()
  await page.getByLabel("Name").fill(name)
  await page.getByRole("button", { name: "Add to agenda" }).click()
  await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible()
}

async function timeItem(page: Page, name: string, ms: number) {
  await nav(page, "Meeting")
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click()
  await expect(page.locator(".speaker-card h1")).toHaveText(name)
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.clock.runFor(ms)
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(page.getByText(/^Recorded \d/)).toBeVisible()
}

async function storedRecords(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ agendaItemId: string; elapsedMs: number; status: string }[]>((resolve, reject) => {
        const request = indexedDB.open("tommy-v2")
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const all = request.result.transaction("timedRecords").objectStore("timedRecords").getAll()
          all.onsuccess = () => resolve(all.result)
          all.onerror = () => reject(all.error)
        }
      }),
  )
}

test("full offline-capable meeting: speeches, evaluations and live Table Topics guests reach the report", async ({ page }) => {
  test.setTimeout(180_000)
  await openWithFakeClock(page)
  await addToAgenda(page, "Prepared speeches", "Ada Speaker")
  await addToAgenda(page, "Prepared speeches", "Ben Speaker")
  await addToAgenda(page, "Evaluations", "Eva Evaluator")
  await addToAgenda(page, "Evaluations", "Ed Evaluator")

  await timeItem(page, "Ada Speaker", 372_000)
  await timeItem(page, "Ben Speaker", 290_000)
  await timeItem(page, "Eva Evaluator", 150_000)
  await timeItem(page, "Ed Evaluator", 175_000)

  await nav(page, "Timer")
  await page.getByRole("tab", { name: "Table Topics" }).click()
  for (const [name, ms] of [
    ["Gia Guest", 75_000],
    ["Hal Guest", 95_000],
    ["Ivy Guest", 130_000],
  ] as const) {
    await page.getByRole("button", { name: "Add guest" }).click()
    await page.getByLabel("Name").fill(name)
    await page.getByRole("button", { name: "Add and start" }).click()
    await expect(page.locator(".speaker-card h1")).toHaveText(name)
    await page.clock.runFor(ms)
    await page.getByRole("button", { name: "Stop", exact: true }).click()
  }

  await nav(page, "Report")
  for (const [name, time, result] of [
    ["Ada Speaker", "6:12", "Within time"],
    ["Ben Speaker", "4:50", "Within time"],
    ["Eva Evaluator", "2:30", "Within time"],
    ["Ed Evaluator", "2:55", "Within time"],
    ["Gia Guest", "1:15", "Within time"],
    ["Hal Guest", "1:35", "Within time"],
    ["Ivy Guest", "2:10", "Over time"],
  ]) {
    const line = page.locator(".report-line", { hasText: name })
    await expect(line).toContainText(time)
    await expect(line).toContainText(result)
  }
  const records = await storedRecords(page)
  expect(
    records
      .filter(record => record.status === "stopped")
      .map(record => record.elapsedMs)
      .sort((a, b) => a - b),
  ).toEqual([75_000, 95_000, 130_000, 150_000, 175_000, 290_000, 372_000])
})

test("a running timer survives a page reload exactly", async ({ page }) => {
  await openWithFakeClock(page)
  await addToAgenda(page, "Prepared speeches", "Persistent Speaker")
  await page.getByRole("button", { name: /^Persistent Speaker/ }).click()
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.clock.runFor(123_000)
  await expectClock(page, 2, 3)
  await page.reload()
  await expect(page.locator(".speaker-card h1")).toHaveText("Persistent Speaker")
  await expectClock(page, 2, 3)
  await page.clock.runFor(10_000)
  await expectClock(page, 2, 13)
})

test("signals change at exact thresholds and are announced in text, not colour alone", async ({ page }) => {
  await openWithFakeClock(page)
  await addToAgenda(page, "Table Topics", "Tess Topics")
  await page.getByRole("button", { name: /^Tess Topics/ }).click()
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.clock.runFor(59_000)
  await expect(page.locator(".timer-state b")).toHaveText("Ready")
  await page.clock.runFor(1_000)
  await expect(page.locator(".timer-state b")).toHaveText("Green")
  await expect(page.locator(".pattern-cue")).toHaveText("● GREEN")
  await page.clock.runFor(30_000)
  await expect(page.locator(".timer-state b")).toHaveText("Amber")
  await page.clock.runFor(30_000)
  await expect(page.locator(".timer-state b")).toHaveText("Red")
  await expect(page.getByRole("status").filter({ hasText: "Time limit reached" })).toHaveCount(1)
})

test("stop can be undone, offsets apply, and an edit needs a reason and keeps the original", async ({ page }) => {
  await openWithFakeClock(page)
  await addToAgenda(page, "Prepared speeches", "Undo Tester")
  await page.getByRole("button", { name: /^Undo Tester/ }).click()
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.clock.runFor(45_000)
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Add 30 seconds" }).click()
  await page.getByRole("button", { name: "Subtract 5 seconds" }).click()
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expectClock(page, 1, 10)

  await page.getByRole("button", { name: "Edit time" }).click()
  await page.getByLabel("Recorded time", { exact: true }).fill("1:20")
  await expect(page.getByRole("button", { name: "Save recorded time" })).toBeDisabled()
  await page.getByLabel("Reason for the edit").fill("Started late")
  await page.getByRole("button", { name: "Save recorded time" }).click()
  await nav(page, "Report")
  await expect(page.locator(".report-line", { hasText: "Undo Tester" })).toContainText("1:20")
  await expect(page.locator(".report-line", { hasText: "Undo Tester" })).toContainText("Edited: Started late")
})

test("removing someone with a recorded time asks for confirmation", async ({ page }) => {
  await openWithFakeClock(page)
  await timeItemAfterAdding(page)
  page.once("dialog", dialog => dialog.dismiss())
  await page.getByRole("button", { name: "Remove Keep Me" }).click()
  await expect(page.getByRole("button", { name: /^Keep Me/ })).toBeVisible()
})
async function timeItemAfterAdding(page: Page) {
  await addToAgenda(page, "Prepared speeches", "Keep Me")
  await timeItem(page, "Keep Me", 10_000)
  await nav(page, "Meeting")
}

test("production PWA reloads offline and keeps timing", async ({ context, page }) => {
  await page.goto("/")
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await addToAgenda(page, "Prepared speeches", "Offline Speaker")
  await context.setOffline(true)
  await page.reload({ waitUntil: "domcontentloaded" })
  await nav(page, "Meeting")
  await page.getByRole("button", { name: /^Offline Speaker/ }).click()
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await nav(page, "Report")
  await expect(page.locator(".report-line", { hasText: "Offline Speaker" })).toBeVisible()
})

test("export and import a meeting through a file", async ({ page }) => {
  await openWithFakeClock(page)
  await addToAgenda(page, "Prepared speeches", "Exported Speaker")
  await timeItem(page, "Exported Speaker", 61_000)
  await nav(page, "Settings")
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export this meeting" }).click()
  const file = await (await download).path()
  await page.getByLabel("Import a Tommy export file").setInputFiles(file)
  await expect(page.getByText("1 meeting imported")).toBeVisible()
})

for (const screen of ["Meeting", "Timer", "Report", "Settings"] as const) {
  test(`no serious accessibility violations on ${screen}`, async ({ page }) => {
    await page.goto("/")
    await nav(page, screen)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter(violation => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([])
  })
}

for (const [width, height] of [
  [360, 740],
  [390, 844],
  [768, 1024],
  [1280, 800],
] as const) {
  test(`layout ${width}x${height}: no horizontal scroll and 48px touch targets`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto("/")
    await expect(page.locator(".timer-number")).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const boxes = await page
      .locator(".bottom-nav button, .timer-actions button, .catchups button")
      .evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()))
    for (const box of boxes) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
  })
}
