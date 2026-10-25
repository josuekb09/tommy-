import type { AgendaItem, TimingAction, WithinRule } from "../domain"
import { createTimer, type Timer } from "../engine/timing"
import { clock } from "./runtime"

const cache = new Map<string, { key: string; timer: Timer }>()

const sameLog = (a: readonly TimingAction[], b: readonly TimingAction[]) =>
  a.length === b.length && (a.length === 0 || JSON.stringify(a.at(-1)) === JSON.stringify(b.at(-1)))

/**
 * One engine timer per agenda item, kept across renders and database
 * refreshes so it remembers the last signal it reported. The stored action
 * log is always the source of truth: a different log (another tab, an import)
 * is loaded silently.
 */
export function timerFor(item: AgendaItem, withinRule: WithinRule, actions: readonly TimingAction[] = []): Timer {
  const t = item.timing
  const key = `${t.green}/${t.amber}/${t.red}/${t.graceSeconds}/${t.disqualifyEnabled}/${withinRule}`
  const entry = cache.get(item.id)
  if (!entry || entry.key !== key) {
    const timer = createTimer({ clock, profile: t, withinRule, actions: [...actions] })
    cache.set(item.id, { key, timer })
    return timer
  }
  if (!sameLog(entry.timer.actions, actions)) entry.timer.load([...actions])
  return entry.timer
}
