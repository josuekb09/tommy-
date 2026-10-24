import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  PencilLine,
  Play,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react"
import type { AgendaItem, AgendaRole, Meeting, Segment, SegmentKind, Template } from "../../domain"
import { agendaWarnings, duplicateLast, evaluatingLabel, nextGuestName, nextInOrder, orderedItems, personLabel, sortedItems } from "../../engine/agenda"
import { defaultProfileIdForRole, formatClock, profileFor, rangeLabel, roleLabels, segmentLabels } from "../../engine/profiles"
import { builtInTemplates } from "../../engine/templates"
import { stateOf } from "../../engine/timing"
import { RecordedTimeError } from "../../storage/repository"
import { Sheet, Toggle } from "../components"
import type { AppData } from "../hooks"
import { peopleOf, PersonField, savePerson, type PersonChoice } from "../people"
import { repo } from "../runtime"
import { resolveTiming, TimingField, type TimingChoice } from "../timing-field"

const rolesFor: Record<SegmentKind, AgendaRole[]> = {
  opening: ["Toastmaster", "President", "SergeantAtArms", "Other"],
  prepared_speeches: ["Speaker", "EvaluatorBrief"],
  table_topics: ["TableTopicsSpeaker", "TableTopicsMaster", "TableTopicsEvaluator"],
  evaluations: ["Evaluator", "GeneralEvaluator"],
  reports: ["Timer", "AhCounter", "Grammarian"],
  other: ["Other", "Speaker"],
}
const pairedRoles: AgendaRole[] = ["Evaluator", "EvaluatorBrief"]

type Data = AppData & { meeting: Meeting }
type SheetState = { type: "add"; kind: SegmentKind } | { type: "edit"; itemId: string } | { type: "new" } | { type: "template" }

export function MeetingScreen({
  data,
  readOnly,
  open,
  notify,
}: {
  data: Data
  readOnly: boolean
  open: (itemId: string) => void
  notify: (message: string) => void
}) {
  const { meeting, records } = data
  const statusOf = (item: AgendaItem) => stateOf(records.find(record => record.agendaItemId === item.id)?.actions ?? []).status
  const [sheet, setSheet] = useState<SheetState>()
  const close = () => setSheet(undefined)
  const done = (message: string) => {
    setSheet(undefined)
    notify(message)
  }
  const update = (patch: Partial<Meeting>) => void repo.meetings.update(meeting.id, current => ({ ...current, ...patch }))
  const warnings = agendaWarnings(meeting)
  const editing = sheet?.type === "edit" ? orderedItems(meeting).find(item => item.id === sheet.itemId) : undefined

  /** Hands the agenda, in this order, to the Timer: the first person not yet timed comes up first. */
  const startMeeting = async () => {
    const first = nextInOrder(meeting, undefined, item => statusOf(item) === "idle")
    if (!first) return notify(orderedItems(meeting).length ? "Everyone on the agenda has been timed" : "Add someone to the agenda first")
    if (meeting.status === "draft") await repo.meetings.update(meeting.id, current => ({ ...current, status: "live" }))
    open(first.id)
  }

  return (
    <section className="screen meeting-screen">
      <div className="screen-title">
        <div>
          <span className="eyebrow">{data.club?.name ?? "Meeting"}</span>
          <h1>Meeting agenda</h1>
        </div>
        <button className="secondary-button" onClick={() => setSheet({ type: "new" })} disabled={readOnly}>
          <CalendarPlus size={18} aria-hidden="true" />
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

      {warnings.length > 0 && (
        <section className="agenda-warnings" aria-labelledby="agenda-warnings">
          <h2 id="agenda-warnings">
            <AlertTriangle size={18} aria-hidden="true" />
            Check the pairings
          </h2>
          <ul>
            {warnings.map(warning => (
              <li key={`${warning.itemId}-${warning.message}`}>{warning.message}</li>
            ))}
          </ul>
          <small>You can still start the meeting.</small>
        </section>
      )}

      <div className="queue-segments">
        {meeting.segments.map((segment, index) => (
          <SegmentSection
            key={segment.id}
            data={data}
            segment={segment}
            first={index === 0}
            last={index === meeting.segments.length - 1}
            readOnly={readOnly}
            open={open}
            edit={itemId => setSheet({ type: "edit", itemId })}
            add={() => setSheet({ type: "add", kind: segment.kind })}
            notify={notify}
          />
        ))}
      </div>

      <div className="meeting-actions">
        <button className="primary-button" onClick={() => void startMeeting()} disabled={readOnly}>
          <Play aria-hidden="true" />
          Start meeting
        </button>
        <button className="secondary-button" onClick={() => setSheet({ type: "template" })} disabled={readOnly}>
          <BookmarkPlus size={18} aria-hidden="true" />
          Save as template
        </button>
      </div>

      {sheet?.type === "add" && <ItemSheet data={data} kind={sheet.kind} close={close} done={done} />}
      {editing && (
        <ItemSheet
          data={data}
          kind={meeting.segments.find(segment => segment.items.some(item => item.id === editing.id))!.kind}
          item={editing}
          close={close}
          done={done}
        />
      )}
      {sheet?.type === "new" && <NewMeetingSheet data={data} close={close} done={done} />}
      {sheet?.type === "template" && <SaveTemplateSheet data={data} close={close} done={done} />}
    </section>
  )
}

