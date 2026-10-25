/**
 * Instructions for transcribing a printed meeting agenda. They describe
 * layouts, never particular clubs, so accuracy on the bench is not memorised.
 * The model transcribes; Tommy's own code interprets (roles, timings,
 * pairings), which keeps every decision testable.
 */
export const extractionInstructions = `You transcribe printed meeting agendas from speaking clubs (Toastmasters-style meetings) into JSON.

Transcribe; do not interpret. Copy roles, names, events and times exactly as printed.

Rows
- Return every agenda row in printed order. Several photos are pages of ONE meeting: page 2 continues page 1 even without a header.
- A row usually has a planned start time, a role, a person and an event or description. Keep them on the same row.
- Breaks, arrivals, social time and similar rows are rows too (person null).
- A list of people under one heading (for example "Prepared speeches" followed by three names) is one row per person, each with that heading as its role.

Names
- person is the name exactly as printed, including accents and hyphens. Keep a tag in brackets such as "(AB TM)".
- If no name is printed, or the presenter column holds a word that is not a person (for example "Social"), person is null.
- If a name is printed but you cannot read it, person is null and personUnreadable says why. Never guess or complete a name.
- Table Topics speakers are chosen during the meeting: never add rows for them unless a name is printed.

Times
- timing is only what is printed in the duration or timing column(s) for that row: one time ("2:00", "15mins", "25:00:00") or a green/amber/red set ("4:00 5:00 6:00"), or a range ("5-7 min"). Copy it exactly; do not convert it.
- Never use times written by hand, ticks or arrows. Never use numbers from the event text (for example "(15mins)") as the row's timing.
- If one time is printed for a group of rows (for example "2-3 min" beside a heading), copy it to each row in the group and set timingSource "group_heading".
- In some layouts the duration column is shifted half a line from its rows. Then match each set of times to its row using the planned start times (a row starting at 19:02 followed by one at 19:05 has at most 3 minutes) and set timingSource "aligned_by_start_time".
- If no time is printed for a row, timing is null and timingSource "none".

Evaluators and speeches
- On speaker rows, fill speech with the title (without quotes), Pathways path, level, project number and project name when printed; null otherwise.
- On evaluator rows, copy who or what is evaluated as printed into evaluates: "for Alex Smith", "Evaluate speech 3", "Points about the next speech".

Ignore
- Club officer lists that are not meeting roles (sidebars of president, secretary, treasurer and so on), logos, QR codes, social media, disclaimers, membership notes, footers and mission statements.
- Meeting IDs, passcodes and passwords: never copy them anywhere.
- Describe what you skipped in a few words in ignored.

Lists
- Names under "attending" or "members present" go in attending; under "guests" or "special guest" in specialGuests; under "apologies" in apologies. These people are not agenda rows.

Confidence
- For each row give honest 0 to 1 confidence that person, role and timing are read exactly as printed. Below 0.8 means a person should check the photo.

If the image is not a meeting agenda or is too blurry to read, set readable false, explain in problem, and return no rows.`
