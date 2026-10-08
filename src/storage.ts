import { openDB } from "idb"
import type { Meeting, Settings } from "./engine/types"
const db = () => openDB("tommy", 1, { upgrade(database) { database.createObjectStore("meetings", { keyPath: "id" }); database.createObjectStore("settings") } })
export async function saveMeeting(meeting: Meeting) { (await db()).put("meetings", meeting) }
export async function loadMeetings() { return (await db()).getAll("meetings") as Promise<Meeting[]> }
export async function saveSettings(settings: Settings) { (await db()).put("settings", settings, "main") }
export async function loadSettings() { return (await db()).get("settings", "main") as Promise<Settings | undefined> }
