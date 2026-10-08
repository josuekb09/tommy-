# Tommy: build brief for Codex (Phase 1, web app)

Save this file in the project root as `AGENTS.md` (or paste it as the first prompt).

## Goal
Build **Tommy**, a mobile-first progressive web app (PWA) that helps the Timer at a Toastmasters meeting. It times speakers, shows green/yellow/red states, records exact times, and produces the Timer's report. A hardware device will come later, so the architecture must be ready for it, but **do not build hardware, firmware or a backend now.**

## Stack
- Vite + React + TypeScript, installable PWA, works offline.
- Local-first storage (IndexedDB via `idb` or Dexie). No accounts, no server.
- Vitest for unit tests. Keep dependencies few.

## Critical domain rule: the Timer reports several times per meeting
The Timer is **not** called once at the end. A meeting has **segments**, and the Timer gives a short report **after each segment**:
1. **Speeches** (this includes Ice Breakers). After the last speech, the Timer reads everyone's time.
2. **Evaluations**. Reported after the evaluators finish (often after a break).
3. **Table Topics**. Reported after the last Table Topics speaker.
Segments can appear in any order, there may be a break between them, and the app must keep the whole meeting state across all of it.
So: every speaking turn belongs to a segment, and a **"Segment report"** screen shows only that segment. A **"Full meeting log"** shows everything.

## Presets (editable)
| Role | Green | Yellow | Red |
|---|---|---|---|
| Table Topics | 1:00 | 1:30 | 2:00 |
| Ice Breaker | 4:00 | 5:00 | 6:00 |
| Speech | 5:00 | 6:00 | 7:00 |
| Evaluation | 2:00 | 2:30 | 3:00 |
Optional disqualification state at Red + 30 s. "Within time" rule must be configurable per club (default: finished between Green minus 30 s and Red plus 30 s).

## Data model
- `Meeting { id, date, title, segments[] }`
- `Segment { id, type: "speeches" | "evaluations" | "tableTopics", turns[] }`
- `Turn { id, name, role, thresholds {green, yellow, red}, status: "queued"|"running"|"paused"|"done", startedAt?, elapsedMs, note?, edited? }`
Guests (Table Topics) are created on the fly and are not on the agenda.

## Features
1. Create a meeting; add segments; add speakers manually (agenda photo import is Phase 2).
2. Speaker queue per segment; the next speaker loads the correct thresholds.
3. **Live timer**: big time, background and label change at Green / Yellow / Red, Start / Pause / Stop, Reset with confirm and Undo.
4. **Catch-up buttons +5 s, +10 s, +30 s**: add time when the speaker started before Start was pressed. Also allow typing a start offset.
5. **Add guest** in one tap (name field, suggestions from past names).
6. Edit any recorded time afterwards (mark it as edited).
7. **Segment report** screen: name, time, within-time Y/N, grouped as in the official Timer Log. Buttons: Read aloud (speech synthesis, e.g. "Benjamin Grossier, 2 minutes 5 seconds"), Copy text, Export PDF.
8. Full meeting log for the whole night.
9. Settings: thresholds, within-time rule, sound/vibration, colour-blind cues (text label + pattern), dark/light.

## Timer accuracy (important)
- Never accumulate time with `setInterval` ticks. Store `startedAt` timestamps and derive elapsed time from `performance.now()` / `Date.now()`; interval only triggers rendering.
- Survive page refresh, phone lock and tab switch: persist running state and recompute.
- Request a screen Wake Lock while running.
- Put the timer logic in a **pure, framework-free module** (`src/engine/`) with an injectable clock, so it can later run on the device and sync with it.

## Tests required
Thresholds fire exactly once at the right second; pause/resume; offset buttons; refresh mid-timer; within-time rule; segment report grouping.

## UI
Follow the Figma design in `/design` (screenshots/exports). Big, high-contrast, thumb-friendly controls; it will be used while standing in front of a room.

## Out of scope for now
Hardware, firmware, cloud, accounts, AI agenda scan, voice assistant.

## Done when
A Timer can run a full mock meeting (two speeches, two evaluations, three Table Topics guests incl. one added live), give the three segment reports, and export the log, all offline.
