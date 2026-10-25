import { describe, expect, it, vi } from "vitest"
import { extractionJsonSchema } from "../../src/engine/import/extraction"
import { toastedSample } from "../../src/engine/import/samples"
import { createGeminiExtractor, dailyQuota, geminiRequest, retryAfter } from "./gemini"
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
        fallbackModels: [],
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

  it("gives Gemini 2.x a thinking budget, because it refuses a thinking level", () => {
    expect(geminiRequest([page], {}, "gemini-2.5-flash").generationConfig.thinkingConfig).toEqual({ thinkingBudget: 4_096 })
    expect(geminiRequest([page], { thinkingLevel: "low" }, "gemini-3.5-flash").generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" })
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

  it("tells a used-up daily free quota apart from the per-minute limit", async () => {
    const error = await failure(
      reply(
        {
          error: {
            code: 429,
            message: "You exceeded your current quota",
            details: [
              { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
              { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "49874s" },
            ],
          },
        },
        { status: 429 },
      ),
    )
    expect([error.kind, error.retryAfterSeconds]).toEqual(["quota_used_up", 49_874])
    expect(dailyQuota({}, 7_200)).toBe(true)
    expect(dailyQuota({ error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }] } }, 30)).toBe(false)
  })

  it.each([
    [reply({ error: { message: "API key not valid" } }, { status: 403 }), "not_configured"],
    [reply({ error: { message: "schema too complex" } }, { status: 400 }), "bad_request"],
    [reply({ error: { message: "high demand" } }, { status: 503 }), "busy"],
    [reply({ error: { message: "internal" } }, { status: 500 }), "busy"],
    [reply({ error: { message: "bad gateway" } }, { status: 502 }), "busy"],
    [reply({}, { status: 524 }), "busy"],
    [reply({ error: { message: "deadline" } }, { status: 504 }), "timeout"],
    [reply({ error: { message: "teapot" } }, { status: 418 }), "unavailable"],
    [ok("not json"), "unreadable"],
    [ok(JSON.stringify({ lines: "nope" })), "unreadable"],
    [reply({ candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }] }), "unreadable"],
    [reply({ promptFeedback: { blockReason: "SAFETY" } }), "unreadable"],
    [new TypeError("fetch failed"), "unavailable"],
  ] as const)("classifies failure %#", async (response, kind) => {
    expect((await failure(response)).kind).toBe(kind)
  })
})

describe("Fallback models", () => {
  const busy = () => reply({ error: { status: "UNAVAILABLE", message: "This model is currently experiencing high demand." } }, { status: 503 })
  const quota = () => reply({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }, { status: 429 })
  const daily = () =>
    reply(
      {
        error: {
          message: "You exceeded your current quota",
          details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }],
        },
      },
      { status: 429 },
    )
  const run = (replies: (() => Response)[], fallbackModels?: string[]) => {
    const fetch = vi.fn(async () => replies.shift()!())
    const extractor = createGeminiExtractor({ apiKey: "test-key", fetch, ...(fallbackModels && { fallbackModels }) })
    const models = () => (fetch.mock.calls as unknown as [string, RequestInit][]).map(([url]) => url.match(/models\/(.+):generateContent/)![1])
    const bodies = () => (fetch.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => JSON.parse(String(init.body)))
    return { promise: extractor.extractAgenda([page]), models, bodies }
  }

  it("tries the free fallback models in order when Gemini is busy or out of free quota", async () => {
    const scan = run([busy, quota, () => ok(JSON.stringify(toastedSample), { modelVersion: "gemini-2.5-flash" })])
    expect((await scan.promise).model).toBe("gemini-2.5-flash")
    expect(scan.models()).toEqual(["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"])
    expect(scan.bodies()[2].generationConfig.thinkingConfig).toEqual({ thinkingBudget: 4_096 })
  })

  it("reports the failure that clears soonest, and every model's cause, when every model fails", async () => {
    const scan = run([daily, busy, quota])
    const error = (await scan.promise.catch(error => error)) as ExtractError
    expect(error.kind).toBe("busy")
    expect(error.message).toMatch(/^quota_used_up: .*gemini-3\.8-flash.* \| busy: .*gemini-3\.5-flash.* \| rate_limited: .*gemini-2\.5-flash/)
    expect(scan.models()).toHaveLength(3)
  })

  it("says the daily free quota is used up only when it is for every model", async () => {
    await expect(run([daily, daily, daily]).promise).rejects.toMatchObject({ kind: "quota_used_up" })
  })

  it("tries the next model when Google times out, and reports a refused key over an earlier busy model", async () => {
    const timedOut = run([() => reply({}, { status: 504 }), () => ok(JSON.stringify(toastedSample))])
    await timedOut.promise
    expect(timedOut.models()).toEqual(["gemini-3.8-flash", "gemini-3.5-flash"])
    const refused = run([busy, () => reply({ error: { message: "API key not valid" } }, { status: 403 })])
    await expect(refused.promise).rejects.toMatchObject({ kind: "not_configured" })
    expect(refused.models()).toEqual(["gemini-3.8-flash", "gemini-3.5-flash"])
  })

  it("does not try other models for a refused key or a refused request", async () => {
    const refused = run([() => reply({ error: { message: "API key not valid" } }, { status: 403 })])
    await expect(refused.promise).rejects.toMatchObject({ kind: "not_configured" })
    expect(refused.models()).toEqual(["gemini-3.8-flash"])
  })

  it("can be turned off", async () => {
    const scan = run([busy], [])
    await expect(scan.promise).rejects.toMatchObject({ kind: "busy" })
    expect(scan.models()).toEqual(["gemini-3.8-flash"])
  })
})
