import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"

const browser = await chromium.launch({ executablePath: "C:/Users/hp/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe", headless: true })
await mkdir("screenshots", { recursive: true })
const sizes = [[390,844],[768,1024],[1024,768],[1280,800],[1920,1080]]
const screens = ["Timer", "Queue", "Report", "Log", "Settings"]
for (const [width,height] of sizes) for (const theme of ["light","dark"]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme })
  await page.goto("http://127.0.0.1:5173/?demo=1", { waitUntil: "networkidle" })
  for (const screen of screens) {
    await page.getByRole("button", { name: screen, exact: true }).click()
    await page.screenshot({ path: `screenshots/${screen.toLowerCase()}-${width}x${height}-${theme}.png`, fullPage: true })
  }
  await page.getByRole("button", { name: "Timer", exact: true }).click()
  await page.getByRole("button", { name: "Open speaker display" }).click()
  await page.screenshot({ path: `screenshots/speaker-display-${width}x${height}-${theme}.png` })
  await page.close()
}
await browser.close()
