# Tommy rebuild roadmap

The approved 17-phase plan. Phases 1 to 7 are done (see the git log on `rebuild`). Each phase that is marked as a checkpoint gets its own detailed plan before any code.

## Context

[docs/AUDIT.md](AUDIT.md) found the following:

- Timing is correct (it is based on timestamps), but **recorded times can be lost**: edits overwrite the original, a remove deletes a timed turn without confirmation, undo is lost on refresh, and two open tabs overwrite each other.
- Cues fire on the wrong events.
- Agenda import is unreliable: it uses Tesseract plus regular expressions (root causes R1–R16).
- All UI lives in a 191-line v1 `App.tsx`.

You queued 18 requests. This plan sequences them into 17 phases. Each phase ends with typecheck, lint, unit and e2e tests passing, plus one commit. I stop only at real checkpoints.

Decisions you made:
- Run phase by phase.
- Remove Tesseract.
- Migrate the old IndexedDB data once.

**No stack migration is needed.** The code is already React + Vite + TypeScript with `strict` mode. The problem is structure, not stack, so phase 1 splits `App.tsx` into modules instead of rewriting it.

Cross-cutting rules (from CLAUDE.md):
- English UI.
- An offline core.
- No keys in the client.
- Never colour alone.
- Tests for every feature.
- Pure engine with an injected clock.

UI wording changes from "yellow" to **"amber"**.

---

## Phase 1: Foundation

**Tooling**
- Pin every `"latest"` dependency to an exact version.
- Add ESLint (flat config: `typescript-eslint`, `react-hooks`) and Prettier.
- Add scripts: `dev`, `build`, `test`, `typecheck` (`tsc -b`), `lint`, `format`, `test:e2e`.
- Add `@testing-library/react` + `jsdom` for component tests and `fake-indexeddb` for storage tests.
- Remove `tesseract.js`, `src/AgendaScanner.tsx` (v1, removed), the old parser and its tests, and drop jsDelivr from the CSP in [public/_headers](../public/_headers). The safe-merge logic in `mergeAgendaIntoMeeting` (v1 `src/engine/agenda.ts:199`, see git history at `16627ee`) is kept as a reference for phase 8.

**Structure**
```
src/domain/     types only: club, member, meeting, agenda, timing, record, settings
src/engine/     pure logic (timer, profiles, report…), no DOM, injected clock
src/storage/    db.ts (Dexie schema), repositories, migrate-legacy.ts, export-import.ts
src/ui/         shell/, screens/, components/, hooks/
functions/      (phase 8) Cloudflare Pages Functions
```

**Domain** (`src/domain/*.ts`): the types exactly as you specified.
- `Club`, `Member`, `Guest`, `Meeting` (+ `status: "draft" | "live" | "finished"`), `Segment.kind`, the `AgendaItem.role` enum, `TimingProfile`, `TimedRecord`.
- One addition: `TimedRecord.actions: TimingAction[]`, an append-only log of `{type, at}`. This log is the source of truth. `startedAt`/`stoppedAt`/`elapsedMs`/`offsetsMs`/`signalReached` are derived from it and stored as a cache. This is what makes undo, audit and firmware test vectors possible.
- `ClubSettings` is in this phase too; phase 3 fills in the rules.

**Storage**
- A Dexie database `tommy-v2` with tables `clubs`, `members`, `guests`, `meetings` (segments and items nested), `timedRecords` (keyed by `agendaItemId`, because it is written often), `settings` and `templates`.
- Repositories (`MeetingRepo`, `RecordRepo`…) are the only code that touches Dexie.
- The UI reads through `useLiveQuery` (`dexie-react-hooks`). Every mutation calls a repository method, which saves immediately; there is no debounced save.
- **Legacy migration:** on first start, if the old `tommy` database exists, convert its meetings, turns and settings into the new model. Done turns become `TimedRecord`s with their exact `elapsedMs`. The old database is left untouched as a backup, and a flag records that migration finished.
- **Export/import:** a versioned JSON envelope `{ format: "tommy-export", version: 1, exportedAt, scope: "meeting" | "all", … }`, validated with `zod`. Import options are "add as copy" (new ids) or "restore all". "Restore all" downloads an automatic backup export first.
- **Multi-tab:** use the Web Locks API so only one tab writes timing at a time. A second tab shows "Tommy is already running in another tab".

