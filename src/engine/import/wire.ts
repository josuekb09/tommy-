import { z } from "zod"
import { rawAgenda } from "./extraction"

/** What the browser sends to /api/parse-agenda: the pages of one agenda, in order. */
export const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const
export const MAX_PAGES = 4
/** Per page, base64 characters (about 6 MB of image). Prepared photos are well under 1 MB. */
export const MAX_PAGE_BASE64 = 8_000_000

export const agendaImage = z.object({ mimeType: z.enum(imageTypes), data: z.string().min(1).max(MAX_PAGE_BASE64) })
export const scanRequest = z.object({ images: z.array(agendaImage).min(1).max(MAX_PAGES) })
export type AgendaImage = z.infer<typeof agendaImage>

export const usage = z.object({ inputTokens: z.number(), outputTokens: z.number(), thoughtTokens: z.number() })
export type Usage = z.infer<typeof usage>

export const scanErrorKinds = ["rate_limited", "quota_used_up", "busy", "unreadable", "bad_request", "not_configured", "unavailable", "timeout"] as const
export type ScanErrorKind = (typeof scanErrorKinds)[number]

export const scanSuccess = z.object({ agenda: rawAgenda, model: z.string(), usage, ms: z.number() })
export const scanFailure = z.object({ error: z.enum(scanErrorKinds), message: z.string(), retryAfterSeconds: z.number().optional() })
export type ScanSuccess = z.infer<typeof scanSuccess>
export type ScanFailure = z.infer<typeof scanFailure>

/** What the Timer reads when a scan fails. Every message offers the manual builder. */
export const scanMessages: Record<ScanErrorKind, string> = {
  rate_limited: "Scan limit reached, try again in a minute, or build it by hand.",
  quota_used_up: "Today’s free Google Gemini scans are used up. Try again tomorrow, or build it by hand.",
  busy: "Google Gemini is busy right now. Try again in a minute, or build it by hand.",
  unreadable: "Tommy couldn’t read this photo as an agenda. Try a sharper, straighter photo, or build it by hand.",
  bad_request: "These files can’t be scanned. Use up to 4 photos (JPEG, PNG, WEBP or HEIC) or a PDF, or build it by hand.",
  not_configured: "Agenda scanning isn’t set up on this site yet. Build the agenda by hand.",
  unavailable: "Google Gemini isn’t answering. Try again later, or build it by hand.",
  timeout: "The scan took too long. Try again, or build it by hand.",
}
