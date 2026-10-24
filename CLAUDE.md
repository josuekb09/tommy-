# Tommy: smart timekeeper for Toastmasters

Live site: https://tommy-21n.pages.dev/ (Cloudflare Pages). The whole product is in English.

## Product

Tommy helps the Timer at a Toastmasters meeting. It times each speaker, shows green / amber / red signals, records exact times, imports the meeting agenda from a photo (speakers, Table Topics, evaluators; guests are added manually), and generates the Timer's report. Later a physical ESP32-S3 device (LED ring, touchscreen, speaker) will connect to this web app.

- The audit of the v1 code is in [docs/AUDIT.md](docs/AUDIT.md).
- The rebuild roadmap is the approved 17-phase plan: [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack

- TypeScript (strict), React 19, Vite 8.
- `vite-plugin-pwa` (Workbox, prompt-to-update, fully precached, works offline).
- IndexedDB via Dexie (`dexie`, `dexie-react-hooks`), and `zod` for validating files and API responses.
- Agenda import: Google Gemini (`gemini-3.8-flash`, free tier) via REST from a Cloudflare Pages Function; `wrangler` for local dev.
- Tests:
  - Vitest for unit and storage tests, with `fake-indexeddb`.
  - Testing Library + jsdom for component tests (opt in per file with `// @vitest-environment jsdom`).
  - Playwright + axe for e2e tests.
- ESLint (flat config, typescript-eslint, react-hooks) and Prettier.
- Deploy: static `dist/` to Cloudflare Pages. Headers and CSP are in `public/_headers`. No third-party origins are allowed.
- Node 22 (`.nvmrc`). Dependencies are pinned to exact versions; do not use `latest`.

## Layout

```
src/domain/    types only (Club, Member, Guest, Meeting, Segment, AgendaItem, TimingProfile, TimedRecord, settings)
src/engine/    pure logic: no React, no DOM, no storage. The clock is always injected.
  timing/      action-log replay (record.ts), signals and results (signal.ts), wall clock (clock.ts),
               portable timer with events (timer.ts), shared vector runner (vectors.test.ts)
  profiles.ts  timing profile library, club-rule resolution (resolveProfile), labels, m:ss helpers
  range.ts     profileFromRange: agenda time text → profile, or null with a reason
  agenda.ts    meeting order, moves, "next" across segments, evaluator pairing and warnings
  people.ts    lenient name matching (case, accents, typos): suggests only, never merges
  templates.ts built-in templates (ToastED, Cape Town, Pinelands), save as / start from template
  signal-output.ts  SignalOutput interface, change-only publisher, displayAt, fake device output
  explain.ts   "Explain the signals" card built from the club rules
  report/      Timer's report: build.ts (groups, results, reasons, award eligibility),
               speech.ts (read-aloud sentences), share.ts (plain WhatsApp text)
  audio.ts     threshold tone (the only browser-API module in engine/; it stays outside the timing core)
  import/      agenda import: extraction.ts (the model's JSON schema, zod), roles.ts (printed role synonyms),
               build.ts (clean-up: timings, pairing, briefs, names, schedule check, flags), wire.ts (API contract)
src/storage/   db.ts (Dexie schema), repository.ts (the only code that touches IndexedDB),
               schema.ts (zod export format), export-import.ts, migrate-legacy.ts (v1 → v2, once)
src/ui/        App.tsx (shell + hash routes), hooks.ts, components.tsx, runtime.ts (db, repo, clock),
               timers.ts (one engine timer per agenda item), signals.tsx (label, icon, pattern per signal),
               people.tsx (PersonField, MembersCard), timing-field.tsx (typed agenda time + live preview),
               read-aloud.ts (pause/skip/voice), screens/PrintLog.tsx (#/print, Timer's log for paper),
               speaker-feed.ts + signal-channel.ts (publish to speaker windows), present.ts (windows, PNGs),
               screens/ (incl. SpeakerView for #/speaker and #/zoom)
server/extract/ provider interface (AgendaExtractor), Gemini extractor, prompt, /api handler (shared by functions/ and scripts/)
functions/     Cloudflare Pages Functions: api/parse-agenda.ts (the only place the model API key is used)
scripts/       check-secrets.mjs (fails the build if a key or provider call reaches dist/)
test-vectors/  timing.json: shared timing scenarios, also run by the device firmware
tests/e2e/     Playwright specs
docs/          AUDIT.md, TIMING_SPEC.md (normative timing rules for app and firmware), SIGNAL_OUTPUT.md
```

## Key design rules

- **Timing state is an append-only action log.** `TimedRecord.actions` is the source of truth. Status, elapsed time, offsets, edits and the reached signal are derived by `replay()` and cached. Undo appends an `undo` action and nothing is ever rewritten.
- **Invalid actions are not recorded.** A double-tapped Start, or a Stop before Start, returns `undefined` from `appendAction` and writes nothing.
- **Every timing action is saved in the same IndexedDB transaction that applies it** (`repo.records.append`). A refresh mid-speech restores the exact time.
- **The clock is `createWallClock()`:** `Date.now()` clamped so it never runs backwards. Do not use `performance.now()` for timing, because it stops during device sleep on phones.
- **Edits require a reason and keep the original value** (`TimeEdit.fromMs`). Removing an item with a recorded time throws `RecordedTimeError` unless the user confirmed.
- **One writer tab** (Web Locks, `useWriterLock`). Other tabs are read-only.
- **The UI changes timers only through the engine.** It calls `timerFor(item).dispatch(input)` and then persists the returned action. Cues react to `signalChanged` events, never to re-renders.
- **Timing behaviour is defined by [docs/TIMING_SPEC.md](docs/TIMING_SPEC.md) and `test-vectors/timing.json`.**
  - Any change to timing rules needs a new or updated vector in the same commit.
  - Never edit an expectation just to make code pass.
- **Club rules and the profile library live on the `Club`.**
  - `resolveProfile` turns a library entry plus the rules into the item's `TimingProfile`.
  - Rule changes are re-applied only to items not yet timed (`repo.meetings.applyClubRules`).
  - Recorded results keep the rules they were timed with.
- **Anything that shows the signal to the speaker is a `SignalOutput`** ([docs/SIGNAL_OUTPUT.md](docs/SIGNAL_OUTPUT.md)).
  - Outputs derive the clock locally and never freeze on a wrong colour.
  - Names never reach an output in contest mode.
- **`profileFromRange` never guesses.** Anything ambiguous returns `{ profile: null, reason }`.
- **The model transcribes; our code interprets.** The extractor returns text as printed; roles, timings, pairings and flags come from `src/engine/import/build.ts`, which is tested on recorded responses. Unreadable is `null` with a reason, never a guess.
- **The Gemini key never reaches the browser.** `GEMINI_API_KEY` lives in `.env.local` (dev, gitignored) and a Cloudflare Pages secret (production). The browser only calls `/api/parse-agenda` on its own origin. `npm run build` ends with `check:secrets`.
- **Similar names are only suggested.** `matchPeople` ranks members and guests; a person is linked only when the Timer picks them (or types the identical name).
- **The report lists every agenda item.** No recorded time is "Not timed", never 0:00. Award eligibility needs a result within the window, using `qualifyingWindow` (the same one `resultFor` uses), and every "not eligible" has a reason in words.
- **An evaluator's brief is its own item** (`EvaluatorBrief`, same person, same `evaluatesItemId`), placed just before the speech. Pairing warnings never block.

## Commands

```bash
npm ci                 # install
npm run dev            # dev server, http://localhost:5173
npm test               # Vitest unit, storage and component tests
npm run typecheck      # tsc -b
npm run lint           # ESLint
npm run format         # Prettier (write); format:check to verify
npm run build          # type check + production build to dist/
npm run preview        # serve dist/ at http://localhost:4173
npm run test:e2e       # Playwright (builds and previews automatically)
npm run dev:api        # build + wrangler pages dev on :8788 (serves /api with GEMINI_API_KEY from .env.local)
npm run check:secrets  # scan dist/ for keys and direct provider calls (also runs at the end of build)
```

Before saying a task is done, run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`.

## Permanent rules

- All UI text is in English.
- Timing must never lose or corrupt a recorded time; the timing engine is pure, tested logic.
- The core timer works fully offline; the cloud is only for agenda AI.
- Never expose API keys in client code.
- Every new feature needs automated tests; run tests and type checks before saying a task is done.
- Signals must never rely on colour alone (colour-blind users).
