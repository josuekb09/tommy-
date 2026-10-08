import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const add = async (page: import("@playwright/test").Page, name: string, guest = false) => {
  const action = guest ? "Add guest" : "Add speaker"
  await page.getByRole("button", { name: action, exact: true }).first().click()
  await page.getByLabel("Name").fill(name)
  await page.getByRole("button", { name: guest ? "Add guest" : "Add to queue", exact: true }).last().click()
}
const openQueue = async (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Queue", exact: true }).click()

test("full meeting uses fake time, records turns, and reports every segment", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-07T18:00:00Z") })
  await page.goto("/")
  await openQueue(page)
  await add(page, "Ada Speech")
  await add(page, "Ben Speech")
  await page.getByRole("button", { name: "Timer", exact: true }).click()
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.clock.runFor(300_000)
  await expect(page.getByText("Green", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "+30 s", exact: true }).click()
  await page.clock.runFor(30_000)
  await expect(page.getByText("Yellow", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Pause", exact: true }).click()
  await page.clock.runFor(30_000)
  await expect(page.getByText("6:00", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Resume", exact: true }).click()
  await page.clock.runFor(60_000)
  await expect(page.getByText("Red", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(page.getByText("Recorded", { exact: true })).toBeVisible()
  await openQueue(page)
  await page.getByText("Evaluations", { exact: true }).first().click()
  await add(page, "Eva Evaluation")
  await page.getByText("Table Topics", { exact: true }).first().click()
  await add(page, "Gia Guest", true)
  await page.getByRole("button", { name: "Timer", exact: true }).click()
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.getByRole("button", { name: "+30 s", exact: true }).click()
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await page.getByRole("button", { name: "Report", exact: true }).click()
  await expect(page.getByText("Gia Guest")).toBeVisible()
  await page.getByRole("button", { name: "Log", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Speeches", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Evaluations", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Table Topics", exact: true })).toBeVisible()
})

test("persists a running timer through reload and a reopened page", async ({ context, page }) => {
  await page.clock.install({ time: new Date("2026-10-07T18:00:00Z") })
  await page.goto("/")
  await openQueue(page); await add(page, "Persistent Speaker")
  await page.getByRole("button", { name: "Timer", exact: true }).click(); await page.getByRole("button", { name: "Start", exact: true }).click()
  await page.getByRole("button", { name: "+30 s", exact: true }).click(); await page.clock.runFor(1_000)
  const recordedBeforeReload = await page.locator(".timer-number").textContent()
  await page.reload(); await expect(page.getByText("Persistent Speaker", { exact: true })).toBeVisible()
  const toSeconds = (value: string) => { const [m,s] = value.split(":").map(Number); return m * 60 + s }
  expect(toSeconds((await page.locator(".timer-number").textContent())!)).toBeGreaterThanOrEqual(toSeconds(recordedBeforeReload!))
  expect(toSeconds((await page.locator(".timer-number").textContent())!)).toBeLessThan(toSeconds(recordedBeforeReload!) + 10)
  await page.close()
  const reopened = await context.newPage(); await reopened.goto("/")
  await expect(reopened.getByText("Persistent Speaker", { exact: true })).toBeVisible()
})

test("continues saving after going offline", async ({ context, page }) => {
  await page.goto("/"); await openQueue(page); await add(page, "Offline Speaker")
  await context.setOffline(true)
  await page.getByRole("button", { name: "Timer", exact: true }).click(); await page.getByRole("button", { name: "Start", exact: true }).click(); await page.getByRole("button", { name: "+30 s", exact: true }).click(); await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(page.getByText("Recorded", { exact: true })).toBeVisible()
})

for (const viewport of [[390,844],[768,1024],[1024,768],[1280,800],[1920,1080]] as const) for (const colorScheme of ["light", "dark"] as const) {
  test(`responsive ${viewport.join("x")} ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width: viewport[0], height: viewport[1] }); await page.goto("/?demo=1")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const controls = page.locator(".segment-tabs button, .bottom-nav button, .timer-actions button, .catchups button")
    for (const box of await controls.evaluateAll(nodes => nodes.map(node => { const r=node.getBoundingClientRect(); return [r.width,r.height] }))) expect(box[0]).toBeGreaterThanOrEqual(48), expect(box[1]).toBeGreaterThanOrEqual(48)
    await expect(page.locator(".bottom-nav")).toHaveCount(1)
  })
}

for (const screen of ["Timer", "Queue", "Report", "Log", "Settings"]) test(`axe ${screen}`, async ({ page }) => {
  await page.goto("/?demo=1"); await page.getByRole("button", { name: screen, exact: true }).click()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter(v => ["serious", "critical"].includes(v.impact || ""))).toEqual([])
})
