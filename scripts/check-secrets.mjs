// Fails the build if anything secret, or any direct call to the model provider, reached dist/.
// The real key from .env.local is checked too (by value, never printed), whatever its format.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const dist = "dist"
const patterns = [
  ["a Google API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["an Anthropic API key", /sk-ant-[0-9A-Za-z_-]{10,}/],
  ["the GEMINI_API_KEY name", /GEMINI_API_KEY/],
  ["a direct call to the Gemini API", /generativelanguage\.googleapis\.com|x-goog-api-key/],
]
const secrets = []
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]*(?:KEY|SECRET|TOKEN)[A-Z0-9_]*)\s*=\s*["']?([^"'\s]+)/)
    if (match && match[2].length >= 12) secrets.push([match[1], match[2]])
  }
}

const files = []
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else files.push(path)
  }
}
if (!existsSync(dist)) {
  console.error("check:secrets: dist/ not found. Run the build first.")
  process.exit(1)
}
walk(dist)

const problems = []
for (const file of files) {
  const text = readFileSync(file).toString("latin1")
  for (const [label, pattern] of patterns) if (pattern.test(text)) problems.push(`${file}: ${label}`)
  for (const [name, value] of secrets) if (text.includes(value)) problems.push(`${file}: the value of ${name} from .env.local`)
}
if (problems.length) {
  console.error(`check:secrets FAILED. Remove these from the client build:\n${problems.map(p => `  - ${p}`).join("\n")}`)
  process.exit(1)
}
console.log(`check:secrets: ${files.length} files in dist/ checked, no keys or provider calls found.`)
