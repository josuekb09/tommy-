import type { Signal } from "../domain"
import { signalPresentation } from "./signals"

/** Window Management API (Chromium). Not yet in TypeScript's DOM types. */
type ScreenDetailed = Screen & { availLeft: number; availTop: number; isPrimary: boolean }
type ScreenDetails = { screens: ScreenDetailed[]; currentScreen: ScreenDetailed }
type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> }

export type PresentResult = "second-screen" | "new-window" | "blocked"

/**
 * Opens the speaker view. The window is opened at once (inside the click, so
 * pop-up blockers allow it); then, where the Window Management API is
 * available and the user allows it, it is moved to fill another screen.
 */
export async function openSpeakerWindow(): Promise<PresentResult> {
  const popup = window.open("#/speaker", "tommy-speaker", "popup,width=960,height=600")
  if (!popup) return "blocked"
  const getScreenDetails = (window as WindowWithScreens).getScreenDetails
  if (!getScreenDetails) return "new-window"
  try {
    const details = await getScreenDetails.call(window)
    const other = details.screens.find(screen => screen !== details.currentScreen)
    if (!other) return "new-window"
    popup.moveTo(other.availLeft, other.availTop)
    popup.resizeTo(other.availWidth, other.availHeight)
    return "second-screen"
  } catch {
    return "new-window" // Permission refused: the window stays where it opened.
  }
}

export const openZoomWindow = () => window.open("#/zoom", "tommy-zoom", "popup,width=960,height=540") !== null

/** Presentation API: lets Chrome send the speaker view to a cast-capable display. */
export const canCast = () => typeof (window as Window & { PresentationRequest?: unknown }).PresentationRequest === "function"
export async function castSpeakerView() {
  const Request = (window as unknown as { PresentationRequest: new (urls: string[]) => { start(): Promise<unknown> } }).PresentationRequest
  await new Request([new URL("#/speaker", window.location.href).href]).start()
}

/** Colours and patterns of the signal backgrounds; they match the Timer screen. */
const palette: Record<Signal, { bg: string; fg: string }> = {
  none: { bg: "#172033", fg: "#ffffff" },
  green: { bg: "#0b6b3a", fg: "#ffffff" },
  amber: { bg: "#ffb400", fg: "#1a1a1a" },
  red: { bg: "#b0001c", fg: "#ffffff" },
  overtime: { bg: "#5c0011", fg: "#ffffff" },
  disqualified: { bg: "#2b2b2b", fg: "#ffffff" },
}
export const backgroundSignals: Signal[] = ["green", "amber", "red", "overtime"]

/** Draws a 1920×1080 virtual background: the colour, a pattern, the signal's shape and its word. */
export function drawBackground(signal: Signal, canvas: HTMLCanvasElement = document.createElement("canvas")) {
  canvas.width = 1920
  canvas.height = 1080
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is not available")
  const { bg, fg } = palette[signal]
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 1920, 1080)

  // A pattern per signal, as on screen, so the backgrounds are distinguishable without colour.
  ctx.strokeStyle = fg
  ctx.globalAlpha = 0.1
  ctx.lineWidth = 12
  const stripes = (angle: number) => {
    ctx.save()
    ctx.translate(960, 540)
    ctx.rotate(angle)
    for (let x = -1400; x < 1400; x += 44) {
      ctx.beginPath()
      ctx.moveTo(x, -1400)
      ctx.lineTo(x, 1400)
      ctx.stroke()
    }
    ctx.restore()
  }
  if (signal === "amber") stripes(Math.PI / 4)
  if (signal === "red") stripes(Math.PI / 2)
  if (signal === "overtime") {
    stripes(Math.PI / 4)
    stripes(-Math.PI / 4)
  }
  if (signal === "green") {
    ctx.fillStyle = fg
    for (let x = 18; x < 1920; x += 36) for (let y = 18; y < 1080; y += 36) ctx.fillRect(x - 3, y - 3, 6, 6)
  }
  ctx.globalAlpha = 1

  // The shape: circle, triangle, square, octagon with a cross.
  ctx.fillStyle = fg
  ctx.strokeStyle = fg
  ctx.lineWidth = 28
  const cx = 960
  const cy = 430
  const r = 190
  ctx.beginPath()
  if (signal === "green") ctx.arc(cx, cy, r, 0, Math.PI * 2)
  if (signal === "amber") {
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx + r * 1.1, cy + r * 0.9)
    ctx.lineTo(cx - r * 1.1, cy + r * 0.9)
    ctx.closePath()
  }
  if (signal === "red") ctx.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7)
  if (signal === "green" || signal === "amber" || signal === "red") ctx.fill()
  if (signal === "overtime" || signal === "disqualified") {
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI / 8 + (i * Math.PI) / 4
      ctx[i === 0 ? "moveTo" : "lineTo"](cx + r * Math.cos(angle), cy + r * Math.sin(angle))
    }
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.45, cy - r * 0.45)
    ctx.lineTo(cx + r * 0.45, cy + r * 0.45)
    ctx.moveTo(cx + r * 0.45, cy - r * 0.45)
    ctx.lineTo(cx - r * 0.45, cy + r * 0.45)
    ctx.stroke()
  }

  ctx.font = "800 150px Inter, Arial, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(signalPresentation[signal].label, cx, 900)
  return canvas
}

export async function downloadBackgrounds() {
  for (const signal of backgroundSignals) {
    const blob = await new Promise<Blob | null>(resolve => drawBackground(signal).toBlob(resolve, "image/png"))
    if (!blob) continue
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement("a"), { href: url, download: `tommy-background-${signal}.png` }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
}
