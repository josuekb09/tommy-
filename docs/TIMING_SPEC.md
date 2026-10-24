# Tommy timing specification (v1)

This document defines how Tommy measures speaking time, chooses signals and judges results. The web app ([src/engine/timing/](../src/engine/timing/)) and the Tommy device firmware (ESP32-S3) must behave identically. The shared test vectors in [test-vectors/timing.json](../test-vectors/timing.json) are the acceptance test for both. If this document and the vectors disagree, the vectors win and this document has a bug.

All times are **integer milliseconds**. Thresholds in a profile are **integer seconds**. No floating point is needed anywhere.

## 1. Clock

The engine never reads a clock itself. The host passes in a function `now() → ms`. Requirements for that function:

- **It keeps counting while the device sleeps.** A speech timed across a locked phone screen must include the locked time.
- **It never goes backwards.** If the underlying source steps back (for example after an OS clock correction), return the last value again until the source catches up.
- **It shares an epoch with the stored timestamps** if timers must survive a restart.

The web app uses `Date.now()` clamped to be non-decreasing ([clock.ts](../src/engine/timing/clock.ts)). It does not use `performance.now()`, because that stops advancing during device suspend on many phones. On the ESP32, use a hardware timer that keeps running in light sleep (e.g. `esp_timer_get_time() / 1000`), or the RTC if deep sleep is used.

## 2. The action log is the state

A timer is stored only as an ordered list of actions. Everything else is derived by replaying it from the start.

| Action | Fields | Accepted when |
|---|---|---|
| `start` | `at` | status is `idle` |
| `pause` | `at` | status is `running` |
| `resume` | `at` | status is `paused` |
| `stop` | `at` | status is `running` or `paused` |
| `reset` | `at` | status is not `idle`, or there are offsets |
| `offset` | `at`, `ms` (integer, may be negative) | status is not `idle`, and the applied amount (see below) is not 0 |
| `edit` | `at`, `ms` (integer ≥ 0), `reason` | status is `stopped` and `reason` is not blank after trimming |
| `undo` | `at` | at least one accepted action has not been undone yet |

- **An action that is not accepted is ignored.** It changes nothing and is **not stored**. This is how a double-tapped Start, a Stop before Start, or an edit without a reason are handled.
- **Timestamps in a log never decrease.**
- **A restart (page refresh, device reboot) simply replays the stored log.** There is no special recovery logic.

### Derived state

```
status        idle | running | paused | stopped
runningSince  start of the current running interval (only while running)
intervalsMs   sum of completed running intervals
offsetsMs     list of applied offsets, in order
overrideMs    set by an edit; replaces the computed time
edits         list of { at, fromMs, toMs, reason }
startedAt     time of the accepted start
stoppedAt     time of the accepted stop
```

Effect of each accepted action:

- **start:** status = running, runningSince = at, startedAt = at.
- **pause:** intervalsMs += at − runningSince, then status = paused.
- **resume:** status = running, runningSince = at.
- **stop:** close the running interval if running, then status = stopped, stoppedAt = at.
- **reset:** return to the initial state (idle, zero, no offsets, no edits). The previous values stay in the log, so the reset can be undone.
- **offset:** applied = max(ms, −elapsed(at)), so an offset can only take the time down to zero. Append `applied` to offsetsMs. If overrideMs is set, add `applied` to it as well.
- **edit:** append { at, fromMs: elapsed(at), toMs: ms, reason: trimmed reason } to edits, then set overrideMs = ms. The original value is never lost: it stays in `fromMs` and in the log.
- **undo:** restore the state exactly as it was before the most recent accepted, not-yet-undone action. Two undos step back twice.
  - Undoing a stop means the timer was never stopped: it is running again and has counted the whole time since the start.

### Elapsed time

```
elapsed(now) = overrideMs                                          if set
             = max(0, intervalsMs + (now − runningSince if running) + sum(offsetsMs))
```

## 3. Profiles and signals

```
profile = {
  green, amber, red,            // seconds
  graceSeconds,                 // seconds after red (and before green, unless graceUnderSeconds is set)
  disqualifyEnabled,            // bool: contest rules
  graceUnderSeconds?,           // seconds before green; default graceSeconds (Table Topics contests: 0)
  redOnly?,                     // bool, default false: only a red limit, no green/amber, no minimum time
  redAt?,                       // "reach" (default) | "exceed": red at t ≥ red, or only at t > red
  overtime?                     // "afterGrace" (default) | "never": stay on red instead of showing overtime
}
```

- **A missing optional field means its default.**
- **The host resolves club rules into these fields before timing:** the grace length, the Table Topics exception, the amber rule, red on reaching or exceeding, and the overtime behaviour. The engine never looks at club settings.
- **In a red-only profile,** green and amber are stored equal to red and are ignored.

Let `limit = (red + graceSeconds) × 1000` and `exceed = (redAt == "exceed")`. The signal for an elapsed time `t` (ms) is the first row that matches, from top to bottom:

