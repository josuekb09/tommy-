import { describe, expect, it } from "vitest"
import { mergeAgendaDrafts, mergeAgendaIntoMeeting, parseAgenda, type AgendaDraft } from "./agenda"
import { defaultSettings, type Meeting } from "./types"

describe("parseAgenda", () => {
  it("extracts a clearly formatted Toastmasters agenda conservatively", () => {
    const draft = parseAgenda("Riverside Toastmasters Meeting Agenda\nOctober 9, 2026\n5. Speech — Ada Lovelace — A Better Algorithm — 7 min\nEvaluator: Grace Hopper — 3 min\nTable Topics Speaker: Linus Torvalds — 2 min")
    expect(draft.title).toContain("Toastmasters")
    expect(draft.date).toBe("October 9, 2026")
    expect(draft.items.map(item => [item.role, item.name, item.durationSeconds])).toEqual([["Speech", "Ada Lovelace", 420], ["Evaluation", "Grace Hopper", 180], ["Table Topics", "Linus Torvalds", 120]])
  })
  it("handles alternative role/name layouts and missing durations", () => {
    const draft = parseAgenda("Ice Breaker: Maya Angelou\nSpeech by James Baldwin\nEvaluation | Toni Morrison")
    expect(draft.items.map(item => [item.role, item.name, item.durationSeconds])).toEqual([["Ice Breaker", "Maya Angelou", undefined], ["Speech", "James Baldwin", undefined], ["Evaluation", "Toni Morrison", undefined]])
  })
  it("flags missing names and titles instead of inventing them", () => {
    const draft = parseAgenda("Speech — 5 min\nEvaluation — 3 min")
    expect(draft.items).toHaveLength(2)
    expect(draft.items.every(item => item.name === "" && item.uncertain.length > 0)).toBe(true)
  })
  it("keeps malformed and unknown-role lines out of the import draft", () => {
    const draft = parseAgenda("Welcome everyone\nMystery slot: Pat Example\nSpeech???")
    expect(draft.items).toHaveLength(1)
    expect(draft.items[0].role).toBe("Speech")
    expect(draft.items[0].name).toBe("")
  })
  it("reports empty OCR output", () => {
    const draft = parseAgenda("   ")
    expect(draft.items).toEqual([])
    expect(draft.warnings[0]).toMatch(/No readable text/)
  })
  it("keeps Ice Breakers in speeches and retains evaluator associations", () => {
    const draft = parseAgenda("Alice — Ice Breaker Speaker\nBob — Evaluator for Alice\nCharlie — Prepared Speech Speaker\nDavid — Evaluator for Charlie\nEmma — General Evaluator")
    expect(draft.items.map(item => [item.role, item.name, item.segment, item.title])).toEqual([
      ["Ice Breaker", "Alice", "speeches", ""],
      ["Evaluation", "Bob", "evaluations", "Evaluates Alice"],
      ["Speech", "Charlie", "speeches", ""],
      ["Evaluation", "David", "evaluations", "Evaluates Charlie"]
    ])
  })
  it("combines pages in selected order and removes duplicate assignments", () => {
    const front = parseAgenda("Speech — Ada Lovelace — 7 min\nEvaluation — Grace Hopper")
    const back = parseAgenda("Evaluation — Grace Hopper\nTable Topics Speaker — Linus Torvalds")
    const merged = mergeAgendaDrafts([front, back])
    expect(merged.items.map(item => [item.name, item.role])).toEqual([
      ["Ada Lovelace", "Speech"], ["Grace Hopper", "Evaluation"], ["Linus Torvalds", "Table Topics"]
    ])
    expect(merged.originalText).toMatch(/^Page 1/)
  })
  it("strictly classifies the two-page ToastED agenda by role and preserves row thresholds", () => {
    const pageOne = parseAgenda(`ToastED meeting agenda
18:15 | Toastmaster | Eugene Asem | 0:00
18:58 | 1st Speaker | Kim Austen | 4:00 | 5:00 | 6:00
19:05 | 2nd Speaker | Christina Thomas | 5:00 | 6:00 | 7:00
19:13 | 3rd Speaker | Chris Adlam | 5:00 | 6:00 | 7:00
President | Michaela Geldhof | 2:00
Timekeeper | Josue Kabuya | 1:00
Educational Speaker | Michaela Geldhof | 15:00`)
    const pageTwo = parseAgenda(`1st Evaluator | Michaela Geldhof | — | — | 1:00
2nd Evaluator | Titus Magua | — | — | 1:00
3rd Evaluator | Andrea Baptista | — | — | 1:00
Table Topics Master | Philip Townsend | 1:00 | 1:30 | 2:00
General Evaluator | Someone Else | 5:00
Um, Er Counter | Maria van Rooyen | 1:00
Grammarian | Fulu Nemaitoni | 1:00
1st Evaluator | Michaela Geldhof | 2:00 | 2:30 | 3:00
2nd Evaluator | Titus Magua | 2:00 | 2:30 | 3:00
3rd Evaluator | Andrea Baptista | 2:00 | 2:30 | 3:00`)
    const draft = mergeAgendaDrafts([pageOne, pageTwo])

    expect(draft.items.filter(item => item.segment === "speeches").map(item => [item.name, item.thresholds])).toEqual([
      ["Kim Austen", { green: 240, yellow: 300, red: 360 }],
      ["Christina Thomas", { green: 300, yellow: 360, red: 420 }],
      ["Chris Adlam", { green: 300, yellow: 360, red: 420 }]
    ])
    expect(draft.items.filter(item => item.segment === "evaluations").map(item => [item.name, item.thresholds])).toEqual([
      ["Michaela Geldhof", { green: 60, yellow: 60, red: 60 }], ["Titus Magua", { green: 60, yellow: 60, red: 60 }], ["Andrea Baptista", { green: 60, yellow: 60, red: 60 }]
    ])
    // The Table Topics Master runs the section; it is not a guest to time.
    expect(draft.items.filter(item => item.segment === "tableTopics")).toEqual([])
    expect(draft.items.map(item => item.name)).not.toEqual(expect.arrayContaining(["Eugene Asem", "Josue Kabuya", "Maria van Rooyen", "Fulu Nemaitoni"]))
  })
  it("keeps flattened table rows from swallowing event words into presenter names", () => {
    const draft = parseAgenda(`Cape Town Toastmasters Meeting Agenda
Toastmaster Meeting 23rd September 2026
19:20 1st Speaker Ruben Pretorius This is me 4:00 5:00 6:00
19:26 2nd Speaker Jan-Hendrik Esterhuysen The art of possibility 5:00 6:00 7:00
19:40 4th Speaker Tehzeen Anjarwalla Leading peaceful transformations 5:00 6:00 7:00
20:11 1st Evaluator John Hambleton Evaluate speech 1 2:00 2:30 3:00
20:28 Table Topics Master Susanna Kwon Let the Fun Begin 1:00 1:30 2:00`)

    expect(draft.items.map(item => [item.role, item.name, item.title, item.thresholds])).toEqual([
      ["Speech", "Ruben Pretorius", "This is me", { green: 240, yellow: 300, red: 360 }],
      ["Speech", "Jan-Hendrik Esterhuysen", "The art of possibility", { green: 300, yellow: 360, red: 420 }],
      ["Speech", "Tehzeen Anjarwalla", "Leading peaceful transformations", { green: 300, yellow: 360, red: 420 }],
      ["Evaluation", "John Hambleton", "", { green: 120, yellow: 150, red: 180 }]
    ])
  })
})

