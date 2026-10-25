# Decisions log

Autonomous decisions taken during the Wednesday-meeting readiness push. Each
entry: what was decided, why, and where it applies. Dates are the day the
decision was taken (local).

## 2026-10-25 — Resume is accepted after Stop

**Decision.** `resume` is now accepted when the timer is `stopped`, in addition
to `paused`. The stopped gap is **not** counted as speaking time: the timer
carries on from the time it showed at Stop, and any edit stays in the log.

**Why.** The user's real-world bug: during a meeting, pressing Stop instead of
Pause recorded the time with no way to resume. Starting a new record would lose
the original time; a workaround with offsets would be slow and error-prone.
Forgiving the mistake matches how a human timekeeper would handle it.

**Where it applies.**
- Engine reducer: `src/engine/timing/record.ts`, `case "resume"`.
- Spec: `docs/TIMING_SPEC.md` (action table and the `resume` effect).
- Vectors: `test-vectors/timing.json` — `resume-after-stop-continues-timing`,
  `resume-after-stop-keeps-the-edited-time`,
  `resume-after-stop-preserves-offsets`,
  `resume-when-idle-is-ignored`, `resume-while-running-is-ignored`.
- Unit tests: `src/engine/timing/record.test.ts`.

Follow-up (Priority 2 UI): the Timer screen must expose Resume after Stop from
the person's row for at least 30 seconds after Stop, and Stop/Pause must be
hard to confuse (distance, colour, label, icon).

## 2026-10-25 — Fixtures stay out of git

**Decision.** `fixtures/` is in `.gitignore`. Real-world agenda photos and
expected JSON files with members' real names live on disk and never reach the
repo.

**Why.** Testing accuracy needs real agendas with real names, but committing
them would publish members' names on a public branch. The eval bench reads
`fixtures/` locally; CI runs on mocked responses instead.

**Where it applies.** `.gitignore` entry; eval script
(`scripts/eval-agendas.test.ts`, run with `npm run eval:agendas`) reads from the local path only; its `.eval-cache/` and `eval-results/` hold names too and are gitignored.

## 2026-10-25 — Gemini free tier only; photos go via /api with a pre-scan notice

**Decision.** Agenda import stays on the Gemini free tier (`gemini-3-flash`,
quota ~20 pages/day). Photos are sent to Google only when the user taps
"Import from photo"; a notice shown before the first scan reads: *"Photos are
sent to Google Gemini's free service, which may use them to improve its
products."* The manual builder ("Build it by hand") must always work without
calling the API.

**Why.** Zero cost rule. Keeping the notice visible before the first call
means the user never sends a photo without seeing where it goes.

**Where it applies.** `/api/parse-agenda` (same-origin only); the Import
screen's pre-scan sheet; `functions/api/parse-agenda.ts` (production secret
only). The browser never sees `GEMINI_API_KEY`.

## 2026-10-25 — Last-stopped speaker wins after a mid-meeting reload

**Decision.** When nothing is running and there is no explicit selection, the
Timer screen now picks the most recently stopped item instead of the first
idle one.

**Why.** A refresh mid-meeting resets the React `selectedId` state. Without
this rule, pressing Stop and then reloading would push the Timer past the
person just timed, straight to the next idle one — Resume and Edit would be
out of reach.

**Where it applies.** `src/ui/screens/TimerScreen.tsx` current-item fallback;
covered by the "Timer forgives mistakes" Playwright test
(`tests/e2e/meeting.spec.ts`), which stops Ada, reloads, and checks the Timer
is still on Ada with the 6:00 result shown.

## 2026-10-25 — Table Topics speakers are never prefilled by the scan

**Decision.** The scan may read a Table Topics *section header* and total
time, but it never writes names into the Table Topics queue. During the
meeting a visible **Add visitor** button adds the next guest straight into
Table Topics.

**Why.** Table Topics speakers are picked live. The model would otherwise
invent names from an attending list or guess from blank rows.

**Where it applies.** `src/engine/import/build.ts` (filters nameless Table
Topics items); the Meeting screen's Table Topics quick-add; the review
screen (phase 8c) never adds Table Topics speakers.

## 2026-10-25 — The scan review blocks on open flags, not on confidence alone

**Decision.** "Use this agenda" is enabled only when every flag from the
clean-up layer is fixed (its one-tap suggestion, or typing the name) or kept
as read. Low model confidence becomes a flag in `build.ts` (below 0.8), so
the review has one rule. Removing a speech drops its evaluator's pairing and
adds a new flag rather than silently re-pairing.

