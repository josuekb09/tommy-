/** Someone the Timer can pick from: a club member or a guest from an earlier meeting. */
export type Person = { id: string; name: string; aliases?: string[]; kind: "member" | "guest" }

export type PersonMatch = {
  person: Person
  /** Lower is closer: 0 is the same name. */
  cost: number
  /** Same name apart from case, accents, spacing and punctuation. */
  sameName: boolean
}

/** Lower case, accents removed, punctuation and extra spaces collapsed: "José-Kabuya " → "jose kabuya". */
export const normalizeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

const tokens = (name: string) => normalizeName(name).split(" ").filter(Boolean)

/** Edit distance counting a swap of two neighbouring letters as one edit. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

/** Typos allowed for a typed word: none for short words, so "Al" never matches "Ed". */
const allowance = (length: number) => (length >= 6 ? 2 : length >= 4 ? 1 : 0)

/** How close one typed word is to one word of a name, or undefined when it is not a match. */
function wordCost(typed: string, word: string): number | undefined {
  if (typed === word) return 0
  if (word.startsWith(typed)) return 1 // still typing
  const allowed = allowance(typed.length)
  if (!allowed) return undefined
  const full = editDistance(typed, word)
  if (full <= allowed) return 2 + full
  const start = editDistance(typed, word.slice(0, typed.length))
  return word.length > typed.length && start <= allowed ? 3 + start : undefined
}

/** Every typed word must match a different word of the name. */
function nameCost(typed: string[], name: string): number | undefined {
  const words = tokens(name)
  let total = 0
  for (const t of typed) {
    let best: { cost: number; index: number } | undefined
    words.forEach((word, index) => {
      const cost = wordCost(t, word)
      if (cost !== undefined && (!best || cost < best.cost)) best = { cost, index }
    })
    if (!best) return undefined
    total += best.cost
    words.splice(best.index, 1)
  }
  // An unmatched extra word in the stored name ("Ada" for "Ada Lovelace") is fine; it just ranks lower.
  return total + words.length * 0.1
}

/**
 * People whose name looks like what was typed, closest first. Lenient about
 * case, accents, word order and small typos (Kabuya, Kubaya, Kambuya). It only
 * suggests: callers must let the user pick, and never merge people on a match.
 */
export function matchPeople(query: string, people: Person[], limit = 5): PersonMatch[] {
  const typed = tokens(query)
  if (!typed.length) return []
  const target = normalizeName(query)
  return people
    .flatMap(person => {
      const names = [person.name, ...(person.aliases ?? [])]
      const costs = names.map(name => nameCost(typed, name)).filter((cost): cost is number => cost !== undefined)
      if (!costs.length) return []
      return [{ person, cost: Math.min(...costs), sameName: names.some(name => normalizeName(name) === target) }]
    })
    .sort((a, b) => Number(b.sameName) - Number(a.sameName) || a.cost - b.cost || a.person.name.localeCompare(b.person.name))
    .slice(0, limit)
}

/** "Kubaya, Kambuya; Josue" → other spellings of a name: trimmed, without repeats or the name itself. */
export function parseAliases(text: string, name: string): string[] {
  const seen = new Set([normalizeName(name)])
  return text
    .split(/[,;\n]/)
    .map(alias => alias.trim().replace(/\s+/g, " "))
    .filter(alias => {
      const key = normalizeName(alias)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}
