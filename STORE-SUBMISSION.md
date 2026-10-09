# Chrome Web Store: resubmission guide (v0.2.1)

Upload file: **`release/TrackPro-by-MD-Niamul-v0.2.1.zip`**
(Developer Dashboard → TrackPro → **Package** → *Upload new package*. Upload the zip as it is; don't unzip it.)

This is your **original** TrackPro extension with only the rejected parts fixed:

| Rejection | What changed |
|---|---|
| **Blue Argon:** remotely hosted code (`static/background/index.js`, `tabs/dashboard.*.js` → `googletagmanager.com/gtm.js`) | The GTM Injector no longer builds a GTM download URL. You paste your own GTM install snippet, and it runs through Chrome's `userScripts` API (MV3's official API for user-provided code). The package contains no remote script URL. |
| **Purple Potassium:** unused `cookies` | Removed `cookies`, plus the also-unused `activeTab` and `webNavigation` (only the old injector used it). |

Everything else (Scan, DataLayer, Pixel Helper, Shopify, Inspector, Variables, Playbook, Triggers, Listeners, Export) is unchanged.
Version bumped 0.2.0 → **0.2.1**.

---

## 1. Privacy practices tab

### Single purpose
```
TrackPro is a tracking-debugging workbench for marketers and analysts: it shows a website's data layer and the analytics/ad-pixel events it fires, helps build Google Tag Manager variables, triggers and listeners from them, and lets the user test their own GTM container on a site.
```

### Permission justifications

| Permission | Paste this |
|---|---|
| `storage` | Saves the user's settings, GTM Injector sessions and the events captured for each site locally in the browser. Nothing is sent to any server. |
| `scripting` | Registers the extension's own bundled detection scripts (data layer / platform detector and the Shopify sandbox observer) in the page context. Only code bundled in the extension package is injected. |
| `userScripts` | Powers the GTM Injector: the user pastes their own Google Tag Manager install snippet and it runs only on the website they enter, until they disconnect. The user must turn on "Allow User Scripts" themselves. The extension ships no remote code; the only code run this way is what the user provides. |
| `webRequest` | Observes (read-only) the analytics and ad-pixel requests a page sends, including from sandboxed iframes such as Shopify Web Pixels and embedded forms, so the user can debug them. Requests are never blocked or modified, and response bodies are not read. |
| `tabs` | Identifies the tab the user opened TrackPro from, talks to the extension's content scripts in that tab (scan, element picker, inventory), and reloads it after a GTM container is injected or removed. |
| `system.display` | Sizes and centers the dashboard window on the user's screen. |
| Host permission (`http://*/*`, `https://*/*`) | Tracking audits run on whatever website the user is working on (their own or client sites), which can't be known in advance. |

### Remote code
**"Are you using remote code?" → No, I am not using remote code.**
```
All logic is in the package. The GTM Injector only runs the GTM install snippet the user pastes in, through the chrome.userScripts API.
```

### Data usage
Tick **Website content** and **Web browsing activity** (the extension reads pages and their tracking requests to show them to the user).
Then tick all three certifications:
- I do not sell or transfer user data to third parties…
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness…

### Privacy policy URL
Publish the text in `PRIVACY-POLICY.md` on your site (e.g. `https://mdniamul.com/trackpro-privacy`) and paste that URL.

---

## 2. Note to the reviewer

Paste this in the submit dialog (*"Additional instructions for review"*) or reply in the rejection thread:

```
This version (0.2.1) resolves both previous violations:

1. Blue Argon (remotely hosted code): background and dashboard no longer contain any googletagmanager.com URL or code that loads a remote script. The GTM Injector now uses the chrome.userScripts API: the user pastes their own GTM install snippet, which runs only on the website they choose, after they enable "Allow User Scripts". The extension never fetches or builds remote code.

2. Purple Potassium: the unused "cookies" permission has been removed (also the unused "activeTab" and "webNavigation"). Every remaining permission is used; justifications are in the Privacy tab.

How to test the GTM Injector:
Open any website → click the TrackPro icon → GTM Injector → follow the "Allow User Scripts" prompt → paste any GTM install snippet (GTM → Admin → Install Google Tag Manager, the <head> code) → Start Session.
```

---

## 3. How the GTM Injector works now (for you)

1. **One time only:** in the GTM Injector tab, click **Open extension settings** and turn on **Allow User Scripts**. On older Chrome versions, turn on **Developer mode** in `chrome://extensions` instead.
2. Website URL fills in automatically.
3. Instead of just the GTM ID, paste the **full GTM install snippet** (GTM → Admin → Install Google Tag Manager → the `<head>` code). TrackPro reads the GTM ID from it.
4. **Start Session**: the container loads on every page of that site (every reload, every tab) until you click **Disconnect**.
5. Bonus: server-side GTM / Stape custom loader snippets work too, because your exact snippet is used.

Sessions saved by the old version held only a GTM ID, so they show "Re-paste snippet". Disconnect them and start them again with the snippet.
