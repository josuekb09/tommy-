# Tommy — Phase 1

Build a mobile-first, offline PWA for Toastmasters meeting timers. It stores meetings locally, with independent **speeches**, **evaluations**, and **tableTopics** segments. Each turn has persisted timestamp-derived timing, configurable thresholds, catch-up offsets, editable recorded times, and segment-specific reports. Keep timing logic framework-free in `src/engine`; no backend or hardware in this phase. Use React, TypeScript, IndexedDB, Vitest, and a small dependency footprint.

The primary acceptance path is a full offline meeting: two speeches, two evaluations, and three Table Topics guests (including one added live), followed by the three segment reports and an exportable log.
