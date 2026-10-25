import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { createGeminiExtractor, DEFAULT_GEMINI_MODEL } from "../server/extract/gemini"
import type { ExtractResult } from "../server/extract/provider"
import { buildDraft } from "../src/engine/import/build"
import type { RawAgenda, RawLine } from "../src/engine/import/extraction"
import type { AgendaImage } from "../src/engine/import/wire"
import { normalizeName } from "../src/engine/people"
import { defaultRules } from "../src/engine/profiles"
import { profileFromRange } from "../src/engine/range"

// Phase 8b accuracy bench. Calls Gemini on the 3 fixture agendas, compares
// what it transcribed against the hand-written ground truth, and writes a
// scoreboard to eval-results/YYYY-MM-DD.md. Model responses are cached in
// .eval-cache/ so re-runs don't burn tokens. The fixtures and cache contain
// real member names and are gitignored. Only runs via `npm run eval:agendas`
// (vitest.eval.config.ts), never in the default test suite.

type ExpectedTiming = { green: string | null; amber: string | null; red: string | null }
type ExpectedItem = { time: string | null; roles: string[]; roleAsWritten: string; person: string; event?: string; timing: ExpectedTiming }
type ExpectedSpeaker = { n: number; person: string; speech: { title: string } | null; evaluator: string | null }
type Expected = {
  meeting: { date: string; theme?: string | null; wordOfTheDay?: string | null; venue?: string | null }
  speakers: ExpectedSpeaker[]
  tableTopics: { master?: string | null }
  items: ExpectedItem[]
}

type Fixture = { slug: string; label: string; images: string[]; expectedPath: string }

const DIR = "fixtures/agendas"
const CACHE = ".eval-cache"
const OUT = "eval-results"

const fixtures: Fixture[] = [
  {
    slug: "toasted-2026-10-06",
    label: "ToastED, 6 Oct 2026",
    images: ["toasted-2026-10-06-p1.jpg", "toasted-2026-10-06-p2.jpg"],
    expectedPath: "toasted-2026-10-06.expected.json",
  },
  {
    slug: "capetown-2026-09-23",
    label: "Cape Town, 23 Sep 2026",
    images: ["capetown-2026-09-23.jpg"],
    expectedPath: "capetown-2026-09-23.expected.json",
  },
  {
    slug: "pinelands-2026-10-15",
    label: "Pinelands, 15 Oct 2026",
    images: ["pinelands-2026-10-15.jpg"],
    expectedPath: "pinelands-2026-10-15.expected.json",
  },
]

loadDotEnvLocal()

const KEY = process.env.GEMINI_API_KEY ?? ""
const MODEL = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL

type Score = { expected: number; matched: number }
type FixtureReport = {
  fixture: Fixture
  cached: boolean
  ms: number
  usage: ExtractResult["usage"]
  lines: Score
  people: Score
  timings: Score
  roles: Score
  speakers: Score
  speakerTitles: Score
  evaluatorPairings: Score
  tableTopicsMaster: { expected: string | null; actual: string | null; matched: boolean }
  rowProblems: string[]
}

describe("agenda scan accuracy bench", () => {
  it("has a GEMINI_API_KEY", () => {
    expect(KEY, "set GEMINI_API_KEY in .env.local").not.toBe("")
  })

  it("scores the 3 fixtures and writes a report", async () => {
    expect(KEY).not.toBe("")
    mkdirSync(CACHE, { recursive: true })
    mkdirSync(OUT, { recursive: true })
    const extractor = createGeminiExtractor({ apiKey: KEY, model: MODEL, timeoutMs: 540_000 })
    const reports: FixtureReport[] = []
    for (const fixture of fixtures) {
      console.log(`\n=== ${fixture.label} ===`)
      const expected = JSON.parse(readFileSync(join(DIR, fixture.expectedPath), "utf8")) as Expected
      const { result, cached } = await extractCached(fixture, extractor)
      const report = compare(fixture, expected, result.agenda, { cached, ms: result.ms, usage: result.usage })
      reports.push(report)
      printFixtureSummary(report)
      // Red limits must at least be read correctly, else Timer signals go wrong.
      expect(report.timings.matched / Math.max(1, report.timings.expected), `${fixture.label} timings`).toBeGreaterThanOrEqual(0.5)
    }
    const path = writeReport(reports)
    console.log(`\nSaved ${path}`)
  })
})

