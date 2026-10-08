import { expect, test, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const at = (minutes: number, seconds = 0) => `${minutes}:${String(seconds).padStart(2, "0")}`
const installClock = (page: Page) => page.clock.install({ time: new Date("2026-10-07T18:00:00Z") })
const freezeClock = async (page: Page) => page.clock.pauseAt((await page.evaluate(() => Date.now())) + 60_000)
const openQueue = (page: Page) => page.getByRole("button", { name: "Queue", exact: true }).click()
const expectTimer = (page: Page, minutes: number, seconds = 0) => expect(page.locator(".timer-number")).toHaveText(at(minutes, seconds))

async function chooseSegment(page: Page, name: "Speeches" | "Evaluations" | "Table Topics") {
  await openQueue(page)
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click()
}
async function addSpeaker(page: Page, name: string, role?: "Speech" | "Ice Breaker") {
  await page.getByRole("button", { name: "Add speaker", exact: true }).click()
  await page.getByLabel("Name").fill(name)
  if (role) await page.getByLabel("Role").selectOption(role)
  await page.getByRole("button", { name: "Add to queue", exact: true }).click()
}
async function addGuest(page: Page, name: string) {
  await page.getByRole("button", { name: "Add guest", exact: true }).click()
  await page.getByLabel("Name").fill(name)
  await page.getByRole("button", { name: "Add guest", exact: true }).last().click()
}
async function startSelected(page: Page) {
  await page.getByRole("button", { name: "Timer", exact: true }).click()
  await page.getByRole("button", { name: "Start", exact: true }).click()
}
async function waitForMeetingSave(page: Page, expected?: { name: string; elapsedMs: number }) {
  await page.waitForFunction(async ({ expected }) => {
    const request = indexedDB.open("tommy")
    return await new Promise<boolean>((resolve, reject) => {
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const store = request.result.transaction("meetings", "readonly").objectStore("meetings")
        const meetings = store.getAll()
        meetings.onsuccess = () => resolve(expected ? meetings.result.some(meeting => meeting.segments.some((segment: { turns: { name: string; elapsedMs: number }[] }) => segment.turns.some(turn => turn.name === expected.name && turn.elapsedMs === expected.elapsedMs))) : meetings.result.length > 0)
        meetings.onerror = () => reject(meetings.error)
      }
    })
  }, { expected })
}

