# Tommy — Repository Audit

Date: 2026-10-24 · Audited revision: `16627ee` (main) plus the uncommitted working-tree changes to `src/engine/agenda.ts`, `src/engine/agenda.test.ts` and `scripts/capture-*.mjs`.
No code was changed during this audit.

---

## 1. Stack, structure and deployment

| Aspect | Finding |
|---|---|
| Language | TypeScript, `strict: true` ([tsconfig.json](../tsconfig.json)). Single project, `include: ["src"]`. |
| UI | React (`"latest"`), `lucide-react` icons, a single hand-written stylesheet ([src/styles.css](../src/styles.css), 982 lines). No router, no state library. |
| Build | Vite 8 + `@vitejs/plugin-react` + `vite-plugin-pwa` (Workbox `generateSW`, `registerType: "autoUpdate"`) ([vite.config.ts](../vite.config.ts)). |
| Storage | IndexedDB via `idb`: database `tommy` v1, stores `meetings` (keyPath `id`) and `settings` (key `main`) ([src/storage.ts:3](../src/storage.ts#L3)). |
| OCR | `tesseract.js` v7, which runs **in the browser**. The worker, WASM core and `eng` language model are downloaded from `cdn.jsdelivr.net` on first use. |
| Tests | Vitest unit tests (`src/**/*.test.ts`, 5 files, 35 tests). Playwright e2e plus axe accessibility checks ([tests/e2e/tommy.spec.ts](../tests/e2e/tommy.spec.ts)). Lighthouse is installed but not wired to a script. |
| Lint/format | **None.** There is no ESLint or Prettier config and no `lint` or `typecheck` script. |
| Server functions | **None.** There is no `functions/` directory, no `wrangler.toml`, no backend and no `fetch()` calls in `src/`. |
| API keys / secrets | **None** in the code, config or git history paths checked. No `import.meta.env` or `VITE_*` usage. No AI or LLM service is used. |
| Deployment | Cloudflare Pages serves the static `dist/` output. [public/_headers](../public/_headers) sets the CSP, security and cache headers. There is no `wrangler.toml` and no CI config, but a local `.wrangler/tmp` exists, so deployment is most likely a manual **Direct Upload** (`npx wrangler pages deploy dist`) rather than Git integration. **This cannot be confirmed from the repo.** Confirm in the Cloudflare dashboard. |
| Node | `package.json` `engines` requires `>=22.12 <23` and `.nvmrc` says `22`, but this machine runs Node **24.13.1**. |

### Folder map

```
src/
  App.tsx              all screens (Timer, Queue, Report, Log, Settings, sheets, speaker display), 191 very dense lines
  AgendaScanner.tsx    photo pick → Tesseract OCR → review → import
  storage.ts           IndexedDB wrapper (idb)
  engine/              framework-free logic: timer.ts, report.ts, agenda.ts, audio.ts, types.ts (+ tests)
tests/e2e/             Playwright specs
public/                icons, _headers
scripts/               Playwright screenshot capture scripts
design/                reference prototype (separate App.tsx of 1524 lines, PNG references), not built
Tommy*.md / .docx / .svg, files.zip, design/*.zip   briefs, prompts and binary assets at the repo root
"Tommy 3D printing/"   untracked
```

The repo holds a lot of binary and briefing material (`Tommy.docx`, `files.zip`, `design/tommy-complete-png-design-pack.zip`, about 100 PNGs). It does not affect the build, but it bloats clones and makes the source hard to find.

---

## 2. Running locally

```bash
nvm use 22                 # package.json requires Node 22.x (24 also worked during this audit)
npm ci                     # install exact versions from package-lock.json
npm run dev                # Vite dev server → http://localhost:5173
npm test                   # Vitest unit tests (35 pass)
npx tsc -b                 # type check (passes; there is no npm script for it)
npm run build              # tsc -b && vite build → dist/ (passes)
npm run preview            # serve dist/ → http://localhost:4173 (service worker active)
npx playwright install chromium && npm run test:e2e   # e2e (builds + previews automatically)
```

`?demo=1` loads a sample meeting with a running timer and does not persist anything.

Results during the audit: unit tests 35/35 pass, `tsc -b` passes and `vite build` passes (precache of 12 entries, 373 KiB). The e2e suite was not run.

---

## 3. Feature inventory

Legend: ✅ works · 🟡 partly works · ❌ broken or missing

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | Timestamp-based timing (start/pause/resume/stop) | ✅ | Pure functions [src/engine/timer.ts:5-9](../src/engine/timer.ts#L5-L9), with unit tests and e2e tests using a fake clock. |
| 2 | Green/yellow/red/over-time state | ✅ | [timer.ts:11-18](../src/engine/timer.ts#L11-L18). Disqualification is hard-coded to red + 30 s ([App.tsx:30](../src/App.tsx#L30)). |
| 3 | Three independent segments (Speeches, Evaluations, Table Topics) | ✅ | [App.tsx:13](../src/App.tsx#L13), tabs at [App.tsx:124](../src/App.tsx#L124). |
| 4 | Persisted timer survives refresh | ✅ | Every meeting change is saved ([App.tsx:45-50](../src/App.tsx#L45-L50)). Writes are serialized ([storage.ts:7-14](../src/storage.ts#L7-L14)). Covered by e2e. |
| 5 | Catch-up offsets | 🟡 | Only +5/+10/+30 s, with no negative correction ([App.tsx:125](../src/App.tsx#L125), `catchups`). Offsets are folded into `elapsedMs`, so there is no record of which offsets were applied ([timer.ts:10](../src/engine/timer.ts#L10)). |
| 6 | Reset with one-step undo | 🟡 | Works, but the undo snapshot lives in a `useRef` ([App.tsx:27](../src/App.tsx#L27)), so it is lost on refresh. There is no undo for an accidental Stop or Start. |
| 7 | Edit recorded time | 🟡 | Works, but **overwrites the original time**. Only an `edited: true` flag is kept, with no reason and no history ([App.tsx:88](../src/App.tsx#L88)). An empty input is accepted as `0:00`, because `Number("")` is `0` ([App.tsx:76](../src/App.tsx#L76)). |
| 8 | Add speaker / evaluator | ✅ | [App.tsx:68](../src/App.tsx#L68). |
| 9 | Add Table Topics participant | 🟡 | **"Add guest" works.** **"Add speaker" inside Table Topics is broken:** it uses the `role` state, which defaults to `"Speech"`, so the participant gets 5:00–7:00 speech thresholds. The `<select>` *displays* "Table Topics" because `"Speech"` is not one of its options ([App.tsx:68](../src/App.tsx#L68), [App.tsx:186](../src/App.tsx#L186)). |
| 10 | Remove from queue | 🟡 | One tap, with **no confirmation, including for completed turns with recorded times**, which deletes the data permanently ([App.tsx:113](../src/App.tsx#L113)). |
| 11 | Reorder queue (drag handle) | ❌ | A `GripVertical` icon is drawn but there is no drag logic ([App.tsx:126](../src/App.tsx#L126)). |
| 12 | Queue help button | ❌ | The button has no `onClick` ([App.tsx:126](../src/App.tsx#L126), `aria-label="Queue help"`). |
| 13 | Per-segment Timer's report | ✅ | [report.ts](../src/engine/report.ts), [App.tsx:127](../src/App.tsx#L127). It does not show the thresholds or how far over or under each speaker was. |
| 14 | Read report aloud | ✅ | `speechSynthesis` ([App.tsx:127](../src/App.tsx#L127)). |
| 15 | Copy report | 🟡 | `navigator.clipboard.writeText` with no success or failure feedback and an unhandled promise rejection ([App.tsx:127](../src/App.tsx#L127)). |
| 16 | Exportable meeting log | 🟡 | "Export PDF" is only `window.print()` ([App.tsx:128-129](../src/App.tsx#L128-L129)). There is no JSON or CSV export, no data import and no backup. |
| 17 | Multiple meetings / new meeting | ❌ | `newMeeting()` is only called when the database is empty ([App.tsx:24](../src/App.tsx#L24)). There is **no way to start next week's meeting** and no meeting list. Past meetings stay in IndexedDB but cannot be reached. |
| 18 | Threshold preset editing | ✅ | [App.tsx:132-170](../src/App.tsx#L132-L170). Changes apply only to turns added later. |
| 19 | Settings: "Club name" | 🟡 | The field is labelled "Club name" but edits `meeting.title` ([App.tsx:165](../src/App.tsx#L165)). There is no club entity. |
| 20 | Early/late allowance inputs | 🟡 | `+e.target.value` accepts negatives, and an empty field becomes 0 ([App.tsx:173-174](../src/App.tsx#L173-L174)). |
| 21 | Sound / vibration cues | 🟡 | They fire on the wrong events (see §5). Sound is off by default. |
| 22 | Colour-blind pattern cues | ✅ | Text label plus a symbol (`● GO`, `▧ WRAP UP`…) ([App.tsx:125](../src/App.tsx#L125)). The symbols are missing from the speaker display. |
| 23 | Speaker display (full screen) | 🟡 | Same tab only. It shows the time and a small state word, with no pattern cue, no Fullscreen API and no second-window sync. Tapping anywhere exits ([App.tsx:190](../src/App.tsx#L190)). |
| 24 | Screen Wake Lock | 🟡 | Requested while running, but **not re-acquired after the tab becomes visible again** (see §5) ([App.tsx:57](../src/App.tsx#L57)). |
| 25 | Theme (system/light/dark) | 🟡 | "System" is evaluated once and does not follow OS changes ([App.tsx:54](../src/App.tsx#L54)). |
| 26 | Offline PWA | ✅ | Workbox precache. The e2e test covers an offline reload. The icons are PNG 192/512 with no `maskable` purpose. |
| 27 | Agenda scan (photo → queue) | 🟡/❌ | The UI flow works (pick, multi-page, review, append/replace). **Extraction quality is poor** (see §4). It does not work offline on first use, because the model is downloaded from the CDN. |
| 28 | Safe import merge (never delete timed turns) | ✅ | [agenda.ts:199-267](../src/engine/agenda.ts#L199-L267), well tested. |
| 29 | Meeting date import | 🟡 | Many common formats fail (see §4, root cause R9). |
| 30 | Header logo link | ❌ | `href="#timer"`, but there is no hash routing, so it does nothing ([App.tsx:108](../src/App.tsx#L108)). |
| 31 | Browser back button | ❌ | There is no history or routing. Back leaves the app. |
| 32 | Multiple tabs open | ❌ | Each tab keeps its own in-memory meeting and blindly `put`s it, so the last tab to write wins and silently overwrites the other ([storage.ts:8-14](../src/storage.ts#L8-L14)). |

---

## 4. Agenda scanning: deep dive

### 4.1 Pipeline today

1. **Capture**: two hidden `<input type="file">` elements. One has `capture="environment"` (camera) and the other has `multiple` (gallery) ([AgendaScanner.tsx:75](../src/AgendaScanner.tsx#L75)). Files must have an `image/*` type and be 15 MB or smaller ([AgendaScanner.tsx:21-30](../src/AgendaScanner.tsx#L21-L30)). Pages can be reordered.
2. **OCR**: `tesseract.js` `createWorker("eng", OEM.LSTM_ONLY)` with **default settings**: page segmentation mode 3 (fully automatic), no `rotateAuto`, no preprocessing. The raw `File` is passed directly to `worker.recognize()` ([AgendaScanner.tsx:41-55](../src/AgendaScanner.tsx#L41-L55)). Only `data.text` is used. Word and line confidences, bounding boxes and layout blocks are discarded.
3. **No AI.** There is **no LLM, no vision model and no prompt**. "Understanding" the agenda is done by regular expressions in [src/engine/agenda.ts](../src/engine/agenda.ts) (`parseAgenda`, lines 123-161).
4. **Parsing**: the text is split into lines. For each line, `roleFor()` classifies it with keyword regexes. If it is a speaker, evaluator or Table Topics role, the role words are stripped, a name is extracted (`rowNameFrom` → `nameFrom` → the next line), and the title and thresholds are extracted from the rest of the line.
5. **Review**: an editable draft. Items without a name or role are not imported. Merge into the meeting uses append or replace ([agenda.ts:199](../src/engine/agenda.ts#L199)).

### 4.2 Root causes of wrong speakers, Table Topics and evaluators

Each root cause below was **reproduced** by running the current `parseAgenda` against realistic lines (scratch probe, not committed). The output is shown as `[role, name, title, thresholds]`.

| # | Root cause | Evidence (input → output) |
|---|---|---|
| **R1** | **OCR loses the table structure.** Agendas are tables (time · role · name · title · G/A/R). With PSM 3 and no preprocessing, Tesseract flattens rows into one line, or reads column by column on photos with perspective or skew. The parser assumes "one row = one line, role then name then title". When the columns are read separately, the role and the name end up on different, distant lines and nothing can match them. | [AgendaScanner.tsx:55](../src/AgendaScanner.tsx#L55) uses `data.text` only. The working-tree diff adds `rowNameFrom` specifically to cope with flattened rows. |
| **R2** | **No image preprocessing.** There is no EXIF rotation, deskew, crop, greyscale/contrast or downscale. A 12 MP phone photo is sent as-is, which is slow and memory-heavy on phones, and rotated photos give garbage. | [AgendaScanner.tsx:55](../src/AgendaScanner.tsx#L55) |
| **R3** | **Role keywords are too narrow and too literal.** Common spellings are dropped silently, and a single OCR typo removes the person entirely. | `"Speaker: Ada Lovelace"` → **nothing**. `"Speaker One - Ada Lovelace"` → nothing. `"Prepared Speaker - Ada Lovelace"` → nothing. `"1st Speakcr \| Kim Austen …"` → nothing. |
| **R4** | **Rule order misclassifies evaluators as speakers.** A "Speech Evaluator" fails every Evaluation pattern and then matches the Speech pattern. | `"Speech Evaluator: Grace Hopper"` → `["Speech","Grace Hopper"]` |
| **R5** | **Evaluator gets the evaluated speaker's name.** The first capitalised phrase after the role is taken as the person. | `"Evaluator for Kim Austen: Grace Hopper"` → `["Evaluation","Kim Austen","Evaluates Kim Austen"]`. Grace Hopper is lost. |
| **R6** | **Exclusion keywords match anywhere on the line, including speech titles.** Words such as `educational`, `break`, `timer`, `toastmaster`, `president` and `announcement` anywhere on a row discard the speaker. | `"1st Speaker \| Kim Austen \| An educational journey \| 5:00 \| 6:00 \| 7:00"` → **nothing** ([agenda.ts:34](../src/engine/agenda.ts#L34)) |
| **R7** | **The name heuristic is ASCII-only, capped at two words and order-dependent.** Accented letters, lowercase particles and three-part names are cut. A title before the name is taken as the name. | `"José Núñez"` → name `"Jos"`, title `"é Núñez"`. `"Maria van Rooyen"` → `"Maria"` with title `"van Rooyen"`. `"Mary Anne Smith"` → `"Mary Anne"`. `"1st Speaker \| Finding My Voice \| Kim Austen"` → name `"Finding"`. ([agenda.ts:45-72](../src/engine/agenda.ts#L45-L72)) |
| **R8** | **Clock times are mistaken for timing thresholds.** Any `h:mm` value is a candidate duration up to 30:00. A schedule start time such as `19:20` becomes a 19 min 20 s red card, and a single value sets green = amber = red. | `"1st Speaker \| 19:20"` → thresholds `1160/1160/1160`. `"1st Speaker Kim Austen 5-7 min 19:20"` → title `"5-"`, thresholds 19:20 ([agenda.ts:107-120](../src/engine/agenda.ts#L107-L120)). |
| **R9** | **Imported thresholds silently override presets, and the first evaluator row wins.** The code uses `item.thresholds` before the presets ([agenda.ts:222](../src/engine/agenda.ts#L222)), which contradicts the README ("OCR does not change Tommy's established timer presets"). Evaluators are de-duplicated by name, so when an agenda lists the evaluator twice (a 1:00 intro slot and a 2:00–3:00 evaluation), the **1:00 slot is kept** and the real evaluation is timed at 1:00 for all three signals. The existing test asserts this behaviour ([agenda.test.ts:76-78](../src/engine/agenda.test.ts#L76-L78)). | `"1st Evaluator \| Ann Lee \| 1:00"` followed by `"… \| 2:00 \| 2:30 \| 3:00"` → one item, `60/60/60` |
| **R10** | **Table Topics model mismatch.** Printed agendas list the *Table Topics Master*; the participants are chosen live. In the **committed/deployed** code (`16627ee`), "Table Topics Master" matched the Table Topics role, so **the Master was imported as a Table Topics speaker**. The uncommitted working-tree change excludes the Master, which is correct, but that change is not deployed. Lines such as "Table Topics Speakers: Guests" yield nothing. That is correct, but the UI does not explain it. | `git diff src/engine/agenda.ts` line 34. `"Table Topics Master \| Philip Townsend …"` → nothing (working tree) |
| **R11** | **Date parsing is month-first and US-style only.** Day-first dates fail, a missing year falls back to 2001, and `dd/mm/yyyy` is read as `mm/dd`. | `"23rd September 2026"` → not found. `"9 October 2026"` → not found. `"October 9"` → **2001-10-09**. `"09/10/2026"` → **2026-09-10** ([agenda.ts:128-129](../src/engine/agenda.ts#L128-L129), [agenda.ts:180-189](../src/engine/agenda.ts#L180-L189)) |
| **R12** | **OCR confidence is ignored.** Tesseract returns per-word confidence, but low-confidence words are not flagged for review, so a misread name looks as trustworthy as a perfect one. | [AgendaScanner.tsx:55](../src/AgendaScanner.tsx#L55) |
| **R13** | **There is no relation model.** Evaluator → speaker links are kept only as free text (`"Evaluates X"`), and nothing checks that the counts are consistent (for example, three speakers but two evaluators). | [agenda.ts:146-149](../src/engine/agenda.ts#L146-L149) |
| **R14** | **The tests do not reflect reality.** Every parser test uses clean, hand-typed text. There is no fixture of real OCR output from real agenda photos, so the 35 green tests say nothing about real-world accuracy. | [agenda.test.ts](../src/engine/agenda.test.ts) |
| **R15** | **The regex approach does not scale.** Each club's agenda template differs. Every fix (for example the uncommitted `titleLead` word list, [agenda.ts:59](../src/engine/agenda.ts#L59)) patches one layout and risks breaking another. | Git history: two "fix agenda" commits in two days, plus uncommitted patches. |
| R16 | The README claims HEIC works "where the browser can decode it", but Tesseract decodes images itself (Leptonica) and does not support HEIC, so iPhone HEIC files will fail. | README "Supported input" |

### 4.3 Direction

Keep the parser as an offline fallback, but move primary extraction to a **server-side vision LLM** (a Cloudflare Pages Function holding the key) that returns **structured JSON** (`role` enum, `personName`, `speechTitle`, `evaluatesItemId`, G/A/R in seconds, per-field confidence). Validate the response with a schema and keep the mandatory human review step. Build a fixture set of real agenda photos with expected output and measure accuracy per field.

---

## 5. Timer accuracy and lifecycle

| Question | Finding |
|---|---|
| Date.now or counting ticks? | **Timestamps.** `elapsed = elapsedMs + (now − startedAt)` ([timer.ts:5](../src/engine/timer.ts#L5)). The `setInterval(250)` at [App.tsx:44](../src/App.tsx#L44) only triggers a re-render. **There is no tick-counting drift.** ✅ |
| Clock source | `Date.now()` is wall-clock, **not monotonic**. If the OS adjusts its clock (NTP sync, a manual change) mid-speech, elapsed time jumps forward or backward. That risk is low but real. A monotonic clock (`performance.timeOrigin + performance.now()`) plus a persisted wall-clock anchor would fix it. |
| Tab in background | Timing stays correct, because it is recomputed from timestamps. **Cues are late:** the vibration and sound fire from a React effect when the state changes on render ([App.tsx:58-65](../src/App.tsx#L58-L65)). Background tabs throttle timers to 1 s or less often, and freeze them entirely after minutes in Chrome. |
| Phone screen locks | JavaScript is suspended, so **no cue fires** while the screen is locked. On unlock the time is correct and the missed cue fires at that moment. Wake Lock is meant to prevent this, but browsers **release the wake lock automatically when the page is hidden**, and the code only re-requests it when `active.status` changes ([App.tsx:57](../src/App.tsx#L57)). After the Timer switches apps once, the screen can lock mid-speech. |
| Refresh mid-speech | The running turn and `startedAt` are persisted, so the time is restored exactly (e2e test at [tommy.spec.ts:69](../tests/e2e/tommy.spec.ts#L69)). ✅ After a reload, `lastState` starts at `"ready"` ([App.tsx:27](../src/App.tsx#L27)), so a **spurious buzz or tone fires** immediately if the speaker is already past green. |
| Spurious cues | **Selecting a completed speaker who finished in red triggers the vibration and tone**, because the effect fires on any change of the displayed state, not on a threshold crossing ([App.tsx:58-65](../src/App.tsx#L58-L65)). `crossed()` already exists in the engine ([timer.ts:19](../src/engine/timer.ts#L19)) but is unused. |
| Two timers at once | Starting a second speaker does not pause the first. Both run, and the first is hidden because `active` prefers `selectedId` ([App.tsx:29](../src/App.tsx#L29)). |
| Stop on a speaker who never started | Stop is enabled for queued turns and records `0:00` as "done" ([App.tsx:125](../src/App.tsx#L125)). An accidental tap creates a fake record. |
| Data integrity of recorded times | An edit overwrites the original (§3 #7). Remove deletes recorded turns without confirmation (§3 #10). Reset on a *done* turn wipes it after a `confirm()`, and the undo is lost on refresh. Multi-tab writes overwrite each other (§3 #32). **These break the rule "never lose a recorded time".** |
| Rounding | `formatTime` floors (`4:59.9` shows `4:59`), consistent with `stateAt` using `>=`, so green appears exactly when `5:00` is shown. ✅ |

---

## 6. Security

| Severity | Issue |
|---|---|
| ✅ | No API keys, secrets or backend exist today. React escapes all rendered text, and there is no `dangerouslySetInnerHTML`. |
| Medium | **Third-party script origin in CSP**: `script-src … https://cdn.jsdelivr.net` with no Subresource Integrity. This allows *any* package on jsDelivr to be loaded if an injection ever occurs, and Tesseract's worker, core and model are fetched unpinned at runtime ([public/_headers:6](../public/_headers#L6)). Self-host the Tesseract assets in `public/` and remove jsDelivr from the CSP. |
| Medium | **`"latest"` dependency ranges** for `react`, `react-dom`, `idb`, `vite-plugin-pwa`, `@vitejs/plugin-react`, `typescript` and `vitest` ([package.json](../package.json)). A fresh `npm install` can pull a breaking or compromised release. The lockfile mitigates this only when `npm ci` is used. |
| Low | `style-src 'unsafe-inline'` (needed for the inline `--progress` style). |
| Low | `Permissions-Policy: camera=()` blocks `getUserMedia`. The file-input camera still works, but any future in-app camera viewfinder will fail silently until this is changed. |
| Future | When agenda AI moves to the cloud, the key **must** live in a Cloudflare Pages Function secret (`wrangler pages secret put`), never `VITE_*`. Add rate limiting, an image size limit and no image retention. |
| Info | `console.error` logs only classified messages, with no personal data ([agenda.ts:283-353](../src/engine/agenda.ts#L283-L353)). ✅ |

## 7. Accessibility

| Issue | Evidence |
|---|---|
| **Signal changes are not announced to screen readers.** The timer state has no `aria-live` region (only toasts have `role="status"`). | [App.tsx:125](../src/App.tsx#L125) |
| Bottom sheets are not dialogs: no `role="dialog"`/`aria-modal`, no focus trap, **Escape does not close them**, and focus does not return to the trigger. | [App.tsx:186-187](../src/App.tsx#L186-L187) |
| Report time buttons are labelled only with the time ("7:30"), so a screen-reader user cannot tell whose time they are editing. | [App.tsx:131](../src/App.tsx#L131) |
| Tabs have `role="tab"` but no arrow-key navigation, `aria-controls` or `tabpanel`. | [App.tsx:124](../src/App.tsx#L124) |
| Bottom navigation has no `aria-current="page"`. | [App.tsx:189](../src/App.tsx#L189) |
| The drag handle is a decorative, non-functional affordance, and the help button is a dead control. | [App.tsx:126](../src/App.tsx#L126) |
| Native `confirm()` is used for destructive actions (works, but unstyled and blocking). | [App.tsx:112](../src/App.tsx#L112) |
| **Colour reliance:** the main timer pairs colour with a text label and a symbol (good), but the pattern cue can be turned off. The speaker display (the screen facing the audience) shows only a small state word and **no symbol**. | [App.tsx:125](../src/App.tsx#L125), [App.tsx:190](../src/App.tsx#L190) |
| Very small text: `font-size` 9–11 px in many places. | [styles.css:148](../src/styles.css#L148), [:173](../src/styles.css#L173), [:502](../src/styles.css#L502), [:770](../src/styles.css#L770) |
| ✅ | axe tests for serious/critical violations on all screens, a 3 px focus outline, 48 px touch targets checked in e2e, and `prefers-reduced-motion` handled ([styles.css:909](../src/styles.css#L909)). |

## 8. Mobile layout

| Issue | Evidence |
|---|---|
| The speaker display uses `100vw/100vh`. On iOS Safari, `100vh` exceeds the visible viewport, so the bottom of the display is hidden behind the toolbar. Use `100dvh`. | [styles.css:964](../src/styles.css#L964), also [:903](../src/styles.css#L903) |
| The primary Start button is not at thumb height on tall phones. The layout stacks card → clock → actions → catch-ups → up-next, so it scrolls. | [App.tsx:125](../src/App.tsx#L125) |
| There is no landscape layout for the speaker display or the timer. | styles.css media queries only use width. |
| Sheets close on `onMouseDown` on the backdrop. On touch devices a scroll gesture that starts on the backdrop can dismiss the sheet. | [App.tsx:186](../src/App.tsx#L186) |
| ✅ | `env(safe-area-inset-bottom)` is used for the bottom navigation, and there is no horizontal scroll at 390 px (e2e-checked). |

## 9. Code health

- [App.tsx](../src/App.tsx) puts every screen into 191 lines with many 2,000-character lines. It is very hard to review, test or change safely, and there are no component tests.
- Timing state lives on the `Turn` object, with no audit trail, offset history or event stream. This fits Phase 1 but not the planned hardware or reporting.
- IndexedDB schema v1 has no migration path or versioned export format.
- `AGENTS.md` says "no backend in this phase", but the product direction now includes cloud agenda AI. The two documents need reconciling.
- `ms + tick * 0` ([App.tsx:112](../src/App.tsx#L112)) is a hack to force re-render.

---

## 10. Prioritized fix list

**P0: data integrity and wrong cues (live-meeting risks)**
1. Never destroy a recorded time: confirm before removing a done turn, keep the original value and a reason when editing, persist the undo, and reject empty edits ([App.tsx:76](../src/App.tsx#L76), [:88](../src/App.tsx#L88), [:113](../src/App.tsx#L113)).
2. Fire cues only on real threshold crossings of a *running* timer (use `crossed()`). No cue on reload or when selecting a recorded turn.
3. Re-acquire the Wake Lock on `visibilitychange`.
4. Allow only one running timer, and disable Stop for a turn that never started.
5. Fix "Add speaker" in Table Topics getting Speech thresholds ([App.tsx:68](../src/App.tsx#L68)).
6. Single-writer protection across tabs (BroadcastChannel or Web Locks), or at least a "Tommy is open in another tab" warning.

**P1: agenda scan reliability**
7. Deploy the working-tree fix (Table Topics Master is not a guest). Until then the live site imports the Master as a speaker.
8. Stop treating schedule clock times as thresholds. Never let OCR override presets without showing it in review, and prefer the full evaluation slot over the intro slot.
9. Fix the role rules (R3–R6) and the name extraction (R7) as a stopgap, and add real OCR fixtures (R14).
10. Move primary extraction to a server-side vision LLM via a Pages Function, with a structured JSON schema and confidence-flagged review. Keep the regex parser as the offline fallback.
11. Image preprocessing (EXIF orientation, downscale to about 2000 px, greyscale/contrast). Self-host Tesseract assets so scanning also works offline.
12. Day-first date parsing, and no year-2001 fallback.

**P2: missing product features**
13. New meeting / meeting list / club entity.
14. JSON export and import of a meeting and of all data; CSV of the log.
15. Negative offset (−5 s), offset history, undo for Start/Stop.
16. Speaker display: symbols, Fullscreen API, second-window sync.
17. Queue reordering (or remove the fake drag handle), and either wire the help button or remove it.

**P3: foundation and polish**
18. ESLint + Prettier, `typecheck`/`lint` scripts, CI running tests, type check and e2e before deploy.
19. Pin dependency versions (no `"latest"`), align Node to 22, and remove jsDelivr from the CSP.
20. Split `App.tsx` into screens and components with component tests.
21. Accessibility: `aria-live` signal announcements, dialog semantics with focus trap and Escape for sheets, contextual labels on time buttons, `aria-current`, minimum font size of 12 px or more.
22. Mobile: `100dvh`, thumb-height primary action, landscape speaker display.
23. Move briefs and binaries (`*.docx`, `*.zip`, design PNGs) out of the source repo or into `docs/`/LFS.