async function extractCached(fixture: Fixture, extractor: ReturnType<typeof createGeminiExtractor>): Promise<{ result: ExtractResult; cached: boolean }> {
  const path = join(CACHE, cacheKey(fixture))
  if (existsSync(path)) {
    const result = JSON.parse(readFileSync(path, "utf8")) as ExtractResult
    console.log(`[cache] ${fixture.slug}`)
    return { result, cached: true }
  }
  console.log(`[api]   ${fixture.slug} (${fixture.images.length} page${fixture.images.length === 1 ? "" : "s"})...`)
  const images: AgendaImage[] = fixture.images.map(readImage)
  // The free tier returns 503 under spiky load; a short wait and retry usually clears it.
  const backoffs = [0, 30_000, 60_000, 120_000]
  let lastError: unknown
  for (const delay of backoffs) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    try {
      const result = await extractor.extractAgenda(images)
      writeFileSync(path, JSON.stringify(result, null, 2))
      return { result, cached: false }
    } catch (error) {
      lastError = error
      const kind = (error as { kind?: string }).kind
      if (kind !== "unavailable" && kind !== "rate_limited" && kind !== "timeout") throw error
      console.log(`  ${kind}, retrying in ${(backoffs[backoffs.indexOf(delay) + 1] ?? 0) / 1000}s...`)
    }
  }
  throw lastError
}

function readImage(name: string): AgendaImage {
  const data = readFileSync(join(DIR, name))
  const mimeType = name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg"
  return { mimeType, data: data.toString("base64") }
}

function cacheKey(fixture: Fixture): string {
  const hash = createHash("sha256")
  hash.update(MODEL)
  for (const image of fixture.images) hash.update(readFileSync(join(DIR, image)))
  return `${fixture.slug}-${hash.digest("hex").slice(0, 16)}.json`
}

