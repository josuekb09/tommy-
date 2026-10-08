import type { Segment, Settings } from "./types"
import { formatTime, withinTime } from "./timer"
export const reportRows = (segment: Segment, settings: Settings) => segment.turns.filter(t => t.status === "done").map(turn => ({ name: turn.name, role: turn.role, time: formatTime(turn.elapsedMs), within: withinTime(turn.elapsedMs, turn.thresholds, settings), edited: !!turn.edited }))
export const reportText = (segment: Segment, settings: Settings) => reportRows(segment, settings).map(row => `${row.name} — ${row.role}: ${row.time} (${row.within ? "within time" : "out of time"})`).join("\n")
