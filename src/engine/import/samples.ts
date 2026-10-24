import type { RawAgenda, RawLine } from "./extraction"

/**
 * Hand transcriptions of the three fixture agendas (fixtures/agendas/) in the
 * model's output format, read from the photos the way a careful model should.
 * They stand in for recorded model responses in unit tests until the accuracy
 * bench records real ones. Test data only.
 */

type Speech = NonNullable<RawLine["speech"]>
type RowOptions = Partial<Pick<RawLine, "speech" | "evaluates" | "timingSource" | "personUnreadable">> & { confidence?: Partial<RawLine["confidence"]> }

export function row(
  page: number,
  startTime: string | null,
  role: string,
  person: string | null,
  event: string | null,
  timing: string | null,
  options: RowOptions = {},
): RawLine {
  const { confidence, ...rest } = options
  return {
    page,
    startTime,
    role,
    person,
    personUnreadable: null,
    event,
    speech: null,
    timing,
    timingSource: timing ? "row" : "none",
    evaluates: null,
    source: [startTime, role, person, event, timing].filter(Boolean).join(" | "),
    ...rest,
    confidence: { person: 0.95, role: 0.95, timing: 0.95, ...confidence },
  }
}

const speech = (title: string, path: string | null, level: number | null, projectNumber: number | null, project: string | null): Speech => ({
  title,
  path,
  level,
  projectNumber,
  project,
})

const empty = { attending: [], specialGuests: [], apologies: [], ignored: [] }

export const toastedSample: RawAgenda = {
  readable: true,
  problem: null,
  meeting: {
    club: "ToastED",
    date: "2026-10-06",
    theme: "If You Could Speak To Your Younger Self",
    wordOfTheDay: null,
    venue: "The Peninsula Hotel, Sea Point",
    startTime: "18:15",
    meetingNumber: "195",
  },
  lines: [
    row(1, "18:00", "Arrivals", null, "Social / Connect", "15mins"),
    row(1, "18:15", "Sergeant at Arms", "Gabrielle Lechtape-Grüter", "Call meeting to order", "3:00"),
    row(1, "18:18", "President", "Michaela Geldhof", "Welcome guests, new member inductions & Loyal Toast", "25:00:00"),
    row(1, "18:43", "Toastmaster", "Eugene Asem", "Describe Program & Introduce Role Players", "5:00"),
    row(1, "18:48", "Timekeeper", "Josue Kabuya", "Describe Role", "2:00"),
    row(1, "18:50", "Um, Er Counter", "Maria van Rooyen", "Describe Role", "2:00"),
    row(1, "18:52", "Grammarian", "Fulu Nemaitoni", "Describe Role", "2:00"),
    row(1, "18:54", "Toastmaster", "Eugene Asem", "Introduce 1st evaluator", "3:00"),
    row(1, "18:57", "1st Evaluator", "Michaela Geldhof", "Points about the next speech", "1:00", { evaluates: "the next speech" }),
    row(1, "18:58", "1st Speaker", "Kim Austen", null, "4:00 5:00 6:00", { speech: speech("Say Yes To Adventure", null, 1, 1, "Icebreaker") }),
    row(1, "19:04", "2nd Evaluator", "Titus Magua", "Points about the next speech", "1:00", { evaluates: "the next speech" }),
    row(1, "19:05", "2nd Speaker", "Christina Thomas", null, "5:00 6:00 7:00", {
      speech: speech("Barrydale Provence", "Presentation Mastery", 1, 4, "Evaluation and Feedback"),
    }),
    row(1, "19:12", "3rd Evaluator", "Andrea Baptista", "Points about the next speech", "1:00", { evaluates: "the next speech" }),
    row(1, "19:13", "3rd Speaker", "Chris Adlam", null, "5:00 6:00 7:00", {
      speech: speech("Let's Braai", "Persuasive Influence", 3, 1, "Understanding Conflict Resolution"),
    }),
    row(1, "19:20", "Educational", "Michaela Geldhof", "Evaluation Educational", "10:00 15:00 20:00"),
    row(1, "19:40", "Toastmaster", "Eugene Asem", "Call for Times", "1:00"),
    row(1, "19:41", "Timekeepers Report", "Josue Kabuya", "Speech times", "2:00"),
    row(1, "19:43", "Toastmaster", "Eugene Asem", "VOTE best speaker", "2:00"),
    row(1, "19:45", "Toastmaster", "Eugene Asem", "Interval announcement", "1:00"),
    row(1, null, "30 min Break", null, null, null),
    row(1, "20:15", "Sergeant at Arms", "Gabrielle Lechtape-Grüter", "Reconvene meeting", "1:00"),
    row(2, "20:16", "Toastmaster", "Eugene Asem", "Introduce Table Topics Master", "1:00"),
    row(2, "20:17", "Table Topics Master", "Philip Townsend", "Impromptu Speeches (15mins)", "1:00 1:30 2:00"),
    row(2, "20:32", "Toastmaster", "Eugene Asem", "Call for TT Times", "1:00"),
    row(2, "20:33", "Timekeepers Report", "Josue Kabuya", "Report Time TT Speakers", "1:00"),
    row(2, "20:34", "Toastmaster", "Eugene Asem", "Call for Evaluation Speeches", "1:00"),
    row(2, "20:35", "1st Evaluator", "Michaela Geldhof", "Evaluation Speech", "2:00 2:30 3:00"),
    row(2, "20:38", "2nd Evaluator", "Titus Magua", "Evaluation Speech", "2:00 2:30 3:00"),
    row(2, "20:41", "3rd Evaluator", "Andrea Baptista", "Evaluation Speech", "2:00 2:30 3:00"),
    row(2, "20:44", "Toastmaster", "Eugene Asem", "Call for Evaluation Times", "1:00"),
    row(2, "20:45", "Timekeepers Report", "Josue Kabuya", "Report Time Evaluators", "1:00"),
    row(2, "20:46", "Toastmaster", "Eugene Asem", "VOTE best Evaluator & TT", "2:00"),
    row(2, "20:48", "Um, Er Counter", "Maria van Rooyen", "Um, Er counter Feedback", "2:00"),
    row(2, "20:50", "Grammarian", "Fulu Nemaitoni", "Grammarian Feedback", "2:00"),
    row(2, "20:52", "Toastmaster", "Eugene Asem", "Close Meeting and Handover for Club Business", "5:00"),
    row(2, "20:57", "President", "Michaela Geldhof", "Closing, awards, feedback from visitors", "18:00"),
  ],
  ...empty,
  ignored: ["online meeting ID and password", "handwritten marks in the margin", "footer and mission statement"],
}

