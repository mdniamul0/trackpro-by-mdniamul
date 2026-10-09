# TrackPro by MD Niamul

Data Layer Checker, GTM Injector, Variable Builder: a tracking workbench for marketers, analysts and agencies.

## What's in this repo

| Path | What it is |
|---|---|
| `release/TrackPro-by-MD-Niamul-v0.2.1.zip` | **The file to upload to the Chrome Web Store** |
| `extension/` | The same extension unzipped. Load it with `chrome://extensions` → Developer mode → **Load unpacked** to test |
| `original-build/chrome-mv3-prod/` | The original v0.2.0 build that was rejected (kept unchanged for reference) |
| `scripts/patch-original.py` | Applies the Chrome Web Store fixes to the original build |
| `scripts/verify-store-build.mjs` | Checks a build for remote code and flagged permissions |
| `STORE-SUBMISSION.md` | Text to paste into the Developer Dashboard (permissions, reviewer note) |
| `PRIVACY-POLICY.md` | Privacy policy text to publish on mdniamul.com |

## Fixes in v0.2.1 (everything else is unchanged)

- **Blue Argon:** the GTM Injector no longer contains a `googletagmanager.com/gtm.js` loader. You paste your GTM install snippet and it runs via `chrome.userScripts`.
- **Purple Potassium:** removed the unused `cookies` permission, plus the unused `activeTab` and `webNavigation`.
- Version 0.2.0 → 0.2.1. Build-tool names removed from file names.

## Rebuild the fixed version

```bash
python3 scripts/patch-original.py original-build/chrome-mv3-prod extension
node scripts/verify-store-build.mjs extension
```

Then zip the *contents* of `extension/` (manifest.json at the zip root).
