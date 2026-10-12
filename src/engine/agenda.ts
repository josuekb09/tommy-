import { presets, type Meeting, type SegmentType, type Settings, type Turn } from "./types"

export type AgendaRole = "Speech" | "Ice Breaker" | "Evaluation" | "Table Topics" | "unknown"
export type AgendaItem = {
  id: string
  role: AgendaRole
  name: string
  title: string
  durationSeconds?: number
  segment?: SegmentType
  uncertain: string[]
  source: string
  sourceIndex?: number
}
export type AgendaDraft = {
  title: string
  date: string
  items: AgendaItem[]
  originalText: string
  warnings: string[]
}

const blankDraft = (originalText: string): AgendaDraft => ({ title: "", date: "", items: [], originalText, warnings: [] })
const clean = (value: string) => value.replace(/\s+/g, " ").replace(/[|•]/g, " ").trim()
const duration = (value: string) => {
  const match = value.match(/\b(\d{1,2})\s*(?:min(?:ute)?s?|m)\b/i) || value.match(/\b(\d{1,2}):(\d{2})\b/)
  if (!match) return undefined
  const seconds = match[2] ? Number(match[1]) * 60 + Number(match[2]) : Number(match[1]) * 60
  return seconds > 0 && seconds <= 60 * 30 ? seconds : undefined
}
const roleFor = (line: string): AgendaRole => {
  if (/table\s*topics|topics\s*speaker/i.test(line)) return "Table Topics"
  if (/ice\s*breaker/i.test(line)) return "Ice Breaker"
  // These are meeting roles, not timed evaluation turns in Tommy's existing model.
  if (/general\s+evaluat|topics\s+evaluat/i.test(line)) return "unknown"
  if (/evaluat(?:ion|or)/i.test(line)) return "Evaluation"
  if (/\b(?:speech(?:es)?|speaker)\b/i.test(line)) return "Speech"
  return "unknown"
}
const segmentFor = (role: AgendaRole): SegmentType | undefined => role === "Evaluation" ? "evaluations" : role === "Table Topics" ? "tableTopics" : role === "Speech" || role === "Ice Breaker" ? "speeches" : undefined
const probablyName = (value: string) => {
  const candidate = value.trim()
  return /^[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3}$/.test(candidate)
    && !/^(Speaker|Speech|Evaluation|Evaluator|General Evaluator|Table Topics|Toastmasters|Meeting|Agenda|Prepared)$/i.test(candidate)
}
const makeId = (index: number) => `agenda-${index}`
const normalized = (value: string) => clean(value).toLocaleLowerCase()
const nameFrom = (value: string) => {
  const matches = value.match(/[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3}/g) || []
  return matches.find(probablyName) || ""
}
const stripRole = (line: string) => line
  .replace(/table\s*topics(?:\s*speaker)?/ig, "")
  .replace(/ice\s*breaker/ig, "")
  .replace(/evaluat(?:ion|or)/ig, "")
  .replace(/\bprepared\s*/ig, "")
  .replace(/\b(?:speech(?:es)?|speaker)\b/ig, "")
  .replace(/^\d{1,2}[:.)\-\s]+/, "")
  .replace(/\b\d{1,2}\s*(?:min(?:ute)?s?|m)\b|\b\d{1,2}:\d{2}\b/ig, "")
const dedupeItems = (items: AgendaItem[]) => {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = `${item.role}|${normalized(item.name)}|${normalized(item.title)}`
    if (!item.name || seen.has(key)) return !item.name
    seen.add(key)
    return true
  })
}

