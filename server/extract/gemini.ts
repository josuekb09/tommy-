import { extractionJsonSchema, rawAgenda } from "../../src/engine/import/extraction"
import type { AgendaImage } from "../../src/engine/import/wire"
import { extractionInstructions } from "./prompt"
import { ExtractError, type AgendaExtractor } from "./provider"

/** The current stable Flash model on the Gemini API's free tier. Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
const API = "https://generativelanguage.googleapis.com/v1beta"

export type GeminiOptions = {
  apiKey: string
  model?: string
  /** Gemini 3 spends a fixed number of tokens per image: HIGH is 1,120 (the recommended level for images). */
  mediaResolution?: "MEDIA_RESOLUTION_MEDIUM" | "MEDIA_RESOLUTION_HIGH"
  thinkingLevel?: "low" | "medium" | "high"
  timeoutMs?: number
  fetch?: typeof fetch
  now?: () => number
}

/** The generateContent request: instructions, the pages in order, and the extraction schema as the required response format. */
export function geminiRequest(images: AgendaImage[], options: Pick<GeminiOptions, "mediaResolution" | "thinkingLevel"> = {}) {
  const pages = images.flatMap((image, index) => [
    { text: `Page ${index + 1} of ${images.length}:` },
    { inlineData: { mimeType: image.mimeType, data: image.data } },
  ])
  return {
    systemInstruction: { parts: [{ text: extractionInstructions }] },
    contents: [{ role: "user", parts: [...pages, { text: "Transcribe this meeting agenda." }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: extractionJsonSchema(),
      mediaResolution: options.mediaResolution ?? "MEDIA_RESOLUTION_HIGH",
      thinkingConfig: { thinkingLevel: options.thinkingLevel ?? "medium" },
      maxOutputTokens: 32_768,
    },
  }
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  modelVersion?: string
}
type GeminiError = { error?: { code?: number; status?: string; message?: string; details?: { "@type"?: string; retryDelay?: string }[] } }

/** "37s" or "1.5s" from a RetryInfo detail, rounded up to whole seconds. */
export function retryAfter(body: GeminiError, header: string | null): number | undefined {
  const delay = body.error?.details?.find(detail => detail["@type"]?.endsWith("RetryInfo"))?.retryDelay
  const seconds = delay ? Number.parseFloat(delay) : header ? Number(header) : NaN
  return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : undefined
}

/**
 * Agenda extraction with Google Gemini through its REST API (plain fetch, so
 * it runs the same in a Cloudflare Pages Function and in Node). The reply is
 * constrained by the extraction schema and validated again with zod.
 */
export function createGeminiExtractor(options: GeminiOptions): AgendaExtractor {
  const model = options.model || DEFAULT_GEMINI_MODEL
  const send = options.fetch ?? fetch
  const now = options.now ?? (() => Date.now())
  return {
    model,
    async extractAgenda(images) {
      const started = now()
      let response: Response
      try {
        response = await send(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
          body: JSON.stringify(geminiRequest(images, options)),
          signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
        })
      } catch (error) {
        if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError"))
          throw new ExtractError("timeout", "The scan took too long.")
        throw new ExtractError("unavailable", "Could not reach the scanning service.")
      }
      const body = (await response.json().catch(() => ({}))) as GeminiResponse & GeminiError
      if (!response.ok) {
        const detail = body.error?.message ?? response.statusText
        if (response.status === 429)
          throw new ExtractError("rate_limited", `Rate limited: ${detail}`, retryAfter(body, response.headers.get("retry-after")) ?? 60)
        if (response.status === 401 || response.status === 403) throw new ExtractError("not_configured", `The API key was refused: ${detail}`)
        if (response.status === 400) throw new ExtractError("bad_request", `The request was refused: ${detail}`)
        if (response.status === 504) throw new ExtractError("timeout", `The model timed out: ${detail}`)
        throw new ExtractError("unavailable", `The model is unavailable (${response.status}): ${detail}`)
      }
      if (body.promptFeedback?.blockReason) throw new ExtractError("unreadable", `The model declined the photo (${body.promptFeedback.blockReason}).`)
      const candidate = body.candidates?.[0]
      const text =
        candidate?.content?.parts
          ?.filter(part => !part.thought && part.text)
          .map(part => part.text)
          .join("") ?? ""
      if (candidate?.finishReason && candidate.finishReason !== "STOP")
        throw new ExtractError("unreadable", `The model stopped early (${candidate.finishReason}).`)
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw new ExtractError("unreadable", "The model's reply was not valid JSON.")
      }
      const parsed = rawAgenda.safeParse(json)
      if (!parsed.success) throw new ExtractError("unreadable", `The model's reply did not match the agenda format: ${parsed.error.issues[0]?.message}`)
      const usage = body.usageMetadata ?? {}
      return {
        agenda: parsed.data,
        model: body.modelVersion ?? model,
        usage: { inputTokens: usage.promptTokenCount ?? 0, outputTokens: usage.candidatesTokenCount ?? 0, thoughtTokens: usage.thoughtsTokenCount ?? 0 },
        ms: now() - started,
      }
    },
  }
}
