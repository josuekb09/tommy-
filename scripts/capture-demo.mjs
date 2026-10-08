import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"

const browser = await chromium.launch({ executablePath: "C:/Users/hp/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe", headless: true })
await mkdir("screenshots", { recursive: true })
async function openTimer(width, height, theme) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme })
  await page.goto("http://127.0.0.1:5173/?demo=1", { waitUntil: "networkidle" })
  return page
}
async function captureTimer(page, path, seconds) {
  page.once("dialog", dialog => dialog.accept())
  await page.getByRole("button", { name: "Reset", exact: true }).click()
  await page.getByRole("button", { name: "Start", exact: true }).click()
  for (let elapsed = 0; elapsed < seconds; elapsed += 30) await page.getByRole("button", { name: "+30 s", exact: true }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path })
}

let page = await openTimer(390, 844, "light")
await captureTimer(page, "screenshots/final-mobile-390x844-light-red.png", 120)
await page.close()

for (const theme of ["light", "dark"]) {
  page = await openTimer(1920, 1080, theme)
  await page.screenshot({ path: `screenshots/final-desktop-1920x1080-${theme}.png` })
  await page.close()
}

page = await openTimer(1024, 768, "light")
await page.screenshot({ path: "screenshots/final-tablet-landscape-1024x768-light.png" })
await page.close()

for (const [state, seconds] of [["green", 60], ["yellow", 90], ["red", 120]]) {
  page = await openTimer(1920, 1080, "light")
  await captureTimer(page, `screenshots/final-speaker-display-${state}-1920x1080.png`, seconds)
  await page.getByRole("button", { name: "Open speaker display" }).click()
  await page.screenshot({ path: `screenshots/final-speaker-display-${state}-1920x1080.png` })
  await page.close()
}
await browser.close()
