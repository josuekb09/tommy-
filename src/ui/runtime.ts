import { createWallClock } from "../engine/timing"
import { TommyDB } from "../storage/db"
import { migrateLegacyIfNeeded } from "../storage/migrate-legacy"
import { createRepository } from "../storage/repository"

/** The single clock used for every timing action and display on this device. */
export const clock = createWallClock()
export const db = new TommyDB()
export const repo = createRepository(db, { now: clock })

export async function boot() {
  await migrateLegacyIfNeeded(db)
  await repo.meetings.current()
}
