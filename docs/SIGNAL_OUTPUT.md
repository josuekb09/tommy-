# Signal outputs: how the signal reaches the speaker

Everything that shows the timing signal to the speaker is a **`SignalOutput`** ([src/engine/signal-output.ts](../src/engine/signal-output.ts)):

- the speaker view window, today;
- the Tommy device (LED ring, touchscreen, speaker), later;
- a room display on another device, later.

The Timer screen never talks to any of them directly.

```ts
interface SignalOutput {
  setSignal(signal: Signal, details: SignalDetails): void   // colour + who/what (no names in contest mode)
  setClock(clock: ClockState): void                         // baseline: elapsedMs at `at`, running?, visible?
  setSilent(silent: boolean): void                          // the Timer muted cues
  showExplanation(card: ExplainCard | null): void           // the "Explain the signals" card, or back to the signal
  close(): void
}
```

## Flow

```
Timer app (any screen)
  useSpeakerFeed ──► speakerSnapshot(data, selection) ──► createSignalPublisher(outputs).update(snapshot)
                                                              │ calls each output only when that part changed
                       ┌──────────────────────────────────────┼─────────────────────────────┐
              BroadcastOutput (same device)          FakeDeviceOutput (tests)      DeviceOutput (future)
              frames over BroadcastChannel,
              localStorage fallback, 1 s heartbeat
                       │
                 Speaker view / Zoom view windows (#/speaker, #/zoom)
```

## Rules every output follows

1. **Derive the clock locally.** `setClock` is sent only when the timer's action log changes (start, pause, offset, stop…), not every second. Between messages, an output computes `elapsed = elapsedMs + (now − at)` while running.
2. **Never freeze on a wrong colour.** `details.profile` carries the thresholds, so an output keeps computing the signal from its own clock (`displayAt`) even if messages stop. The speaker view shows **"Reconnecting…"** after 2 s without a frame (`LINK_TIMEOUT_MS`) and keeps advancing.
3. **Contest mode:** `details.person` is never set (the snapshot builder drops it), and outputs must not show names.
4. **Never colour alone:** an output shows the signal's word and/or a distinct shape or pattern as well as the colour. On the device, the LED ring is the colour and the screen shows the word and icon.
5. **Silent:** when `setSilent(true)`, an output with sound or vibration stays quiet. Visual signals continue.

## Adding the Tommy device or a cross-device room

1. Implement `SignalOutput` over the transport. This is the extension point:
   - Web Bluetooth, the device's own Wi-Fi page, or a WebSocket room. See `docs/DEVICE_PROTOCOL.md` (phase 14) for the message format.
   - Map `setSignal` to the LED ring and the screen, `setClock` to the screen clock, and `setSilent` to the amplifier and the vibration motor.
2. Pass it to `useSpeakerFeed(data, selectedId, explanation, [deviceOutput])` in [src/ui/App.tsx](../src/ui/App.tsx).
3. Test it the way [signal-output.test.ts](../src/engine/signal-output.test.ts) tests the fake device: feed snapshots to the publisher and assert the calls.

No screen code changes. Cross-device sync is **not** implemented yet. The current transport works between windows on the same device only.

## Same-device transport details

- **Channel:** `BroadcastChannel("tommy-signal")`. Where that is missing, `localStorage` key `tommy-signal`, where other windows receive a `storage` event.
- **Messages:**
  - `{ kind: "frame", frame }`: the whole state, with `v: 1`, `seq`, `sentAt`, `signal`, `details`, `clock`, `silent`, `explanation`.
  - `{ kind: "hello" }`: sent by a newly opened view. The Timer window answers at once.
- **Heartbeat:** the Timer window re-sends the latest frame every second, which is how views detect a lost link.
- **Placement:** `Present` opens the view with `window.open` inside the click. Where the Window Management API is available and allowed, it then moves the view to another screen. Otherwise it shows instructions. The Presentation API ("Cast to a display") is offered where Chrome supports it. A cast receiver that runs in a separate browser will not receive frames until cross-device sync exists.
