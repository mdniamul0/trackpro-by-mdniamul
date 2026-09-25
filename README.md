# TrackPro by MD Niamul

Data Layer Checker, Pixel Event Debugger, Variable Builder and GTM Injector: one tracking workbench for marketers, analysts and agencies.

## Features

| Area | What it does |
|---|---|
| **Overview** | Page platform, GTM/Google tag IDs, tracking libraries, automatic **tracking health checks** (duplicate conversions, blocked requests, incomplete purchase data, Consent Mode v2 gaps, unstored click IDs) |
| **Data Layer** | Every `dataLayer.push` / `gtag()` call from the first moment the page loads, as searchable JSON |
| **Pixel Events** | GA4 (incl. server-side endpoints), Google Ads, Floodlight, Meta, TikTok, Pinterest, Snap, LinkedIn, Microsoft UET, X, Reddit, Klaviyo, Shopify: event, ID, all parameters, HTTP status / blocked |
| **Variable Builder** | Click keys → GTM Data Layer Variables, ready-made Custom JS (Meta/TikTok/Google Ads item mappings, totals, normalized email/phone), Custom Event triggers → **GTM import file** |
| **GTM Injector** | Test any GTM container on a live site (paste the install snippet), works with GTM Preview |
| **Consent & Cookies** | Consent Mode default/update/effective state, consent commands, click IDs, UTMs, marketing cookies |
| **Shopify & Forms** | Shopify Web Pixel customer events, embedded Calendly/Typeform/HubSpot/GoHighLevel/Jotform/Tally… events |

## Build the Chrome Web Store zip

```bash
npm ci
npm run package
```

Output: `release/TrackPro-by-MD-Niamul-v<version>.zip`. The command refuses to create the zip if the build contains remotely hosted code or an unused permission (the causes of the earlier Blue Argon / Purple Potassium rejections).

Submission text (listing, permission justifications, reviewer note): see **`STORE-SUBMISSION.md`**. Privacy policy text: **`PRIVACY-POLICY.md`**.

## Load it locally for testing

`npm run build`, then `chrome://extensions` → Developer mode → **Load unpacked** → `build/chrome-mv3-prod`.

## Project layout

```
background.ts                  dashboard window, capture storage, network observer
contents/datalayer-hook.ts     page-world data layer observer (document_start)
contents/relay.ts              forwards captures to the extension, form postMessages
tabs/dashboard.tsx             dashboard app
components/                    UI (views, JSON tree, GTM Injector panel)
lib/pixels.ts                  pixel/analytics request recognition
lib/page-inspector.ts          GTM containers, consent, cookies, platform detection
lib/variable-builder.ts        GTM variable/trigger export
lib/health.ts                  tracking health checks
lib/gtm-injector.ts            GTM Injector (chrome.userScripts)
lib/embedded-forms.ts          embedded form / booking providers
scripts/                       post-build cleanup, store-safety check, release zip
```

## Chrome Web Store rules to keep

- Never add a hard-coded remote script URL (e.g. the GTM loader) to the source; the GTM Injector must keep using the user's pasted snippet.
- Only request permissions the code actually uses.
