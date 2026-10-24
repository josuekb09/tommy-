import { useRef, useState } from "react"
import { Download, Moon, Sun, Upload } from "lucide-react"
import type { ClubRules, Meeting, TimingProfile } from "../../domain"
import { builtInProfiles, formatClock, parseClock, type ProfileId } from "../../engine/profiles"
import { exportAll, exportMeeting, ImportError, importExport, parseExport } from "../../storage/export-import"
import { download, Toggle } from "../components"
import type { AppData } from "../hooks"
import { db, repo } from "../runtime"

const fileDate = () => new Date().toISOString().slice(0, 10)

export function SettingsScreen({ data, readOnly, notify }: { data: AppData & { meeting: Meeting }; readOnly: boolean; notify: (message: string) => void }) {
  const { settings, rules, club } = data
  const fileInput = useRef<HTMLInputElement>(null)
  const setRules = (patch: Partial<ClubRules>) => club && void repo.clubs.put({ ...club, defaultRules: { ...rules, ...patch } })
  const setTimes = (id: ProfileId, key: "green" | "amber" | "red", seconds: number) => {
    const current = settings.profileOverrides[id] ?? { ...builtInProfiles[id], graceSeconds: rules.graceSeconds, disqualifyEnabled: false }
    const next: TimingProfile = {
      green: current.green,
      amber: current.amber,
      red: current.red,
      graceSeconds: current.graceSeconds,
      disqualifyEnabled: current.disqualifyEnabled,
      [key]: seconds,
    }
    void repo.settings.update({ profileOverrides: { ...settings.profileOverrides, [id]: next } })
  }

  const exportFile = async (scope: "meeting" | "all") => {
    const envelope = scope === "all" ? await exportAll(db) : await exportMeeting(db, data.meeting.id)
    download(`tommy-${scope === "all" ? "backup" : `meeting-${data.meeting.date}`}-${fileDate()}.json`, JSON.stringify(envelope, null, 2))
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
        <label>
          Grace period
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
        <Toggle
          label="Within time includes grace"
          value={rules.withinRule === "grace"}
          onChange={value => setRules({ withinRule: value ? "grace" : "strict" })}
        />
        <Toggle label="Contest mode (disqualify outside the window)" value={rules.contestMode} onChange={value => setRules({ contestMode: value })} />
        <small>Rule changes apply to people added after the change.</small>
      </section>
      <section className="settings-card">
        <h2>
          Timing profiles <small>m:ss</small>
        </h2>
        {(Object.keys(builtInProfiles) as ProfileId[]).map(id => {
          const times = settings.profileOverrides[id] ?? builtInProfiles[id]
          return (
            <div className="preset-row" key={id}>
              <span>{builtInProfiles[id].name}</span>
              {(["green", "amber", "red"] as const).map(key => (
                <ClockInput key={key} label={`${builtInProfiles[id].name} ${key}`} seconds={times[key]} onChange={seconds => setTimes(id, key, seconds)} />
              ))}
            </div>
          )
        })}
      </section>
      <section className="settings-card">
        <h2>Signals on this device</h2>
        <Toggle label="Threshold sound" value={settings.sound} onChange={value => void repo.settings.update({ sound: value })} />
        <Toggle label="Vibration" value={settings.vibration} onChange={value => void repo.settings.update({ vibration: value })} />
        <Toggle label="Pattern cues next to colours" value={settings.signalPatterns} onChange={value => void repo.settings.update({ signalPatterns: value })} />
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

function ClockInput({ label, seconds, onChange }: { label: string; seconds: number; onChange: (seconds: number) => void }) {
  const formatted = formatClock(seconds * 1000)
  // While editing, the field shows the draft; otherwise it always shows the saved value.
  const [draft, setDraft] = useState<string>()
  const commit = () => {
    const ms = draft === undefined ? undefined : parseClock(draft)
    if (ms && ms <= 3_600_000) onChange(ms / 1000)
    setDraft(undefined)
  }
  return (
    <label>
      <small>{label.split(" ").at(-1)![0].toUpperCase()}</small>
      <input
        aria-label={label}
        inputMode="numeric"
        value={draft ?? formatted}
        onFocus={() => setDraft(formatted)}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => event.key === "Enter" && event.currentTarget.blur()}
      />
    </label>
  )
}
