import { scanMessages, scanRequest, type ScanFailure, type ScanSuccess } from "../../src/engine/import/wire"
import { createGeminiExtractor } from "./gemini"
import { ExtractError, type AgendaExtractor } from "./provider"

export type ScanEnv = { GEMINI_API_KEY?: string; GEMINI_MODEL?: string }
/** Up to 4 pages of base64 plus JSON overhead. */
const MAX_BODY_BYTES = 33_000_000

const json = (body: ScanSuccess | ScanFailure, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } })

const fail = (status: number, error: ScanFailure["error"], retryAfterSeconds?: number) =>
  json(
    { error, message: scanMessages[error], ...(retryAfterSeconds !== undefined && { retryAfterSeconds }) },
    status,
    retryAfterSeconds !== undefined ? { "retry-after": String(retryAfterSeconds) } : {},
  )

/**
 * POST /api/parse-agenda. The API key stays on the server: the browser sends
 * photos to its own origin and gets back a transcription. Nothing is stored
 * or logged. Only same-origin browser requests with a valid body reach the model.
 */
export async function handleScan(
  request: Request,
  env: ScanEnv,
  makeExtractor: (env: ScanEnv) => AgendaExtractor | undefined = defaultExtractor,
): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } })
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 })
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail(415, "bad_request")
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail(413, "bad_request")

  const body = scanRequest.safeParse(await request.json().catch(() => undefined))
  if (!body.success) return fail(400, "bad_request")
  const extractor = makeExtractor(env)
  if (!extractor) return fail(503, "not_configured")
  try {
    const result = await extractor.extractAgenda(body.data.images)
    return json(result, 200)
  } catch (error) {
    if (!(error instanceof ExtractError)) return fail(502, "unavailable")
    const status = { rate_limited: 429, unreadable: 422, bad_request: 400, not_configured: 503, unavailable: 502, timeout: 504 }[error.kind]
    return fail(status, error.kind, error.retryAfterSeconds)
  }
}

const defaultExtractor = (env: ScanEnv) => (env.GEMINI_API_KEY ? createGeminiExtractor({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }) : undefined)
