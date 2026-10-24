import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"

const browser = await chromium.launch({ headless: true })
await mkdir("screenshots", { recursive: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" })
await page.screenshot({ path: "screenshots/01-timer-idle-mobile-light.png", fullPage: true })
async function add(name, type = "speaker") { await page.getByRole("button", { name: type === "guest" ? "Add guest" : "Add speaker", exact: true }).last().click(); await page.getByLabel("Name").fill(name); await page.getByRole("button", { name: type === "guest" ? "Add guest" : "Add to queue", exact: true }).last().click() }
await page.getByRole("button", { name: "Queue", exact: true }).click()
await add("Alex Morgan"); await add("Priya Patel")
await page.getByText("Evaluations", { exact: true }).first().click(); await add("Jamie Lee"); await add("Morgan Ellis")
await page.getByText("Table Topics", { exact: true }).first().click(); await add("Taylor Brooks", "guest"); await add("Sam Rivera", "guest"); await add("Jordan Wells", "guest")
await page.screenshot({ path: "screenshots/02-queue-mobile-light.png", fullPage: true })
await page.getByRole("button", { name: "Timer", exact: true }).click(); await page.screenshot({ path: "screenshots/03-timer-ready-mobile-light.png", fullPage: true })
for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "+30 s" }).click(); await page.screenshot({ path: "screenshots/04-timer-green-mobile-light.png", fullPage: true })
await page.getByRole("button", { name: "+30 s" }).click(); await page.screenshot({ path: "screenshots/05-timer-yellow-mobile-light.png", fullPage: true })
await page.getByRole("button", { name: "+30 s" }).click(); await page.screenshot({ path: "screenshots/06-timer-red-mobile-light.png", fullPage: true })
await page.getByRole("button", { name: "+30 s" }).click(); await page.screenshot({ path: "screenshots/07-timer-overtime-mobile-light.png", fullPage: true })
await page.getByRole("button", { name: "Stop" }).click(); await page.getByRole("button", { name: "Report", exact: true }).click(); await page.screenshot({ path: "screenshots/08-report-mobile-light.png", fullPage: true })
await page.getByRole("button", { name: "Log", exact: true }).click(); await page.screenshot({ path: "screenshots/09-log-mobile-light.png", fullPage: true })
await page.getByRole("button", { name: "Settings", exact: true }).click(); await page.screenshot({ path: "screenshots/10-settings-mobile-light.png", fullPage: true }); await page.getByRole("button", { name: "Dark", exact: true }).click(); await page.screenshot({ path: "screenshots/11-settings-mobile-dark.png", fullPage: true })
await page.setViewportSize({ width: 1280, height: 800 }); await page.getByRole("button", { name: "Timer", exact: true }).click(); await page.screenshot({ path: "screenshots/12-timer-desktop-dark.png", fullPage: true })
const views = ["Timer", "Queue", "Report", "Log", "Settings"]
async function captureMatrix(size, theme) {
  await page.setViewportSize(size)
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  const current = theme === "dark" ? "Dark" : "Light"
  await page.getByRole("button", { name: current, exact: true }).click()
  for (const view of views) {
    await page.getByRole("button", { name: view, exact: true }).click()
    await page.screenshot({ path: `screenshots/matrix-${size.width === 390 ? "mobile" : "desktop"}-${theme}-${view.toLowerCase()}.png`, fullPage: true })
  }
}
await captureMatrix({ width: 390, height: 844 }, "light")
await captureMatrix({ width: 390, height: 844 }, "dark")
await captureMatrix({ width: 1280, height: 800 }, "light")
await captureMatrix({ width: 1280, height: 800 }, "dark")
await browser.close()
