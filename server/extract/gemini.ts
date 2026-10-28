import { extractionJsonSchema, rawAgenda } from "../../src/engine/import/extraction"
import type { AgendaImage, ScanErrorKind } from "../../src/engine/import/wire"
import { extractionInstructions } from "./prompt"
import { ExtractError, type AgendaExtractor, type ExtractResult } from "./provider"

/**
 * Flash-lite is the fastest free-tier model. Falls back to full Flash models
 * which are accurate but slower. Override with GEMINI_MODEL.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-lite"
/**
 * Free-tier models tried in order when the main one is busy (5xx), timed out
 * (504) or out of free quota (429). Each model has its own free quota, so this
 * stays at zero cost. Override with GEMINI_FALLBACK_MODELS (comma-separated, empty for none).
 */
export const DEFAULT_FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-2.5-flash"]
/**
 * Per-model timeout: give up quickly so the next fallback starts soon.
 * The whole-scan deadline (timeoutMs) is still 140 s as the outer guard.
 */
export const DEFAULT_PER_MODEL_TIMEOUT_MS = 18_000
const API = "https://generativelanguage.googleapis.com/v1beta"

export type GeminiOptions = {
  apiKey: string
  model?: string
  fallbackModels?: string[]
  /** Gemini 3 spends a fixed number of tokens per image: HIGH is 1,120 (the recommended level for images). */
  mediaResolution?: "MEDIA_RESOLUTION_MEDIUM" | "MEDIA_RESOLUTION_HIGH"
  thinkingLevel?: "low" | "medium" | "high"
  /** For the whole scan, fallbacks included; just under the browser's 150 s. */
  timeoutMs?: number
  /** Maximum time to wait for a single model before trying the next fallback. */
  perModelTimeoutMs?: number
  fetch?: typeof fetch
  now?: () => number
}

/**
 * Gemini 2.x takes a thinking budget in tokens; thinkingLevel is refused there.
 * flash-lite models are too fast to need much thinking; we use a minimal budget.
 */
const thinkingConfig = (model: string, level: NonNullable<GeminiOptions["thinkingLevel"]>) => {
  const isLite = /lite/.test(model)
  if (/^gemini-2\./.test(model)) return { thinkingBudget: isLite ? 0 : { low: 1_024, medium: 4_096, high: 16_384 }[level] }
  return { thinkingLevel: level }
}

