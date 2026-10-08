# Codex prompt: bug fixes, responsive layout, and full testing

Do not change `src/engine/` behaviour. This pass fixes visible bugs, makes Tommy work properly on phone, tablet and PC, and proves it with automated tests.

## 1. Bugs seen in the current screenshots (fix all)
1. **Bottom navigation**: a dark grey pill sits on top of the "Report" tab and hides its label/icon on every screen. Remove it (or move it below the nav as a safe-area spacer, never overlapping).
2. **Inconsistent app width**: Settings renders about 240 px wide while Timer, Queue, Report and Log render about 360 px. The container width must be fixed by the layout (not by the content). All screens use the same width at the same viewport.
3. **Text is far too small and low contrast**: eyebrow labels ("READY WHEN YOU ARE", "Catch up", "Reset", "Undo reset"), chips, table text and nav labels. Minimum body text 16 px, secondary 14 px, nav labels 12 px, nothing below 12 px. Muted text must reach contrast 4.5:1.
4. **Touch targets**: catch-up chips (+5 s, +10 s, +30 s), Stop, Reset, Undo, tabs and nav items must be at least 48 x 48 px. Start is at least 72 px high.
5. **Disabled Start/Stop look washed out and broken**. Use a clear disabled style with readable text, and show why it is disabled ("Choose a speaker first").
6. **Settings**: threshold inputs are about 25 px wide (unusable); club name and date are truncated. Use full-width rows with proper numeric inputs (m:ss format), and add the theme option **System / Light / Dark** (System is default).
7. **Segment switcher**: it appears on Log, where it makes no sense (the log shows everything), and it duplicates the accordion on Queue. Show it only on Timer and Report.
8. **"Up next" card** shows the segment name as its title. It must show the next speaker's name and role, or a short "No one queued" message with an Add speaker button.
9. **Duplicate actions**: Queue has two "Add speaker" buttons; Log has two export controls. Keep one clear primary action per screen.
10. **Timer idle screen** is mostly empty and the ring is barely visible. Make the ring and time the visual centre of the screen.

## 2. Responsive layout (design all three, test all three)
- **Phone, under 640 px**: single column, bottom nav, current layout (after fixes). Respect safe areas (`env(safe-area-inset-*)`).
- **Tablet, 640 to 1023 px (portrait and landscape)**: replace the bottom nav with a left navigation rail. Two columns: the timer (large) on the left, "Up next" and the current segment's queue on the right. Landscape must not scroll for the main timing controls.
- **Desktop, 1024 px and up**: three zones: left navigation rail, central timer (very large digits), right panel with the segment queue and recorded times updating live. Content max width about 1280 px, centred. No narrow column floating in empty space.
- Use CSS container/media queries and fluid type (`clamp()`). No horizontal scroll at any width from 320 to 2560 px. Support browser zoom up to 200%.
- **Speaker display mode** (new): a full-screen button on the timer that shows only the huge time and the full-screen green/yellow/red colour with its text label, so a tablet or laptop can be placed facing the speaker. Tap to exit. Keep the screen awake.

## 3. Seed data for design review
Add a hidden `?demo=1` URL flag that loads a realistic mock meeting: 2 speeches (one Ice Breaker), 2 evaluations, 3 Table Topics speakers with recorded times, one over time, one within time, one currently running. Use it for all screenshots so every screen shows real content (not only empty states).

## 4. Automated tests (Playwright + Vitest, all must pass)
- **End-to-end full meeting** with `page.clock` (fake time): add speakers, start, +30 s catch-up, thresholds fire at the right second, pause/resume, stop, add a guest live, give the three segment reports, export. Assert the recorded times exactly.
- **Persistence**: reload mid-timer and the elapsed time stays correct; close and reopen the page and the meeting is still there.
- **Offline**: `context.setOffline(true)` after first load; the app still works and saves.
- **Responsive matrix** (390x844, 768x1024, 1024x768, 1280x800, 1920x1080, in light and dark): no horizontal overflow, nothing clipped, nav never overlaps content, all interactive elements at least 48 px.
- **Accessibility**: `@axe-core/playwright` on every screen and state with zero serious or critical violations; keyboard-only navigation works; visible focus; every colour state also has a text label.
- **Screenshots** of every screen and state from the matrix above (using `?demo=1`) into `/screenshots`, named `screen-viewport-theme.png`.
- Try Lighthouse against `vite preview` using Playwright's Chromium; if it still cannot run, say exactly why and skip it.

## 5. Report back
List each numbered bug and how you fixed it, the screenshots folder, test results (counts and any failures), and anything you could not do. Do not claim something is fixed unless a test or screenshot proves it.