function SegmentSection({
  data,
  segment,
  first,
  last,
  readOnly,
  open,
  edit,
  add,
  notify,
}: {
  data: Data
  segment: Segment
  first: boolean
  last: boolean
  readOnly: boolean
  open: (itemId: string) => void
  edit: (itemId: string) => void
  add: () => void
  notify: (message: string) => void
}) {
  const { meeting, records } = data
  const items = sortedItems(segment)
  const label = segmentLabels[segment.kind]
  const list = useRef<HTMLOListElement>(null)
  const move = (itemId: string, toIndex: number) => void repo.meetings.moveItem(meeting.id, itemId, toIndex)
  const lastItem = items.at(-1)
  /** Another slot like the last one; a brief goes just before the speech it is paired with. */
  const duplicate = async () => {
    const copy = duplicateLast(meeting, segment.id)
    if (!copy) return
    await repo.meetings.addItem(meeting.id, segment.kind, copy, { before: copy.role === "EvaluatorBrief" ? copy.evaluatesItemId : undefined })
    notify(`Another ${roleLabels[copy.role].toLowerCase()} added`)
  }
  const drag = useDragToReorder(list, move, readOnly)
  return (
    <section className="queue-section current" aria-labelledby={`segment-${segment.id}`}>
      <div className="queue-section-title">
        <span id={`segment-${segment.id}`}>{label}</span>
        <span className="segment-tools">
          <button
            className="icon-button small"
            aria-label={`Move ${label} earlier`}
            disabled={readOnly || first}
            onClick={() => void repo.meetings.moveSegment(meeting.id, segment.id, -1)}
          >
            <ChevronUp size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button small"
            aria-label={`Move ${label} later`}
            disabled={readOnly || last}
            onClick={() => void repo.meetings.moveSegment(meeting.id, segment.id, 1)}
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <button className="text-button" onClick={add} disabled={readOnly} aria-label={`Add to ${label}`}>
            <Plus size={16} aria-hidden="true" />
            Add
          </button>
        </span>
      </div>
      {segment.kind === "table_topics" && <TableTopicsQuickAdd data={data} readOnly={readOnly} notify={notify} />}
      <ol className="agenda-list" ref={list} aria-label={`${label} order`}>
        {items.map((item, index) => {
          const record = records.find(r => r.agendaItemId === item.id)
          const status = stateOf(record?.actions ?? []).status
          const name = personLabel(item)
          const evaluating = evaluatingLabel(meeting, item)
          return (
            <li className={`speaker-row${drag.draggingId === item.id ? " dragging" : ""}`} key={item.id} style={drag.styleFor(item.id)}>
              <span className="drag-handle" aria-hidden="true" {...drag.handle(item.id, index)}>
                <GripVertical size={18} />
              </span>
              <button className="speaker-row-main" onClick={() => open(item.id)}>
                <b className={item.personName.trim() ? undefined : "unnamed"}>{name}</b>
                {item.guest && <span className="person-chip guest">Guest</span>}
                <small>
                  {item.personName.trim() ? roleLabels[item.role] : "No name yet"}
                  {item.speechTitle ? ` · ${item.speechTitle}` : ""}
                  {item.pathwaysProject ? ` · ${item.pathwaysProject}` : ""} · {rangeLabel(item.timing)}
                </small>
                {evaluating && <small className="evaluating">{evaluating}</small>}
                {status !== "idle" && (
                  <small className={`row-status ${status}`}>{status === "stopped" ? `Done ${formatClock(record!.elapsedMs)}` : status}</small>
                )}
              </button>
              <span className="row-tools">
                <button aria-label={`Move ${name} up`} disabled={readOnly || index === 0} onClick={() => move(item.id, index - 1)}>
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button aria-label={`Move ${name} down`} disabled={readOnly || index === items.length - 1} onClick={() => move(item.id, index + 1)}>
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
                <button aria-label={`Edit ${name}`} disabled={readOnly} onClick={() => edit(item.id)}>
                  <PencilLine size={16} aria-hidden="true" />
                </button>
              </span>
            </li>
          )
        })}
      </ol>
      {lastItem && lastItem.role !== "TableTopicsSpeaker" && (
        <button className="text-button duplicate-last" onClick={() => void duplicate()} disabled={readOnly}>
          <Copy size={16} aria-hidden="true" />
          Add another {roleLabels[lastItem.role].toLowerCase()}
        </button>
      )}
      {!items.length && <p className="empty-queue">{segment.kind === "table_topics" ? "Add participants as they are called up." : "No one yet."}</p>}
    </section>
  )
}

