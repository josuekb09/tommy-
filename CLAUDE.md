# Tommy: smart timekeeper for Toastmasters

Live site: https://tommy-21n.pages.dev/ (Cloudflare Pages). The whole product is in English.

## Product

Tommy helps the Timer at a Toastmasters meeting. It times each speaker, shows green / amber / red signals, records exact times, imports the meeting agenda from a photo (speakers, Table Topics, evaluators; guests are added manually), and generates the Timer's report. Later a physical ESP32-S3 device (LED ring, touchscreen, speaker) will connect to this web app.

- The audit of the v1 code is in [docs/AUDIT.md](docs/AUDIT.md).
- The rebuild roadmap is the approved 17-phase plan.

## Stack

- TypeScript (strict), React 19, Vite 8.
- `vite-plugin-pwa` (Workbox, prompt-to-update, fully precached, works offline).
- IndexedDB via Dexie (`dexie`, `dexie-react-hooks`), and `zod` for validating files and API responses.
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
  timing/      action-log replay (record.ts), signals and results (signal.ts), wall clock (clock.ts)
  profiles.ts  built-in timing profiles, role and segment labels, m:ss helpers
  report.ts    Timer's report rows
  audio.ts     threshold tone (the only browser-API module in engine/; it stays outside the timing core)
src/storage/   db.ts (Dexie schema), repository.ts (the only code that touches IndexedDB),
               schema.ts (zod export format), export-import.ts, migrate-legacy.ts (v1 → v2, once)
src/ui/        App.tsx (shell + hash routes), hooks.ts, components.tsx, runtime.ts (db, repo, clock), screens/
tests/e2e/     Playwright specs
docs/          audit and specs
```

## Key design rules

- **Timing state is an append-only action log.** `TimedRecord.actions` is the source of truth. Status, elapsed time, offsets, edits and the reached signal are derived by `replay()` and cached. Undo appends an `undo` action and nothing is ever rewritten.
- **Invalid actions are not recorded.** A double-tapped Start, or a Stop before Start, returns `undefined` from `appendAction` and writes nothing.
- **Every timing action is saved in the same IndexedDB transaction that applies it** (`repo.records.append`). A refresh mid-speech restores the exact time.
- **The clock is `createWallClock()`:** `Date.now()` clamped so it never runs backwards. Do not use `performance.now()` for timing, because it stops during device sleep on phones.
- **Edits require a reason and keep the original value** (`TimeEdit.fromMs`). Removing an item with a recorded time throws `RecordedTimeError` unless the user confirmed.
- **One writer tab** (Web Locks, `useWriterLock`). Other tabs are read-only.

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
```

Before saying a task is done, run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`.

## Permanent rules

- All UI text is in English.
- Timing must never lose or corrupt a recorded time; the timing engine is pure, tested logic.
- The core timer works fully offline; the cloud is only for agenda AI.
- Never expose API keys in client code.
- Every new feature needs automated tests; run tests and type checks before saying a task is done.
- Signals must never rely on colour alone (colour-blind users).