describe("mergeAgendaIntoMeeting", () => {
  const baseMeeting: Meeting = {
    id: "m-1",
    title: "Original Meeting",
    date: "2026-10-09",
    segments: [
      {
        id: "s-speeches",
        type: "speeches",
        turns: [
          {
            id: "t-completed",
            name: "Alice Speaker",
            role: "Speech",
            thresholds: { green: 300, yellow: 360, red: 420 },
            status: "done",
            elapsedMs: 345000,
            note: "Great delivery"
          },
          {
            id: "t-running",
            name: "Bob Running",
            role: "Speech",
            thresholds: { green: 300, yellow: 360, red: 420 },
            status: "running",
            startedAt: 1000,
            elapsedMs: 50000
          },
          {
            id: "t-queued",
            name: "Charlie Queued",
            role: "Speech",
            thresholds: { green: 300, yellow: 360, red: 420 },
            status: "queued",
            elapsedMs: 0
          }
        ]
      },
      {
        id: "s-evaluations",
        type: "evaluations",
        turns: []
      },
      {
        id: "s-topics",
        type: "tableTopics",
        turns: []
      }
    ]
  }

  const sampleDraft: AgendaDraft = {
    title: "Scanned Agenda Meeting",
    date: "2026-10-10",
    originalText: "Scanned text",
    warnings: [],
    items: [
      {
        id: "item-1",
        name: "Dana New",
        role: "Speech",
        title: "Future of AI",
        durationSeconds: 420,
        segment: "speeches",
        uncertain: [],
        source: "Speech Dana"
      },
      {
        id: "item-2",
        name: "Eve Evaluator",
        role: "Evaluation",
        title: "",
        durationSeconds: 180,
        segment: "evaluations",
        uncertain: [],
        source: "Evaluation Eve"
      }
    ]
  }

  it("never deletes completed turns with recorded times or running turns in Replace mode", () => {
    let idCounter = 100
    const merged = mergeAgendaIntoMeeting(baseMeeting, sampleDraft, defaultSettings, "replace", {
      idGenerator: () => `gen-${++idCounter}`
    })

    const speeches = merged.segments.find(s => s.type === "speeches")!.turns

    // Completed turn must remain intact with all timings and notes
    const completedTurn = speeches.find(t => t.id === "t-completed")
    expect(completedTurn).toBeDefined()
    expect(completedTurn?.status).toBe("done")
    expect(completedTurn?.elapsedMs).toBe(345000)
    expect(completedTurn?.note).toBe("Great delivery")

    // Running turn must remain intact
    const runningTurn = speeches.find(t => t.id === "t-running")
    expect(runningTurn).toBeDefined()
    expect(runningTurn?.status).toBe("running")
    expect(runningTurn?.startedAt).toBe(1000)
    expect(runningTurn?.elapsedMs).toBe(50000)

    // Unstarted queued turn should have been replaced
    expect(speeches.find(t => t.id === "t-queued")).toBeUndefined()

    // Newly imported speech turn should be present
    const newTurn = speeches.find(t => t.name === "Dana New")
    expect(newTurn).toBeDefined()
    expect(newTurn?.role).toBe("Speech")
    expect(newTurn?.note).toContain("Speech title: Future of AI")
  })

  it("preserves existing queued turns when appending a new agenda", () => {
    let idCounter = 200
    const merged = mergeAgendaIntoMeeting(baseMeeting, sampleDraft, defaultSettings, "append", {
      idGenerator: () => `gen-${++idCounter}`
    })

    const speeches = merged.segments.find(s => s.type === "speeches")!.turns
    expect(speeches.map(t => t.name)).toEqual([
      "Alice Speaker",
      "Bob Running",
      "Charlie Queued",
      "Dana New"
    ])

    const evals = merged.segments.find(s => s.type === "evaluations")!.turns
    expect(evals.map(t => t.name)).toEqual(["Eve Evaluator"])
  })

  it("prevents duplicate turns when imported item matches existing name and role", () => {
    const draftWithDupes: AgendaDraft = {
      title: "Dupe Agenda",
      date: "",
      originalText: "",
      warnings: [],
      items: [
        {
          id: "dup-1",
          name: "Alice Speaker",
          role: "Speech",
          title: "",
          segment: "speeches",
          uncertain: [],
          source: "Alice"
        },
        {
          id: "new-1",
          name: "Frank New",
          role: "Speech",
          title: "",
          segment: "speeches",
          uncertain: [],
          source: "Frank"
        }
      ]
    }

    const merged = mergeAgendaIntoMeeting(baseMeeting, draftWithDupes, defaultSettings, "append")
    const speeches = merged.segments.find(s => s.type === "speeches")!.turns

    // Alice Speaker should appear exactly once
    const alices = speeches.filter(t => t.name.toLowerCase() === "alice speaker")
    expect(alices).toHaveLength(1)
    expect(alices[0].id).toBe("t-completed")

    // Frank New should be appended
    expect(speeches.some(t => t.name === "Frank New")).toBe(true)
  })
  it("imports each reviewed assignment into its existing timer segment", () => {
    const fresh = { ...baseMeeting, segments: baseMeeting.segments.map(segment => ({ ...segment, turns: [] })) }
    const draft = parseAgenda("Alice — Ice Breaker Speaker\nBob — Evaluator for Alice\nCharlie — Prepared Speech Speaker\nDavid — Evaluator for Charlie\nTable Topics Speaker — Gail Guest")
    const merged = mergeAgendaIntoMeeting(fresh, draft, defaultSettings, "append", { idGenerator: (() => { let id = 0; return () => `new-${++id}` })() })
    expect(merged.segments.find(segment => segment.type === "speeches")?.turns.map(turn => [turn.name, turn.role])).toEqual([["Alice", "Ice Breaker"], ["Charlie", "Speech"]])
    expect(merged.segments.find(segment => segment.type === "evaluations")?.turns.map(turn => [turn.name, turn.note])).toEqual([["Bob", "Speech title: Evaluates Alice"], ["David", "Speech title: Evaluates Charlie"]])
    expect(merged.segments.find(segment => segment.type === "tableTopics")?.turns.map(turn => turn.name)).toEqual(["Gail Guest"])
  })

  it("preserves meeting title and date when historical turns are already recorded unless replace is chosen", () => {
    const appendMerged = mergeAgendaIntoMeeting(baseMeeting, sampleDraft, defaultSettings, "append")
    expect(appendMerged.title).toBe("Original Meeting")
    expect(appendMerged.date).toBe("2026-10-09")

    const freshMeeting: Meeting = {
      id: "fresh-1",
      title: "New Meeting",
      date: "2026-10-09",
      segments: [
        { id: "s1", type: "speeches", turns: [] },
        { id: "s2", type: "evaluations", turns: [] },
        { id: "s3", type: "tableTopics", turns: [] }
      ]
    }
    const freshMerged = mergeAgendaIntoMeeting(freshMeeting, sampleDraft, defaultSettings, "append")
    expect(freshMerged.title).toBe("Scanned Agenda Meeting")
    expect(freshMerged.date).toBe("2026-10-10")
  })
})

