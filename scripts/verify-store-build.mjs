// Pre-submission check for the Chrome Web Store build.
// Fails if the production build contains remotely hosted code (Blue Argon)
// or requests a permission the store has flagged as unused (Purple Potassium).
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const BUILD_DIR = process.argv[2] ?? "build/chrome-mv3-prod"

const FORBIDDEN_CODE = [
  { pattern: /googletagmanager\.com\/gtm\.js/, why: "loads GTM from Google's servers (remotely hosted code)" },
  { pattern: /googletagmanager\.com/, why: "mentions the GTM script host — Chrome's review scanner flags this" },
  { pattern: /googletagmanager\.com\/gtag\/js/, why: "loads gtag.js from Google's servers (remotely hosted code)" },
  { pattern: /\beval\s*\(/, why: "eval() runs code the store cannot review" },
  { pattern: /new\s+Function\s*\(/, why: "new Function() runs code the store cannot review" }
]
const FORBIDDEN_PERMISSIONS = ["cookies", "webNavigation"]

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

let files
try {
  files = walk(BUILD_DIR)
} catch {
  console.error(`✗ ${BUILD_DIR} not found — run "npm run build" first.`)
  process.exit(1)
}

const problems = []

for (const file of files.filter((f) => /\.(js|html)$/.test(f))) {
  const src = readFileSync(file, "utf8")
  for (const { pattern, why } of FORBIDDEN_CODE) {
    if (pattern.test(src)) problems.push(`${file}: ${why} [${pattern}]`)
  }
}

const manifest = JSON.parse(readFileSync(join(BUILD_DIR, "manifest.json"), "utf8"))
for (const perm of FORBIDDEN_PERMISSIONS) {
  if (manifest.permissions?.includes(perm)) problems.push(`manifest.json: requests unused permission "${perm}"`)
}

if (problems.length) {
  console.error("✗ Not safe to submit to the Chrome Web Store:\n  " + problems.join("\n  "))
  process.exit(1)
}
console.log(`✓ ${BUILD_DIR} passed the Chrome Web Store checks (${files.length} files scanned).`)