const aligned = { timingSource: "aligned_by_start_time" as const }

export const capeTownSample: RawAgenda = {
  readable: true,
  problem: null,
  meeting: {
    club: "Cape Town",
    date: "2026-09-23",
    theme: "Heritage Day: Ubuntu Spirit",
    wordOfTheDay: "Ubuntu",
    venue: "Chairman's View Room, Western Province Cricket Club",
    startTime: "19:00",
    meetingNumber: "868",
  },
  lines: [
    row(1, "19:00", "Sergeant at Arms", "Reggie Davidson", "Call to Order", "1:00 1:30 2:00", aligned),
    row(1, "19:02", "President", "Shukri Wiener", "Welcome & Loyal Toast", "1:00 2:00 3:00", aligned),
    row(1, "19:05", "Toastmaster", "Dawn Corin", "Introducing the theme of the night", "3:00 4:00 5:00", aligned),
    row(1, "19:10", "Club Business", null, "New Member Induction", "5:00 6:00 7:00", aligned),
    row(1, null, "Grammarian", "Shukri Wiener", "Introduction", null),
    row(1, null, "Ah Counter", "Deidre Lewis", "Introduction", null),
    row(1, null, "Timer", "Kubaya Tambwe", "Introduction", null),
    row(1, "19:20", "1st Speaker", "Ruben Pretorius", null, "4:00 5:00 6:00", { speech: speech("This is me", "Presentation Mastery", 1, 1, "Icebreaker") }),
    row(1, "19:26", "2nd Speaker", "Jan-Hendrik Esterhuyse", null, "5:00 6:00 7:00", {
      speech: speech("The art of possibility", "Presentation Mastery", 1, 5, "Evaluation and Feedback - 2"),
    }),
    row(1, "19:33", "3rd Speaker", "Lizo Ncapai", null, "5:00 6:00 7:00", {
      speech: speech("34%", "Presentation Mastery", 1, 3, "Introduction to Vocal Variety and Body Language"),
    }),
    row(1, "19:40", "4th Speaker", "Tehzeen Anjarwalla", null, "5:00 6:00 7:00", {
      speech: speech("Leading peaceful transformations", "Persuasive Influence", 2, 1, "Understanding Your Leadership Style"),
    }),
    row(1, "19:47", "5th Speaker", "Robert Rouessart", null, "5:00 6:00 7:00", {
      speech: speech("διάλογος", "Presentation Mastery", 2, 2, "Understanding Your Communication Style"),
    }),
    row(1, "19:54", "Timer", "Kubaya Tambwe", "Timer", null),
    row(1, null, "Break", null, "Break", null),
    row(1, "20:11", "1st Evaluator", "John Hambleton", "Evaluate speech 1", "2:00 2:30 3:00", { evaluates: "Evaluate speech 1" }),
    row(1, "20:14", "2nd Evaluator", "Chris Adlam", "Evaluate speech 2", "2:00 2:30 3:00", { evaluates: "Evaluate speech 2" }),
    row(1, "20:17", "3rd Evaluator", "Wayne Robinson", "Evaluate speech 3", "2:00 2:30 3:00", { evaluates: "Evaluate speech 3" }),
    row(1, "20:20", "4th Evaluator", "Reggie Davidson", "Evaluate speech 4", "2:00 2:30 3:00", { evaluates: "Evaluate speech 4" }),
    row(1, "20:23", "5th Evaluator", "Aletta Rochat", "Evaluate Speech 5", "2:00 2:30 3:00", { evaluates: "Evaluate Speech 5" }),
    row(1, "20:26", "Timer", "Kubaya Tambwe", "Timer", "2:00 2:30 3:00"),
    row(1, "20:28", "Table Topics Master", "Susanna Kwon", "Let the Fun Begin", "1:00 1:30 2:00"),
    row(1, "20:46", "Timer", "Kubaya Tambwe", "Timer", null),
    row(1, null, "Ah Counter", "Deidre Lewis", "Ah Counter", null),
    row(1, null, "Grammarian", "Shukri Wiener", "Grammarian", null),
    row(1, "20:56", "President", "Shukri Wiener", "Awards, thanks, guest comments", null),
  ],
  attending: ["Aletta Rochat", "Chris Adlam", "Dawn Corin", "Deidre Lewis", "Donovan Will", "John Hambleton", "Kubaya Tambwe", "Lizo Ncapai"],
  specialGuests: ["Jan-Hendrik Esterhuyse"],
  apologies: ["Aphiwe Madikizela", "Bessie Zastrau", "Carolyn Innes"],
  ignored: ["Pathways project descriptions", "QR codes and social media column", "photo disclaimer"],
}