describe("classifyOcrError", () => {
  it("identifies worker initialization and CSP errors", async () => {
    const { classifyOcrError } = await import("./agenda")

    // The exact error discovered on Cloudflare Pages preview
    const cspWorkerError = "Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js' failed to load."
    const result1 = classifyOcrError(cspWorkerError, { stage: "worker-init" })
    expect(result1.kind).toBe("worker-init")
    expect(result1.userMessage).toContain("could not start")
    expect(result1.logMessage).toContain("Worker initialization failure")

    // Empty string rejection from worker.onerror event
    const result2 = classifyOcrError("", { stage: "worker-init" })
    expect(result2.kind).toBe("worker-init")
    expect(result2.userMessage).toContain("could not start")

    // WASM compilation without wasm-unsafe-eval
    const wasmError = new Error("WebAssembly.instantiate(): Refused to compile or instantiate WebAssembly module because 'wasm-unsafe-eval' is not an allowed source")
    const result3 = classifyOcrError(wasmError, { stage: "loading-core" })
    expect(result3.kind).toBe("worker-init")

    // Core load failure
    const coreError = new Error("Failed to load TesseractCore")
    const result4 = classifyOcrError(coreError, { stage: "loading-core" })
    expect(result4.kind).toBe("worker-init")
  })

  it("identifies language file download errors", async () => {
    const { classifyOcrError } = await import("./agenda")

    const netError = new Error("Network error while fetching https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz. Response code: 404")
    const result1 = classifyOcrError(netError, { stage: "loading-lang" })
    expect(result1.kind).toBe("lang-download")
    expect(result1.userMessage).toContain("download the English OCR language model")
    expect(result1.userMessage).toContain("internet connection")

    const fetchError = "TypeError: Failed to fetch"
    const result2 = classifyOcrError(fetchError, { stage: "loading-lang" })
    expect(result2.kind).toBe("lang-download")
  })

  it("identifies OCR recognition runtime errors", async () => {
    const { classifyOcrError } = await import("./agenda")

    const memError = new Error("Canvas allocation failed: out of memory")
    const result1 = classifyOcrError(memError, { stage: "recognizing" })
    expect(result1.kind).toBe("runtime")
    expect(result1.userMessage).toContain("Could not process this image file")

    const imageError = new Error("loadImage failed to decode buffer")
    const result2 = classifyOcrError(imageError, { stage: "recognizing" })
    expect(result2.kind).toBe("runtime")
  })

  it("identifies genuinely unreadable images with zero extracted text", async () => {
    const { classifyOcrError } = await import("./agenda")

    const result = classifyOcrError(null, { stage: "recognizing", hasText: false })
    expect(result.kind).toBe("unreadable")
    expect(result.userMessage).toContain("could not read any text from that image")
    expect(result.userMessage).toContain("brighter, sharper photo")
  })

  it("never exposes sensitive personal data or file paths in user-facing error messages", async () => {
    const { classifyOcrError } = await import("./agenda")

    const sensitiveMessage = new Error("Sensitive error parsing /Users/secret/John_Doe_Confidential_Agenda.jpg")
    const result = classifyOcrError(sensitiveMessage, { stage: "recognizing" })
    expect(result.userMessage).not.toContain("John_Doe")
    expect(result.userMessage).not.toContain("Confidential")
    expect(result.userMessage).not.toContain("/Users/secret")
  })
})

