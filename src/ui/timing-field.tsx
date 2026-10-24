import { useId } from "react"
import type { AgendaRole, ClubRules, ProfileDefinition, TimingProfile } from "../domain"
import { definitionFromRange, formatClock, profileFor, profileLibrary, rangeLabel, resolveProfile } from "../engine/profiles"
import { profileFromRange } from "../engine/range"

/** A library preset, or the text the agenda prints (which wins when it can be read). */
export type TimingChoice = { profileId: string; text: string }

export type ResolvedTiming = { timing: TimingProfile; profileId?: string } | { error: string }

/** The profile an item gets: the typed text when it can be read, else the preset. Unreadable text is an error, never a guess. */
export function resolveTiming(role: AgendaRole, choice: TimingChoice, rules: ClubRules, clubProfiles: Record<string, ProfileDefinition>): ResolvedTiming {
  const text = choice.text.trim()
  if (!text) return { timing: profileFor(role, rules, clubProfiles, choice.profileId), profileId: choice.profileId }
  const parsed = profileFromRange(text)
  if (!parsed.profile) return { error: parsed.reason }
  return { timing: resolveProfile(definitionFromRange(parsed.profile, text), rules, role === "TableTopicsSpeaker") }
}

const seconds = (s: number) => formatClock(s * 1000)

/** "Green 5:00 · Amber 6:00 · Red 7:00", in words so it never relies on colour. */
export function thresholdsText(timing: TimingProfile) {
  if (timing.redOnly) return `Red at ${seconds(timing.red)}`
  return `Green ${seconds(timing.green)} · Amber ${seconds(timing.amber)} · Red ${seconds(timing.red)}`
}

/**
 * Type what the agenda prints ("5-7", "5:00 6:00 7:00", "2-3 min") and see
 * the signals it gives at once. If Tommy cannot read it, the reason is shown
 * and a preset can be picked instead.
 */
export function TimingField({
  role,
  value,
  onChange,
  rules,
  clubProfiles,
  locked,
}: {
  role: AgendaRole
  value: TimingChoice
  onChange: (value: TimingChoice) => void
  rules: ClubRules
  clubProfiles: Record<string, ProfileDefinition>
  /** Set once the item has been timed: its timing can no longer change. */
  locked?: TimingProfile
}) {
  const previewId = useId()
  const library = profileLibrary(clubProfiles)
  if (locked)
    return (
      <div className="timing-field">
        <p className="field-label">Timing</p>
        <p className="timing-preview">
          {thresholdsText(locked)}
          <small>Already timed, so the timing stays as it was recorded.</small>
        </p>
      </div>
    )
  const resolved = resolveTiming(role, value, rules, clubProfiles)
  const error = "error" in resolved ? resolved.error : undefined
  const preset = library.find(profile => profile.id === value.profileId)
  return (
    <div className="timing-field">
      <label className="field-label">
        Time on the agenda
        <input
          value={value.text}
          onChange={event => onChange({ ...value, text: event.target.value })}
          placeholder={`e.g. 5-7, 5:00 6:00 7:00 or 2-3 min`}
          aria-describedby={previewId}
          aria-invalid={!!error}
          autoComplete="off"
        />
      </label>
      <p id={previewId} className={`timing-preview${error ? " invalid" : ""}`} role="status">
        {"error" in resolved ? (
          <>
            Tommy can’t read “{value.text.trim()}”: {error} Pick a preset instead, or fix the text.
          </>
        ) : (
          <>
            {thresholdsText(resolved.timing)}
            <small>{value.text.trim() ? `Read from “${value.text.trim()}”` : `Preset: ${preset?.name ?? "default"}`}</small>
          </>
        )}
      </p>
      <label className="field-label">
        Preset
        <select value={value.profileId} onChange={event => onChange({ profileId: event.target.value, text: "" })}>
          {library.map(profile => (
            <option key={profile.id} value={profile.id}>
              {profile.name} ({rangeLabel(profileFor(role, rules, clubProfiles, profile.id))})
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