/**
 * Drag a row by its handle to reorder (mouse, touch or pen). The up and down
 * buttons do the same from the keyboard or a screen reader.
 */
function useDragToReorder(list: React.RefObject<HTMLOListElement | null>, move: (itemId: string, toIndex: number) => void, disabled: boolean) {
  const [dragging, setDragging] = useState<{ id: string; dy: number }>()
  const start = useRef<{ id: string; from: number; y: number; middles: number[] }>(undefined)
  const finish = (event: ReactPointerEvent) => {
    const drag = start.current
    start.current = undefined
    setDragging(undefined)
    if (!drag) return
    const to = drag.middles.filter((middle, index) => index !== drag.from && middle < event.clientY).length
    if (to !== drag.from) move(drag.id, to)
  }
  return {
    draggingId: dragging?.id,
    styleFor: (id: string) => (dragging?.id === id ? { transform: `translateY(${dragging.dy}px)` } : undefined),
    handle: (id: string, from: number) => ({
      onPointerDown(event: ReactPointerEvent) {
        if (disabled || !list.current) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        const rows = [...list.current.children].map(row => row.getBoundingClientRect())
        start.current = { id, from, y: event.clientY, middles: rows.map(rect => rect.top + rect.height / 2) }
        setDragging({ id, dy: 0 })
      },
      onPointerMove(event: ReactPointerEvent) {
        if (start.current) setDragging({ id: start.current.id, dy: event.clientY - start.current.y })
      },
      onPointerUp: finish,
      onPointerCancel() {
        start.current = undefined
        setDragging(undefined)
      },
    }),
  }
}

