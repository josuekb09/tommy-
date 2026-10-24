export type Clock = () => number

/**
 * Wall-clock time that never runs backwards.
 *
 * `performance.now()` is monotonic but, on many phones, stops advancing while
 * the device is suspended with the screen locked, so it would undercount a
 * speech timed across a screen lock. `Date.now()` keeps counting through
 * sleep but can step backwards when the OS corrects its clock. This clock uses
 * real time and clamps backward steps, so elapsed time never decreases.
 */
export function createWallClock(source: Clock = () => Date.now()): Clock {
  let last = -Infinity
  return () => {
    last = Math.max(last, Math.floor(source()))
    return last
  }
}
