export type SegmentType = "speeches" | "evaluations" | "tableTopics"
export type TurnStatus = "queued" | "running" | "paused" | "done"
export type Thresholds = { green: number; yellow: number; red: number; disqualify?: number }
export type Turn = { id: string; name: string; role: string; thresholds: Thresholds; status: TurnStatus; startedAt?: number; elapsedMs: number; note?: string; edited?: boolean }
export type Segment = { id: string; type: SegmentType; turns: Turn[] }
export type Meeting = { id: string; date: string; title: string; segments: Segment[] }
export type Settings = { withinEarly: number; withinLate: number; disqualification: boolean; sound: boolean; vibration: boolean; colourBlind: boolean; dark: boolean; theme?: "system" | "light" | "dark"; presetOverrides?: Record<string, Thresholds> }
export const presets: Record<string, Thresholds> = {
  "Table Topics": { green: 60, yellow: 90, red: 120 },
  "Ice Breaker": { green: 240, yellow: 300, red: 360 },
  "Speech": { green: 300, yellow: 360, red: 420 },
  "Evaluation": { green: 120, yellow: 150, red: 180 },
}
export const defaultSettings: Settings = { withinEarly: 30, withinLate: 30, disqualification: false, sound: false, vibration: true, colourBlind: true, dark: false, theme: "system" }
