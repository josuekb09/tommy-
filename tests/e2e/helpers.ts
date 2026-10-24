import { expect, type Page } from "@playwright/test"

export const nav = (page: Page, name: "Meeting" | "Timer" | "Report" | "Settings") =>
  page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name, exact: true }).click()

/** Installs a fake clock, lets the app start (IndexedDB needs timers), then freezes time for the test. */
export async function openWithFakeClock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-24T18:00:00Z") })
  await page.goto("/")
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible()
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000)
}
