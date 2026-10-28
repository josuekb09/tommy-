# Tommy status — 2026-10-28

Ready for tonight's meeting.

## Where to try it

- **Production (main):** https://tommy-21n.pages.dev/
- **Preview (rebuild):** https://rebuild.tommy-21n.pages.dev/ — `GEMINI_API_KEY` set as a preview secret.

## Ready for tonight checklist

- [x] All checks pass: `npm run typecheck && npm run lint && npm test && npm run test:e2e` (328 unit + 29 e2e)
- [x] Production build clean: `npm run build` — no keys, no secrets in dist/
- [x] Merge rebuild → main, push, Cloudflare production live at https://tommy-21n.pages.dev/
- [x] Quick scan + timer test on production Chrome — all flows verified (2026-10-28)
- [x] Animated logo deployed (afc569a) — SW auto-reload active, signal CSS-class tests added

## What is ready

- **Timing engine.** Pure, tested, replays an append-only action log. 327 unit tests + shared test vectors (`test-vectors/timing.json`) the device firmware also runs.
- **Meeting builder.** Prepared speeches, evaluators (with brief), Table Topics by hand. Drag-reorder, duplicate last, pairing warnings. Templates (built-in and user-saved).
- **Meeting flow.** End meeting → view-only report; Past meetings; Reopen.
- **Built-in templates.** ToastED, Cape Town and Pinelands match their real agendas: order, timings, 1:00 briefs and pairings.
- **Timer.** Start → Stop → Next; Pause/Resume; accidental Stop → Resume (gap not counted); Re-time, Edit (with reason), Undo, Back. Mid-meeting reload keeps recorded time.
- **Speaker view.** Word + icon per signal (never colour alone), second screen, Zoom view.
- **Report.** Every timed item (speakers, evaluators, Table Topics), award eligibility with reason, WhatsApp copy, printable log.
- **Agenda scan.** `gemini-3.5-flash-lite` primary (fast free tier). Falls back to `gemini-3.8-flash` → `gemini-2.5-flash`. Key stays server-side only.
  - Only timed roles extracted (prompt change): prepared speakers, evaluators, Table Topics speakers. Non-timed roles shown collapsed in "Other roles (not timed)".
  - Per-model timeout 18 s so fallbacks kick in fast.
  - Images resized to 1 600 px JPEG 0.7 in-browser.
- **Scan review.** Flagged rows editable; non-timed rows collapsed; confirmation requires only timed flags resolved.
- **Service worker.** `skipWaiting: true` + `clientsClaim: true` — phones get updates automatically on next open. Update banner available if needed.
- **Offline.** Fully precached PWA. Scan is the only part that needs network.

## Scan speed (gemini-3.5-flash-lite, 2026-10-28)

New timed-roles-only prompt + lite model. All timed-role accuracy 100%.

| Fixture | Pages | Time | Timed roles | Names | Timings |
|---|---|---|---|---|---|
| ToastED, 6 Oct 2026 | 2 | **6.4 s** | 9/9 (100%) | 9/9 (100%) | 9/9 (100%) |
| Cape Town, 23 Sep 2026 | 1 | **6.6 s** | 10/10 (100%) | 10/10 (100%) | 10/10 (100%) |
| Pinelands, 15 Oct 2026 | 1 | **4.9 s** | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |

Non-timed roles (Toastmaster, Timer, Grammarian, etc.) are intentionally excluded by the prompt.

Previous run with `gemini-3.8-flash` (full agenda): roles 97%/100%/85%, timings 100%.

## Browser test results (2026-10-28, Chrome 390×844 + desktop)

All tested on production https://tommy-21n.pages.dev/ except scan (tested on local wrangler; production timing confirmed by eval:agendas).

| Test | Result |
|---|---|
| Build agenda by hand | ✅ Speaker + evaluator added, pairing warning shown |
| Timer tabs | ✅ Only Prepared speeches, Table Topics, Evaluations (no Opening/Reports) |
| Colours: green / amber / red | ✅ Green 5:30, Amber 6:38 (hatched), Red 7:14 (striped), Overtime (checkered) |
| Stop → Resume | ✅ Timer resumes correctly, gap not counted |
| Undo | ✅ Undid Stop, timer resumed |
| Edit time + reason | ✅ 7:34 → 6:30 "Started late", shown as "· edited" in report |
| Reload mid-timer | ✅ Timer restored at correct elapsed time, kept running |
| End meeting | ✅ Meeting ended, shown as view-only with Reopen/New meeting |
| Past meetings | ✅ Listed on new meeting draft screen, clickable to switch |
| Report | ✅ Edit annotation shown, award eligibility with reason |
| WhatsApp copy | ✅ "Report copied. Paste it into WhatsApp." toast |
| Scan (Cape Town fixture) | ✅ 10/10 items, no flags, 6.6 s in production (42 s local wrangler overhead) |

## What is in progress or deferred

- **Review screen extras.** Adding a new row and changing a role happen in the builder after confirming. Review state is in memory: reload during review means scan again. PDF pages not previewed.

## Known issues / post-meeting work

- Bench reports "TT Master miss" for ToastED and Cape Town — expected: the new timed-roles-only prompt intentionally skips the Table Topics Master (facilitator, not timed). The TT speakers themselves are returned correctly.
- 4 agenda rows across fixtures (1 ToastED, 3 Pinelands) come back merged by the model. Flags + review cover it at the meeting.