/** Converts OCR text into a cautious, editable agenda draft. It never manufactures people or durations. */
export function parseAgenda(text: string): AgendaDraft {
  const originalText = text.trim()
  const draft = blankDraft(originalText)
  if (!originalText) { draft.warnings.push("No readable text was found. Try a brighter, straighter photo."); return draft }
  const lines = originalText.split(/\r?\n/).map(clean).filter(Boolean)
  const dateLine = lines.find(line => /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}/i.test(line))
  if (dateLine) draft.date = dateLine.match(/\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?)\b/i)?.[0] || ""
  const titleLine = lines.find(line => /toastmasters|club meeting|meeting agenda/i.test(line))
  if (titleLine) draft.title = titleLine

  for (const [index, line] of lines.entries()) {
    const role = roleFor(line)
    if (role === "unknown") continue
    const withoutRole = stripRole(line)
    const candidates = withoutRole.split(/[—–|:]|\s+-\s+|\s+by\s+/i).map(clean).filter(Boolean)
    // A common two-line layout puts a role on one line and the participant on the next.
    const nextLine = lines[index + 1] || ""
    const nextName = roleFor(nextLine) === "unknown" ? nameFrom(nextLine) : ""
    const name = candidates.find(probablyName) || nameFrom(withoutRole) || nextName
    let title = candidates.find(candidate => candidate !== name && candidate.length > 2) || ""
    if (role === "Evaluation") {
      const evaluated = line.match(/(?:\bfor|evaluat(?:ing|es))\s+([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})/i)?.[1]
      if (evaluated) title = `Evaluates ${evaluated}`
    }
    const uncertain: string[] = []
    if (!name) uncertain.push("Participant name needs review")
    if (role === "Speech" && !title) uncertain.push("Speech title not recognized")
    const item: AgendaItem = { id: makeId(index), role, name, title, durationSeconds: duration(line), segment: segmentFor(role), uncertain, source: line }
    draft.items.push(item)
  }
  if (!draft.title) draft.warnings.push("Meeting title was not confidently recognized.")
  draft.items = dedupeItems(draft.items)
  if (!draft.items.length) draft.warnings.push("No timer-relevant agenda items were confidently identified. Add items manually in the review step.")
  return draft
}

/** Combines pages in their selected order and removes confirmed duplicates across pages. */
export function mergeAgendaDrafts(drafts: AgendaDraft[]): AgendaDraft {
  const readable = drafts.filter(draft => draft.originalText.trim())
  const items = dedupeItems(readable.flatMap((draft, page) => draft.items.map(item => ({ ...item, id: `page-${page}-${item.id}`, sourceIndex: page }))))
  const warnings = readable.flatMap(draft => draft.warnings).filter((warning, index, all) => all.indexOf(warning) === index)
  return {
    title: readable.map(draft => draft.title).find(Boolean) || "",
    date: readable.map(draft => draft.date).find(Boolean) || "",
    items,
    originalText: readable.map((draft, index) => `Page ${index + 1}\n${draft.originalText}`).join("\n\n"),
    warnings
  }
}

export const agendaRoleOptions: AgendaRole[] = ["Speech", "Ice Breaker", "Evaluation", "Table Topics", "unknown"]
export const segmentForAgendaRole = segmentFor

