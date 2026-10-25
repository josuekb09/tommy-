import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"

const nav = (page: Page, name: "Meeting" | "Timer" | "Settings") =>
  page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name, exact: true }).click()

/** A Timer window with one speaker selected, and a speaker view window, sharing one fake clock. */
async function timerAndSpeaker(context: BrowserContext) {
  await context.clock.install({ time: new Date("2026-10-24T18:00:00Z") })
  const timer = await context.newPage()
  await timer.goto("/")
  await nav(timer, "Meeting")
  await timer.getByRole("button", { name: "Add to Prepared speeches" }).click()
  await timer.getByLabel("Name").fill("Ada Lovelace")
  await timer.getByRole("button", { name: "Add to agenda" }).click()
  await timer.getByRole("button", { name: /^Ada Lovelace/ }).click()
  const speaker = await context.newPage()
  await speaker.goto("/#/speaker")
  await expect(speaker.locator(".sv-word")).toHaveText("READY")
  await context.clock.pauseAt((await timer.evaluate(() => Date.now())) + 1_000)
  return { timer, speaker }
}

const word = (page: Page) => page.locator(".sv-word")

test("the speaker view follows the Timer window, with a word and an icon for every signal", async ({ context }) => {
  const { timer, speaker } = await timerAndSpeaker(context)
  await expect(speaker.getByText("Ada Lovelace · Speech 5:00 to 7:00")).toBeVisible()
  await timer.getByRole("button", { name: "Start", exact: true }).click()

  for (const [ms, label] of [
    [300_000, "GREEN"],
    [60_000, "AMBER"],
    [60_000, "RED"],
    [30_001, "OVERTIME"],
  ] as const) {
    await context.clock.runFor(ms)
    await expect(word(speaker)).toHaveText(label)
    // Never colour alone: the word and a distinct icon are always present.
    await expect(speaker.locator(".sv-signal svg")).toHaveCount(1)
    await expect(speaker.locator(".sv-stage")).toHaveClass(new RegExp(`signal-${label.toLowerCase()}`))
  }
  // The clock is hidden by default (colour, word and icon only).
  await expect(speaker.locator(".sv-clock")).toHaveCount(0)
})

test("when the Timer window goes away the speaker view says so but never freezes on a wrong colour", async ({ context }) => {
  const { timer, speaker } = await timerAndSpeaker(context)
  await timer.getByRole("button", { name: "Start", exact: true }).click()
  await context.clock.runFor(290_000)
  await expect(word(speaker)).toHaveText("READY")
  await expect(speaker.getByText("Reconnecting…")).toHaveCount(0)

  await timer.close()
  await context.clock.runFor(1_500)
  await expect(speaker.getByText("Reconnecting…")).toHaveCount(0)
  await context.clock.runFor(1_000)
  await expect(speaker.getByText("Reconnecting…")).toBeVisible()
  // The speech goes on: the view keeps advancing from the last known start time.
  await context.clock.runFor(10_000)
  await expect(word(speaker)).toHaveText("GREEN")

  const reopened = await context.newPage()
  await reopened.goto("/")
  await context.clock.runFor(1_000)
  await expect(speaker.getByText("Reconnecting…")).toHaveCount(0)
  await expect(word(speaker)).toHaveText("GREEN")
})

test("contest mode hides names on the speaker view", async ({ context }) => {
  const { timer, speaker } = await timerAndSpeaker(context)
  await expect(speaker.getByText(/Ada Lovelace/)).toBeVisible()
  await nav(timer, "Settings")
  await timer.getByRole("switch", { name: /Contest mode/ }).click()
  await expect(speaker.getByText(/Ada Lovelace/)).toHaveCount(0)
  await expect(speaker.getByText(/Speech 5:00 to 7:00/)).toBeVisible()
})

test("the clock can be shown to the speaker, and the explanation card follows the club rules", async ({ context }) => {
  const { timer, speaker } = await timerAndSpeaker(context)
  await timer.getByRole("button", { name: "Present to the speaker" }).click()
  await timer.getByRole("switch", { name: "Show the clock to the speaker" }).click()
  await expect(speaker.locator(".sv-clock")).toHaveText("0:00")

  await timer.getByRole("switch", { name: "Show 'Explain the signals' on the speaker view" }).click()
  await expect(speaker.getByRole("heading", { name: "How the timing signals work" })).toBeVisible()
  await expect(speaker.getByText("You have 30 seconds of grace after red (Table Topics has no grace period).")).toBeVisible()
  await expect(speaker.getByText("green 5:00, amber 6:00, red 7:00")).toBeVisible()

  await timer.keyboard.press("Escape")
  await nav(timer, "Settings")
  await timer.getByLabel("Grace length").fill("15")
  await expect(speaker.getByText("You have 15 seconds of grace after red (Table Topics has no grace period).")).toBeVisible()
})

test("Present opens the speaker view in its own window", async ({ context }) => {
  const { timer } = await timerAndSpeaker(context)
  await timer.getByRole("button", { name: "Present to the speaker" }).click()
  const popup = context.waitForEvent("page")
  await timer.getByRole("button", { name: "Open speaker view" }).click()
  const window = await popup
  await expect(window).toHaveURL(/#\/speaker$/)
  await expect(window.locator(".sv-word")).toHaveText("READY")
})

test("Zoom view is a clean 1920x1080 frame of the signal", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto("/#/zoom")
  const stage = (await page.locator(".sv-stage").boundingBox())!
  expect([Math.round(stage.width), Math.round(stage.height)]).toEqual([1920, 1080])
  await expect(page.locator(".sv-word")).toBeVisible()
  await expect(page.locator(".sv-fullscreen, .sv-who")).toHaveCount(0)
})

test("downloadable backgrounds are 1920x1080 PNGs for green, amber, red and overtime", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Present to the speaker" }).click()
  const downloads: string[] = []
  page.on("download", async download => downloads.push(download.suggestedFilename() + "|" + (await download.path())))
  await page.getByRole("button", { name: "Download backgrounds (PNG)" }).click()
  await expect.poll(() => downloads.length).toBe(4)
  const names = downloads.map(entry => entry.split("|")[0]).sort()
  expect(names).toEqual(["tommy-background-amber.png", "tommy-background-green.png", "tommy-background-overtime.png", "tommy-background-red.png"])
  for (const entry of downloads) {
    const bytes = await readFile(entry.split("|")[1])
    expect(bytes.subarray(1, 4).toString()).toBe("PNG")
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1920, 1080])
  }
})
