import { useId, useMemo, useState } from "react"
import { Trash2, UserPlus } from "lucide-react"
import type { Guest, Member } from "../domain"
import { matchPeople, type Person } from "../engine/people"
import { repo } from "./runtime"

/** What a person field holds: a name, and who it is once the Timer picked someone. */
export type PersonChoice = { name: string; personId?: string; guest: boolean }

export const peopleOf = (members: Member[], guests: Guest[]): Person[] => [
  ...members.map(member => ({ id: member.id, name: member.name, aliases: member.aliases, kind: "member" as const })),
  ...guests.map(guest => ({ id: guest.id, name: guest.name, kind: "guest" as const })),
]

/** The person as stored on an agenda item. New names become a club member or a guest, as the Timer chose. */
export async function savePerson(choice: PersonChoice): Promise<{ personName: string; personId?: string; guest?: true }> {
  const personName = choice.name.trim()
  if (!personName) return { personName }
  if (choice.personId) return { personName, personId: choice.personId }
  // Exactly the same name is the same person. Anything only similar was offered as a suggestion instead.
  const member = (await repo.members.list()).find(existing => existing.name === personName)
  if (member) return { personName, personId: member.id }
  if (choice.guest) {
    await repo.guests.add(personName)
    return { personName, guest: true }
  }
  return { personName, personId: (await repo.members.add(personName)).id }
}

/**
 * A name field with lenient suggestions from the club members and earlier
 * guests. A suggestion is only used when the Timer picks it: a similar name
 * is never merged on its own. A new name is saved as a member or a guest.
 */
export function PersonField({
  value,
  onChange,
  people,
  label = "Name",
  placeholder = "e.g. Taylor Brooks",
}: {
  value: PersonChoice
  onChange: (value: PersonChoice) => void
  people: Person[]
  label?: string
  placeholder?: string
}) {
  const hintId = useId()
  const identical = people.find(person => person.name === value.name.trim() && (person.kind === "member" || value.guest))
  const kind = value.personId ? "member" : identical?.kind
  const matches = useMemo(() => (kind ? [] : matchPeople(value.name, people)), [kind, value.name, people])
  return (
    <div className="person-field">
      <label className="field-label">
        {label}
        <input
          value={value.name}
          placeholder={placeholder}
          autoComplete="off"
          aria-describedby={hintId}
          onChange={event => onChange({ name: event.target.value, guest: value.guest })}
        />
      </label>
      <div id={hintId} className="person-hint">
        {kind ? (
          <span className={`person-chip ${kind}`}>{kind === "member" ? "Club member" : "Guest"}</span>
        ) : (
          value.name.trim() && (
            <span className="person-new" role="group" aria-label={`Add ${value.name.trim()} as`}>
              New:
              <button type="button" aria-pressed={!value.guest} onClick={() => onChange({ ...value, guest: false })}>
                Club member
              </button>
              <button type="button" aria-pressed={value.guest} onClick={() => onChange({ ...value, guest: true })}>
                Guest
              </button>
            </span>
          )
        )}
      </div>
      {matches.length > 0 && (
        <ul className="person-suggestions" aria-label="Suggestions">
          {matches.map(({ person, sameName }) => (
            <li key={`${person.kind}-${person.id}`}>
              <button
                type="button"
                onClick={() =>
                  onChange(person.kind === "member" ? { name: person.name, personId: person.id, guest: false } : { name: person.name, guest: true })
                }
              >
                {sameName ? "Use" : "Did you mean"} <b>{person.name}</b>
                <small>{person.kind === "member" ? "Club member" : "Guest"}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The club's member list. Adding a name like an existing one asks first and never merges. */
export function MembersCard({ members, readOnly, notify }: { members: Member[]; readOnly: boolean; notify: (message: string) => void }) {
  const [name, setName] = useState("")
  const people = useMemo(() => peopleOf(members, []), [members])
  const similar = matchPeople(name, people)
  const add = async () => {
    await repo.members.add(name)
    notify(`${name.trim()} added to the club members`)
    setName("")
  }
  const remove = async (member: Member) => {
    if (!confirm(`Remove ${member.name} from the club members? Past meetings keep their name.`)) return
    await repo.members.remove(member.id)
  }
  return (
    <section className="settings-card" aria-labelledby="members-heading">
      <h2 id="members-heading">
        Club members <small>{members.length}</small>
      </h2>
      <label>
        New member
        <input value={name} onChange={event => setName(event.target.value)} placeholder="Full name" disabled={readOnly} autoComplete="off" />
      </label>
      {name.trim() && similar.length > 0 && (
        <p className="person-warning" role="status">
          Already in the list? {similar.map(match => match.person.name).join(", ")}
        </p>
      )}
      <button className="secondary-button" onClick={() => void add()} disabled={readOnly || !name.trim()}>
        <UserPlus size={18} aria-hidden="true" />
        {similar.length ? "Add as a new member" : "Add member"}
      </button>
      {members.length > 0 && (
        <ul className="member-list">
          {members.map(member => (
            <li key={member.id}>
              <span>{member.name}</span>
              <button className="row-delete" aria-label={`Remove ${member.name}`} onClick={() => void remove(member)} disabled={readOnly}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
