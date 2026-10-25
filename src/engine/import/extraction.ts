import { z } from "zod"

/**
 * What the vision model returns for one agenda: a transcription, not an
 * interpretation. Text is kept exactly as printed (roles, names, times); the
 * clean-up layer (build.ts) decides what it means. Every field is required
 * and nullable rather than optional: unreadable is `null` with a reason,
 * never a guess. This one schema is sent to the model and validates its reply.
 */
const confidence = z.number().min(0).max(1).describe("0 to 1: how sure you are that you read this exactly as printed")
const text = (description: string) => z.string().nullable().describe(description)

export const rawLine = z.object({
  page: z.number().int().describe("Page number, 1 for the first photo"),
  startTime: text('Planned start time printed on the row, "18:57", or null'),
  role: z.string().describe('The role column exactly as printed, e.g. "1st Evaluator", "Um, Er Counter", "Timekeepers Report"; "" if none'),
  person: text("The person's name exactly as printed. null when no name is printed or it cannot be read. Never guess."),
  personUnreadable: text('Why the name could not be read ("smudged", "cut off"), or null'),
  event: text('The event or description text, e.g. "Points about the next speech", or null'),
  speech: z
    .object({
      title: text("Speech title without quotes"),
      path: text('Pathways path, e.g. "Presentation Mastery"'),
      level: z.number().int().nullable(),
      projectNumber: z.number().int().nullable(),
      project: text('Project name, e.g. "Icebreaker"'),
    })
    .nullable()
    .describe("Prepared speech details, only on speaker rows; null otherwise"),
  timing: text(
    'The time(s) printed in the duration/timing column for this row, exactly as printed: "1:00", "4:00 5:00 6:00", "25:00:00", "5-7 min". null if none. Never times written by hand.',
  ),
  timingSource: z
    .enum(["row", "group_heading", "aligned_by_start_time", "none"])
    .describe(
      "row: printed on this row. group_heading: printed once for a group of rows (copy it to each row). aligned_by_start_time: the column is offset and you matched it using the start times. none: no time.",
    ),
  evaluates: text('For evaluator rows, who or what is evaluated, as printed: "for May Khine Kyaw", "Evaluate speech 3", "the next speech"; else null'),
  confidence: z.object({ person: confidence, role: confidence, timing: confidence }),
  source: z.string().describe("The printed row in a few words, for the Timer to check against the photo"),
})

export const rawAgenda = z.object({
  readable: z.boolean().describe("false if this is not a meeting agenda or is too blurry to read"),
  problem: text("If not readable, why; else null"),
  meeting: z.object({
    club: text("Club name"),
    date: text("Meeting date as YYYY-MM-DD"),
    theme: text("Meeting theme"),
    wordOfTheDay: text("Word of the day"),
    venue: text("Venue"),
    startTime: text('Meeting start time, "19:00"'),
    meetingNumber: text("Meeting number"),
  }),
  lines: z.array(rawLine).describe("Every agenda row, in order, across all pages"),
  attending: z.array(z.string()).describe("Names in an attending or members-present list"),
  specialGuests: z.array(z.string()).describe("Names listed as guests or special guests"),
  apologies: z.array(z.string()).describe("Names listed under apologies (absent people)"),
  ignored: z
    .array(z.string())
    .describe("Short descriptions of what you skipped on purpose, e.g. 'officers sidebar', 'handwritten times'. Never copy meeting IDs or passwords."),
})

export type RawLine = z.infer<typeof rawLine>
export type RawAgenda = z.infer<typeof rawAgenda>

type JsonSchema = { [key: string]: unknown }
const SAFE = Number.MAX_SAFE_INTEGER

/**
 * The extraction schema as the plain JSON Schema subset Gemini accepts:
 * nullable values as type arrays (["string", "null"]) instead of anyOf, no
 * $schema, and no ±2^53 integer bounds (wide bounds make Gemini's schema
 * compiler reject the request).
 */
export function extractionJsonSchema(): JsonSchema {
  const simplify = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(simplify)
    if (!node || typeof node !== "object") return node
    const schema = Object.fromEntries(Object.entries(node).filter(([key]) => key !== "$schema")) as JsonSchema
    if (schema.minimum === -SAFE) delete schema.minimum
    if (schema.maximum === SAFE) delete schema.maximum
    const anyOf = schema.anyOf as JsonSchema[] | undefined
    if (anyOf?.length === 2 && anyOf.some(option => option.type === "null")) {
      const value = simplify(anyOf.find(option => option.type !== "null")) as JsonSchema
      const { anyOf: _drop, ...rest } = schema
      void _drop
      return { ...value, ...rest, type: [value.type, "null"] }
    }
    return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, simplify(value)]))
  }
  return simplify(z.toJSONSchema(rawAgenda)) as JsonSchema
}
