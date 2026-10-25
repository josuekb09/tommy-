# Tommy status — 2026-10-25

Working toward being ready to run as the Timer at a real meeting on Wednesday 2026-10-28.

## Where to try it

- **Production (main):** https://tommy-21n.pages.dev/
- **Preview (rebuild):** pushed to https://github.com/josuekb09/tommy-/tree/rebuild. If Cloudflare Pages is set to build non-production branches, the preview URL will be `https://rebuild.tommy-21n.pages.dev/` (or `https://<commit>.tommy-21n.pages.dev/` per build). `GEMINI_API_KEY` must be set as a preview secret for agenda scan to work.

## What is ready

- **Timing engine.** Pure, tested, replays an append-only action log. Covered by the unit suite (311 tests across engine, storage and UI) and shared test vectors (`test-vectors/timing.json`) that the device firmware also runs.
- **Meeting builder.** Prepared speeches, evaluators (with brief), Table Topics by hand. Drag-reorder, duplicate last, pairing warnings. Templates (built-in and user-saved).
- **Meeting flow.** End meeting makes it view-only (the report stays); Past meetings lists every meeting and one tap switches to it; Reopen meeting puts an ended one back to live.
- **Built-in templates (phase 8d).** ToastED, Cape Town and Pinelands follow their real agendas: printed order, timings, 1:00 briefs and pairings. A test reads each sample agenda through the import clean-up and requires the template to match.
- **Timer.**
  - Start → Stop → Next on the big button; Pause/Resume on the small row.
  - Accidental Stop is forgiven: Resume carries on from the time shown; the stopped gap is not counted; any edit stays in the log. ([DECISIONS](DECISIONS.md#2026-10-25--resume-is-accepted-after-stop))
  - Re-time, Edit (with reason), Undo and Back to the previous speaker are reachable in two taps or fewer.
  - Mid-meeting reload keeps the recorded time and the current speaker.
  - Speaker view with word + icon per signal (never colour alone), second screen, Zoom view, download backgrounds.
- **Report.** Every agenda item with recorded time, award eligibility (with reason when not eligible) and WhatsApp copy. Also a printable Timer's log.
- **Agenda scan (phase 8a).** Gemini extractor + clean-up layer + `/api/parse-agenda` proxy. The key never reaches the browser. The scan reads structure, roles and timings; names stay as the model wrote them. Table Topics speakers are never prefilled.
- **Scan review (phase 8c).** New meeting → Scan a printed agenda (up to 4 photos or a PDF; the Gemini notice is shown first). The review shows the photo beside the rows (Rows/Photo toggle on phones); flagged rows carry the reason in words, a one-tap fix where there is one, and Keep as read. Use this agenda stays off until no flag is open. Confirming creates the meeting and writes a local corrections log (Dexie `importLog`, never exported). Any failure offers Build it by hand.
- **Accuracy bench (phase 8b).** `npm run eval:agendas` scores the extractor on the 3 local fixtures (cached responses in `.eval-cache/`, report in `eval-results/`, both gitignored). Last run, `gemini-3.8-flash`: timings 100% on all three; names 100%; roles 97% / 100% / 85% (ToastED / Cape Town / Pinelands, the misses are rows the model merged); speakers, titles, evaluator pairings and Table Topics Master all correct.
- **Offline.** Precached PWA. The agenda scan is the only part that needs the network.

## What is in progress or deferred

- **Bench gaps.** 4 agenda rows across the fixtures come back merged into a neighbour (ToastED 1, Pinelands 3). The flags and review cover it at the meeting; prompt work can follow with before/after bench numbers.
- **Review screen extras.** Adding a new row and changing a role happen in the builder after confirming, not in the review. The review state is in memory: a reload during review means scanning again. PDF pages are not previewed (images are).

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
6. **Scan an agenda** (online, preview URL with `GEMINI_API_KEY` set): New meeting → Scan a printed agenda → photo → check the highlighted rows → Use this agenda. Then End meeting and find it under Past meetings.

## Known blockers

- Pages preview setup: `rebuild` is pushed, but non-production builds and `GEMINI_API_KEY` as a preview secret need to be enabled once in the Cloudflare dashboard.
