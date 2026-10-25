import { MAX_PAGES, type AgendaImage } from "../engine/import/wire"

/**
 * Photos are resized on the phone before upload. Gemini 3 spends a fixed
 * 1,120 tokens per image at its default resolution whatever the pixel size,
 * so pixels beyond what keeps small print legible only slow the upload.
 * 2048 px on the long edge keeps 8-point agenda text readable and a photo
 * well under 1 MB.
 */
export const LONG_EDGE = 2048
const QUALITY = 0.85

/** The size to draw a photo at: never enlarged, long edge at most `max`. */
export function fitWithin(width: number, height: number, max = LONG_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * One page ready to send: photos are turned upright from their camera
 * orientation, scaled down and re-encoded as JPEG; PDFs are sent as they are.
 */
export async function preparePage(file: File): Promise<AgendaImage> {
  if (file.type === "application/pdf") return { mimeType: "application/pdf", data: await toBase64(file) }
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY })
  return { mimeType: "image/jpeg", data: await toBase64(blob) }
}

/** All pages of one agenda, in the order the Timer chose them. */
export async function preparePages(files: File[]): Promise<AgendaImage[]> {
  if (!files.length || files.length > MAX_PAGES) throw new RangeError(`Choose 1 to ${MAX_PAGES} pages.`)
  return Promise.all(files.map(preparePage))
}
