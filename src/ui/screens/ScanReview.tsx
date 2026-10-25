import { useMemo, useState } from "react"
import { AlertTriangle, ArrowDown, ArrowUp, Check, Image as ImageIcon, List, ScanLine, Trash2, X } from "lucide-react"
import { buildDraft, type DraftItem, type ImportDraft } from "../../engine/import/build"
import {
  acceptFlag,
  applySuggestion,
  canConfirm,
  flagId,
  itemsOf,
  moveDraftItem,
  openFlags,
  removeItem,
  renameItem,
  startReview,
  summarizeCorrections,
  type Review,
} from "../../engine/import/review"
import { roleLabels, segmentLabels } from "../../engine/profiles"
import { Sheet } from "../components"
import type { AppData } from "../hooks"
import { peopleOf } from "../people"
import { repo } from "../runtime"
import { scanAgenda } from "../scan-api"
import { preparePages, type Page } from "../scan-images"
import { thresholdsText } from "../timing-field"

export type ScannedAgenda = { draft: ImportDraft; model: string; pages: Page[] }

/** Pick the agenda pages and send them to /api/parse-agenda. Every failure offers the manual builder. */
export function ScanSheet({ data, close, scanned }: { data: AppData; close: () => void; scanned: (result: ScannedAgenda) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const read = async () => {
    setBusy(true)
    setError(undefined)
    const { pages, problem } = await preparePages(files)
    if (problem) {
      setBusy(false)
      setError(problem)
      return
    }
    const outcome = await scanAgenda(pages.map(page => page.image))
    setBusy(false)
    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    const draft = buildDraft(outcome.result.agenda, { rules: data.rules, clubProfiles: data.clubProfiles, people: peopleOf(data.members, data.guests) })
    scanned({ draft, model: outcome.result.model, pages })
  }
  return (
    <Sheet title="Scan an agenda" eyebrow="New meeting" onClose={close}>
      <p className="sheet-note">
        Take a photo of the printed agenda, or pick up to 4 photos or a PDF. You check every row before it becomes the meeting. Needs an internet connection.
      </p>
      <label className="field-label">
        Agenda pages
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
          multiple
          onChange={event => setFiles([...(event.target.files ?? [])])}
          disabled={busy}
        />
      </label>
      {error && (
        <p className="scan-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          {error}
        </p>
      )}
      <button className="primary-button sheet-submit" onClick={() => void read()} disabled={busy || files.length === 0}>
        <ScanLine aria-hidden="true" />
        {busy ? "Reading the agenda…" : "Read the agenda"}
      </button>
      <button className="secondary-button sheet-submit" onClick={close}>
        Build it by hand instead
      </button>
    </Sheet>
  )
}

/**
 * The photo beside the rows Tommy read from it. Flagged rows are highlighted
 * with the reason in words; "Use this agenda" stays off until every flag is
 * fixed or kept as read.
 */
export function ReviewScreen({
  scan,
  clubId,
  cancel,
  confirmed,
}: {
  scan: ScannedAgenda
  clubId?: string
  cancel: () => void
  confirmed: (message: string) => void
}) {
  const [review, setReview] = useState<Review>(() => startReview(scan.draft))
  const [applied, setApplied] = useState(0)
  const [view, setView] = useState<"list" | "photo">("list")
  const [selected, setSelected] = useState<string>()
  const [zoomed, setZoomed] = useState(false)
  const open = openFlags(review)
  const openIds = useMemo(() => new Set(open.map(entry => entry.id)), [open])
  const total = itemsOf(review.draft).length
  const selectedItem = itemsOf(review.draft).find(item => item.key === selected)
  const unreadable = review.draft.problems.length > 0 && total === 0

  const confirmAgenda = async () => {
    const summary = summarizeCorrections(scan.draft, review, applied)
    await repo.imports.confirm({ original: scan.draft, final: review.draft, summary, model: scan.model, clubId })
    confirmed(`Agenda imported: ${total} ${total === 1 ? "item" : "items"}`)
  }
  const discard = () => {
    const changed = review.draft !== scan.draft || review.accepted.size > 0
    if (!changed || confirm("Discard this scan? Nothing is saved; your current meeting stays as it is.")) cancel()
  }

  return (
    <section className="screen review-screen" aria-labelledby="review-title">
      <div className="screen-title">
        <div>
          <span className="eyebrow">Scanned agenda</span>
          <h1 id="review-title">Check the agenda</h1>
        </div>
        <button className="secondary-button" onClick={discard}>
          <X size={18} aria-hidden="true" />
          Discard scan
        </button>
      </div>

      <MeetingLine draft={review.draft} />

      {review.draft.problems.length > 0 && (
        <section className="agenda-warnings" aria-label="Problems with the photo">
          <ul>
            {review.draft.problems.map(problem => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          {unreadable && <small>Try a sharper, straighter photo, or build the agenda by hand.</small>}
        </section>
      )}

      <div className="review-summary" role="status">
        <span>
          {total} {total === 1 ? "item" : "items"} read
        </span>
        <b>{open.length === 0 ? "Nothing left to check" : `${open.length} to check`}</b>
      </div>

      {scan.pages.length > 0 && (
        <div className="review-view-toggle" role="group" aria-label="Show">
          <button aria-pressed={view === "list"} onClick={() => setView("list")}>
            <List size={18} aria-hidden="true" />
            Rows
          </button>
          <button aria-pressed={view === "photo"} onClick={() => setView("photo")}>
            <ImageIcon size={18} aria-hidden="true" />
            Photo
          </button>
        </div>
      )}

      <div className={`review-layout show-${view}`}>
        {scan.pages.length > 0 && (
          <section className="review-photo" aria-label="Agenda photo">
            {selectedItem && (
              <p className="review-looking-for">
                Find on the photo: <q>{selectedItem.source}</q>
              </p>
            )}
            <div className={zoomed ? "review-pages zoomed" : "review-pages"}>
              {scan.pages.map((page, index) =>
                page.previewUrl ? (
                  <img key={page.name + index} src={page.previewUrl} alt={`Agenda page ${index + 1}`} />
                ) : (
                  <p key={page.name + index} className="sheet-note">
                    {page.name}: PDF pages are not previewed. Open the file beside Tommy to compare.
                  </p>
                ),
              )}
            </div>
            <button className="secondary-button" onClick={() => setZoomed(!zoomed)} aria-pressed={zoomed}>
              {zoomed ? "Fit to screen" : "Zoom in"}
            </button>
          </section>
        )}

        <div className="review-list">
          {review.draft.segments.map((segment, segmentIndex) => (
            <section className="review-segment" key={`${segment.kind}-${segmentIndex}`} aria-label={segment.title ?? segmentLabels[segment.kind]}>
              <h2>{segment.title ?? segmentLabels[segment.kind]}</h2>
              <ol>
                {segment.items.map((item, index) => (
                  <ReviewRow
                    key={item.key}
                    item={item}
                    first={index === 0}
                    last={index === segment.items.length - 1}
                    evaluates={item.evaluatesKey ? itemsOf(review.draft).find(other => other.key === item.evaluatesKey) : undefined}
                    openIds={openIds}
                    selected={item.key === selected}
                    select={() => setSelected(item.key)}
                    rename={name => setReview(current => renameItem(current, item.key, name))}
                    fix={index => {
                      setReview(current => applySuggestion(current, item.key, index))
                      setApplied(count => count + 1)
                    }}
                    accept={index => setReview(current => acceptFlag(current, item.key, index))}
                    move={direction => setReview(current => moveDraftItem(current, item.key, direction))}
                    remove={() => setReview(current => removeItem(current, item.key))}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>

      <div className="review-actions">
        <button className="primary-button" onClick={() => void confirmAgenda()} disabled={!canConfirm(review)}>
          <Check aria-hidden="true" />
          Use this agenda
        </button>
        {!canConfirm(review) && total > 0 && <small>Fix each highlighted row, or keep it as read, to continue.</small>}
      </div>
    </section>
  )
}

function MeetingLine({ draft }: { draft: ImportDraft }) {
  const { club, date, theme, wordOfTheDay } = draft.meeting
  const parts = [club, date, theme && `Theme: ${theme}`, wordOfTheDay && `Word of the day: ${wordOfTheDay}`].filter(Boolean)
  if (!parts.length) return null
  return <p className="review-meeting">{parts.join(" · ")}</p>
}

function ReviewRow({
  item,
  first,
  last,
  evaluates,
  openIds,
  selected,
  select,
  rename,
  fix,
  accept,
  move,
  remove,
}: {
  item: DraftItem
  first: boolean
  last: boolean
  evaluates?: DraftItem
  openIds: Set<string>
  selected: boolean
  select: () => void
  rename: (name: string) => void
  fix: (index: number) => void
  accept: (index: number) => void
  move: (direction: -1 | 1) => void
  remove: () => void
}) {
  const [name, setName] = useState(item.personName)
  const flagged = item.flags.some((_, index) => openIds.has(flagId(item, index)))
  const label = item.roleAsWritten && item.roleAsWritten !== roleLabels[item.role] ? `${roleLabels[item.role]} (${item.roleAsWritten})` : roleLabels[item.role]
  const who = item.personName || label
  return (
    <li className={["review-row", flagged && "flagged", selected && "selected"].filter(Boolean).join(" ")} onFocus={select} onClick={select}>
      <div className="review-row-head">
        <b>{label}</b>
        {item.plannedStart && <small>{item.plannedStart}</small>}
      </div>
      <label className="field-label">
        Name
        <input
          value={name}
          placeholder="No name"
          aria-label={`Name for ${label}${item.plannedStart ? ` at ${item.plannedStart}` : ""}`}
          onChange={event => setName(event.target.value)}
          onBlur={() => name.trim() !== item.personName && rename(name.trim())}
        />
      </label>
      <small className="review-detail">
        {item.timed === false ? "Not timed" : thresholdsText(item.timing)}
        {evaluates && ` · Evaluating: ${evaluates.personName || roleLabels[evaluates.role]}`}
        {item.speechTitle && ` · “${item.speechTitle}”`}
      </small>
      <small className="review-source">Printed: {item.source}</small>
      {item.flags.length > 0 && (
        <ul className="review-flags">
          {item.flags.map((flag, index) => {
            const isOpen = openIds.has(flagId(item, index))
            return (
              <li key={`${index}-${flag.message}`} className={isOpen ? "open" : "kept"}>
                <span>
                  {isOpen ? <AlertTriangle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                  {isOpen ? flag.message : `Kept as read: ${flag.message}`}
                </span>
                {isOpen && (
                  <span className="review-flag-actions">
                    {flag.suggestion && (
                      <button
                        className="secondary-button"
                        onClick={() => {
                          fix(index)
                          if (flag.suggestion?.patch.personName !== undefined) setName(flag.suggestion.patch.personName)
                        }}
                      >
                        {flag.suggestion.label}
                      </button>
                    )}
                    <button className="secondary-button" onClick={() => accept(index)}>
                      Keep as read
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="review-row-tools">
        <button className="icon-button" aria-label={`Move ${who} up`} onClick={() => move(-1)} disabled={first}>
          <ArrowUp size={18} aria-hidden="true" />
        </button>
        <button className="icon-button" aria-label={`Move ${who} down`} onClick={() => move(1)} disabled={last}>
          <ArrowDown size={18} aria-hidden="true" />
        </button>
        <button className="icon-button" aria-label={`Remove ${who}`} onClick={remove}>
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
