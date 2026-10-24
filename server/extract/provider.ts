import type { RawAgenda } from "../../src/engine/import/extraction"
import type { AgendaImage, ScanErrorKind, Usage } from "../../src/engine/import/wire"

export type ExtractResult = { agenda: RawAgenda; model: string; usage: Usage; ms: number }

/**
 * The one seam between Tommy and a vision model: the pages of one agenda in,
 * a transcription out. The clean-up layer (src/engine/import/build.ts) never
 * sees the provider, so a model can be swapped by writing another extractor.
 */
export interface AgendaExtractor {
  readonly model: string
  extractAgenda(images: AgendaImage[]): Promise<ExtractResult>
}

/** A failed extraction, classified so the browser can say what to do next. */
export class ExtractError extends Error {
  constructor(
    readonly kind: ScanErrorKind,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = "ExtractError"
  }
}
