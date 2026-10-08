# Codex prompt: Tommy UI redesign (paste this as your message)

Read `AGENTS.md` first (domain rules and timer logic stay unchanged). Your job now is a **complete visual redesign of the UI**. The current UI is not acceptable: it looks generic and unfinished (flat empty cards, default-looking selects, no real timer display). Do not touch `src/engine/` or its tests except to fix real bugs.

## Source of truth
1. The Figma exports in `/design/*.png`. **Reproduce them faithfully**: layout, spacing, hierarchy, colours, type, corner radii. Open every image before coding. Where a screen is missing, extend it in the same visual language.
2. Brand assets in `/brand` (copy these into `public/` and use them): `Tommy-logo-light.svg`, `Tommy-logo-dark.svg`, `Tommy-mark.svg`, `Tommy-app-icon.svg`. Use the app icon for the PWA manifest (generate 192 and 512 PNGs) and the favicon, and the logo lockup in the header. Never redraw or recolour the logo.

## Design tokens (define as CSS variables, light and dark)
- Navy `#14213D` (text, dark surfaces), Blue `#1F5FBF` (primary action), Green `#1FA463`, Yellow `#F2B705`, Red `#E5484D`.
- Light: background `#F6F7FA`, surface `#FFFFFF`, border `#E3E6EC`, muted text `#5B6475`.
- Dark: background `#0E1524`, surface `#16213A`, border `#26324D`, text `#F2F5FA`.
- Fonts: **Inter** for UI, **JetBrains Mono** (or Inter with `font-variant-numeric: tabular-nums`) for time digits. Self-host the font files so it works offline.
- 8 px spacing grid. Radii: 12 px controls, 20 px cards. One soft shadow only. No gradients except the full-screen timer state colour fade. No emoji icons: use a consistent line icon set (Lucide).

## Quality bar (read carefully)
It must look like a hand-crafted, professional product, **not AI-generated**. That means: restrained palette, strong typographic hierarchy, generous whitespace, real content in every state, no decorative blobs, no default browser controls (style or replace native `<select>`), no centered-everything layouts, no inconsistent button sizes. Every tap target at least 48 px; primary actions at least 64 px high on the timer screen.

## Screens (mobile first, 390 px; centred max-width 480 px on desktop with a calm background)
1. **Timer (main screen)**
   - Header: logo lockup left, settings icon right. Under it a segment switcher (Speeches / Evaluations / Table Topics) as a segmented control, not a select.
   - Current speaker card: name, role, small threshold pills (G 5:00, Y 6:00, R 7:00).
   - A **huge** time display (at least 96 px, tabular digits) centred, with a thin progress ring or bar showing position between thresholds.
   - The whole timer area changes state: neutral, green, yellow, red, overtime. Colour fade 300 ms, with a text label ("Green", "Yellow", "Red", "Over time") so it works without colour. Optional colour-blind pattern from settings.
   - Controls: one large Start/Pause button, a Stop button, a row of catch-up chips **+5 s, +10 s, +30 s**, and an Undo.
   - "Up next" list below with the next 2 speakers; tap to switch.
   - **Idle state** (no speaker selected) shows a designed prompt with the first queued speaker pre-selected and a big "Start" button, never an empty card.
2. **Queue**
   - Segment sections with their speakers as list rows (drag handle, name, role, thresholds, status chip: Queued / Done 4:12).
   - "Add speaker" opens a bottom sheet (name, role, optional custom thresholds). "Add guest" is a one-tap quick action inside Table Topics with a recent-names suggestion row.
   - Empty state: friendly, short, with one action.
3. **Report (segment report)**
   - Segment tabs at the top. Table: Name, Time, Within time (check or cross, plus text). Totals row.
   - Actions: Read aloud, Copy, Export PDF (clear icon buttons with labels).
   - Empty state when nothing is recorded yet.
4. **Log**: the whole meeting, grouped by segment, same table style, Export PDF, and the ability to tap a time to edit it (mark as edited).
5. **Settings**: thresholds per role, within-time rule, sound and vibration, colour-blind cues, theme (system / light / dark), club name. Grouped in cards with clear labels.

## Interaction details
- Bottom navigation: Timer, Queue, Report, Log, Settings, with icons and labels; active item clearly marked.
- Haptics (`navigator.vibrate`) and a short tone at each threshold, if enabled.
- Respect `prefers-reduced-motion`.
- Keep the screen awake (Wake Lock) while a timer is running.

## Verification (do this yourself before you reply)
1. Add Playwright as a dev dependency. Script a mock meeting: 2 speeches, 2 evaluations, 3 Table Topics guests (one added live).
2. Take screenshots of every screen and state (idle, running, green, yellow, red, overtime, each report, empty states) at 390x844 and at 1280x800, light and dark. Save them in `/screenshots`.
3. Compare each against `/design` and list every difference you could not match, with the reason.
4. Run `npm run build` and `npm test`; all tests must pass.
5. Check Lighthouse (PWA, accessibility >= 95) and fix what you can.

## Do not
- Do not change the timer engine's behaviour or the data model without telling me.
- Do not add a backend, accounts or analytics.
- Do not leave placeholder text, lorem ipsum, or unstyled elements.

Reply with: what you built, the screenshots folder, the list of unmatched differences, and the test results.
