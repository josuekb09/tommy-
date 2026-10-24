import type { ClubRules, ProfileDefinition } from "../domain"
import { formatClock, resolveProfile } from "./profiles"

export type ExplainCard = {
  title: string
  signals: { signal: "green" | "amber" | "red" | "overtime" | "disqualified"; text: string }[]
  rules: string[]
  examples: { name: string; text: string }[]
}

const exampleIds = ["speech", "evaluation", "table_topics"]
const clock = (seconds: number) => formatClock(seconds * 1000)

/** The card a Toastmaster shows at the start of a meeting, written from the club's own rules and profiles. */
export function explainSignals(rules: ClubRules, library: ProfileDefinition[]): ExplainCard {
  const grace = rules.graceEnabled ? rules.graceSeconds : 0
  const signals: ExplainCard["signals"] = [
    { signal: "green", text: "You have reached the minimum time. Finish whenever you are ready." },
    {
      signal: "amber",
      text:
        rules.amberRule === "beforeRed"
          ? `${clock(rules.amberBeforeRedSeconds)} before your maximum time. Start wrapping up.`
          : "You are halfway between the minimum and the maximum. Start wrapping up.",
    },
    {
      signal: "red",
      text:
        rules.redAt === "exceed"
          ? "You have gone over your maximum time. Please close now."
          : "You have reached your maximum time. Finish your sentence and close.",
    },
  ]
  if (rules.contestMode) signals.push({ signal: "disqualified", text: `You are now outside the contest time window.` })
  else if (rules.overtime === "afterGrace" && grace > 0) signals.push({ signal: "overtime", text: "Flashing: you are past the grace period." })

  const ruleLines: string[] = []
  if (grace > 0) {
    ruleLines.push(`You have ${grace} seconds of grace after red${rules.graceAppliesToTableTopics ? "" : " (Table Topics has no grace period)"}.`)
    ruleLines.push(
      rules.withinRule === "grace"
        ? `Finishing up to ${grace} seconds before green or after red still counts as within time.`
        : "Only times between green and red count as within time.",
    )
  } else {
    ruleLines.push("There is no grace period: red is the limit.")
  }
  if (rules.contestMode) ruleLines.push("Contest rules apply: outside the time window a contestant is disqualified for time, and names are not shown.")

  const examples = exampleIds.flatMap(id => {
    const definition = library.find(profile => profile.id === id)
    if (!definition) return []
    const profile = resolveProfile(definition, rules)
    const text = profile.redOnly ? `red at ${clock(profile.red)}` : `green ${clock(profile.green)}, amber ${clock(profile.amber)}, red ${clock(profile.red)}`
    return [{ name: definition.name, text }]
  })

  return { title: "How the timing signals work", signals, rules: ruleLines, examples }
}
