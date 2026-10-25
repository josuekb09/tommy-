import { useEffect, useId, useRef, type ReactNode } from "react"
import { X } from "lucide-react"

/** A bottom sheet with dialog semantics: labelled, Escape closes it, focus returns to the trigger. */
export function Sheet({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.icon-button)")
    first?.focus()
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      opener?.focus?.()
    }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section ref={panel} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="toggle-line">
      <span>{label}</span>
      <button role="switch" aria-label={label} aria-checked={value} className={value ? "on" : ""} onClick={() => onChange(!value)}>
        <i />
      </button>
    </div>
  )
}

export function download(filename: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = Object.assign(document.createElement("a"), { href: url, download: filename })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
