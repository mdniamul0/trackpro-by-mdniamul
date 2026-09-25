// Copies the packaged zip to release/TrackPro-by-MD-Niamul-v<version>.zip
import { copyFileSync, mkdirSync, readFileSync } from "node:fs"

const { version } = JSON.parse(readFileSync("package.json", "utf8"))
const out = `release/TrackPro-by-MD-Niamul-v${version}.zip`
mkdirSync("release", { recursive: true })
copyFileSync("build/chrome-mv3-prod.zip", out)
console.log(`✓ Chrome Web Store upload file: ${out}`)
