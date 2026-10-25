# Tommy status — 2026-10-25

Working toward being ready to run as the Timer at a real meeting on Wednesday 2026-10-28.

## Where to try it

- **Production (main):** https://tommy-21n.pages.dev/
- **Preview (rebuild):** pushed to https://github.com/josuekb09/tommy-/tree/rebuild. If Cloudflare Pages is set to build non-production branches, the preview URL will be `https://rebuild.tommy-21n.pages.dev/` (or `https://<commit>.tommy-21n.pages.dev/` per build). `GEMINI_API_KEY` must be set as a preview secret for agenda scan to work.

## What is ready

- **Timing engine.** Pure, tested, replays an append-only action log. Covered by 300 unit tests and shared test vectors (`test-vectors/timing.json`) that the device firmware also runs.
- **Meeting builder.** Prepared speeches, evaluators (with brief), Table Topics by hand. Drag-reorder, duplicate last, pairing warnings. Templates (built-in and user-saved).
- **Timer.**
  - Start → Stop → Next on the big button; Pause/Resume on the small row.
  - Accidental Stop is forgiven: Resume carries on from the time shown; the stopped gap is not counted; any edit stays in the log. ([DECISIONS](DECISIONS.md#2026-10-25--resume-is-accepted-after-stop))
  - Re-time, Edit (with reason), Undo and Back to the previous speaker are reachable in two taps or fewer.
  - Mid-meeting reload keeps the recorded time and the current speaker.
  - Speaker view with word + icon per signal (never colour alone), second screen, Zoom view, download backgrounds.
- **Report.** Every agenda item with recorded time, award eligibility (with reason when not eligible) and WhatsApp copy. Also a printable Timer's log.
- **Agenda scan (phase 8a).** Gemini extractor + clean-up layer + `/api/parse-agenda` proxy. The key never reaches the browser. The scan reads structure, roles and timings; names stay as the model wrote them. Table Topics speakers are never prefilled.
- **Offline.** Precached PWA. The agenda scan is the only part that needs the network.

## What is in progress or deferred

- **Phase 8b — accuracy bench.** Script to run the extractor against local fixture agendas and print a metrics table. Deferred until there is enough fixture coverage to run; the mocked integration test (`src/engine/import/import.test.ts`) already protects regressions.
- **Phase 8c — review screen + import flow.** The clean-up output is ready; the review UI (image + list with flag highlighting, confirm when all flags resolved, corrections log in Dexie) is not yet wired to the Meeting screen.
- **Phase 8d — corrected built-in templates.** ToastED, Cape Town and Pinelands templates in `src/engine/templates.ts` need to match the real fixtures (pre-speech briefs, evaluators pairing, segment order).
- **Toast with Undo-action affordance.** Toasts show the message; the Undo button inside the toast is not yet implemented.

## What to check before Wednesday

Run the full gate and spot-check on a phone (360×740):

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

Then on the preview URL, mobile:

1. **Build an agenda by hand** with 2–3 speakers, 1–2 evaluators (one with a brief) and 2–3 Table Topics participants. Save it as a template.
2. **Start the meeting.** Time each person; press Stop by mistake once and Resume. Edit a recorded time with a reason. Press Next → Back.
3. **Reload the page** mid-meeting. The Timer should land on the current speaker with the recorded time still shown.
4. **Open the Report.** Every row has a time; the WhatsApp copy produces one clean line.
5. **Offline test.** Go into airplane mode, reload, and confirm the timing core still works.

## Known blockers

- Pages preview setup: `rebuild` is pushed, but non-production builds and `GEMINI_API_KEY` as a preview secret need to be enabled once in the Cloudflare dashboard.
- The review screen (phase 8c) is not wired in: the Scan button on the Meeting screen currently sends the user straight through without a review step.
