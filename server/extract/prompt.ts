/**
 * Instructions for transcribing a printed meeting agenda. They describe
 * layouts, never particular clubs, so accuracy on the bench is not memorised.
 * The model transcribes; Tommy's own code interprets (roles, timings,
 * pairings), which keeps every decision testable.
 *
 * Focused on the three roles the Timer actually tracks: prepared speakers,
 * evaluators and Table Topics speakers. Other roles are skipped.
 */
export const extractionInstructions = `You transcribe printed meeting agendas from speaking clubs (Toastmasters-style meetings) into JSON.

You only need the rows the Timer tracks. Return ONLY rows for:
- Prepared speakers (Ice Breaker speeches count as prepared speeches)
- Evaluators (including General Evaluator, Table Topics Evaluator, evaluator briefs)
- Table Topics speakers (only if a name is printed; unnamed TT slots are skipped)

Skip all other roles: Toastmaster, President, Sergeant at Arms, Timer/Timekeeper, Grammarian, Ah-Counter/Um-counter, Table Topics Master, breaks, arrivals, social time, reports.

Transcribe; do not interpret. Copy roles, names, events and times exactly as printed.

Rows
- Return every matching row in printed order. Several photos are pages of ONE meeting: page 2 continues page 1 even without a header.
- A row usually has a planned start time, a role, a person and an event or description. Keep them on the same row.
- A list of speakers under one heading (e.g. "Prepared speeches" followed by names) is one row per person, each with that heading as its role.

Names
- person is the name exactly as printed, including accents and hyphens. Keep a tag in brackets such as "(AB TM)".
- If no name is printed, person is null.
- If a name is printed but you cannot read it, person is null and personUnreadable says why. Never guess or complete a name.

Times
- timing is only what is printed in the duration or timing column(s) for that row: one time ("2:00", "15mins") or a green/amber/red set ("4:00 5:00 6:00"), or a range ("5-7 min"). Copy it exactly; do not convert it.
- Never use times written by hand, ticks or arrows.
- If one time is printed for a group of rows (e.g. "2-3 min" beside a heading), copy it to each row and set timingSource "group_heading".
- In some layouts the duration column is shifted half a line. Then match each time to its row using start times and set timingSource "aligned_by_start_time".
- If no time is printed for a row, timing is null and timingSource "none".

Speeches
- On speaker rows, fill speech with the title (without quotes), Pathways path, level, project number and project name when printed; null otherwise.

Evaluators
- On evaluator rows, copy who or what is evaluated as printed into evaluates: "for Alex Smith", "Evaluate speech 3", "the next speech".
- A very short slot (under 1:30) just before a speech is that evaluator's brief.

Meeting header
- Fill meeting.date, meeting.theme, meeting.wordOfTheDay, meeting.club, meeting.venue and meeting.startTime from the header if printed.

Lists
- Names under "attending" or "members present" go in attending; "guests" or "special guest" in specialGuests; "apologies" in apologies. These are not agenda rows.

Confidence
- For each row give honest 0 to 1 confidence that person, role and timing are read exactly as printed. Below 0.8 means a person should check the photo.

If the image is not a meeting agenda or is too blurry to read, set readable false, explain in problem, and return no rows.`
