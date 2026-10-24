import { describe, expect, it, vi } from "vitest"
import { pinelandsSample } from "../../src/engine/import/samples"
import { handleScan } from "./handler"
import { ExtractError, type AgendaExtractor } from "./provider"

const origin = "https://tommy.example"
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${origin}/api/parse-agenda`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
const page = { mimeType: "image/jpeg", data: "AAAA" }
const extractor = (result: () => ReturnType<AgendaExtractor["extractAgenda"]>) => {
  const extractAgenda = vi.fn(result)
  return { extractAgenda, make: () => ({ model: "test-model", extractAgenda }) }
}
const success = extractor(async () => ({ agenda: pinelandsSample, model: "test-model", usage: { inputTokens: 1, outputTokens: 2, thoughtTokens: 0 }, ms: 5 }))

describe("POST /api/parse-agenda", () => {
  it("returns the transcription for a same-origin request with valid pages", async () => {
    const response = await handleScan(post({ images: [page, page] }), { GEMINI_API_KEY: "k" }, success.make)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect((await response.json()).agenda.meeting.theme).toBe("Endings")
    expect(success.extractAgenda).toHaveBeenCalledWith([page, page])
  })

  it("refuses other methods, other origins and requests without an Origin", async () => {
    expect((await handleScan(new Request(`${origin}/api/parse-agenda`), {}, success.make)).status).toBe(405)
    expect((await handleScan(post({ images: [page] }, { origin: "https://evil.example" }), {}, success.make)).status).toBe(403)
    const noOrigin = new Request(`${origin}/api/parse-agenda`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    expect((await handleScan(noOrigin, {}, success.make)).status).toBe(403)
  })

  it.each([
    ["no pages", { images: [] }],
    ["too many pages", { images: Array(5).fill(page) }],
    ["an unsupported file type", { images: [{ mimeType: "text/html", data: "PGgxPg==" }] }],
    ["broken JSON", "{"],
  ])("rejects %s without calling the model", async (_, body) => {
    const calls = extractor(success.extractAgenda)
    const response = await handleScan(post(body), { GEMINI_API_KEY: "k" }, calls.make)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("bad_request")
    expect(calls.extractAgenda).not.toHaveBeenCalled()
  })

  it("says scanning is not set up when there is no key", async () => {
    const response = await handleScan(post({ images: [page] }), {})
    expect(response.status).toBe(503)
    expect((await response.json()).message).toBe("Agenda scanning isn’t set up on this site yet. Build the agenda by hand.")
  })

  it("passes a free-tier rate limit on with a clear message and Retry-After", async () => {
    const limited = extractor(async () => {
      throw new ExtractError("rate_limited", "Quota exceeded", 42)
    })
    const response = await handleScan(post({ images: [page] }), { GEMINI_API_KEY: "secret-key-value" }, limited.make)
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("42")
    const body = await response.json()
    expect(body).toEqual({ error: "rate_limited", message: "Scan limit reached, try again in a minute, or build it by hand.", retryAfterSeconds: 42 })
    expect(JSON.stringify(body)).not.toContain("secret-key-value")
  })

  it("never passes provider error details to the browser", async () => {
    const broken = extractor(async () => {
      throw new ExtractError("unavailable", "upstream said: key AIzaSecret is over quota")
    })
    const body = await (await handleScan(post({ images: [page] }), { GEMINI_API_KEY: "k" }, broken.make)).json()
    expect(body).toEqual({ error: "unavailable", message: "The scanning service isn’t answering. Try again later, or build it by hand." })
    const crashed = extractor(async () => {
      throw new Error("boom")
    })
    expect((await handleScan(post({ images: [page] }), { GEMINI_API_KEY: "k" }, crashed.make)).status).toBe(502)
  })
})
