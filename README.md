# Tommy

Smart timekeeper for Toastmasters meetings. Tommy times each speaker with green, amber and red signals, records exact times, imports the agenda from a photo, and produces the Timer's report at the end. It is an offline-first PWA: meetings, times and settings live in the browser (IndexedDB) and never leave the device. The agenda scan is the only part that talks to the network, and the key for it never reaches the browser.

Live preview: https://tommy-21n.pages.dev/

Tommy is not affiliated with Toastmasters International.

## Run as the Timer

1. Open the site. On the first visit, allow "Install app" so it keeps working if the Wi-Fi drops.
2. **Meeting** screen: either tap the agenda photo (Scan agenda) or add speakers, evaluators and Table Topics participants by hand. The builder warns about missing pairings but never blocks you.
3. **Start meeting** → the Timer opens on the first speaker.
4. The big button is Start → Stop → Next. The small row underneath has Pause/Resume, Re-time, Undo and the signal silencer.
5. If you tap Stop by mistake, Resume carries on from the time shown. The stopped gap is not counted. Edit on the result banner lets you correct the recorded time with a reason.
6. The **Report** screen shows every agenda item with the recorded time and award eligibility. **Copy for WhatsApp** gives you the Timer's text in one line.

Everything works with no network. Signals never rely on colour alone (every signal has a word and an icon).

## Develop

Node 22 (`.nvmrc`). Dependencies are pinned.

```bash
npm ci
npm run dev            # http://localhost:5173
npm test               # Vitest: unit, storage and component tests
npm run typecheck
npm run lint
npm run format         # Prettier (write); format:check to verify
npm run test:e2e       # Playwright + axe (builds and previews automatically)
npm run build          # type check + production build to dist/
npm run check:secrets  # runs after build; fails if a key or provider call reaches dist/
```

Before saying a task is done, run `npm run typecheck && npm run lint && npm test && npm run test:e2e`.

### Agenda scan

Agenda scan uses Google Gemini (`gemini-3.8-flash`, free tier) via a Cloudflare Pages Function at `/api/parse-agenda`. **The browser never has the API key.**

For local development:

1. Create a key in Google AI Studio (free).
2. Put it in `.env.local` (gitignored):

   ```
   GEMINI_API_KEY=…
   ```

3. Start the API locally with wrangler:

   ```
   npm run dev:api        # build + wrangler pages dev on http://localhost:8788
   ```

The browser calls `/api/parse-agenda` on its own origin. CSP in `public/_headers` allows no third-party origins.

## Deploy

Deploys to Cloudflare Pages from the `main` branch (production) and `rebuild` branch (preview).

- `GEMINI_API_KEY` is a Pages secret (set once per environment).
- The build runs `npm run build`, which ends with `check:secrets` to make sure no key reaches `dist/`.

See [CLAUDE.md](CLAUDE.md) for the project structure and the full set of rules, [docs/ROADMAP.md](docs/ROADMAP.md) for the 17-phase rebuild plan, [docs/TIMING_SPEC.md](docs/TIMING_SPEC.md) for the normative timing behaviour (shared with the device firmware), and [docs/STATUS.md](docs/STATUS.md) for the current state.

## Your data

Meetings, times and settings never leave the device. Use **Settings → Your data** to export a meeting or a full backup as JSON, and to import one. Importing a full backup can replace everything (a backup of the current data downloads first) or add the meetings as copies.
