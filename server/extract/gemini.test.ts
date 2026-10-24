import { describe, expect, it, vi } from "vitest"
import { extractionJsonSchema } from "../../src/engine/import/extraction"
import { toastedSample } from "../../src/engine/import/samples"
import { createGeminiExtractor, geminiRequest, retryAfter } from "./gemini"
import { ExtractError } from "./provider"

const page = { mimeType: "image/jpeg" as const, data: "AAAA" }
const reply = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init })
const ok = (text: string, extra: object = {}) =>
  reply({
    candidates: [{ content: { parts: [{ text: "thinking about rows", thought: true }, { text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 2_400, candidatesTokenCount: 5_100, thoughtsTokenCount: 900 },
    modelVersion: "gemini-3.8-flash",
    ...extra,
  })
const extractWith = (response: Response | Error) => {
  const fetch = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return {
    fetch,
    run: () =>
      createGeminiExtractor({
        apiKey: "test-key",
        fetch,
        now: (() => {
          let t = 0
          return () => (t += 1_500)
        })(),
      }).extractAgenda([page]),
  }
}
const failure = async (response: Response | Error) => {
  try {
    await extractWith(response).run()
  } catch (error) {
    return error as ExtractError
  }
  throw new Error("expected a failure")
}

describe("Gemini request", () => {
  it("sends the instructions, the pages in order and the extraction schema as the response format", () => {
    const request = geminiRequest([page, { ...page, data: "BBBB" }])
    expect(request.contents[0].parts.map(part => ("text" in part ? part.text : part.inlineData.data))).toEqual([
      "Page 1 of 2:",
      "AAAA",
      "Page 2 of 2:",
      "BBBB",
      "Transcribe this meeting agenda.",
    ])
    expect(request.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseJsonSchema: extractionJsonSchema(),
      mediaResolution: "MEDIA_RESOLUTION_HIGH",
      thinkingConfig: { thinkingLevel: "medium" },
    })
    expect(request.systemInstruction.parts[0].text).toContain("Never guess or complete a name")
  })

  it("puts the key in a header, never in the URL or the body", async () => {
    const { fetch, run } = extractWith(ok(JSON.stringify(toastedSample)))
    await run()
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent")
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key")
    expect(String(init.body)).not.toContain("test-key")
  })
})

describe("Gemini reply", () => {
  it("returns the validated transcription with tokens and time, skipping thought parts", async () => {
    const result = await extractWith(ok(JSON.stringify(toastedSample))).run()
    expect(result.agenda.lines).toHaveLength(toastedSample.lines.length)
    expect(result.usage).toEqual({ inputTokens: 2_400, outputTokens: 5_100, thoughtTokens: 900 })
    expect(result.ms).toBe(1_500)
    expect(result.model).toBe("gemini-3.8-flash")
  })

  it("classifies a free-tier rate limit and how long to wait", async () => {
    const error = await failure(
      reply(
        {
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            message: "Quota exceeded",
            details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "37.2s" }],
          },
        },
        { status: 429 },
      ),
    )
    expect([error.kind, error.retryAfterSeconds]).toEqual(["rate_limited", 38])
    expect(retryAfter({}, "12")).toBe(12)
    expect(retryAfter({}, null)).toBeUndefined()
  })

  it.each([
    [reply({ error: { message: "API key not valid" } }, { status: 403 }), "not_configured"],
    [reply({ error: { message: "schema too complex" } }, { status: 400 }), "bad_request"],
    [reply({ error: { message: "overloaded" } }, { status: 503 }), "unavailable"],
    [ok("not json"), "unreadable"],
    [ok(JSON.stringify({ lines: "nope" })), "unreadable"],
    [reply({ candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }] }), "unreadable"],
    [reply({ promptFeedback: { blockReason: "SAFETY" } }), "unreadable"],
    [new TypeError("fetch failed"), "unavailable"],
  ] as const)("classifies failure %#", async (response, kind) => {
    expect((await failure(response)).kind).toBe(kind)
  })
})
