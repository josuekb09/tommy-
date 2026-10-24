import { useState } from "react"
import { CalendarPlus, ChevronRight, Plus, X } from "lucide-react"
import type { AgendaRole, Meeting, SegmentKind } from "../../domain"
import { defaultProfileIdForRole, formatClock, profileFor, profileLibrary, rangeLabel, roleLabels, segmentLabels } from "../../engine/profiles"
import { stateOf } from "../../engine/timing"
import { RecordedTimeError } from "../../storage/repository"
import { Sheet } from "../components"
import type { AppData } from "../hooks"
import { repo } from "../runtime"

const rolesFor: Record<SegmentKind, AgendaRole[]> = {
  opening: ["Toastmaster", "President", "SergeantAtArms", "Other"],
  prepared_speeches: ["Speaker"],
  table_topics: ["TableTopicsSpeaker", "TableTopicsMaster", "TableTopicsEvaluator"],
  evaluations: ["Evaluator", "GeneralEvaluator"],
  reports: ["Timer", "AhCounter", "Grammarian"],
  other: ["Other"],
}

export function MeetingScreen({
  data,
  readOnly,
  open,
  notify,
}: {
  data: AppData & { meeting: Meeting }
  readOnly: boolean
  open: (itemId: string) => void
  notify: (message: string) => void
}) {
  const { meeting, records } = data
  const recordFor = new Map(records.map(record => [record.agendaItemId, record]))
  const [adding, setAdding] = useState<SegmentKind>()
  const update = (patch: Partial<Meeting>) => void repo.meetings.update(meeting.id, current => ({ ...current, ...patch }))

  const remove = async (itemId: string, name: string) => {
    try {
      await repo.meetings.removeItem(meeting.id, itemId)
    } catch (error) {
      if (!(error instanceof RecordedTimeError)) throw error
      if (!confirm(`${name} has a recorded time. Remove them and their time permanently?`)) return
      await repo.meetings.removeItem(meeting.id, itemId, { confirmRecorded: true })
    }
    notify(`${name} removed`)
  }
  const newMeeting = async () => {
    if (!confirm("Start a new meeting? This meeting and its times stay saved on this device.")) return
    await repo.meetings.update(meeting.id, current => ({ ...current, status: current.status === "draft" ? "draft" : "finished" }))
    await repo.meetings.create(meeting.clubId)
    notify("New meeting started")
  }

  return (
    <section className="screen meeting-screen">
      <div className="screen-title">
        <div>
          <span className="eyebrow">{data.club?.name ?? "Meeting"}</span>
          <h1>Meeting agenda</h1>
        </div>
        <button className="secondary-button" onClick={() => void newMeeting()} disabled={readOnly}>
          <CalendarPlus size={18} />
          New meeting
        </button>
      </div>
      <section className="settings-card">
        <label>
          Date
          <input type="date" value={meeting.date} onChange={event => update({ date: event.target.value })} disabled={readOnly} />
        </label>
        <label>
          Theme
          <input
            value={meeting.theme ?? ""}
            placeholder="Optional"
            onChange={event => update({ theme: event.target.value || undefined })}
            disabled={readOnly}
          />
        </label>
        <label>
          Word of the day
          <input
            value={meeting.wordOfTheDay ?? ""}
            placeholder="Optional"
            onChange={event => update({ wordOfTheDay: event.target.value || undefined })}
            disabled={readOnly}
          />
        </label>
      </section>
      <div className="queue-segments">
        {meeting.segments.map(segment => (
          <section className="queue-section current" key={segment.id} aria-labelledby={`segment-${segment.id}`}>
            <div className="queue-section-title">
              <span id={`segment-${segment.id}`}>{segmentLabels[segment.kind]}</span>
              <button className="text-button" onClick={() => setAdding(segment.kind)} disabled={readOnly} aria-label={`Add to ${segmentLabels[segment.kind]}`}>
                <Plus size={16} />
                Add
              </button>
            </div>
            {[...segment.items]
              .sort((a, b) => a.order - b.order)
              .map(item => {
                const record = recordFor.get(item.id)
                const state = stateOf(record?.actions ?? [])
                return (
                  <div className="speaker-row" key={item.id}>
                    <button className="speaker-row-main" onClick={() => open(item.id)}>
                      <b>{item.personName}</b>
                      <small>
                        {roleLabels[item.role]}
                        {item.speechTitle ? ` · ${item.speechTitle}` : ""} · {rangeLabel(item.timing)}
                      </small>
                    </button>
                    <span className={`row-status ${state.status}`}>
                      {state.status === "stopped" ? `Done ${formatClock(record!.elapsedMs)}` : state.status === "idle" ? "Queued" : state.status}
                    </span>
                    <button
                      className="row-delete"
                      aria-label={`Remove ${item.personName}`}
                      onClick={() => void remove(item.id, item.personName)}
                      disabled={readOnly}
                    >
                      <X size={16} />
                    </button>
                    <ChevronRight size={16} aria-hidden="true" />
                  </div>
                )
              })}
            {!segment.items.length && <p className="empty-queue">No one yet.</p>}
          </section>
        ))}
      </div>
      {adding && (
        <AddItemSheet
          data={data}
          kind={adding}
          close={() => setAdding(undefined)}
          added={name => {
            setAdding(undefined)
            notify(`${name} added`)
          }}
        />
      )}
    </section>
  )
}

function AddItemSheet({
  data,
  kind,
  close,
  added,
}: {
  data: AppData & { meeting: Meeting }
  kind: SegmentKind
  close: () => void
  added: (name: string) => void
}) {
  const roles = rolesFor[kind]
  const [role, setRole] = useState<AgendaRole>(roles[0])
  const [name, setName] = useState("")
  const [title, setTitle] = useState("")
  const [profileId, setProfileId] = useState(defaultProfileIdForRole(roles[0]))
  const library = profileLibrary(data.clubProfiles)
  const save = async () => {
    if (!name.trim()) return
    await repo.meetings.addItem(data.meeting.id, kind, {
      role,
      personName: name.trim(),
      ...(title.trim() && { speechTitle: title.trim() }),
      profileId,
      timing: profileFor(role, data.rules, data.clubProfiles, profileId),
    })
    added(name.trim())
  }
  return (
    <Sheet title={`Add to ${segmentLabels[kind]}`} eyebrow="Agenda" onClose={close}>
      <label className="field-label">
        Name
        <input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Taylor Brooks" list="people" />
      </label>
      <datalist id="people">
        {data.guests.map(guest => (
          <option key={guest.id} value={guest.name} />
        ))}
      </datalist>
      <label className="field-label">
        Role
        <select
          value={role}
          onChange={event => {
            const next = event.target.value as AgendaRole
            setRole(next)
            setProfileId(defaultProfileIdForRole(next))
          }}
        >
          {roles.map(r => (
            <option key={r} value={r}>
              {roleLabels[r]}
            </option>
          ))}
        </select>
      </label>
      {role === "Speaker" && (
        <label className="field-label">
          Speech title
          <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Optional" />
        </label>
      )}
      <label className="field-label">
        Timing
        <select value={profileId} onChange={event => setProfileId(event.target.value)}>
          {library.map(profile => (
            <option key={profile.id} value={profile.id}>
              {profile.name} ({rangeLabel(profileFor(role, data.rules, data.clubProfiles, profile.id))})
            </option>
          ))}
        </select>
      </label>
      <button className="primary-button sheet-submit" onClick={() => void save()} disabled={!name.trim()}>
        <Plus />
        Add to agenda
      </button>
    </Sheet>
  )
}
