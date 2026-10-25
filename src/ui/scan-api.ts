import { scanFailure, scanMessages, scanSuccess, type AgendaImage, type ScanErrorKind, type ScanSuccess } from "../engine/import/wire"

export type ScanOutcome = { ok: true; result: ScanSuccess } | { ok: false; kind: ScanErrorKind; message: string; retryAfterSeconds?: number }

const failed = (kind: ScanErrorKind, retryAfterSeconds?: number): ScanOutcome => ({
  ok: false,
  kind,
  message: scanMessages[kind],
  ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
})

/**
 * Sends the pages to Tommy's own /api/parse-agenda (never to the model
 * provider directly) and turns every failure into a message that offers the
 * manual builder. Offline is answered at once, without a request; a request
 * that never got an answer is told apart from Gemini not answering.
 */
export async function scanAgenda(
  images: AgendaImage[],
  options: { fetch?: typeof fetch; online?: () => boolean; timeoutMs?: number } = {},
): Promise<ScanOutcome> {
  const online = options.online ?? (() => navigator.onLine)
  if (!online()) return { ok: false, kind: "unavailable", message: "Scanning needs an internet connection. Build the agenda by hand: it works offline." }
  let response: Response
  try {
    response = await (options.fetch ?? fetch)("/api/parse-agenda", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ images }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 150_000),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") return failed("timeout")
    return { ok: false, kind: "unavailable", message: "Couldn’t reach Tommy’s scan service. Check the connection and try again, or build it by hand." }
  }
  const body: unknown = await response.json().catch(() => undefined)
  if (response.ok) {
    const success = scanSuccess.safeParse(body)
    return success.success ? { ok: true, result: success.data } : failed("unreadable")
  }
  const failure = scanFailure.safeParse(body)
  if (failure.success) return failed(failure.data.error, failure.data.retryAfterSeconds)
  return failed(response.status === 429 ? "rate_limited" : response.status === 404 || response.status === 405 ? "not_configured" : "unavailable")
}