const group = { timingSource: "group_heading" as const }

export const pinelandsSample: RawAgenda = {
  readable: true,
  problem: null,
  meeting: {
    club: "Pinelands Toastmasters Club",
    date: "2026-10-15",
    theme: "Endings",
    wordOfTheDay: null,
    venue: "SASNEV, Pinelands",
    startTime: "18:28",
    meetingNumber: null,
  },
  lines: [
    row(1, "18:28", "SAA calls Meeting to Order", "Neveron Adams", null, null),
    row(1, "18:30", "President opens Meeting", "Gregory Smith", "Welcomes TM's, Guests, announces Farewell to SASNEV", null),
    row(1, "18:35", "History of the Club", "Jonathan Pillay", null, null),
    row(1, "18:40", "Tribute to Lindsay Meihuizen (DTM)", "John Hambleton", null, null),
    row(1, "18:44", "Toastmaster introduces Roleplayers", "Lucille Meyer", null, null),
    row(1, null, "Timekeeper", "Kabuya Tambwe (CT TM)", null, null),
    row(1, null, "Grammarian/Ah Counter", "Diana Bresendale", null, null),
    row(1, "18:49", "Prepared speeches", "May Khine Kyaw", null, "5-7 min"),
    row(1, null, "Prepared speeches", "Christen O' Reilly", null, "5-7 min"),
    row(1, null, "Prepared speeches", "Lizo Ncapai (CT TM)", null, "5-7 min"),
    row(1, "19:15", "Timekeepers Report", "Kabuya Tambwe", null, null),
    row(1, "19:17", "Moments of Truth", "Johann Kok", "A few reflections", null),
    row(1, "19:30", "Evaluation Reports", "Peter Ahmed", "for May Khine Kyaw", "2-3 min", { ...group, evaluates: "for May Khine Kyaw" }),
    row(1, null, "Evaluation Reports", "Jonathan Pillay", "for Christen O' Reilly", "2-3 min", { ...group, evaluates: "for Christen O' Reilly" }),
    row(1, null, "Evaluation Reports", "Jan-Hendrik Esterhuyse", "for Lizo Ncapai", "2-3 min", { ...group, evaluates: "for Lizo Ncapai" }),
    row(1, "19:40", "Role player reports", "Lucille Meyer", null, null),
    row(1, null, "Timekeeper", "Kambuya Tambwe", null, null),
    row(1, null, "Grammarian/Ah Counter", "Diana Bresendale", null, null),
    row(1, "19:45", "President makes announcements and closes meeting", null, null, null),
    row(1, "19:52", "Social gathering", null, null, null),
  ],
  ...empty,
  ignored: ["officers sidebar", "handwritten times next to speakers and evaluators", "Zoom meeting ID and passcode", "QR code"],
}
