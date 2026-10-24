# Tommy

A timer for speaking clubs and Toastmasters-style meetings. Tommy times each speaker with green, amber and red signals, records exact times, and produces the Timer's report. It is an offline-first PWA: everything is stored on the device in IndexedDB.

Tommy is not affiliated with Toastmasters International.

## Develop

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run typecheck
npm run lint
npm run test:e2e     # Playwright (builds and serves the production bundle)
```

See [CLAUDE.md](CLAUDE.md) for the project structure and rules, and [docs/AUDIT.md](docs/AUDIT.md) for the October 2026 audit.

## Your data

Meetings, times and settings never leave the device. Use **Settings → Your data** to export a meeting or a full backup as JSON, and to import one. Importing a full backup can replace everything (a backup of the current data downloads first) or add the meetings as copies.