describe("public/_headers Content-Security-Policy", () => {
  it("includes all necessary permissions for Tesseract.js worker, core, wasm, and fonts", async () => {
    const fs: any = await import(/* @vite-ignore */ "node" + ":fs")
    const headersUrl = new URL("../../public/_headers", import.meta.url)
    const content: string = fs.readFileSync(headersUrl, "utf-8")

    const cspLine = content.split("\n").find((line: string) => line.includes("Content-Security-Policy:"))
    expect(cspLine).toBeDefined()

    // Must allow scripts from cdn.jsdelivr.net and blob: for importScripts in Web Worker
    expect(cspLine).toMatch(/script-src[^;]*https:\/\/cdn\.jsdelivr\.net/)
    expect(cspLine).toMatch(/script-src[^;]*blob:/)

    // Must allow WebAssembly instantiation via wasm-unsafe-eval
    expect(cspLine).toMatch(/script-src[^;]*'wasm-unsafe-eval'/)

    // Must allow Web Workers from blob: and cdn.jsdelivr.net
    expect(cspLine).toMatch(/worker-src[^;]*blob:/)
    expect(cspLine).toMatch(/worker-src[^;]*https:\/\/cdn\.jsdelivr\.net/)

    // Must allow network requests to cdn.jsdelivr.net for .wasm and .traineddata.gz
    expect(cspLine).toMatch(/connect-src[^;]*https:\/\/cdn\.jsdelivr\.net/)

    // Must allow font data URIs
    expect(cspLine).toMatch(/font-src[^;]*data:/)
  })
})
