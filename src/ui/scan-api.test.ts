import { describe, expect, it, vi } from "vitest"
import { pinelandsSample } from "../engine/import/samples"
import { fitWithin } from "./capture"
import { scanAgenda } from "./scan-api"

const page = { mimeType: "image/jpeg" as const, data: "AAAA" }
const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
const online = () => true

describe("scanning from the browser", () => {
  it("posts the pages to Tommy's own API and validates the reply", async () => {
    const fetch = respond(200, { agenda: pinelandsSample, model: "m", usage: { inputTokens: 1, outputTokens: 2, thoughtTokens: 3 }, ms: 4 })
    const outcome = await scanAgenda([page], { fetch, online })
    expect(outcome.ok && outcome.result.agenda.meeting.theme).toBe("Endings")
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe("/api/parse-agenda")
  })

  it("answers offline at once, without a request", async () => {
    const fetch = vi.fn()
    const outcome = await scanAgenda([page], { fetch, online: () => false })
    expect(outcome).toMatchObject({ ok: false, message: "Scanning needs an internet connection. Build the agenda by hand: it works offline." })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("shows the rate-limit message, and makes sense of failures without a body", async () => {
    expect(await scanAgenda([page], { fetch: respond(429, { error: "rate_limited", message: "x", retryAfterSeconds: 30 }), online })).toEqual({
      ok: false,
      kind: "rate_limited",
      message: "Scan limit reached, try again in a minute, or build it by hand.",
      retryAfterSeconds: 30,
    })
    expect(await scanAgenda([page], { fetch: respond(429, "Too many"), online })).toMatchObject({ kind: "rate_limited" })
    expect(await scanAgenda([page], { fetch: respond(404, null), online })).toMatchObject({ kind: "not_configured" })
    expect(await scanAgenda([page], { fetch: respond(200, { agenda: "garbage" }), online })).toMatchObject({ kind: "unreadable" })
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    expect(await scanAgenda([page], { fetch: down, online })).toMatchObject({ kind: "unavailable" })
  })
})

describe("photo size", () => {
  it("scales the long edge down to 2048 px, never up", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 })
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 })
  })
})
