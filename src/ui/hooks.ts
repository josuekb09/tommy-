import { useEffect, useState, useSyncExternalStore } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import type { TimingAction } from "../domain"
import { rulesOf } from "../engine/profiles"
import { normalizeClub } from "../storage/repository"
import { elapsedAt, stateOf } from "../engine/timing"
import { clock, db, repo } from "./runtime"

export type Route = "meeting" | "timer" | "report" | "settings"
const routes: Route[] = ["meeting", "timer", "report", "settings"]

const readRoute = (): Route => {
  const hash = window.location.hash.replace(/^#\/?/, "") as Route
  return routes.includes(hash) ? hash : "timer"
}

/** Hash routing keeps the browser back button working without a router dependency. */
export function useRoute(): [Route, (route: Route) => void] {
  const route = useSyncExternalStore(listener => {
    window.addEventListener("hashchange", listener)
    return () => window.removeEventListener("hashchange", listener)
  }, readRoute)
  return [route, next => (window.location.hash = `/${next}`)]
}

/** Re-renders on an interval while active. Display only: timing comes from stored actions. */
/**
 * Re-renders exactly when the next whole second of elapsed time begins, so the
 * clock digits and the signal colour change right on each threshold instead
 * of up to one polling interval late. Returns the current time.
 */
export function useSecondTicks(active: boolean, actions: TimingAction[] | undefined) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const state = stateOf(actions ?? [])
    let id: ReturnType<typeof setTimeout>
    const schedule = () => {
      const untilNextSecond = 1000 - (elapsedAt(state, clock()) % 1000)
      id = setTimeout(() => {
        setTick(tick => tick + 1)
        schedule()
      }, untilNextSecond)
    }
    schedule()
    return () => clearTimeout(id)
  }, [active, actions])
  return clock()
}

/** Everything the screens show, kept live from IndexedDB (including changes from other tabs). */
export function useAppData() {
  return useLiveQuery(async () => {
    const settings = await repo.settings.get()
    const meeting = settings.currentMeetingId ? await db.meetings.get(settings.currentMeetingId) : undefined
    const records = meeting ? await db.timedRecords.where("meetingId").equals(meeting.id).toArray() : []
    const club = normalizeClub(settings.currentClubId ? await db.clubs.get(settings.currentClubId) : undefined)
    const guests = await db.guests.toArray()
    return { settings, meeting, records, rules: rulesOf(club), clubProfiles: club?.profiles ?? {}, club, guests }
  })
}
export type AppData = NonNullable<ReturnType<typeof useAppData>>

export type WriterLock = "pending" | "owner" | "other"

/**
 * Only one tab may change timers at a time, so two open tabs can never
 * overwrite each other. Browsers without Web Locks are treated as owners.
 */
export function useWriterLock(): WriterLock {
  const [state, setState] = useState<WriterLock>(navigator.locks ? "pending" : "owner")
  useEffect(() => {
    if (!navigator.locks) return
    const controller = new AbortController()
    const { signal } = controller
    // Holds the lock until this effect is cleaned up. A grant that arrives after
    // cleanup (React StrictMode mounts effects twice) is released immediately.
    const hold = () => {
      if (signal.aborted) return
      setState("owner")
      return new Promise<void>(resolve => signal.addEventListener("abort", () => resolve()))
    }
    navigator.locks
      .request("tommy-writer", { ifAvailable: true }, lock => {
        if (lock) return hold()
        if (signal.aborted) return
        setState("other")
        // Wait in line so this tab takes over when the other one closes.
        navigator.locks.request("tommy-writer", { signal }, hold).catch(() => undefined)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])
  return state
}

/** Keeps the screen on while enabled, re-acquiring after the tab becomes visible again. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return
    let sentinel: WakeLockSentinel | undefined
    let cancelled = false
    const acquire = () => {
      if (document.visibilityState !== "visible") return
      navigator.wakeLock
        .request("screen")
        .then(lock => (cancelled ? void lock.release() : (sentinel = lock)))
        .catch(() => undefined) // Refusal (battery saver, permissions) is not an error for the Timer.
    }
    acquire()
    document.addEventListener("visibilitychange", acquire)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", acquire)
      void sentinel?.release()
    }
  }, [enabled])
}