**PWA:** keep `vite-plugin-pwa`. Add maskable icons, precache everything (the app is fully offline with no CDN), and an update prompt so an update never reloads during a speech.

**Shell:** hash router (`#/meeting`, `#/timer`, `#/report`, `#/settings`), which fixes the back button without adding a router dependency. Navigation: Meeting · Timer · Report · Settings. The existing screens are moved from `App.tsx` into `src/ui/screens/` with today's behaviour, wired to the repositories. The P0 data-loss bugs are fixed here, because the new model rules them out.

**Tests:** repository CRUD, auto-save, legacy migration (fixture of an old database → new model, times preserved), and the export → import round trip (deep-equal, for both scopes), all with `fake-indexeddb`.

**Docs:** update CLAUDE.md with the structure and scripts. Point [AGENTS.md](../AGENTS.md) to CLAUDE.md, because its "no backend" line conflicts with agenda AI.

## Phase 2: Timing engine

`src/engine/timing/` contains no DOM and no `performance`. It exports `createTimer({ clock, profile, rules })`.

- **State machine:** `idle → running ⇄ paused → stopped`, plus `reset`.
- **Reducer:** `apply(record, action, now)` is a pure function.
- **Derived values:** `elapsedAt(record, now)` is the sum of the running intervals plus the offsets.
- **Undo:** removes the last action. That covers an accidental start, stop or reset. A double tap on Start is idempotent.
- **Offsets:** +5, +10, +30 and −5 s, allowed while running or stopped, each stored in `offsetsMs`. Elapsed time is clamped at 0 or more.
- **Edits:** `edit(stoppedRecord, newMs, reason)` requires a reason. It appends to `edits[]` with `{from, to, reason, at}`, and the original value is always recoverable.
- **Signals:** `none | green | amber | red | overtime (≥ red + grace) | disqualified (contest only)`. The result has `under | within | over | disqualified` according to the club's within-time rule.
- **Events:** a typed emitter for `started`, `stopped`, `paused`, `signalChanged` and `offsetApplied`. `signalChanged` fires **only on crossings while running**, which fixes the spurious cues found in the audit.
- **Clock:** the UI clock is `performance.timeOrigin + performance.now()`, which is monotonic within a session and anchored to the epoch so it can be persisted. The engine only sees `() => number`.
- **Persistence:** every action goes through `RecordRepo.append()` before the UI updates. A refresh while running restores from `actions`.
- **Test vectors:** `test-vectors/timing.json` holds `{ name, profile, rules, actions: [{type, at, ms?}], expect: [{at, elapsedMs, signal}] }` in integer milliseconds. A Vitest runner executes every scenario. The format is documented in `docs/TIMING_SPEC.md` for firmware use.
- **Edge cases covered:** 299 900 vs 300 000 ms, an offset that jumps a threshold, undo after stop, a double start, a refresh (re-hydrate mid-run), and 3 h of overtime.

## Phase 3: Profiles and club rules

- `src/engine/profiles.ts` holds the built-in presets: Table Topics (contest window 1:00–2:30), Ice Breaker, Standard, 8–10, 10–12, 13–15, 18–22 (amber at the midpoint), Evaluation, and role reports with sensible defaults.
- `profileFromRange(text)` handles `5-7`, `5 – 7 min`, `5 to 7 minutes`, `(5'-7')`, `4-6 mins` and `m:ss` ranges, and returns `null` otherwise. It has thorough table-driven tests, and phase 8 reuses it.
- Club rules: grace period (30 s, Table Topics excluded by default), the within-time rule (strict or with grace), contest mode, and report style.
- A Settings UI to edit all of them.

## Phase 4: Timer screen

- Rebuilt for one-handed use:
  - Name, role and range ("Speech 5:00 to 7:00") at the top, with "Next: …" below.
  - A huge mm:ss clock with a full background colour, a text label and a distinct icon or pattern per signal.
  - A Start/Stop button at least 72 px tall at thumb height.
  - +5, +10, +30, −5, Undo and Reset buttons.
- The after-Stop panel shows the recorded time, the within/under/over result, **Edit time** (reason required) and **Next speaker**.
- Wake Lock is held while the meeting is live and re-acquired on `visibilitychange`; if the browser refuses, the app keeps working.
- Vibration and tone at crossings, with a silent mode.
- Keyboard shortcuts: Space, N, U, 1/2/3.
- An `aria-live` announcement at each signal change.
- Consumes engine events only; there is no timing logic in the UI.
- Component tests (Testing Library + fake clock) for start → green → stop → edit → next, undo and keyboard shortcuts.

