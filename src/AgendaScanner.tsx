import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Camera, FileImage, LoaderCircle, Plus, RotateCcw, ScanLine, Trash2, Upload, X } from "lucide-react"
import { agendaRoleOptions, classifyOcrError, mergeAgendaDrafts, mergeAgendaIntoMeeting, parseAgenda, segmentForAgendaRole, type AgendaDraft, type AgendaItem, type MergeMode } from "./engine/agenda"
import { type Meeting, type Settings } from "./engine/types"

type Mode = "pick" | "processing" | "review" | "error"
type SelectedImage = { id: string; file: File; preview: string; status: "ready" | "processing" | "done" | "failed"; error?: string }
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const uid = () => crypto.randomUUID()
const localDate = () => new Date().toISOString().slice(0, 10)
const newItem = (): AgendaItem => ({ id: uid(), role: "unknown", name: "", title: "", uncertain: ["Choose a role and enter a participant name"], source: "Added during review" })

export default function AgendaScanner({ meeting, settings, onImport, onClose }: { meeting: Meeting; settings: Settings; onImport: (meeting: Meeting) => void; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("pick"), [images, setImages] = useState<SelectedImage[]>([]), [draft, setDraft] = useState<AgendaDraft>(), [progress, setProgress] = useState(0), [statusText, setStatusText] = useState("Choose agenda photos"), [error, setError] = useState(""), [merge, setMerge] = useState<MergeMode>("append"), [imported, setImported] = useState(false)
  const input = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null), cancelled = useRef(false)
  const hasExisting = meeting.segments.some(segment => segment.turns.length > 0)
  const imagesRef = useRef<SelectedImage[]>([])
  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => () => { imagesRef.current.forEach(image => URL.revokeObjectURL(image.preview)) }, [])
  const validItems = useMemo(() => draft?.items.filter(item => item.name.trim() && item.role !== "unknown" && item.segment) || [], [draft])
  const addFiles = (files: FileList | File[]) => {
    const accepted: SelectedImage[] = [], problems: string[] = []
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) problems.push(`${file.name}: choose an image file.`)
      else if (file.size > MAX_IMAGE_BYTES) problems.push(`${file.name}: larger than 15 MB.`)
      else accepted.push({ id: uid(), file, preview: URL.createObjectURL(file), status: "ready" })
    })
    if (accepted.length) { setImages(current => [...current, ...accepted]); setError(problems.join(" ")); setMode("pick") }
    else if (problems.length) { setError(problems.join(" ")); setMode("error") }
  }
  const removeImage = (id: string) => setImages(current => { const image = current.find(candidate => candidate.id === id); if (image) URL.revokeObjectURL(image.preview); return current.filter(candidate => candidate.id !== id) })
  const moveImage = (index: number, direction: number) => setImages(current => { const destination = index + direction; if (destination < 0 || destination >= current.length) return current; const next = [...current]; [next[index], next[destination]] = [next[destination], next[index]]; return next })
  const runOcr = async (onlyIds?: string[]) => {
    const work = images.filter(image => onlyIds ? onlyIds.includes(image.id) : image.status !== "done")
    if (!work.length) return
    cancelled.current = false; setImported(false); setMode("processing"); setProgress(0); setError(""); setStatusText("Preparing local OCR…")
    let stage: "worker-init" | "loading-core" | "loading-lang" | "initializing" | "recognizing" = "worker-init"
    let worker: { recognize: (image: File) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> } | null = null
    const drafts: AgendaDraft[] = []
    try {
      const { createWorker, OEM } = await import("tesseract.js")
      worker = await createWorker("eng", OEM?.LSTM_ONLY ?? 1, { logger: message => {
        if (message.status === "loading tesseract core") { stage = "loading-core"; setStatusText("Loading OCR engine…") }
        else if (message.status === "loading language traineddata") { stage = "loading-lang"; setStatusText("Downloading English language model…") }
        else if (message.status === "initializing api") { stage = "initializing"; setStatusText("Initializing OCR…") }
        else if (message.status === "recognizing text") stage = "recognizing"
      } })
      for (let index = 0; index < work.length; index++) {
        if (cancelled.current) break
        const image = work[index]
        setImages(current => current.map(candidate => candidate.id === image.id ? { ...candidate, status: "processing", error: undefined } : candidate))
        setStatusText(`Reading image ${index + 1} of ${work.length}: ${image.file.name}`)
        try {
          stage = "recognizing"
          const result = await worker.recognize(image.file), page = parseAgenda(result?.data?.text || "")
          if (!page.originalText) throw new Error("No text detected")
          drafts.push(page)
          setImages(current => current.map(candidate => candidate.id === image.id ? { ...candidate, status: "done" } : candidate))
        } catch (cause) {
          const info = classifyOcrError(cause, { stage, hasText: false })
          setImages(current => current.map(candidate => candidate.id === image.id ? { ...candidate, status: "failed", error: info.userMessage } : candidate))
        }
        setProgress(Math.round(((index + 1) / work.length) * 100))
      }
      if (drafts.length) { setDraft(current => mergeAgendaDrafts([...(current ? [current] : []), ...drafts])); setMode("review") }
      else { const info = classifyOcrError(null, { stage, hasText: false }); setError(info.userMessage); setMode("error") }
    } catch (cause) { const info = classifyOcrError(cause, { stage, hasText: false }); console.error(info.logMessage); setError(info.userMessage); setMode("error") }
    finally { if (worker) try { await worker.terminate() } catch { /* cleanup only */ } }
  }
  const update = (id: string, patch: Partial<AgendaItem>) => setDraft(current => current ? { ...current, items: current.items.map(item => item.id === id ? { ...item, ...patch, uncertain: patch.name?.trim() || (patch.role !== undefined && patch.role !== "unknown") ? item.uncertain.filter(note => !/name|role/i.test(note)) : item.uncertain } : item) } : current)
  const importDraft = () => { if (!draft || !validItems.length || imported) return; setImported(true); onImport(mergeAgendaIntoMeeting(meeting, draft, settings, merge, { idGenerator: uid, localDateFallback: localDate() })) }
  return <section className="screen agenda-scanner">
    <div className="screen-title"><div><span className="eyebrow">Meeting plan</span><h1>Scan Meeting Agenda</h1></div><button className="icon-button" aria-label="Close agenda scanner" onClick={onClose}><X /></button></div>
    <p className="scanner-privacy">Your agenda stays on this device. Tommy processes photos locally. The OCR engine and English language file may download once before the first scan.</p>
    {mode === "pick" && <><div className="scanner-actions"><button className="primary-button" onClick={() => camera.current?.click()}><Camera />Take photo</button><button className="secondary-button" onClick={() => input.current?.click()}><Upload />Add photos</button></div><input ref={camera} aria-label="Take agenda photo" className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={event => event.target.files && addFiles(event.target.files)} /><input ref={input} aria-label="Upload agenda images" className="visually-hidden" type="file" accept="image/*" multiple onChange={event => event.target.files && addFiles(event.target.files)} />
      {images.length ? <div className="image-list" aria-label="Selected agenda photos">{images.map((image, index) => <article className="image-card" key={image.id}><img src={image.preview} alt={`Agenda photo ${index + 1}: ${image.file.name}`} /><div><b>Photo {index + 1}</b><small>{image.file.name}</small>{image.status === "failed" && <small className="scanner-warning">{image.error}</small>}</div><div className="image-controls"><button aria-label={`Move photo ${index + 1} earlier`} disabled={!index} onClick={() => moveImage(index, -1)}>↑</button><button aria-label={`Move photo ${index + 1} later`} disabled={index === images.length - 1} onClick={() => moveImage(index, 1)}>↓</button><button aria-label={`Remove photo ${index + 1}`} onClick={() => removeImage(image.id)}><Trash2 size={16} /></button></div></article>)}</div> : <div className="scan-preview"><ScanLine size={42} aria-hidden="true" /></div>}
      {images.length > 0 && <div className="scanner-actions"><button className="primary-button" onClick={() => runOcr()}><ScanLine />Review agenda</button><button className="secondary-button" onClick={() => input.current?.click()}><Plus />Add another photo</button></div>}<p className="scanner-hint"><FileImage size={16} /> Add pages in reading order. JPEG, PNG, WebP and other browser-supported image formats work; each photo can be up to 15 MB.</p></>}
    {mode === "processing" && <div className="scanner-processing" role="status" aria-live="polite"><LoaderCircle className="spin" size={36} /><h2>Reading your agenda</h2><p>{statusText}</p><progress value={progress} max="100">{progress}%</progress><button className="text-button" onClick={() => { cancelled.current = true }}>Finish current image</button></div>}
    {mode === "error" && <div className="scanner-error" role="alert"><h2>We could not read that agenda</h2><p>{error}</p><div className="scanner-actions"><button className="primary-button" onClick={() => setMode("pick")}><RotateCcw />Manage photos</button><button className="secondary-button" onClick={() => input.current?.click()}>Choose another image</button></div></div>}
    {mode === "review" && draft && <><div className="scanner-review-head"><h2>Review before import</h2><p>Confirm names and destinations before Tommy changes your live queues.</p></div>{draft.warnings.map(warning => <p className="scanner-warning" key={warning}>{warning}</p>)}<div className="scanner-meta"><label>Meeting title<input value={draft.title} placeholder="Needs review" onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><label>Meeting date<input value={draft.date} placeholder="Needs review" onChange={event => setDraft({ ...draft, date: event.target.value })} /></label></div><div className="agenda-items">{draft.items.map((item, index) => <article className={`agenda-item ${item.uncertain.length ? "needs-review" : ""}`} key={item.id}><div className="agenda-item-head"><b>Item {index + 1}</b><button aria-label={`Remove agenda item ${index + 1}`} className="row-delete" onClick={() => setDraft({ ...draft, items: draft.items.filter(candidate => candidate.id !== item.id) })}><Trash2 size={16} /></button></div>{item.uncertain.map(note => <small className="scanner-warning" key={note}>{note}</small>)}<label>Role / queue destination<select value={item.role} onChange={event => { const role = event.target.value as AgendaItem["role"]; update(item.id, { role, segment: segmentForAgendaRole(role) }) }}>{agendaRoleOptions.map(role => <option key={role} value={role}>{role === "unknown" ? "Choose role" : role}</option>)}</select></label><label>Participant<input value={item.name} placeholder="Name needs review" onChange={event => update(item.id, { name: event.target.value })} /></label><label>{item.role === "Evaluation" ? "Evaluator note" : "Speech title"}<input value={item.title} placeholder="Optional" onChange={event => update(item.id, { title: event.target.value })} /></label><details><summary>Recognized line</summary><p>{item.source}</p></details></article>)}</div><button className="secondary-button scanner-add" onClick={() => setDraft({ ...draft, items: [...draft.items, newItem()] })}><Plus />Add agenda item</button><details className="ocr-text"><summary>Inspect extracted text</summary><pre>{draft.originalText}</pre></details><div className="scanner-actions"><button className="secondary-button" onClick={() => setMode("pick")}><ArrowLeft />Add or reorder photos</button>{images.some(image => image.status === "failed") && <button className="secondary-button" onClick={() => runOcr(images.filter(image => image.status === "failed").map(image => image.id))}>Retry failed photos</button>}</div>{hasExisting && <fieldset className="import-choice"><legend>Existing meeting items</legend><label><input type="radio" checked={merge === "append"} onChange={() => setMerge("append")} />Append new items (skips duplicates)</label><label><input type="radio" checked={merge === "replace"} onChange={() => setMerge("replace")} />Replace queued items only (preserves completed and running turns)</label></fieldset>}<div className="scanner-actions"><button className="primary-button" disabled={!validItems.length || imported} onClick={importDraft}>{imported ? "Importing…" : `Import ${validItems.length} confirmed item${validItems.length === 1 ? "" : "s"}`}</button><button className="text-button" onClick={onClose}>Cancel</button></div></>}
  </section>
}