/** One tap adds the next Table Topics participant: a name is optional, and a new name is a guest unless the Timer says otherwise. */
function TableTopicsQuickAdd({ data, readOnly, notify }: { data: Data; readOnly: boolean; notify: (message: string) => void }) {
  const { meeting } = data
  const people = useMemo(() => peopleOf(data.members, data.guests), [data.members, data.guests])
  const [person, setPerson] = useState<PersonChoice>({ name: "", guest: true })
  // Taps are handled one after another, so quick taps still get Guest 1, Guest 2, Guest 3.
  const queue = useRef(Promise.resolve())
  const add = () => {
    const choice = person
    setPerson({ name: "", guest: true })
    queue.current = queue.current.then(async () => {
      const saved = choice.name.trim()
        ? await savePerson(choice)
        : { personName: nextGuestName((await repo.meetings.get(meeting.id)) ?? meeting), guest: true as const }
      await repo.meetings.addItem(meeting.id, "table_topics", {
        role: "TableTopicsSpeaker",
        ...saved,
        profileId: "table_topics",
        timing: profileFor("TableTopicsSpeaker", data.rules, data.clubProfiles),
      })
      notify(`${saved.personName} added to Table Topics`)
    })
  }
  return (
    <div className="tt-quick-add">
      <PersonField label="Participant" placeholder={`${nextGuestName(meeting)} (optional name)`} value={person} onChange={setPerson} people={people} />
      <button className="secondary-button" onClick={add} disabled={readOnly}>
        <UserPlus size={18} aria-hidden="true" />
        Add participant
      </button>
    </div>
  )
}

const clockText = (seconds: number) => formatClock(seconds * 1000)
/** How an item's timing reads back in the agenda field when it was typed rather than picked. */
const printedTiming = (item: AgendaItem) =>
  item.timing.redOnly ? clockText(item.timing.red) : `${clockText(item.timing.green)} ${clockText(item.timing.amber)} ${clockText(item.timing.red)}`