**Why.** The Timer must look at every doubtful row once, but a correct row
should cost one tap, never a retype. Re-pairing on delete would be a guess.

**Where it applies.** `src/engine/import/review.ts` (pure, unit tested);
`src/ui/screens/ScanReview.tsx`; `tests/e2e/scan.spec.ts`.

## 2026-10-25 — The corrections log stays on the device

**Decision.** Each confirmed scan writes one `importLog` row (Dexie schema
v2): the draft as read, the draft as confirmed, and counts per kind of
change. It is not part of the export file and is never sent anywhere.

**Why.** It is there to see where the scan needs correcting (phase 10). It
holds member names, so it follows the same rule as `fixtures/`.

**Where it applies.** `src/storage/db.ts` (`importLog`, not in
`dataTables`); `repo.imports.confirm` writes it in the same transaction that
creates the meeting.

## 2026-10-25 — Built-in templates follow the real agendas, untimed where nothing is printed

**Decision.** Built-in templates follow the fixture agendas: speech, brief,
evaluation and Table Topics order, timings and pairings come from what is
printed, checked by a test against the sample transcriptions. No template has
a General Evaluator (none of the three agendas has one). A role the agenda
lists with no time (all of Pinelands' opening and reports, Cape Town's
reports) is untimed, as the import would read it. Toastmaster link-ins, breaks
and mid-meeting Timer reports are left out.

**Why.** "`profileFromRange` never guesses" applies to templates too: a
default 1:00 for a role the club does not time would put wrong signals in
front of the speaker. Link-ins would only add rows the Timer does not report.

**Where it applies.** `src/engine/templates.ts`; `src/engine/templates.test.ts`
("matches the club's real agenda").

## 2026-10-25 — Agenda scan falls back to other free Gemini models

**Decision.** When the main model (`gemini-3.8-flash`) answers 503/500 (busy)
or 429 (free quota used up), the scan tries `gemini-3.5-flash`, then
`gemini-2.5-flash`, within one 140 s deadline. If every model fails, the main
model's error is reported. A busy model is its own error kind, `busy`, with its
own message ("Google Gemini is busy right now"); a request that never reached
Tommy's server says so, apart from Gemini not answering. Failures are logged
(kind and the provider's message, never photos or the key) so
`wrangler pages deployment tail` shows the cause.

**Why.** On the preview, every scan failed with "The scanning service isn't
answering": the key and model were fine, but 3.8-flash was overloaded (503
"high demand") and later out of free quota. Each model has its own free quota,
so falling back stays at zero cost. The Timer still checks every row.

**Where it applies.** `server/extract/gemini.ts` (`DEFAULT_FALLBACK_MODELS`,
Gemini 2.x gets `thinkingBudget` instead of `thinkingLevel`; override with the
`GEMINI_FALLBACK_MODELS` env var, empty for none), `server/extract/handler.ts`,
`src/engine/import/wire.ts`, `src/ui/scan-api.ts`, and their tests. The
accuracy bench turns fallbacks off so it measures the chosen model.

## 2026-10-25 — A used-up daily quota says so; every model's cause is logged

**Decision.** A 429 whose quota is per day (`QuotaFailure` quotaId with
`PerDay`, or a retry delay over an hour) is its own kind, `quota_used_up`:
"Today’s free Google Gemini scans are used up. Try again tomorrow, or build it
by hand." Any 5xx except 504 counts as `busy` (502 and Cloudflare's 524
included), and a 504 from Google moves on to the next model while the 140 s
deadline has time left. When every model fails, the Timer is told about the one
that clears soonest (busy, then timeout, unavailable, per-minute limit, daily
quota); a refused key or request stops at once and is reported as itself. The
log line lists every model tried with its kind and Google's message.

**Why.** After the fallback change the preview still failed: 3.8-flash had used
its daily free quota (resets in ~14 h), 3.5-flash answered 503 "high demand",
and the Timer read "try again in a minute", which was not true. Only the main
model's error was logged, so why the fallbacks failed could not be seen. A 524
from the main model skipped the fallbacks entirely.

**Where it applies.** `server/extract/gemini.ts` (`dailyQuota`, `soonest`),
`server/extract/handler.ts`, `src/engine/import/wire.ts`, and their tests.