function compare(fixture: Fixture, expected: Expected, raw: RawAgenda, meta: { cached: boolean; ms: number; usage: ExtractResult["usage"] }): FixtureReport {
  const problems: string[] = []
  const lines: Score = { expected: expected.items.length, matched: raw.lines.length }

  const linesByTime = new Map<string, RawLine[]>()
  for (const line of raw.lines) {
    if (!line.startTime) continue
    const list = linesByTime.get(line.startTime) ?? []
    list.push(line)
    linesByTime.set(line.startTime, list)
  }
  const used = new Set<RawLine>()
  const match = (item: ExpectedItem): RawLine | undefined => {
    if (item.time) {
      const candidate = (linesByTime.get(item.time) ?? []).find(line => !used.has(line))
      if (candidate) {
        used.add(candidate)
        return candidate
      }
    }
    const fallback = raw.lines.find(
      line => !used.has(line) && similarRole(line.role, item.roleAsWritten) && (!item.person || similarName(line.person ?? "", item.person)),
    )
    if (fallback) used.add(fallback)
    return fallback
  }

  const people: Score = { expected: 0, matched: 0 }
  const timings: Score = { expected: 0, matched: 0 }
  const roles: Score = { expected: expected.items.length, matched: 0 }

  for (const item of expected.items) {
    const line = match(item)
    if (!line) {
      problems.push(`No model row for ${item.time ?? "untimed"} / ${item.roleAsWritten} / ${item.person || "(no name)"}`)
      continue
    }
    if (similarRole(line.role, item.roleAsWritten)) roles.matched++
    else problems.push(`Role differs: expected “${item.roleAsWritten}”, got “${line.role}” (${item.time ?? "untimed"})`)
    if (item.person) {
      people.expected++
      if (similarName(line.person ?? "", item.person)) people.matched++
      else problems.push(`Name differs: expected “${item.person}”, got “${line.person ?? "(null)"}” (${item.time ?? "untimed"})`)
    }
    if (hasTiming(item.timing)) {
      timings.expected++
      if (similarTiming(line.timing, item.timing)) timings.matched++
      else
        problems.push(
          `Timing differs: expected ${formatExpectedTiming(item.timing)}, got “${line.timing ?? "(null)"}” (${item.time ?? "untimed"} ${item.roleAsWritten})`,
        )
    }
  }

  const draft = buildDraft(raw, { rules: defaultRules, people: [] })
  const draftSpeakers = draft.segments
    .filter(segment => segment.kind === "prepared_speeches")
    .flatMap(segment => segment.items)
    .filter(item => item.role === "Speaker")
  const speakers: Score = { expected: expected.speakers.length, matched: 0 }
  const speakerTitles: Score = { expected: expected.speakers.filter(s => s.speech?.title).length, matched: 0 }
  const evaluatorPairings: Score = { expected: expected.speakers.filter(s => s.evaluator).length, matched: 0 }
  for (const speaker of expected.speakers) {
    const found = draftSpeakers.find(s => similarName(s.personName, speaker.person))
    if (!found) {
      problems.push(`Speaker not found in draft: ${speaker.person}`)
      continue
    }
    speakers.matched++
    if (speaker.speech?.title) {
      if (found.speechTitle && similarTitle(found.speechTitle, speaker.speech.title)) speakerTitles.matched++
      else problems.push(`Speaker title differs: expected “${speaker.speech.title}”, got “${found.speechTitle ?? "(none)"}” for ${speaker.person}`)
    }
    if (speaker.evaluator) {
      const evaluators = draft.segments.flatMap(segment => segment.items).filter(item => item.role === "Evaluator" && item.evaluatesKey === found.key)
      if (evaluators.some(e => similarName(e.personName, speaker.evaluator!))) evaluatorPairings.matched++
      else
        problems.push(
          `Evaluator pairing missing: expected ${speaker.evaluator} for ${speaker.person}, got ${evaluators.map(e => e.personName).join(", ") || "(none)"}`,
        )
    }
  }

  const ttmExpected = expected.tableTopics.master ?? null
  const ttm = draft.segments
    .filter(segment => segment.kind === "table_topics")
    .flatMap(segment => segment.items)
    .find(item => item.role === "TableTopicsMaster")
  const ttmActual = ttm?.personName ?? null
  const tableTopicsMaster = { expected: ttmExpected, actual: ttmActual, matched: !ttmExpected || (!!ttmActual && similarName(ttmActual, ttmExpected)) }

  return {
    fixture,
    cached: meta.cached,
    ms: meta.ms,
    usage: meta.usage,
    lines,
    people,
    timings,
    roles,
    speakers,
    speakerTitles,
    evaluatorPairings,
    tableTopicsMaster,
    rowProblems: problems,
  }
}

const hasTiming = (timing: ExpectedTiming) => timing.red !== null || timing.green !== null || timing.amber !== null

function formatExpectedTiming(timing: ExpectedTiming): string {
  if (timing.green || timing.amber) return `“${[timing.green, timing.amber, timing.red].filter(Boolean).join(" ")}”`
  return `“${timing.red ?? ""}” (red-only)`
}

const normalize = (text: string) =>
  normalizeName(text)
    .replace(/[^a-z0-9 ]/g, "")
    .trim()

function similarName(a: string, b: string): boolean {
  if (!a || !b) return false
  const na = normalize(a)
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim()
  const nb = normalize(b)
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim()
  if (na === nb) return true
  const aw = na.split(" ").filter(Boolean)
  const bw = nb.split(" ").filter(Boolean)
  return aw.length > 0 && bw.length > 0 && aw[0] === bw[0] && aw.at(-1) === bw.at(-1)
}

function similarRole(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na && !nb) return true
  if (!na || !nb) return false
  if (na === nb) return true
  const stripOrdinal = (s: string) =>
    s
      .replace(/\b(1st|2nd|3rd|\dth|first|second|third|fourth|fifth)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
  return stripOrdinal(na) === stripOrdinal(nb) || na.includes(nb) || nb.includes(na)
}