| Condition | Signal |
|---|---|
| status is `idle` | `none` |
| t > limit and disqualifyEnabled | `disqualified` |
| t > limit and overtime ≠ "never" and not (exceed and graceSeconds = 0) | `overtime` |
| exceed ? t > red × 1000 : t ≥ red × 1000 | `red` |
| redOnly | `none` |
| t ≥ amber × 1000 | `amber` |
| t ≥ green × 1000 | `green` |
| otherwise | `none` |

- **Each signal starts exactly at its threshold.** For a 5:00 green, `299 999 → none` and `300 000 → green`. With `redAt: "exceed"`, red starts 1 ms after the maximum.
- **Overtime starts 1 ms after the grace period ends.** This matches the contest qualification boundary below.
- **With red-on-exceed and no grace,** red itself is the final signal, because an immediate overtime would hide it.
- **Table Topics normally has a grace period of 0.** The club setting decides, and the profile already contains the resolved value.

The device shows the signal colour and must always show a non-colour cue as well (text, icon or pattern). Signals never rely on colour alone.

## 4. Results

The club's within-time rule is either `strict` or `grace`. Contest profiles (`disqualifyEnabled`) always use the grace window.

```
useGrace = (rule == "grace") or disqualifyEnabled
over     = useGrace ? graceSeconds : 0
under    = useGrace ? (graceUnderSeconds ?? graceSeconds) : 0
min      = redOnly ? 0 : max(0, green − under) × 1000
max      = (red + over) × 1000
result   = under   if t < min
           over    if t > max
           within  otherwise          // both edges are within
if disqualifyEnabled and result ≠ within: result = disqualified
```

Examples with the default 30-second grace:

| Profile | Qualifies (inclusive) |
|---|---|
| Speech contest, 5 to 7 min | 4:30.000 to 7:30.000 |
| Evaluation contest, 2 to 3 min | 1:30.000 to 3:30.000 |
| Table Topics contest, 1 to 2 min (graceUnderSeconds 0) | 1:00.000 to 2:30.000 |

## 5. Events

The host evaluates the timer at **evaluation points**. There are two kinds:

- **Actions.** At an action's time, the signal is first evaluated, then the action is applied, then the signal is evaluated again.
- **Ticks.** The host calls `tick()` from its loop. The web app ticks exactly on each whole second of elapsed time. The firmware should tick at least 10 times a second.

At each evaluation, if the signal differs from the last reported signal, emit `signalChanged { at, elapsedMs, from, to }`.

Accepted actions emit:

| Action | Event |
|---|---|
| start | `started` |
| pause | `paused` |
| resume | `resumed` |
| stop | `stopped` |
| reset | `reset` |
| undo | `undone` |
| offset | `offsetApplied` (with `ms` = the applied amount) |
| edit | `edited` (with `fromMs` and `reason`) |

All events carry `{ at, elapsedMs }`, where elapsedMs is the value after the action.

**Loading a stored log emits nothing.** After a restart the last reported signal is set to the current signal silently. This is why a refresh never replays a buzz.

Cues (vibration, sound, LED flash) are triggered only by `signalChanged` events where the timer is running and the new signal ranks higher than the old one. The rank order is none < green < amber < red < overtime < disqualified.

## 6. Test vector file format

```jsonc
{
  "format": "tommy-timing-vectors",
  "version": 1,
  "profiles": { "<id>": { "green": 300, "amber": 360, "red": 420, "graceSeconds": 30, "disqualifyEnabled": false } },
  "scenarios": [
    {
      "name": "unique-kebab-case-name",
      "description": "optional",
      "profile": "<id>",
      "withinRule": "grace",            // optional, "grace" (default) or "strict"
      "actions": [ { "type": "start", "at": 0 }, { "type": "offset", "at": 1000, "ms": 5000 } ],
      "ignored": [ 1 ],                 // optional: indexes of actions that must be rejected; default []
      "expect": [                       // checkpoints
        { "at": 300000, "status": "running", "elapsedMs": 300000, "signal": "green",
          "result": "within",           // optional: checked only if present
          "offsetsMs": [5000],          // optional
          "edits": [ { "at": 0, "fromMs": 0, "toMs": 0, "reason": "" } ] }  // optional
      ],
      "events": [ { "type": "started", "at": 0, "elapsedMs": 0 } ]    // optional: the complete ordered event list
    }
  ]
}
```

### How to run a scenario

1. Create a timer with the scenario's profile and within-time rule, and an empty log.
2. Merge `actions` and `expect` into one timeline, sorted by `at`. At equal times, actions come before checkpoints. Ties within a kind keep file order.
3. Walk the timeline with the clock set to each point's `at`:
   - **Action:** dispatch it without its `at` (the timer stamps it with the clock). If it is rejected, record its index as ignored.
   - **Checkpoint:** call `tick()`, then compare `status`, `elapsedMs`, `signal`, and any optional fields that are present.
4. The ignored indexes must equal `ignored`. If `events` is present, the full list of emitted events must equal it, in order.

The reference runner is [vectors.test.ts](../src/engine/timing/vectors.test.ts) (`npm test`).

### Adding scenarios

- Add a vector whenever a timing bug is found, in the same change as the fix.
- Never edit an existing expectation to make an implementation pass.
- Changing the meaning of an existing scenario is a breaking change to this spec, so bump `version`.
