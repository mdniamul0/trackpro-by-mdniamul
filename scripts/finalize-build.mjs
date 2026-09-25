// Post-build cleanup: the build tool stamps its own name into some output
// file names (e.g. icon16.plasmo.6c567d50.png). Rename those so the shipped
// extension only carries TrackPro's naming, and update every reference.
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"

const BUILD_DIR = process.argv[2] ?? "build/chrome-mv3-prod"

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const renames = []
for (const file of walk(BUILD_DIR)) {
  const name = basename(file)
  if (!name.includes(".plasmo.")) continue
  const newName = name.replace(".plasmo.", ".trackpro.")
  renameSync(file, join(dirname(file), newName))
  renames.push([name, newName])
}

// Internal labels the build tool leaves in the page/bundle (root element id,
// module keys). Every occurrence is replaced consistently, so references
// still resolve.
renames.push(["__plasmo", "__trackpro"], ["@plasmo-static-common", "@trackpro-static-common"])

{
  for (const file of walk(BUILD_DIR).filter((f) => /\.(js|css|html|json)$/.test(f))) {
    let text = readFileSync(file, "utf8")
    let changed = false
    for (const [from, to] of renames) {
      if (text.includes(from)) {
        text = text.split(from).join(to)
        changed = true
      }
    }
    if (changed) writeFileSync(file, text)
  }
}
console.log(`✓ Finalized ${relative(".", BUILD_DIR)} (${renames.length - 2} file names cleaned).`)
