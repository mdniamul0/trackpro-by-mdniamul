# Chrome Web Store — resubmission guide (v0.3.0)

Upload file: **`release/TrackPro-by-MD-Niamul-v0.3.0.zip`**
(Developer Dashboard → TrackPro → **Package** → *Upload new package*)

Then fill the tabs below, click **Submit for review**.

---

## 1. Store listing → Description

```
TrackPro by MD Niamul is a tracking workbench for marketers, analysts and agencies. See exactly what a website sends to your analytics and ad platforms — and fix it faster.

DATA LAYER CHECKER
• Every dataLayer.push and gtag() call, live, from the first moment the page loads
• Clean JSON view, search, and "hide gtm.*" filter
• Works with renamed data layers and GTM containers

PIXEL EVENT DEBUGGER
• GA4 (including server-side GTM endpoints), Google Ads, Floodlight, Meta Pixel, TikTok, Pinterest, Snapchat, LinkedIn, Microsoft Ads (UET), X, Reddit, Klaviyo and Shopify customer events
• Event name, pixel/measurement ID and every parameter for each hit
• Shows requests blocked by ad blockers or browser privacy features

VARIABLE BUILDER
• Click any key in a data layer push to create a GTM Data Layer Variable
• Ready-made Custom JavaScript variables: Meta content_ids / contents, TikTok contents, Google Ads cart data, totals, clean numbers, normalized email & phone
• Custom Event triggers for captured events
• Export as a GTM container file (Admin → Import Container → Merge)

GTM INJECTOR
• Paste your GTM install snippet and test the container on any live website without installing it — works with GTM Preview / Tag Assistant
• Server-side GTM / custom loader snippets supported

TRACKING HEALTH CHECKS
• Duplicate conversions, blocked requests, purchase events missing transaction_id / value / currency, missing ecommerce clear, Consent Mode v2 gaps, click IDs that aren't stored

CONSENT MODE & COOKIES
• Google Consent Mode default/update state for all four v2 signals
• gclid / fbclid / ttclid and UTM parameters, first-party marketing cookies

SHOPIFY & EMBEDDED FORMS
• Shopify customer events sent from sandboxed Web Pixels
• Events from embedded Calendly, Typeform, HubSpot, GoHighLevel, Jotform, Tally and more

Privacy: everything TrackPro captures stays in your browser. Nothing is sent to MD Niamul or any server.

Built by MD Niamul — Conversion Tracking & Web Analytics specialist. mdniamul.com
```

**Category:** Developer Tools

---

## 2. Privacy practices tab

### Single purpose
```
TrackPro is a tracking-debugging tool for marketers and analysts: it shows the data layer, analytics and ad-pixel events a website sends, helps build Google Tag Manager variables from them, and lets the user test their own GTM container on a site.
```

### Permission justifications

| Permission | Paste this |
|---|---|
| `storage` | Stores the user's settings, GTM test sessions and the events captured for each tab locally in the browser. Nothing is sent to any server. |
| `scripting` | Registers the extension's bundled data-layer observer script, and re-reads the page's data layer, consent state and cookies when the user clicks "Rescan". Only code bundled in the extension package is injected. |
| `userScripts` | Powers the GTM Injector: the user pastes their own Google Tag Manager install snippet and it runs only on the website they choose, until they disconnect. The user must enable "Allow User Scripts" themselves. The extension ships no remote code — the only code run this way is what the user provides. |
| `webRequest` | Observes (read-only) the analytics and ad-pixel requests a page sends — GA4, Google Ads, Meta, TikTok, etc., including from sandboxed iframes such as Shopify Web Pixels and embedded forms — so the user can debug them. Requests are never blocked, modified or redirected, and response bodies are not read. |
| `tabs` | Lets the user pick which open tab to inspect, shows its URL/title, and reloads it after a GTM container is injected or removed. |
| `system.display` | Sizes and centers the dashboard window on the user's screen. |
| Host permission (`http://*/*`, `https://*/*`) | Tracking audits run on whatever website the user is working on (their own or client sites), which can't be known in advance. |

### Remote code
**"Are you using remote code?" → No, I am not using remote code.**
```
All logic is in the package. The GTM Injector only runs the GTM snippet the user pastes in, via the chrome.userScripts API.
```

### Data usage
Tick **Website content** and **Web browsing activity** (the extension reads pages and requests to show them to the user).
Then tick all three certifications:
- I do not sell or transfer user data to third parties…
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness…

### Privacy policy URL
Publish the text in `PRIVACY-POLICY.md` on your site, e.g. `https://mdniamul.com/trackpro-privacy`, and paste that URL.

---

## 3. Note to the reviewer

Dashboard → **Submit for review** dialog → *"Additional instructions for review"* (or reply in the rejection thread):

```
This version resolves the previous rejections:

1. Blue Argon (remotely hosted code): the package contains no googletagmanager.com URL and no remote script loading. The GTM Injector now uses the chrome.userScripts API: the user pastes their own GTM install snippet, which runs only on the site they choose after they enable "Allow User Scripts". The extension never fetches or builds any remote code.

2. Purple Potassium: the unused "cookies" permission has been removed (as well as unused "webNavigation" and "activeTab"). Every remaining permission is used; justifications are in the Privacy tab.

How to test:
- Open any website, click the TrackPro icon → a dashboard window opens.
- Data Layer / Pixel Events tabs show the page's data layer and analytics/ad requests.
- GTM Injector: follow the "Allow User Scripts" prompt, paste any GTM install snippet (GTM → Admin → Install Google Tag Manager), click "Inject & reload".
```
