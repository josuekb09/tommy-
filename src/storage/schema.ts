import { z } from "zod"
import { agendaRoles, type AppSettings, type Club, type Guest, type Meeting, type Member, type TimedRecord, type Template } from "../domain"

const profile = z.object({
  green: z.number(),
  amber: z.number(),
  red: z.number(),
  graceSeconds: z.number(),
  disqualifyEnabled: z.boolean(),
  graceUnderSeconds: z.number().optional(),
  redOnly: z.boolean().optional(),
  redAt: z.enum(["reach", "exceed"]).optional(),
  overtime: z.enum(["afterGrace", "never"]).optional(),
})
const signal = z.enum(["none", "green", "amber", "red", "overtime", "disqualified"])
const action = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["start", "pause", "resume", "stop", "reset", "undo"]), at: z.number() }),
  z.object({ type: z.literal("offset"), at: z.number(), ms: z.number() }),
  z.object({ type: z.literal("edit"), at: z.number(), ms: z.number(), reason: z.string() }),
])
const item = z.object({
  id: z.string(),
  order: z.number(),
  role: z.enum(agendaRoles),
  personId: z.string().optional(),
  personName: z.string(),
  speechTitle: z.string().optional(),
  pathwaysProject: z.string().optional(),
  evaluatesItemId: z.string().optional(),
  profileId: z.string().optional(),
  timing: profile,
})
const segment = z.object({
  id: z.string(),
  kind: z.enum(["opening", "prepared_speeches", "table_topics", "evaluations", "reports", "other"]),
  items: z.array(item),
})
const meeting = z.object({
  id: z.string(),
  clubId: z.string().optional(),
  date: z.string(),
  theme: z.string().optional(),
  wordOfTheDay: z.string().optional(),
  segments: z.array(segment),
  status: z.enum(["draft", "live", "finished"]),
  createdAt: z.number(),
  updatedAt: z.number(),
})
const record = z.object({
  agendaItemId: z.string(),
  meetingId: z.string(),
  actions: z.array(action),
  status: z.enum(["idle", "running", "paused", "stopped"]),
  startedAt: z.number().optional(),
  stoppedAt: z.number().optional(),
  elapsedMs: z.number(),
  offsetsMs: z.array(z.number()),
  edits: z.array(z.object({ at: z.number(), fromMs: z.number(), toMs: z.number(), reason: z.string() })),
  signalReached: signal,
  legacy: z.boolean().optional(),
})
// Defaults let files saved before a rule existed still import.
const rules = z.object({
  graceEnabled: z.boolean().default(true),
  graceSeconds: z.number(),
  graceAppliesToTableTopics: z.boolean(),
  withinRule: z.enum(["strict", "grace"]),
  amberRule: z.enum(["printed", "midpoint", "beforeRed"]).default("printed"),
  amberBeforeRedSeconds: z.number().default(60),
  redAt: z.enum(["reach", "exceed"]).default("reach"),
  overtime: z.enum(["afterGrace", "never"]).default("afterGrace"),
  contestMode: z.boolean(),
  reportStyle: z.enum(["exact", "category"]),
})
const definition = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["speech", "evaluation", "table_topics", "role", "contest", "custom"]),
  green: z.number().optional(),
  amber: z.number().optional(),
  red: z.number(),
  redOnly: z.boolean().optional(),
  contest: z.object({ graceOverSeconds: z.number(), graceUnderSeconds: z.number() }).optional(),
})
const club = z.object({
  id: z.string(),
  name: z.string(),
  number: z.string().optional(),
  district: z.string().optional(),
  defaultRules: rules,
  profiles: z.record(z.string(), definition).optional(),
})
const member = z.object({ id: z.string(), name: z.string(), aliases: z.array(z.string()) })
const guest = z.object({ id: z.string(), name: z.string(), addedAt: z.number() })
const template = z.object({ id: z.string(), clubId: z.string().optional(), name: z.string(), segments: z.array(segment) })
const settings = z.object({
  sound: z.boolean(),
  vibration: z.boolean(),
  silent: z.boolean().default(false),
  speakerClock: z.boolean().default(false),
  signalPatterns: z.boolean(),
  theme: z.enum(["system", "light", "dark"]),
  currentMeetingId: z.string().optional(),
  currentClubId: z.string().optional(),
})

export const exportEnvelope = z.object({
  format: z.literal("tommy-export"),
  version: z.literal(1),
  exportedAt: z.number(),
  scope: z.enum(["meeting", "all"]),
  data: z.object({
    clubs: z.array(club),
    members: z.array(member),
    guests: z.array(guest),
    meetings: z.array(meeting),
    timedRecords: z.array(record),
    templates: z.array(template),
    settings: settings.optional(),
  }),
})
export type ExportEnvelope = z.infer<typeof exportEnvelope>

// Compile-time guarantee that the file format and the domain model agree.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const check = <T extends true>() => undefined as unknown as T
check<Same<z.infer<typeof meeting>, Meeting>>()
check<Same<z.infer<typeof record>, TimedRecord>>()
check<Same<z.infer<typeof club>, Club>>()
check<Same<z.infer<typeof member>, Member>>()
check<Same<z.infer<typeof guest>, Guest>>()
check<Same<z.infer<typeof template>, Template>>()
check<Same<z.infer<typeof settings>, AppSettings>>()