## Phase 5: Speaker display and SignalTransport

- `SignalTransport` interface: `publish(SignalFrame)`, `subscribe(cb)`, `close()`.
- `BroadcastChannelTransport` handles a second tab or window on the same device. The interface is documented as the extension point for a room server and BLE/WebSocket hardware, in `docs/SIGNAL_TRANSPORT.md`.
- Display route `#/display`:
  - A solid colour per signal, with flashing red for overtime.
  - Optional time and a large label, toggled in Settings.
  - A flash at each threshold, with no flash under `prefers-reduced-motion`.
  - A "Present" button (Fullscreen API).
  - Names are never shown in contest mode.
- "Share in Zoom/Teams" mode: a 16:9 layout. Downloadable green, amber and red 1920×1080 PNGs are generated on a canvas.
- An "Explain the signals" card generated from the club's profiles.
- Tests: transport contract, frame mapping and the explain-card text.

## Phase 6: Meeting screen (manual builder, always-works fallback)

- Create a meeting with date, theme and word of the day.
- Add items per segment, with role, person, title and profile (a preset or typed `5-7`).
- An Evaluator → Speaker pairing dropdown.
- Reorder with drag (pointer events) plus up/down buttons for accessibility. Delete with confirmation if the item has a time. Duplicate the last item.
- Roster in Settings (name and aliases). Autocomplete from the roster and from past guests.
- "Add guest" is always visible on the Timer screen during Table Topics. It offers "Guest N" placeholder names that can be renamed later, and "Add and start".
- Save the meeting as the club template, and start a new meeting from the template.
- Queue view: done (with times), current and upcoming; tap any item to jump to it.
- **Playwright acceptance test:** 2 speeches, 2 evaluations and 3 Table Topics guests (one added live), all timed with a mocked clock. The test asserts the stored `TimedRecord`s in IndexedDB.

## Phase 7: Timer's report

- `src/engine/report/` is a pure builder.
  - Groups: Prepared speeches, Evaluations, Table Topics, Other.
  - Each line has name, role, m:ss, range and a status chip in text.
  - Exact or category style.
  - Award eligibility (Best Speaker, Best Table Topics, Best Evaluator).
  - An "edited" marker with the reason.
- The spoken-text generator produces lines like "Benjamin Grossier, 6 minutes 12 seconds, within time".
- UI:
  - Presenter view (large, one segment at a time).
  - Read aloud with pause, skip and an English voice picker.
  - WhatsApp-formatted copy and the Web Share API.
  - A PDF in the traditional Timer's log layout: print CSS from a dedicated print view, so no PDF library is needed.
- Unit tests for the builder and the speech text.

## Phase 8: Agenda import rebuild (**checkpoint: detailed plan first, plus your API key**)

As you asked, before coding this phase I present its own detailed plan. Outline:

- **Capture:**
  - camera, multiple photos, PDF, screenshot or pasted text;
  - EXIF orientation fix and a crop UI;
  - resize to about 2000 px on the long side, then JPEG compression;
  - multiple pages.
- **Function `functions/api/parse-agenda.ts`:**
  - the `ANTHROPIC_API_KEY` secret;
  - Claude Messages API with `claude-sonnet-5-5`;
  - forced tool use whose input schema is the agenda JSON;
  - PDFs sent as document blocks;
  - a size limit, per-IP rate limiting and no storage of images.
  - I will load the `claude-api` skill before writing this.
- **Prompt:**
  - role synonyms (TMOD, TTM, GE, Ah/Um Counter…);
  - Table Topics participants usually do not appear on the agenda, so they must not be invented;
  - unreadable fields are `null` with low confidence, and names are never guessed.
- **Client post-processing** (pure, tested on messy inputs):
  - synonym-table role mapping;
  - `profileFromRange`;
  - Evaluator N ↔ Speaker N pairing;
  - fuzzy roster matching that keeps the original text;
  - de-duplication;
  - suspicion flags.
- **Errors:** offline, timeout and unreadable each get a clear message, and the manual builder is always one tap away.
- **What I need from you:** an Anthropic API key (put it in `.dev.vars` locally and in a Pages secret in production), and confirmation of how you deploy (Direct Upload or Git), because Functions deploy with `wrangler pages deploy`.