/** The generateContent request: instructions, the pages in order, and the extraction schema as the required response format. */
export function geminiRequest(
  images: AgendaImage[],
  options: Pick<GeminiOptions, "mediaResolution" | "thinkingLevel"> = {},
  model: string = DEFAULT_GEMINI_MODEL,
) {
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
      thinkingConfig: thinkingConfig(model, options.thinkingLevel ?? "medium"),
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
type GeminiError = {
  error?: { code?: number; status?: string; message?: string; details?: { "@type"?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[] }
}

/** "37s" or "1.5s" from a RetryInfo detail, rounded up to whole seconds. */
export function retryAfter(body: GeminiError, header: string | null): number | undefined {
  const delay = body.error?.details?.find(detail => detail["@type"]?.endsWith("RetryInfo"))?.retryDelay
  const seconds = delay ? Number.parseFloat(delay) : header ? Number(header) : NaN
  return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : undefined
}

/** A daily free quota, or a wait of over an hour: "try again in a minute" would not be true. */
export function dailyQuota(body: GeminiError, seconds: number | undefined): boolean {
  const quotas = body.error?.details?.flatMap(detail => detail.violations ?? []).map(violation => violation.quotaId ?? "") ?? []
  return quotas.some(quota => /PerDay/i.test(quota)) || (seconds ?? 0) > 3_600
}

/** Worth trying the next model: busy, out of free quota, or timed out on Google's side while our deadline has time left. */
const tryNext = (error: unknown, signal: AbortSignal) =>
  error instanceof ExtractError && (["busy", "rate_limited", "quota_used_up"].includes(error.kind) || (error.kind === "timeout" && !signal.aborted))
/** When every model failed, the Timer is told about the one that clears soonest. */
const soonest: ScanErrorKind[] = ["busy", "timeout", "unavailable", "rate_limited", "quota_used_up"]

/**
 * Agenda extraction with Google Gemini through its REST API (plain fetch, so
 * it runs the same in a Cloudflare Pages Function and in Node). The reply is
 * constrained by the extraction schema and validated again with zod. When the
 * main model is busy, out of free quota or timed out, the fallback models are
 * tried in order; if all fail, the failure that clears soonest is reported.
 */
export function createGeminiExtractor(options: GeminiOptions): AgendaExtractor {
  const model = options.model || DEFAULT_GEMINI_MODEL
  const models = [model, ...(options.fallbackModels ?? DEFAULT_FALLBACK_MODELS).filter(fallback => fallback !== model)]
  const send = options.fetch ?? fetch
  const now = options.now ?? (() => Date.now())

  async function attempt(model: string, images: AgendaImage[], signal: AbortSignal): Promise<Omit<ExtractResult, "ms">> {
    let response: Response
    try {
      response = await send(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
        body: JSON.stringify(geminiRequest(images, options, model)),
        signal,
      })
    } catch (error) {
      if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError"))
        throw new ExtractError("timeout", "The scan took too long.")
      throw new ExtractError("unavailable", "Could not reach the scanning service.")
    }
    const body = (await response.json().catch(() => ({}))) as GeminiResponse & GeminiError
    if (!response.ok) {
      const detail = `${model}: ${body.error?.message ?? response.statusText}`
      if (response.status === 429) {
        const seconds = retryAfter(body, response.headers.get("retry-after"))
        if (dailyQuota(body, seconds)) throw new ExtractError("quota_used_up", `Daily free quota used up: ${detail}`, seconds)
        throw new ExtractError("rate_limited", `Rate limited: ${detail}`, seconds ?? 60)
      }
      if (response.status === 401 || response.status === 403) throw new ExtractError("not_configured", `The API key was refused: ${detail}`)
      if (response.status === 400) throw new ExtractError("bad_request", `The request was refused: ${detail}`)
      if (response.status === 504) throw new ExtractError("timeout", `The model timed out: ${detail}`)
      if (response.status >= 500) throw new ExtractError("busy", `The model is busy (${response.status}): ${detail}`)
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
    }
  }

  /** The chosen failure, its message listing every model tried so the function log shows each cause. */
  function reported(chosen: ExtractError, failures: ExtractError[]): never {
    if (failures.length === 1) throw chosen
    throw new ExtractError(chosen.kind, failures.map(failure => `${failure.kind}: ${failure.message}`).join(" | "), chosen.retryAfterSeconds)
  }

  return {
    model,
    async extractAgenda(images) {
      const started = now()
      const deadline = AbortSignal.timeout(options.timeoutMs ?? 140_000)
      const perModelMs = options.perModelTimeoutMs ?? DEFAULT_PER_MODEL_TIMEOUT_MS
      const failures: ExtractError[] = []
      for (const candidate of models) {
        // Race the per-model budget against the remaining overall deadline.
        const modelSignal = AbortSignal.any([deadline, AbortSignal.timeout(perModelMs)])
        try {
          return { ...(await attempt(candidate, images, modelSignal)), ms: now() - started }
        } catch (error) {
          if (!(error instanceof ExtractError)) throw error
          failures.push(error)
          // A refused key or bad request is the real blocker: say that, not an earlier busy model.
          if (!tryNext(error, deadline)) return reported(error, failures)
        }
      }
      const chosen = failures.reduce((best, error) => (soonest.indexOf(error.kind) < soonest.indexOf(best.kind) ? error : best))
      return reported(chosen, failures)
    },
  }
}
