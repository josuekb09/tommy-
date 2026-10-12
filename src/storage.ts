import { openDB } from "idb"
import type { Meeting, Settings } from "./engine/types"
const db = () => openDB("tommy", 1, { upgrade(database) { database.createObjectStore("meetings", { keyPath: "id" }); database.createObjectStore("settings") } })
// React can schedule several state effects before IndexedDB completes the
// preceding transaction. Keep writes in their state-change order so an older
// snapshot cannot win a race with a newer timer action (for example Reset).
let meetingWrite = Promise.resolve()
export function saveMeeting(meeting: Meeting) {
  const snapshot = structuredClone(meeting)
  meetingWrite = meetingWrite.catch(() => undefined).then(async () => {
    await (await db()).put("meetings", snapshot)
  })
  return meetingWrite
}
export async function loadMeetings() { return (await db()).getAll("meetings") as Promise<Meeting[]> }
export async function saveSettings(settings: Settings) { (await db()).put("settings", settings, "main") }
export async function loadSettings() { return (await db()).get("settings", "main") as Promise<Settings | undefined> }

export function findCurrentMeeting(meetings: Meeting[], currentMeetingId?: string): Meeting | undefined {
  if (!meetings.length) return undefined
  if (currentMeetingId) {
    const match = meetings.find(m => m.id === currentMeetingId)
    if (match) return match
  }
  return [...meetings].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]
}