## Phase 9: Review screen

- Image on one side and the list on the other. On a phone, a toggle switches between them, and the image is zoomable.
- Grouped, editable items. Amber highlighting for confidence below 0.8 or a flag, with the reason. Tapping an item highlights its `sourceText`.
- One-tap fixes; add, delete and reorder.
- A summary bar. "Confirm" is enabled only when every flagged item is fixed or explicitly accepted.
- The corrections log (original extraction vs final) is stored locally in Dexie.
- An e2e test with a recorded API response fixture (Playwright `route`).

## Phase 10: Accuracy bench (**checkpoint: your real agenda photos and PDFs**)

- Put the files in `fixtures/agendas/`.
- `npm run eval:agendas` runs `scripts/eval-agendas.ts`:
  - it calls the real API, with a content-hash cache in `.eval-cache/`;
  - it writes draft `NAME.expected.json` files plus a correction checklist for you;
  - per-field and per-role metrics: name precision/recall, role accuracy, time-range accuracy, pairing accuracy and invented items;
  - a printed table and `eval-results/YYYY-MM-DD.md`.
- Then I iterate on the prompt, synonyms and post-processing, with before/after numbers each time. **Expected files are never edited to pass.**
- Targets: 95% of fields correct, 100% of time ranges, zero invented names.

## Phase 11: Ah-Counter and Grammarian

- A role picker on first open: Timer, Ah-Counter or Grammarian. It is remembered and can be changed in Settings.
- **Ah-Counter:**
  - large tap counters (an editable filler list), each with undo;
  - counters follow the current agenda item or run independently;
  - a report with per-speaker totals, the top filler and a meeting summary.
- **Grammarian:**
  - word of the day (part of speech, definition, example), optionally shown on the speaker display;
  - per speaker, a word-of-the-day tally and notes (good use, errors with corrections);
  - a report.
- Both reuse the report share and read-aloud components from phase 7. Pure counters and reports have unit tests. Each phone runs independently.

## Phase 12: Meeting clock and contest mode

- **Meeting clock:**
  - planned start and end, and a planned duration per item (its range or a segment default);
  - a pure `scheduleStatus(meeting, records, now)` that returns on schedule, N min behind or N min ahead;
  - a slim bar on every screen;
  - a Run sheet view (planned vs actual start);
  - a "finished on time" record.
- **Contest mode:**
  - contest-type profiles (International 5–7, Evaluation 2–3, Table Topics 1–2, Humorous 5–7, Tall Tales 3–5), all editable;
  - a 30 s grace window; times outside it are "disqualified for time";
  - draw-order numbers and no names on the display;
  - a Chief Judge Timer's sheet with timers' names, as a PDF.
  - **Two-timer mode:** the second Timer runs on their own phone and exports a JSON file that is imported here, or enters times manually. Differences over 1 s are highlighted. Live cross-device sync would wait for the SignalTransport room.
- Tests for qualification at exact boundaries (4:29.999 / 4:30.000 / 7:30.000 / 7:30.001).

## Phase 13: Club history and member statistics

- Club profile: name, number, district, meeting day and time, default template, rules and roster. This extends the phase 1 `Club`.
- Meeting history list: date, theme, number of speakers and on-time flag. Any past report can be opened, because phase 7's builder already works on any meeting.
- Pure `src/engine/stats/`:
  - per member: appearances, % within time, filler trend;
  - per club: average overrun, most common overtime segment, Table Topics participation, guests per meeting.
  - Each has unit tests.
- Charts are **hand-written SVG** with no chart library (fast on cheap Android). Every point carries a text label or shape, the range is shown as a labelled band, and each chart has a data-table alternative. I load the `dataviz` skill before building them.
- Merge duplicate members into one member with aliases. All records are re-pointed by `personId` in one Dexie transaction, and the merge has its own test.
- Backup reminder: after every 4 finished meetings without an export, prompt to export.

## Phase 14: Hardware readiness (device = source of truth)

- `docs/DEVICE_PROTOCOL.md` describes a versioned JSON protocol:
  - an envelope `{v, seq, ack, type, payload}`;
  - the messages you listed;
  - resync: the device keeps records until they are acknowledged, the phone sends its last acked `seq`, and the device replays unacked `record`s, which are de-duplicated by `agendaItemId` plus `stoppedAt`.
