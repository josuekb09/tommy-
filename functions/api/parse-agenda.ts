import { handleScan, type ScanEnv } from "../../server/extract/handler"

/** Cloudflare Pages Function: POST /api/parse-agenda. GEMINI_API_KEY is a Pages secret, never sent to the browser. */
export const onRequest: PagesFunction<ScanEnv> = ({ request, env }) => handleScan(request, env)
