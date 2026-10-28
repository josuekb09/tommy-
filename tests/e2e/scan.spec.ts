import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { reviewSample } from "../../src/engine/import/samples"
import { nav } from "./helpers"

// The page's own /api/parse-agenda is answered here with a response in the
// API's wire format (a made-up agenda, no real names), so no model is called.
// Service workers are blocked so the route sees the request.
test.use({ serviceWorkers: "block" })

// A 1×1 PNG: the browser decodes and re-encodes it like a real photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")

test("a scanned agenda is checked row by row before it becomes the meeting", async ({ page }) => {
  let sent: { images: { mimeType: string }[] } | undefined
  await page.route("**/api/parse-agenda", async route => {
    sent = route.request().postDataJSON()
    await route.fulfill({ json: { agenda: reviewSample, model: "recorded", usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 }, ms: 5 } })
  })
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto("/")
  await nav(page, "Meeting")
  await page.getByRole("button", { name: "New meeting" }).click()
  await page.getByRole("button", { name: /^Scan a printed agenda/ }).click()
  await page.getByLabel("Agenda pages").setInputFiles({ name: "agenda.png", mimeType: "image/png", buffer: PNG })
  await page.getByRole("button", { name: "Read the agenda" }).click()

  await expect(page.getByRole("heading", { name: "Check the agenda" })).toBeVisible()
  expect(sent!.images).toHaveLength(1)
  expect(sent!.images[0].mimeType).toBe("image/jpeg")
  await expect(page.getByRole("status")).toHaveText("8 items read2 to check")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([])

  // On a phone the photo is one tap away.
  await page.getByRole("button", { name: "Photo" }).click()
  await expect(page.getByRole("img", { name: "Agenda page 1" })).toBeVisible()
  await page.getByRole("button", { name: "Rows" }).click()

  const useIt = page.getByRole("button", { name: "Use this agenda" })
  await expect(useIt).toBeDisabled()
  await page.getByLabel("Name for Speaker (Speaker 2) at 19:20").fill("Ben Byte")
  await page.getByLabel("Name for Speaker (Speaker 2) at 19:20").blur()
  await page.getByRole("button", { name: "Keep as read" }).click()
  await expect(page.getByRole("status")).toHaveText("8 items readNothing left to check")
  await useIt.click()

  await expect(page.getByRole("heading", { name: "Meeting agenda" })).toBeVisible()
  await expect(page.getByLabel("Theme")).toHaveValue("Beginnings")
  await expect(page.getByRole("button", { name: /^Ben Byte/ })).toBeVisible()
  // The imported agenda survives a reload.
  await page.reload()
  await nav(page, "Meeting")
  await expect(page.getByRole("button", { name: /^Ada Lovel/ })).toBeVisible()
})

test("offline, the scan says so at once and the builder still works", async ({ page, context }) => {
  await page.goto("/")
  await nav(page, "Meeting")
  await context.setOffline(true)
  await page.getByRole("button", { name: "New meeting" }).click()
  await page.getByRole("button", { name: /^Scan a printed agenda/ }).click()
  await page.getByLabel("Agenda pages").setInputFiles({ name: "agenda.png", mimeType: "image/png", buffer: PNG })
  await page.getByRole("button", { name: "Read the agenda" }).click()
  await expect(page.getByRole("alert")).toHaveText("Scanning needs an internet connection. Build the agenda by hand: it works offline.")
  await page.getByRole("button", { name: "Build it by hand instead" }).click()
  await expect(page.getByRole("button", { name: "Add to Prepared speeches" })).toBeEnabled()
  await context.setOffline(false)
})