test("full meeting records exact prepared, Table Topics, and evaluation times in all reports", async ({ page }) => {
  await installClock(page); await page.goto("/"); await freezeClock(page); await openQueue(page)
  await addSpeaker(page, "Ada Speech"); await addSpeaker(page, "Ben Speech", "Ice Breaker")
  await page.getByRole("button", { name: /^Ada Speech Speech/ }).click(); await startSelected(page)
  await page.clock.runFor(299_000); await expect(page.getByText("Ready", { exact: true })).toBeVisible(); await expectTimer(page, 4, 59)
  await page.clock.runFor(1_000); await expect(page.getByText("Green", { exact: true })).toBeVisible()
  await page.clock.runFor(60_000); await expect(page.getByText("Yellow", { exact: true })).toBeVisible(); await expectTimer(page, 6)
  await page.clock.runFor(60_000); await expect(page.getByText("Red", { exact: true })).toBeVisible(); await expectTimer(page, 7)
  await page.getByRole("button", { name: "Pause", exact: true }).click(); await page.clock.runFor(30_000); await expectTimer(page, 7)
  await page.getByRole("button", { name: "Resume", exact: true }).click(); await page.clock.runFor(30_000); await expectTimer(page, 7, 30)
  await page.getByRole("button", { name: "Stop", exact: true }).click(); await expect(page.getByText("Recorded", { exact: true })).toBeVisible()

  await chooseSegment(page, "Table Topics"); await addGuest(page, "Gia Guest"); await startSelected(page)
  await page.clock.runFor(90_000); await expect(page.getByText("Yellow", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Stop", exact: true }).click(); await expectTimer(page, 1, 30)
  await chooseSegment(page, "Evaluations"); await addSpeaker(page, "Eva Evaluation"); await startSelected(page)
  await page.clock.runFor(150_000); await expect(page.getByText("Yellow", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Stop", exact: true }).click(); await expectTimer(page, 2, 30)

  await page.getByRole("button", { name: "Report", exact: true }).click(); await expect(page.getByRole("heading", { name: "Evaluations", exact: true })).toBeVisible(); await expect(page.getByText("Eva Evaluation", { exact: true })).toBeVisible()
  await page.getByRole("tab", { name: "Speeches", exact: true }).click(); await expect(page.getByText("Ada Speech", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "7:30", exact: true })).toBeVisible()
  await page.getByRole("tab", { name: "Table Topics", exact: true }).click(); await expect(page.getByText("Gia Guest", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "1:30", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Log", exact: true }).click()
  for (const name of ["Speeches", "Evaluations", "Table Topics", "Ada Speech", "Eva Evaluation", "Gia Guest"]) await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
  for (const time of ["7:30", "2:30", "1:30"]) await expect(page.getByRole("button", { name: time, exact: true })).toBeVisible()
})

test("running timer persists exact timestamp-derived time through reload, pause, resume, and reopening", async ({ context, page }) => {
  await installClock(page); await page.goto("/"); await freezeClock(page); await openQueue(page); await addSpeaker(page, "Persistent Speaker"); await startSelected(page)
  await page.clock.runFor(123_000); await expectTimer(page, 2, 3); await waitForMeetingSave(page)
  await page.reload(); await expect(page.getByText("Persistent Speaker", { exact: true })).toBeVisible(); await expectTimer(page, 2, 3)
  await page.getByRole("button", { name: "Pause", exact: true }).click(); await page.clock.runFor(30_000); await expectTimer(page, 2, 3)
  await page.getByRole("button", { name: "Resume", exact: true }).click(); await page.clock.runFor(30_000); await expectTimer(page, 2, 33); await page.getByRole("button", { name: "Stop", exact: true }).click(); await waitForMeetingSave(page)
  await page.close(); const reopened = await context.newPage(); await reopened.goto("/")
  await openQueue(reopened); await expect(reopened.getByText("Persistent Speaker", { exact: true })).toBeVisible(); await reopened.getByRole("button", { name: /^Persistent Speaker Speech/ }).click(); await expect(reopened.locator(".timer-number")).toHaveText("2:33")
  await reopened.getByRole("button", { name: "Report", exact: true }).click(); await expect(reopened.getByRole("button", { name: "2:33", exact: true })).toBeVisible()
})

test("production PWA reloads offline and continues storing a completed timer and report", async ({ context, page }) => {
  await page.goto("/"); await page.waitForFunction(() => navigator.serviceWorker.controller !== null); await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await openQueue(page); await addSpeaker(page, "Offline Speaker"); await waitForMeetingSave(page); await context.setOffline(true); await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.getByText("Offline Speaker", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Start", exact: true }).click(); await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible(); await page.getByRole("button", { name: "Stop", exact: true }).click()
  await page.getByRole("button", { name: "Report", exact: true }).click(); await expect(page.getByText("Offline Speaker", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "0:00", exact: true })).toBeVisible(); await waitForMeetingSave(page)
})

type TimerCase = { name: string; role: "Speech" | "Ice Breaker" | "Evaluation" | "Table Topics"; segment: "Speeches" | "Evaluations" | "Table Topics"; thresholds: [number, number, number]; custom?: boolean }
const timerCases: TimerCase[] = [
  { name: "prepared speech", role: "Speech", segment: "Speeches", thresholds: [300, 360, 420] },
  { name: "Ice Breaker", role: "Ice Breaker", segment: "Speeches", thresholds: [240, 300, 360] },
  { name: "evaluation", role: "Evaluation", segment: "Evaluations", thresholds: [120, 150, 180] },
  { name: "Table Topics", role: "Table Topics", segment: "Table Topics", thresholds: [60, 90, 120] },
  { name: "custom speech configuration", role: "Speech", segment: "Speeches", thresholds: [30, 60, 90], custom: true },
]
for (const timerCase of timerCases) test(`${timerCase.name} has exact thresholds, disqualification, pause/resume, stop, reset, and saved reset state`, async ({ page }) => {
  await installClock(page); await page.goto("/"); await freezeClock(page)
  if (timerCase.custom) { await page.getByRole("button", { name: "Settings", exact: true }).click(); await page.getByLabel("Speech green").fill("0:30"); await page.getByLabel("Speech yellow").fill("1:00"); await page.getByLabel("Speech red").fill("1:30") }
  await chooseSegment(page, timerCase.segment)
  if (timerCase.role === "Table Topics") await addGuest(page, `${timerCase.name} guest`)
  else await addSpeaker(page, `${timerCase.name} speaker`, timerCase.role === "Evaluation" ? undefined : timerCase.role)
  await page.getByRole("button", { name: "Settings", exact: true }).click(); await page.getByRole("switch", { name: "Disqualify at red + 30 s" }).click(); await page.getByRole("button", { name: "Timer", exact: true }).click(); await page.getByRole("button", { name: "Start", exact: true }).click()
  const [green, yellow, red] = timerCase.thresholds
  await page.clock.runFor((green - 1) * 1_000); await expect(page.getByText("Ready", { exact: true })).toBeVisible(); await page.clock.runFor(1_000); await expect(page.getByText("Green", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Pause", exact: true }).click(); await page.clock.runFor(30_000); await expectTimer(page, Math.floor(green / 60), green % 60); await page.getByRole("button", { name: "Resume", exact: true }).click()
  await page.clock.runFor((yellow - green) * 1_000); await expect(page.getByText("Yellow", { exact: true })).toBeVisible(); await page.clock.runFor((red - yellow) * 1_000); await expect(page.getByText("Red", { exact: true })).toBeVisible(); await page.clock.runFor(30_000); await expect(page.getByText("Over time", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Stop", exact: true }).click(); await expect(page.getByText("Recorded", { exact: true })).toBeVisible(); await expectTimer(page, Math.floor((red + 30) / 60), (red + 30) % 60)
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Reset", exact: true }).click(); await expectTimer(page, 0); await expect(page.getByText("Ready", { exact: true })).toBeVisible(); await waitForMeetingSave(page, { name: `${timerCase.name} ${timerCase.role === "Table Topics" ? "guest" : "speaker"}`, elapsedMs: 0 }); await page.reload(); await page.getByRole("tab", { name: timerCase.segment, exact: true }).click(); await expectTimer(page, 0); await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled()
})

const viewports = [[390, 844], [768, 1024], [1024, 768], [1280, 800], [1920, 1080]] as const
for (const viewport of viewports) for (const colorScheme of ["light", "dark"] as const) test(`responsive ${viewport.join("x")} ${colorScheme}: controls, navigation, timer, and speaker display remain usable`, async ({ page }) => {
  await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width: viewport[0], height: viewport[1] }); await installClock(page); await page.goto("/?demo=1")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const controls = page.locator(".segment-tabs button, .bottom-nav button, .timer-actions button, .catchups button, .display-button")
  for (const box of await controls.evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return [rect.width, rect.height] }))) { expect(box[0]).toBeGreaterThanOrEqual(48); expect(box[1]).toBeGreaterThanOrEqual(48) }
  for (const selector of [".timer-number", ".speaker-card h1", ".bottom-nav"]) expect(await page.locator(selector).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  const nav = await page.locator(".bottom-nav").boundingBox(), actions = await page.locator(".timer-actions").boundingBox(); expect(nav).not.toBeNull(); expect(actions).not.toBeNull()
  expect(nav!.x < actions!.x + actions!.width && nav!.x + nav!.width > actions!.x && nav!.y < actions!.y + actions!.height && nav!.y + nav!.height > actions!.y).toBe(false)
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Reset", exact: true }).click(); await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.clock.runFor(59_000); await expect(page.locator(".signal")).toHaveClass(/ready/); await page.clock.runFor(1_000); await expect(page.locator(".signal")).toHaveClass(/green/); await page.clock.runFor(30_000); await expect(page.locator(".signal")).toHaveClass(/yellow/); await page.clock.runFor(30_000); await expect(page.locator(".signal")).toHaveClass(/red/)
  await page.getByRole("button", { name: "Open speaker display" }).click(); const display = page.getByRole("button", { name: "Exit speaker display" }); await expect(display).toBeVisible(); expect((await display.boundingBox())!.width).toBeGreaterThanOrEqual(viewport[0] - 1); await display.click()
})

for (const screen of ["Timer", "Queue", "Report", "Log", "Settings"] as const) test(`accessibility has no serious or critical axe violations on ${screen}`, async ({ page }) => {
  await page.goto("/?demo=1"); await page.getByRole("button", { name: screen, exact: true }).click(); const results = await new AxeBuilder({ page }).analyze(); expect(results.violations.filter(violation => ["serious", "critical"].includes(violation.impact || ""))).toEqual([])
})
test("accessibility: add-speaker form and keyboard focus have names and visible focus", async ({ page }) => {
  await page.goto("/"); await openQueue(page); await page.getByRole("button", { name: "Add speaker", exact: true }).click(); const results = await new AxeBuilder({ page }).analyze(); expect(results.violations.filter(violation => ["serious", "critical"].includes(violation.impact || ""))).toEqual([])
  await expect(page.getByRole("button", { name: "Close add speaker" })).toBeVisible(); const focus = await page.evaluate(() => { const active = document.activeElement as HTMLElement, style = getComputedStyle(document.activeElement as Element); return { name: active.getAttribute("aria-label") || active.getAttribute("placeholder"), outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle } }); expect(focus.name).toBe("e.g. Taylor Brooks"); expect(focus.outlineStyle).not.toBe("none"); expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(3)
})
