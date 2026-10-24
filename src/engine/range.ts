/** Thresholds read from an agenda, in whole seconds. A red-only time has no green or amber. */
export type ParsedRange = { green: number; amber: number; red: number; redOnly?: false } | { red: number; redOnly: true }
export type RangeResult = { profile: ParsedRange; reason?: undefined } | { profile: null; reason: string }

const fail = (reason: string): RangeResult => ({ profile: null, reason })
const MAX_SECONDS = 60 * 60

/**
 * Reads the timing an agenda prints for a slot, such as "5-7 min",
 * "4:00 5:00 6:00", "(5'-7')", "15mins" or "3:00". Green is the minimum, red
 * the maximum, and amber the midpoint unless it is printed. A single time is
 * a red-only limit. Anything ambiguous returns null with a reason: this
 * function never guesses.
 *
 * Clock values are minutes:seconds. A third group ("25:00:00", as printed by
 * some agenda templates) is hundredths of a second and must be zero: agendas
 * never time hours.
 */
export function profileFromRange(input: string): RangeResult {
  const text = input
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/[()[\]]/g, " ")
    .replace(/\b\d+(?:st|nd|rd|th)\b/g, " ")
    .trim()
  if (!/\d/.test(text)) return fail(text ? "No time found." : "Empty.")
  if (/\b(?:hours?|hrs?|h)\b/.test(text)) return fail("Hours are not a speaking time.")

  const clocks = [...text.matchAll(/\b(\d{1,3}):(\d{2})(?::(\d{2}))?\b/g)]
  if (clocks.length) {
    const rest = text.replace(/\b\d{1,3}:\d{2}(?::\d{2})?\b/g, " ")
    if (/\d/.test(rest)) return fail("Mixes clock times with other numbers.")
    const seconds: number[] = []
    for (const [, m, s, hundredths] of clocks) {
      if (hundredths && hundredths !== "00") return fail(`Cannot tell what "${m}:${s}:${hundredths}" means.`)
      if (Number(s) >= 60) return fail(`"${m}:${s}" is not a valid time.`)
      seconds.push(Number(m) * 60 + Number(s))
    }
    return fromValues(seconds)
  }

  const numbers = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]))
  const inSeconds = /\d\s*(?:seconds?|secs?|s|")(?![a-z])/.test(text)
  const inMinutes = /\d\s*(?:minutes?|mins?|m|')(?![a-z])/.test(text)
  if (inSeconds && inMinutes) return fail("Mixes minutes and seconds.")
  const isRange = numbers.length === 2 && /\d\s*'?\s*(?:-|to)\s*\d/.test(text)
  // A bare "5-7" is the usual agenda shorthand for minutes; a bare "5" is not enough to know.
  if (!inSeconds && !inMinutes && !isRange) return fail('No unit: write it as minutes, e.g. "5 min".')
  const factor = inSeconds ? 1 : 60
  const values = numbers.map(n => n * factor)
  if (values.some(v => !Number.isInteger(v))) return fail("Times must be whole seconds.")
  return fromValues(values)
}

function fromValues(values: number[]): RangeResult {
  if (values.length > 3) return fail("Too many times: expected green, amber and red at most.")
  if (values.some(v => v <= 0)) return fail("Times must be greater than zero.")
  if (values.some(v => v > MAX_SECONDS)) return fail("Longer than 60 minutes.")
  if (values.length === 1) return { profile: { red: values[0], redOnly: true } }
  if (values.some((v, i) => i > 0 && v <= values[i - 1])) return fail("Times must increase from green to red.")
  const [green, middle, last] = values
  if (values.length === 2) return { profile: { green, amber: Math.floor((green + middle) / 2), red: middle } }
  return { profile: { green, amber: middle, red: last } }
}
