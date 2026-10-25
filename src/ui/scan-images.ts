import { imageTypes, MAX_PAGE_BASE64, MAX_PAGES, type AgendaImage } from "../engine/import/wire"

export type Page = { image: AgendaImage; previewUrl?: string; name: string }

const LONG_SIDE = 2000

/**
 * Agenda files ready to send: photos are scaled to about 2000 px on the long
 * side and re-encoded as JPEG (EXIF orientation applied by the browser);
 * PDFs, and photos the browser cannot decode, are sent as they are.
 */
export async function preparePages(files: File[]): Promise<{ pages: Page[]; problem?: string }> {
  if (files.length > MAX_PAGES) return { pages: [], problem: `Up to ${MAX_PAGES} pages at a time.` }
  const pages: Page[] = []
  for (const file of files) {
    const type = (imageTypes as readonly string[]).includes(file.type) ? (file.type as AgendaImage["mimeType"]) : undefined
    if (!type) return { pages: [], problem: `${file.name} is not a photo or PDF.` }
    const image = (type.startsWith("image/") && (await scaled(file))) || { mimeType: type, data: await base64(file) }
    if (image.data.length > MAX_PAGE_BASE64) return { pages: [], problem: `${file.name} is too large. Try a smaller photo.` }
    pages.push({ image, name: file.name, ...(image.mimeType !== "application/pdf" && { previewUrl: `data:${image.mimeType};base64,${image.data}` }) })
  }
  return { pages }
}

async function scaled(file: File): Promise<AgendaImage | undefined> {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return undefined
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 })
    return { mimeType: "image/jpeg", data: await base64(blob) }
  } catch {
    // HEIC on most browsers, or a damaged file: let the server try the original.
    return undefined
  }
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