/** Add or edit one agenda item: role, person, title, project, timing and, for evaluators, the speech they evaluate. */
function ItemSheet({
  data,
  kind,
  item,
  close,
  done,
}: {
  data: Data
  kind: SegmentKind
  item?: AgendaItem
  close: () => void
  done: (message: string) => void
}) {
  const { meeting, rules, clubProfiles } = data
  const items = orderedItems(meeting)
  const people = useMemo(() => peopleOf(data.members, data.guests), [data.members, data.guests])
  const roles = item && !rolesFor[kind].includes(item.role) ? [item.role, ...rolesFor[kind]] : rolesFor[kind]
  const record = item && data.records.find(r => r.agendaItemId === item.id)
  const timed = !!record && stateOf(record.actions).status !== "idle"
  const speeches = items.filter(other => other.role === "Speaker")
  const unpaired = speeches.find(speech => !items.some(other => other.role === "Evaluator" && other.evaluatesItemId === speech.id))

  const [role, setRole] = useState<AgendaRole>(item?.role ?? roles[0])
  const [person, setPerson] = useState<PersonChoice>({ name: item?.personName ?? "", personId: item?.personId, guest: item?.guest ?? kind === "table_topics" })
  const [title, setTitle] = useState(item?.speechTitle ?? "")
  const [project, setProject] = useState(item?.pathwaysProject ?? "")
  const [evaluates, setEvaluates] = useState(item?.evaluatesItemId ?? (unpaired?.id || ""))
  const [timing, setTiming] = useState<TimingChoice>(
    item
      ? { profileId: item.profileId ?? defaultProfileIdForRole(item.role), text: item.profileId ? "" : printedTiming(item) }
      : { profileId: defaultProfileIdForRole(role), text: "" },
  )
  const [withBrief, setWithBrief] = useState(false)

  const paired = pairedRoles.includes(role)
  const hasBrief = items.some(other => other.role === "EvaluatorBrief" && other.evaluatesItemId === evaluates && other.id !== item?.id)
  const resolved = timed ? { timing: item!.timing, profileId: item!.profileId } : resolveTiming(role, timing, rules, clubProfiles)
  const canSave = !("error" in resolved) && (!!item || !!person.name.trim())
  const speechLabel = (speech: AgendaItem) => `Speech ${speeches.indexOf(speech) + 1}: ${personLabel(speech)}`

  const save = async () => {
    if ("error" in resolved) return
    const personChanged = !item || person.name.trim() !== item.personName || person.personId !== item.personId || person.guest !== !!item.guest
    const saved = personChanged ? await savePerson(person) : { personName: item.personName, personId: item.personId, guest: item.guest }
    const fields = {
      role,
      personName: saved.personName,
      personId: saved.personId,
      guest: saved.guest,
      speechTitle: title.trim() || undefined,
      pathwaysProject: project.trim() || undefined,
      evaluatesItemId: paired && evaluates ? evaluates : undefined,
      profileId: resolved.profileId,
      timing: resolved.timing,
    }
    if (item) {
      await repo.meetings.updateItem(meeting.id, item.id, fields)
      // The evaluator's brief is the same person: keep it in step when the evaluator changes.
      if (personChanged && item.role === "Evaluator")
        for (const brief of items.filter(
          other => other.role === "EvaluatorBrief" && other.evaluatesItemId === item.evaluatesItemId && other.personName === item.personName,
        ))
          await repo.meetings.updateItem(meeting.id, brief.id, { personName: saved.personName, personId: saved.personId, guest: saved.guest })
    } else {
      await repo.meetings.addItem(meeting.id, kind, fields)
    }
    if (role === "Evaluator" && withBrief && evaluates && !hasBrief)
      await repo.meetings.addItem(
        meeting.id,
        "prepared_speeches",
        {
          role: "EvaluatorBrief",
          personName: saved.personName,
          personId: saved.personId,
          guest: saved.guest,
          evaluatesItemId: evaluates,
          profileId: "evaluator_brief",
          timing: profileFor("EvaluatorBrief", rules, clubProfiles),
        },
        { before: evaluates },
      )
    done(item ? `${personLabel({ ...item, ...fields })} updated` : `${saved.personName} added`)
  }

  const remove = async () => {
    if (!item) return
    const name = personLabel(item)
    try {
      await repo.meetings.removeItem(meeting.id, item.id)
    } catch (error) {
      if (!(error instanceof RecordedTimeError)) throw error
      if (!confirm(`${name} has a recorded time. Remove them and their time permanently?`)) return
      await repo.meetings.removeItem(meeting.id, item.id, { confirmRecorded: true })
    }
    done(`${name} removed`)
  }

  return (
    <Sheet title={item ? `Edit ${personLabel(item)}` : `Add to ${segmentLabels[kind]}`} eyebrow="Agenda" onClose={close}>
      <label className="field-label">
        Role
        <select
          value={role}
          onChange={event => {
            const next = event.target.value as AgendaRole
            setRole(next)
            // Picking a role proposes its usual timing.
            if (!timed) setTiming({ profileId: defaultProfileIdForRole(next), text: "" })
          }}
        >
          {roles.map(r => (
            <option key={r} value={r}>
              {roleLabels[r]}
            </option>
          ))}
        </select>
      </label>
      <PersonField value={person} onChange={setPerson} people={people} />
      {(role === "Speaker" || role === "Other") && (
        <>
          <label className="field-label">
            Title
            <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Optional" />
          </label>
          {role === "Speaker" && (
            <label className="field-label">
              Project / level
              <input value={project} onChange={event => setProject(event.target.value)} placeholder="Optional, e.g. Level 2 · Mentoring" />
            </label>
          )}
        </>
      )}
      {paired && (
        <label className="field-label">
          Evaluating
          <select value={evaluates} onChange={event => setEvaluates(event.target.value)}>
            <option value="">Not paired yet</option>
            {speeches.map(speech => (
              <option key={speech.id} value={speech.id}>
                {speechLabel(speech)}
              </option>
            ))}
          </select>
        </label>
      )}
      {role === "Evaluator" && evaluates && !hasBrief && <Toggle label="Add a 1:00 brief before the speech" value={withBrief} onChange={setWithBrief} />}
      <TimingField role={role} value={timing} onChange={setTiming} rules={rules} clubProfiles={clubProfiles} locked={timed ? item!.timing : undefined} />
      <button className="primary-button sheet-submit" onClick={() => void save()} disabled={!canSave}>
        {item ? <PencilLine aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {item ? "Save changes" : "Add to agenda"}
      </button>
      {item && (
        <button className="secondary-button sheet-submit danger" onClick={() => void remove()}>
          <Trash2 size={18} aria-hidden="true" />
          Remove {personLabel(item)}
        </button>
      )}
    </Sheet>
  )
}

const templateSummary = (template: Template) => {
  const items = template.segments.flatMap(segment => segment.items)
  const count = (role: AgendaRole, one: string, many: string) => {
    const n = items.filter(item => item.role === role).length
    return n ? `${n} ${n === 1 ? one : many}` : ""
  }
  return (
    [count("Speaker", "speech", "speeches"), count("Evaluator", "evaluation", "evaluations"), count("EvaluatorBrief", "brief", "briefs")]
      .filter(Boolean)
      .join(" · ") || "Roles and timings"
  )
}

/** A blank meeting, or one from a built-in or saved template. The current meeting and its times stay saved. */
function NewMeetingSheet({ data, close, done }: { data: Data; close: () => void; done: (message: string) => void }) {
  const { meeting } = data
  const start = async (template?: Template) => {
    await repo.meetings.update(meeting.id, current => ({ ...current, status: current.status === "draft" ? "draft" : "finished" }))
    if (template) await repo.meetings.createFromTemplate(template, data.club)
    else await repo.meetings.create(meeting.clubId)
    done(template ? `New meeting from ${template.name}` : "New meeting started")
  }
  const remove = async (template: Template) => {
    if (!confirm(`Delete the template “${template.name}”? Meetings made from it are not changed.`)) return
    await repo.templates.remove(template.id)
  }
  return (
    <Sheet title="New meeting" eyebrow="Agenda" onClose={close}>
      <p className="sheet-note">This meeting and its times stay saved on this device.</p>
      <div className="template-list">
        <button className="template-choice" onClick={() => void start()}>
          <b>Blank meeting</b>
          <small>Add everyone yourself</small>
        </button>
        {builtInTemplates.map(template => (
          <button className="template-choice" key={template.id} onClick={() => void start(template)}>
            <b>{template.name} format</b>
            <small>{templateSummary(template)}</small>
          </button>
        ))}
        {data.templates.map(template => (
          <div className="template-saved" key={template.id}>
            <button className="template-choice" onClick={() => void start(template)}>
              <b>{template.name}</b>
              <small>Saved template · {templateSummary(template)}</small>
            </button>
            <button className="row-delete" aria-label={`Delete template ${template.name}`} onClick={() => void remove(template)}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function SaveTemplateSheet({ data, close, done }: { data: Data; close: () => void; done: (message: string) => void }) {
  const [name, setName] = useState(`${data.club?.name ?? "Club"} meeting`)
  const save = async () => {
    await repo.templates.saveMeeting(data.meeting.id, name)
    done(`Template “${name.trim()}” saved`)
  }
  return (
    <Sheet title="Save as template" eyebrow="Agenda" onClose={close}>
      <p className="sheet-note">Keeps the order, roles, timings and evaluator pairings. Names, titles and Table Topics participants are left out.</p>
      <label className="field-label">
        Template name
        <input value={name} onChange={event => setName(event.target.value)} />
      </label>
      <button className="primary-button sheet-submit" onClick={() => void save()} disabled={!name.trim()}>
        <BookmarkPlus aria-hidden="true" />
        Save template
      </button>
    </Sheet>
  )
}
