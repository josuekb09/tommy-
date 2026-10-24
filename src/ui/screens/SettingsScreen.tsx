import { useRef, useState } from "react"
import { Download, Moon, Plus, RotateCcw, Sun, Trash2, Upload } from "lucide-react"
import type { Club, ClubRules, Meeting, ProfileCategory, ProfileDefinition } from "../../domain"
import { builtInProfiles, definitionFromRange, formatClock, parseClock, profileLibrary } from "../../engine/profiles"
import { profileFromRange } from "../../engine/range"
import { exportAll, exportMeeting, ImportError, importExport, parseExport } from "../../storage/export-import"
import { download, Toggle } from "../components"
import type { AppData } from "../hooks"
import { MembersCard } from "../people"
import { db, repo } from "../runtime"

const fileDate = () => new Date().toISOString().slice(0, 10)
const categoryLabels: Record<ProfileCategory, string> = {
  speech: "Speeches",
  evaluation: "Evaluations",
  table_topics: "Table Topics",
  role: "Role reports",
  contest: "Contests (30-second grace, disqualify outside the window)",
  custom: "Custom",
}

type Props = { data: AppData & { meeting: Meeting }; readOnly: boolean; notify: (message: string) => void }

export function SettingsScreen({ data, readOnly, notify }: Props) {
  const { settings, rules, club, meeting } = data
  const fileInput = useRef<HTMLInputElement>(null)

  /** Saves the club, then re-applies its rules to everyone in this meeting who has not been timed yet. */
  const saveClub = async (next: Club) => {
    await repo.clubs.put(next)
    await repo.meetings.applyClubRules(meeting.id, next)
  }
  const setRules = (patch: Partial<ClubRules>) => club && void saveClub({ ...club, defaultRules: { ...rules, ...patch } })

  const exportFile = async (scope: "meeting" | "all") => {
    const envelope = scope === "all" ? await exportAll(db) : await exportMeeting(db, meeting.id)
    download(`tommy-${scope === "all" ? "backup" : `meeting-${meeting.date}`}-${fileDate()}.json`, JSON.stringify(envelope, null, 2))
    notify(scope === "all" ? "Backup downloaded" : "Meeting exported")
  }
  const importFile = async (file: File) => {
    try {
      const envelope = parseExport(await file.text())
      const restore =
        envelope.scope === "all" &&
        confirm(
          "Replace ALL data on this device with this backup? A backup of the current data downloads first. Press Cancel to add the meetings as copies instead.",
        )
      if (restore) await exportFile("all")
      const result = await importExport(db, envelope, restore ? "restore" : "copy")
      notify(`${result.meetings} meeting${result.meetings === 1 ? "" : "s"} imported`)
    } catch (error) {
      notify(error instanceof ImportError ? error.message : "Import failed. The file was not changed.")
    }
  }

  return (
    <section className="screen settings-screen">
      <div className="screen-title">
        <div>
          <span className="eyebrow">Club preferences</span>
          <h1>Settings</h1>
        </div>
      </div>

      <section className="settings-card">
        <h2>Club</h2>
        <label>
          Club name
          <input value={club?.name ?? ""} onChange={event => club && void repo.clubs.put({ ...club, name: event.target.value })} disabled={readOnly} />
        </label>
      </section>

      <MembersCard members={data.members} readOnly={readOnly} notify={notify} />

      <section className="settings-card" aria-labelledby="rules-heading">
        <h2 id="rules-heading">Club timing rules</h2>
        <Toggle label="Grace period" value={rules.graceEnabled} onChange={value => setRules({ graceEnabled: value })} />
        {rules.graceEnabled && (
          <>
            <label>
              Grace length
              <input
                type="number"
                min={0}
                max={120}
                value={rules.graceSeconds}
                onChange={event => setRules({ graceSeconds: clampSeconds(event.target.value) })}
                disabled={readOnly}
              />
              <small>seconds</small>
            </label>
            <Toggle
              label="Grace applies to Table Topics"
              value={rules.graceAppliesToTableTopics}
              onChange={value => setRules({ graceAppliesToTableTopics: value })}
            />
          </>
        )}
        <Toggle
          label="Within time includes grace"
          value={rules.withinRule === "grace"}
          onChange={value => setRules({ withinRule: value ? "grace" : "strict" })}
        />
        <label>
          Amber signal
          <select value={rules.amberRule} onChange={event => setRules({ amberRule: event.target.value as ClubRules["amberRule"] })} disabled={readOnly}>
            <option value="printed">As set in each profile</option>
            <option value="midpoint">Always halfway between green and red</option>
            <option value="beforeRed">A fixed time before red</option>
          </select>
        </label>
        {rules.amberRule === "beforeRed" && (
          <label>
            Amber before red
            <input
              type="number"
              min={5}
              max={600}
              value={rules.amberBeforeRedSeconds}
              onChange={event => setRules({ amberBeforeRedSeconds: Math.max(5, Math.round(Number(event.target.value) || 0)) })}
              disabled={readOnly}
            />
            <small>seconds</small>
          </label>
        )}
        <label>
          Red signal
          <select value={rules.redAt} onChange={event => setRules({ redAt: event.target.value as ClubRules["redAt"] })} disabled={readOnly}>
            <option value="reach">On reaching the maximum time</option>
            <option value="exceed">Only after exceeding the maximum</option>
          </select>
        </label>
        <label>
          After the grace period
          <select value={rules.overtime} onChange={event => setRules({ overtime: event.target.value as ClubRules["overtime"] })} disabled={readOnly}>
            <option value="afterGrace">Show a flashing overtime signal</option>
            <option value="never">Stay on red</option>
          </select>
        </label>
        <Toggle
          label="Contest mode (disqualify outside the window, hide names)"
          value={rules.contestMode}
          onChange={value => setRules({ contestMode: value })}
        />
        <Toggle
          label="Guests can be Best Table Topics"
          value={rules.tableTopicsGuestsEligible}
          onChange={value => setRules({ tableTopicsGuestsEligible: value })}
        />
        <label>
          Report style
          <select value={rules.reportStyle} onChange={event => setRules({ reportStyle: event.target.value as ClubRules["reportStyle"] })} disabled={readOnly}>
            <option value="exact">Exact times</option>
            <option value="category">Categories (within, over, under time)</option>
          </select>
        </label>
        <small>Changes apply straight away to everyone not yet timed. Recorded times keep the rules they were timed with.</small>
      </section>

      {club && <ProfileLibrary club={club} readOnly={readOnly} save={saveClub} notify={notify} />}

      <section className="settings-card">
        <h2>Signals on this device</h2>
        <Toggle label="Threshold sound" value={settings.sound} onChange={value => void repo.settings.update({ sound: value })} />
        <Toggle label="Vibration" value={settings.vibration} onChange={value => void repo.settings.update({ vibration: value })} />
        <Toggle label="Pattern cues next to colours" value={settings.signalPatterns} onChange={value => void repo.settings.update({ signalPatterns: value })} />
        <Toggle label="Show the clock to the speaker" value={settings.speakerClock} onChange={value => void repo.settings.update({ speakerClock: value })} />
      </section>

      <section className="settings-card">
        <h2>Appearance</h2>
        <div className="theme-choices">
          {(["system", "light", "dark"] as const).map(theme => (
            <button
              key={theme}
              className={settings.theme === theme ? "selected" : ""}
              aria-pressed={settings.theme === theme}
              onClick={() => void repo.settings.update({ theme })}
            >
              {theme === "light" && <Sun />}
              {theme === "dark" && <Moon />}
              {theme[0].toUpperCase() + theme.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <h2>Your data</h2>
        <p>Everything is stored on this device only. Export a backup regularly.</p>
        <div className="report-actions">
          <button onClick={() => void exportFile("meeting")}>
            <Download size={18} />
            Export this meeting
          </button>
          <button onClick={() => void exportFile("all")}>
            <Download size={18} />
            Export all data
          </button>
          <button onClick={() => fileInput.current?.click()} disabled={readOnly}>
            <Upload size={18} />
            Import
          </button>
        </div>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Import a Tommy export file"
          onChange={event => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void importFile(file)
          }}
        />
      </section>
    </section>
  )
}

const clampSeconds = (value: string) => Math.min(120, Math.max(0, Math.round(Number(value) || 0)))

/** The club's profile library: edit any built-in, reset it, and add custom profiles from a range. */
function ProfileLibrary({
  club,
  readOnly,
  save,
  notify,
}: {
  club: Club
  readOnly: boolean
  save: (club: Club) => Promise<void>
  notify: (message: string) => void
}) {
  const clubProfiles = club.profiles ?? {}
  const library = profileLibrary(clubProfiles)
  const [name, setName] = useState("")
  const [rangeText, setRangeText] = useState("")
  const parsed = rangeText.trim() ? profileFromRange(rangeText) : undefined

  const setTime = (profile: ProfileDefinition, key: "green" | "amber" | "red", seconds: number) => {
    const next = { ...profile, [key]: seconds }
    const ordered = next.redOnly || ((next.green ?? 0) < (next.amber ?? 0) && (next.amber ?? 0) < next.red)
    if (!ordered) return notify("Green, amber and red must increase in that order.")
    void save({ ...club, profiles: { ...clubProfiles, [profile.id]: next } })
  }
  const reset = (profile: ProfileDefinition) => {
    const rest = { ...clubProfiles }
    delete rest[profile.id]
    void save({ ...club, profiles: rest })
  }
  const addCustom = () => {
    if (!parsed?.profile) return
    const id = `custom-${crypto.randomUUID()}`
    void save({ ...club, profiles: { ...clubProfiles, [id]: definitionFromRange(parsed.profile, name.trim() || rangeText.trim(), id) } }).then(() => {
      setName("")
      setRangeText("")
      notify("Custom profile added")
    })
  }

  return (
    <section className="settings-card" aria-labelledby="library-heading">
      <h2 id="library-heading">
        Timing profiles <small>m:ss</small>
      </h2>
      {(Object.keys(categoryLabels) as ProfileCategory[]).map(category => {
        const profiles = library.filter(profile => profile.category === category)
        if (!profiles.length) return null
        return (
          <div className="profile-group" key={category}>
            <h3>{categoryLabels[category]}</h3>
            {profiles.map(profile => {
              const isBuiltIn = builtInProfiles.some(builtIn => builtIn.id === profile.id)
              return (
                <div className="preset-row" key={profile.id}>
                  <span>{profile.name}</span>
                  {profile.redOnly ? (
                    <ClockInput
                      label={`${profile.name} red`}
                      seconds={profile.red}
                      onChange={seconds => setTime(profile, "red", seconds)}
                      disabled={readOnly}
                    />
                  ) : (
                    (["green", "amber", "red"] as const).map(key => (
                      <ClockInput
                        key={key}
                        label={`${profile.name} ${key}`}
                        seconds={profile[key] ?? 0}
                        onChange={seconds => setTime(profile, key, seconds)}
                        disabled={readOnly}
                      />
                    ))
                  )}
                  {isBuiltIn ? (
                    clubProfiles[profile.id] && (
                      <button className="icon-button" aria-label={`Reset ${profile.name} to the default`} onClick={() => reset(profile)} disabled={readOnly}>
                        <RotateCcw size={16} />
                      </button>
                    )
                  ) : (
                    <button className="icon-button" aria-label={`Delete ${profile.name}`} onClick={() => reset(profile)} disabled={readOnly}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      <div className="profile-add">
        <h3>Add a custom profile</h3>
        <label>
          Name
          <input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Keynote" disabled={readOnly} />
        </label>
        <label>
          Time range
          <input value={rangeText} onChange={event => setRangeText(event.target.value)} placeholder='e.g. "8 to 10 minutes" or "3:00"' disabled={readOnly} />
        </label>
        {parsed && (
          <p className={parsed.profile ? "range-preview" : "range-error"} role="status">
            {parsed.profile
              ? parsed.profile.redOnly
                ? `Red only at ${formatClock(parsed.profile.red * 1000)}`
                : `Green ${formatClock(parsed.profile.green * 1000)} · Amber ${formatClock(parsed.profile.amber * 1000)} · Red ${formatClock(parsed.profile.red * 1000)}`
              : parsed.reason}
          </p>
        )}
        <button className="secondary-button" onClick={addCustom} disabled={readOnly || !parsed?.profile}>
          <Plus size={18} />
          Add profile
        </button>
      </div>
    </section>
  )
}

function ClockInput({ label, seconds, onChange, disabled }: { label: string; seconds: number; onChange: (seconds: number) => void; disabled?: boolean }) {
  const formatted = formatClock(seconds * 1000)
  // While editing, the field shows the draft; otherwise it always shows the saved value.
  const [draft, setDraft] = useState<string>()
  const commit = () => {
    const ms = draft === undefined ? undefined : parseClock(draft)
    if (ms && ms <= 3_600_000 && ms / 1000 !== seconds) onChange(ms / 1000)
    setDraft(undefined)
  }
  return (
    <label>
      <small>{label.split(" ").at(-1)![0].toUpperCase()}</small>
      <input
        aria-label={label}
        inputMode="numeric"
        value={draft ?? formatted}
        disabled={disabled}
        onFocus={() => setDraft(formatted)}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => event.key === "Enter" && event.currentTarget.blur()}
      />
    </label>
  )
}