// Timings are scored the way the app reads them: the printed text goes through
// profileFromRange and the resulting green / amber / red must equal the ground
// truth. So "5-7 min" matches 5:00 / 6:00 / 7:00, and text the app can't read never matches.
function similarTiming(printed: string | null, expected: ExpectedTiming): boolean {
  if (!printed) return false
  const { profile } = profileFromRange(printed)
  if (!profile) return false
  const seconds = (clock: string | null) => (clock ? Number(clock.split(":")[0]) * 60 + Number(clock.split(":")[1]) : null)
  if (seconds(expected.red) !== profile.red) return false
  if (profile.redOnly) return expected.green === null && expected.amber === null
  return seconds(expected.green) === profile.green && seconds(expected.amber) === profile.amber
}

function similarTitle(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  return na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))
}

function printFixtureSummary(report: FixtureReport) {
  const pct = (score: Score) => (score.expected ? Math.round((score.matched / score.expected) * 100) : 100)
  const header = report.cached ? "(cached)" : `${report.ms} ms, ${report.usage.inputTokens} in / ${report.usage.outputTokens} out tok`
  console.log(`  ${header}`)
  console.log(`  lines   : ${report.lines.matched} / ${report.lines.expected} expected`)
  console.log(`  roles   : ${report.roles.matched} / ${report.roles.expected} (${pct(report.roles)}%)`)
  console.log(`  people  : ${report.people.matched} / ${report.people.expected} (${pct(report.people)}%)`)
  console.log(`  timings : ${report.timings.matched} / ${report.timings.expected} (${pct(report.timings)}%)`)
  console.log(
    `  speakers: ${report.speakers.matched}/${report.speakers.expected} · titles ${report.speakerTitles.matched}/${report.speakerTitles.expected} · evaluators ${report.evaluatorPairings.matched}/${report.evaluatorPairings.expected}`,
  )
  console.log(
    `  TT Master: ${report.tableTopicsMaster.matched ? "ok" : `expected “${report.tableTopicsMaster.expected}”, got “${report.tableTopicsMaster.actual ?? "(none)"}”`}`,
  )
}

function writeReport(reports: FixtureReport[]): string {
  const now = new Date()
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const path = join(OUT, `${today}.md`)
  const lines: string[] = []
  lines.push(`# Agenda scan accuracy — ${today}`)
  lines.push("")
  lines.push(`Model: \`${MODEL}\`. Fixtures: ${reports.length}.`)
  lines.push("")
  lines.push("| Fixture | Lines | Roles | People | Timings | Speakers | Titles | Evaluators | TT Master |")
  lines.push("|---|---|---|---|---|---|---|---|---|")
  for (const report of reports) {
    const pct = (score: Score) => (score.expected ? `${Math.round((score.matched / score.expected) * 100)}%` : "—")
    const cell = (score: Score) => `${score.matched}/${score.expected} (${pct(score)})`
    const ttm = report.tableTopicsMaster.matched ? "ok" : "miss"
    lines.push(
      `| ${report.fixture.label} | ${report.lines.matched}/${report.lines.expected} | ${cell(report.roles)} | ${cell(report.people)} | ${cell(report.timings)} | ${cell(report.speakers)} | ${cell(report.speakerTitles)} | ${cell(report.evaluatorPairings)} | ${ttm} |`,
    )
  }
  lines.push("")
  for (const report of reports) {
    lines.push(`## ${report.fixture.label}`)
    lines.push("")
    lines.push(`- Cached: ${report.cached ? "yes" : "no"}`)
    lines.push(`- Request time: ${report.cached ? "—" : `${report.ms} ms`}`)
    lines.push(`- Tokens: ${report.usage.inputTokens} input, ${report.usage.outputTokens} output, ${report.usage.thoughtTokens} thinking`)
    if (report.rowProblems.length) {
      lines.push("")
      lines.push("Mismatches:")
      for (const problem of report.rowProblems) lines.push(`- ${problem}`)
    } else {
      lines.push("")
      lines.push("No row-level mismatches.")
    }
    lines.push("")
  }
  writeFileSync(path, lines.join("\n"))
  return path
}

function loadDotEnvLocal() {
  if (!existsSync(".env.local")) return
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "")
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}