- The mixed-content limitation (HTTPS cannot reach `ws://`), compared with options: a device-hosted page on its own access point, Web Bluetooth (Chrome/Android only, not iOS), or a native app later.
  - **Recommendation for the prototype: Web Bluetooth** for the Android remote control, plus a device-hosted page as the iPhone fallback.
- The `DeviceTransport` interface (it extends phase 5's `SignalTransport` idea).
- `SimulatedDevice` runs the phase 2 engine in-browser and speaks the protocol.
- `#/simulator` page: an SVG wedge device with a 24-LED ring animated per signal, the touchscreen face, battery level and a protocol log. It is controllable from the Timer screen through the transport.
- `test-vectors/timing.json` becomes a normative part of the protocol doc, with a section for the firmware runner.
- Protocol contract tests run against `SimulatedDevice`, including a disconnect/replay test.

## Phase 15: Launch for other clubs

- Landing page at `/`, with the app moved to `/app`. This needs two Vite entries and a `_redirects` rule so `/app/*` works offline. The PWA scope becomes `/app/`.
  - Content: a one-sentence pitch, a video placeholder, three benefits, a live simulator preview and a "Try it free" button.
  - **No Toastmasters logo**, the wording "a timer for speaking clubs and Toastmasters-style meetings", and a footer disclaimer that Tommy is not affiliated with Toastmasters International.
- Onboarding: create the club, add members (skippable), choose rules, run a 30 s demo timer.
- Help page "How to be the Timer with Tommy".
- **POPIA privacy page:** what stays on the device, what goes to the AI service (agenda images, not stored), and how to export or delete. Settings gets a "Delete all my data" button that deletes the Dexie database after a confirmation and offers an export first.
- A feedback form stored locally and exportable, with no third-party services.
- A version from `package.json` injected at build time, and a changelog page from `CHANGELOG.md`.

## Phase 16: Pilot learning (opt-in, first-party only)

- Off by default. When the user opts in, a random anonymous `installId`/`clubId` is created; there are no names and no agenda content.
- Events: setup time, scan vs manual, corrections per scan, edits and undos, report exported or read aloud.
- Events are batched, sent from an offline queue to `functions/api/telemetry.ts`, validated with `zod` and stored in **D1**.
- The admin page `/admin`: I recommend protecting it with **Cloudflare Access** instead of a shared secret in a URL. A fallback is a bearer secret held in a Pages secret. It shows numbers per club and over time.
- A survey after the 3rd finished meeting (NPS, willingness to pay, device interest with price options), stored locally and sent only if the user opted in.
- Invite links: the club template is encoded in the URL **fragment**, so setup takes one tap, no server is needed and it works offline.
- The privacy page lists every collected field. Tests cover the event schema and the "nothing sent without opt-in" rule.
- **Checkpoint:** you create the D1 database and the Access policy in your Cloudflare account; I provide the commands.

## Phase 17: Full quality pass and CI (`docs/QUALITY.md`)

- Complete-meeting e2e: mocked scan → review → every timer → 3 guests → Ah-Counter → report → export. It runs in Playwright projects for Chromium, WebKit (iPhone) and a small Android viewport.
- Reliability tests:
  - a refresh mid-speech;
  - going offline mid-meeting;
  - a 5-minute "lock", simulated by hiding the page and advancing the clock;
  - 100 stored meetings, checked for responsiveness.
- Lighthouse CI (mobile) with targets of 95 or more, a slow-4G first-load budget under 2 s, and a bundle size report.
- Accessibility: keyboard-only flows, axe on every route, contrast checks, and colour-blind simulation screenshots of each signal.
- Code health: zero `tsc` and lint errors, dead code from v1 removed, and a check that no secret appears in the bundle (grep `dist/` for key patterns in CI).
- GitHub Actions: typecheck, lint, unit and e2e tests on every push. Deploy with `wrangler pages deploy` **only from that workflow after the tests pass**.
- **Checkpoint:** this needs the repo on GitHub plus a `CLOUDFLARE_API_TOKEN` secret. No remote is configured right now.
- Critical findings get fixed; the rest are listed by priority.

---

## Verification (every phase)

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build
```

- In addition, run a manual smoke test on a phone-width preview (`npm run preview`) with offline mode in DevTools.
- After phase 6, the full-meeting acceptance test in [AGENTS.md](../AGENTS.md) runs offline in Playwright.
- I report failures as they are, and I do not deploy unless you ask.
