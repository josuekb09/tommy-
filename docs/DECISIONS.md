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
(`scripts/eval-agendas.ts`, forthcoming) reads from the local path only.

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
Topics items); the Meeting screen's Table Topics quick-add; the pending
review screen (phase 8c).