export const isoDateLocal = (value: string, fallback: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return fallback
  const d = new Date(parsed)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export type MergeMode = "append" | "replace"

/**
 * Merges an agenda draft into a meeting safely:
 * - Completed, running, paused turns, or turns with recorded times are NEVER removed.
 * - In "replace" mode, only untouched queued turns (status: queued and elapsedMs === 0) are replaced.
 * - Skips duplicate turns with the same name and role in the target segment.
 */
export function mergeAgendaIntoMeeting(
  meeting: Meeting,
  draft: AgendaDraft,
  settings: Settings,
  merge: MergeMode,
  options?: { idGenerator?: () => string; localDateFallback?: string }
): Meeting {
  const uid = options?.idGenerator || (() => crypto.randomUUID())
  const validItems = draft.items.filter(item => item.name.trim() && item.role !== "unknown" && item.segment)

  const updatedSegments = meeting.segments.map(segment => {
    // Preserve any turn that has already been timed, is currently running/paused, or has elapsed time.
    // In "replace" mode, only untouched queued turns (status: queued && elapsedMs === 0) are removed.
    const preservedTurns = merge === "replace"
      ? segment.turns.filter(t => t.status !== "queued" || t.elapsedMs > 0)
      : [...segment.turns]

    const resultTurns = [...preservedTurns]

    for (const item of validItems) {
      if (item.segment !== segment.type) continue
      const role = item.role as keyof typeof presets
      const trimmedName = item.name.trim()

      // Duplicate prevention: skip if turn with same name & role already exists in this segment
      const isDuplicate = resultTurns.some(
        t => t.name.trim().toLowerCase() === trimmedName.toLowerCase() && t.role === role
      )
      if (isDuplicate) continue

      const durationNote = item.durationSeconds
        ? `Agenda duration: ${Math.floor(item.durationSeconds / 60)}:${String(item.durationSeconds % 60).padStart(2, "0")}`
        : ""
      const note = [item.title && `Speech title: ${item.title}`, durationNote].filter(Boolean).join(" · ") || undefined

      const newTurn: Turn = {
        id: uid(),
        name: trimmedName,
        role,
        thresholds: { ...(settings.presetOverrides?.[role] || presets[role]) },
        status: "queued",
        elapsedMs: 0,
        note
      }
      resultTurns.push(newTurn)
    }

    return { ...segment, turns: resultTurns }
  })

  const hasRecorded = meeting.segments.some(s => s.turns.some(t => t.status === "done" || t.elapsedMs > 0))
  const replaceMeetingDetails = !hasRecorded || merge === "replace"
  const title = replaceMeetingDetails ? (draft.title.trim() || meeting.title) : meeting.title
  const date = replaceMeetingDetails
    ? (draft.date ? isoDateLocal(draft.date, meeting.date || options?.localDateFallback || "") : meeting.date)
    : meeting.date

  return {
    ...meeting,
    title,
    date,
    segments: updatedSegments
  }
}

export type OcrErrorKind = "worker-init" | "lang-download" | "runtime" | "unreadable"

export interface OcrErrorInfo {
  kind: OcrErrorKind
  userMessage: string
  logMessage: string
}

/**
 * Classifies OCR errors into distinct categories without exposing sensitive user or image data.
 * Distinguishes worker initialization errors (CSP, worker scripts, WASM compilation),
 * language file download failures (network, HTTP status, offline),
 * OCR recognition runtime errors, and genuinely unreadable images (no extracted text).
 */
export function classifyOcrError(
  cause: unknown,
  context?: { stage?: string; hasText?: boolean }
): OcrErrorInfo {
  if (context?.hasText === false && !cause) {
    return {
      kind: "unreadable",
      userMessage: "Tommy could not read any text from that image. Try a brighter, sharper photo with the page filling the frame.",
      logMessage: "[AgendaScanner] Genuinely unreadable image: no text detected"
    }
  }

  const raw = typeof cause === "string"
    ? cause
    : cause instanceof Error
      ? cause.message
      : (cause && typeof cause === "object" && "message" in cause && typeof (cause as { message: unknown }).message === "string")
        ? (cause as { message: string }).message
        : String(cause || "")

  const msg = raw.toLowerCase()
  const stage = context?.stage || ""

  // 1. Language file download error (network error or HTTP status fetching traineddata)
  if (
    stage === "loading-lang" ||
    /traineddata|response code:?\s*[45]\d\d/i.test(msg) ||
    (/network error|failed to fetch/i.test(msg) && stage !== "loading-core" && stage !== "worker-init")
  ) {
    return {
      kind: "lang-download",
      userMessage: "Could not download the English OCR language model. Check your internet connection and try again.",
      logMessage: `[AgendaScanner] Language model download failure (stage: ${stage || "loading-lang"})`
    }
  }

  // 2. Worker initialization & CSP / WASM errors
  if (
    stage === "worker-init" ||
    stage === "loading-core" ||
    stage === "initializing" ||
    /importscripts|worker|tesseractcore|initialization failed|wasm|webassembly|content security policy|csp|compile error|instantiate/i.test(msg) ||
    raw === "" ||
    msg === "script error."
  ) {
    return {
      kind: "worker-init",
      userMessage: "The local OCR engine could not start. Please check browser permissions, Content Security Policy, or try refreshing.",
      logMessage: `[AgendaScanner] Worker initialization failure (stage: ${stage || "worker-init"})`
    }
  }

  // 3. OCR runtime error (image decoding, memory limit, canvas error during recognize)
  if (
    stage === "recognizing" ||
    /loadimage|image|canvas|memory|out of memory|allocation|bitmap/i.test(msg)
  ) {
    return {
      kind: "runtime",
      userMessage: "Could not process this image file. Try taking a photo with lower resolution or a standard format (JPEG or PNG).",
      logMessage: `[AgendaScanner] OCR runtime recognition failure (stage: ${stage || "recognizing"})`
    }
  }

  // 4. Fallback runtime error
  return {
    kind: "runtime",
    userMessage: "OCR could not finish processing the image. Try again with a clearer photo.",
    logMessage: `[AgendaScanner] Unspecified OCR failure (stage: ${stage || "unknown"})`
  }
}
