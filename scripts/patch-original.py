#!/usr/bin/env python3
"""
Applies the Chrome Web Store fixes to the ORIGINAL TrackPro build
(trackos-extension-build.zip -> build/chrome-mv3-prod), without changing
anything else in the extension.

Fixes:
  Blue Argon (remotely hosted code)
    - background + dashboard no longer contain the googletagmanager.com
      loader. The GTM Injector now runs the GTM install snippet the USER
      pastes, via chrome.userScripts (Manifest V3's API for user code).
  Purple Potassium (unused permission)
    - removes "cookies" (and the also-unused "activeTab"; "webNavigation"
      was only used by the old injector).

Usage: python3 scripts/patch-original.py <original build dir> <output dir>
"""
import json
import re
import shutil
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
if out.exists():
    shutil.rmtree(out)
shutil.copytree(src, out)


def patch(path: Path, old_start: str, old_end: str, new: str, keep_end=False):
    text = path.read_text(encoding="utf-8")
    a = text.find(old_start)
    b = text.find(old_end, a)
    if a < 0 or b < 0 or text.count(old_start) != 1:
        sys.exit(f"✗ {path.name}: anchor not found exactly once ({old_start[:40]!r})")
    end = b if keep_end else b + len(old_end)
    path.write_text(text[:a] + new + text[end:], encoding="utf-8")


def replace_once(path: Path, old: str, new: str):
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        sys.exit(f"✗ {path.name}: expected exactly one {old[:50]!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


# ---------------------------------------------------------------------------
# 1. Background: replace remote-GTM re-injection with a userScripts sync.
# ---------------------------------------------------------------------------
BACKGROUND_GTM = r'''const tpGtmPrefix="trackpro-gtm-";
function tpGtmScript(origin,s){let u=new URL(origin),code=`if (location.origin === ${JSON.stringify(origin)} && !(window.google_tag_manager && window.google_tag_manager[${JSON.stringify(s.containerId)}])) {\nwindow.__trackproInjectedGtm = ${JSON.stringify(s.containerId)};\nif (!document.getElementsByTagName("script")[0]) (document.head || document.documentElement).appendChild(document.createElement("script"));\n${s.code}\n}`;return{id:tpGtmPrefix+origin.replace(/[^a-z0-9]/gi,"_"),matches:[`${u.protocol}//${u.hostname}/*`],js:[{code}],runAt:"document_start",world:"MAIN",allFrames:!1}}
async function tpGtmSyncNow(){if(!chrome.userScripts)return{ok:!1,error:'Turn on "Allow User Scripts" for TrackPro first (see the yellow box above).'};let reg;try{reg=await chrome.userScripts.getScripts()}catch{return{ok:!1,error:'Turn on "Allow User Scripts" for TrackPro first (see the yellow box above).'}}let res=await chrome.storage.local.get(l),all=res[l]??{},scripts=[];for(let[origin,s]of Object.entries(all)){if(!s||"object"!=typeof s||!s.code)continue;try{scripts.push(tpGtmScript(origin,s))}catch{}}let ours=reg.filter(x=>x.id.startsWith(tpGtmPrefix)).map(x=>x.id);ours.length&&await chrome.userScripts.unregister({ids:ours});scripts.length&&await chrome.userScripts.register(scripts);return{ok:!0,count:scripts.length}}
let tpGtmChain=Promise.resolve();
function tpGtmSync(){let p=tpGtmChain.then(tpGtmSyncNow,tpGtmSyncNow);tpGtmChain=p.catch(()=>{});return p.catch(x=>({ok:!1,error:String(x&&x.message||x)}))}
chrome.runtime.onStartup.addListener(()=>{tpGtmSync()});chrome.runtime.onInstalled.addListener(()=>{tpGtmSync()});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{if(msg?.type==="trackpro:gtm-sync"){tpGtmSync().then(reply);return!0}})'''

bg = out / "static/background/index.js"
patch(bg, "function d(e){let t=window;t.google_tag_manager", '.catch(()=>{})})}})', BACKGROUND_GTM)

# ---------------------------------------------------------------------------
# 2. Dashboard: GTM Injector panel takes the user's GTM install snippet.
#    Same layout, styles and wording as the original panel.
# ---------------------------------------------------------------------------
DASHBOARD_GTM = r'''function tpParseGtmSnippet(input){let text=(input||"").trim();if(!text)return{ok:!1,error:"Paste your GTM install snippet first."};let body=text.replace(/<noscript[\s\S]*?<\/noscript>/gi,""),code,tags=[...body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];if(tags.length){let inline=tags.find(m=>!/\bsrc\s*=/i.test(m[1])&&m[2].trim());if(!inline)return{ok:!1,error:"That snippet only has an external <script src=…>. Paste the GTM <head> snippet that starts with (function(w,d,s,l,i){…"};code=inline[2].trim()}else code=body;if(!/gtm\.start|gtm\.js/.test(code))return{ok:!1,error:"This doesn't look like a Google Tag Manager snippet. Copy it from GTM → Admin → Install Google Tag Manager."};let id=code.match(/\bGTM-[A-Z0-9]{4,}\b/i);return id?{ok:!0,containerId:id[0].toUpperCase(),code}:{ok:!1,error:"No GTM container ID (GTM-XXXXXXX) found in the snippet."}}
async function tpUserScriptsStatus(){let m=navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/),v=m?Number(m[1]):0;if(v&&v<120)return"unsupported";if(!chrome.userScripts)return"needs-toggle";try{return await chrome.userScripts.getScripts(),"ready"}catch{return"needs-toggle"}}
function tpGtmSync(){return new Promise(done=>chrome.runtime.sendMessage({type:"trackpro:gtm-sync"},res=>{void chrome.runtime.lastError;done(res||{ok:!1,error:"TrackPro's background service didn't answer — try again."})}))}
let ed="trackos-gtm-injection-sessions";function ep({tabId:tpTab,origin:tpOrigin}){let[tpUrl,tpSetUrl]=(0,n.useState)(""),[tpSnippet,tpSetSnippet]=(0,n.useState)(""),[tpState,tpSetState]=(0,n.useState)({status:"idle"}),[tpSessions,tpSetSessions]=(0,n.useState)({}),[tpUs,tpSetUs]=(0,n.useState)(null);
let tpRefresh=()=>{tpUserScriptsStatus().then(tpSetUs)};
(0,n.useEffect)(()=>{chrome.storage.local.get(ed,x=>tpSetSessions(x[ed]??{}));let onChange=x=>{x[ed]&&tpSetSessions(x[ed].newValue??{})};chrome.storage.onChanged.addListener(onChange);tpRefresh();window.addEventListener("focus",tpRefresh);return()=>{chrome.storage.onChanged.removeListener(onChange);window.removeEventListener("focus",tpRefresh)}},[]);
(0,n.useEffect)(()=>{tpOrigin&&!tpUrl&&tpSetUrl(tpOrigin)},[tpOrigin]);
let tpPreview=tpSnippet.trim()?tpParseGtmSnippet(tpSnippet):null,tpList=Object.entries(tpSessions);
let tpStart=async()=>{let site,raw=tpUrl.trim();if(!raw)return;/^https?:\/\//i.test(raw)||(raw=`https://${raw}`);try{site=new URL(raw).origin}catch{tpSetState({status:"error",message:"That doesn't look like a valid URL."});return}let parsed=tpParseGtmSnippet(tpSnippet);if(!parsed.ok){tpSetState({status:"error",message:parsed.error});return}tpSetState({status:"starting"});let cur=(await chrome.storage.local.get(ed))[ed]??{};await chrome.storage.local.set({[ed]:{...cur,[site]:{containerId:parsed.containerId,code:parsed.code,createdAt:Date.now()}}});let res=await tpGtmSync();if(!res.ok){tpSetState({status:"error",message:res.error});return}let here=tpTab&&tpOrigin===site;here&&await chrome.tabs.reload(tpTab).catch(()=>{});tpSetSnippet("");tpSetState({status:"done",message:`${parsed.containerId} now loads on every page of ${site} until you disconnect.${here?" The tab was reloaded.":" Open or reload that site to see it."}`})};
let tpStop=async site=>{let cur={...(await chrome.storage.local.get(ed))[ed]??{}};delete cur[site];await chrome.storage.local.set({[ed]:cur});await tpGtmSync();tpTab&&tpOrigin===site&&chrome.tabs.reload(tpTab).catch(()=>{})};
return(0,a.jsxs)("div",{className:"p-4",children:[(0,a.jsx)(S,{title:"GTM Injector"}),
"unsupported"===tpUs&&(0,a.jsx)(I,{className:"p-2.5 mb-3 border-red-200",children:(0,a.jsx)("p",{className:"text-[10px] text-red-600",children:"GTM Injector needs Chrome 120 or newer. Please update Chrome."})}),
"needs-toggle"===tpUs&&(0,a.jsxs)(I,{className:"p-2.5 mb-3 bg-amber-50",children:[(0,a.jsx)("p",{className:"text-[11px] font-semibold text-amber-700 mb-1",children:"One-time setup: allow user scripts"}),(0,a.jsx)("p",{className:"text-[10px] text-amber-700 mb-1",children:(navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/)?.[1]??0)>=138?'Open the extension details page and switch on "Allow User Scripts", then come back here.':'Open chrome://extensions and switch on "Developer mode" (top-right), then come back here.'}),(0,a.jsx)("p",{className:"text-[9px] text-amber-700 mb-2",children:"Chrome requires this for any extension that runs code you provide. TrackPro only runs the GTM snippet you paste here, only on the website you choose."}),(0,a.jsx)("button",{className:"text-xs font-semibold px-3 py-2 rounded-md bg-brand-500 text-white hover:bg-brand-600",onClick:()=>chrome.tabs.create({url:`chrome://extensions/?id=${chrome.runtime.id}`}),children:"Open extension settings"})]}),
(0,a.jsxs)(I,{className:"p-2.5 mb-3",children:[(0,a.jsxs)("p",{className:"text-[10px] text-gray-500 mb-2",children:["Starts a persistent session for a website + your GTM container — once started, the container is automatically injected on ",(0,a.jsx)("strong",{children:"every"}),' page load for that site (any tab, any reload) until you disconnect it, so it behaves like a real installation rather than a one-off script run. This is what makes it survive the navigation Google\'s own Tag Assistant "Connect" step performs.']}),(0,a.jsxs)("p",{className:"text-[9px] text-amber-700 bg-amber-50 rounded p-1.5 mb-2",children:["Once active, go to ",(0,a.jsx)("strong",{children:"tagmanager.google.com → your container → Preview"}),", enter this same URL in the Tag Assistant tab that opens, and click ",(0,a.jsx)("strong",{children:"Connect"})," — Tag Assistant's own Connect step is what makes Google's Preview UI say \"Connected\"; this session is what makes sure the container is actually present for it to find, on every page it looks at."]}),
(0,a.jsx)("label",{className:"text-[9px] font-semibold text-gray-500 uppercase",children:"Website URL"}),(0,a.jsx)("input",{className:"w-full text-[11px] border border-gray-300 rounded px-2 py-1.5 mb-2 mt-0.5",placeholder:"https://example.com",value:tpUrl,onChange:x=>tpSetUrl(x.target.value)}),
(0,a.jsx)("label",{className:"text-[9px] font-semibold text-gray-500 uppercase",children:"GTM Install Snippet"}),(0,a.jsx)("p",{className:"text-[9px] text-gray-400 mt-0.5",children:"GTM → Admin → Install Google Tag Manager → copy the <head> code. Server-side GTM / custom loader (Stape, first-party domain) snippets work as-is."}),(0,a.jsx)("textarea",{className:"w-full text-[10px] border border-gray-300 rounded px-2 py-1.5 mb-1 mt-0.5 font-mono",style:{height:"112px"},placeholder:"<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){ … })(window,document,'script','dataLayer','GTM-XXXXXXX');</script>\n<!-- End Google Tag Manager -->",value:tpSnippet,onChange:x=>tpSetSnippet(x.target.value)}),
tpPreview&&(0,a.jsx)("p",{className:`text-[10px] mb-2 ${tpPreview.ok?"text-green-700":"text-red-600"}`,children:tpPreview.ok?`✓ Container found: ${tpPreview.containerId}`:tpPreview.error}),
(0,a.jsx)("button",{className:"w-full text-xs font-semibold px-3 py-2 rounded-md bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50",onClick:tpStart,disabled:!tpUrl.trim()||!tpPreview?.ok||"ready"!==tpUs||"starting"===tpState.status,children:"starting"===tpState.status?"Starting session…":"Start Session"})]}),
"error"===tpState.status&&(0,a.jsx)(I,{className:"p-2.5 mb-2 border-red-200",children:(0,a.jsx)("p",{className:"text-[10px] text-red-600",children:tpState.message})}),
"done"===tpState.status&&(0,a.jsx)(I,{className:"p-2.5 mb-2",children:(0,a.jsx)("p",{className:"text-[10px] text-green-700",children:tpState.message})}),
(0,a.jsx)(S,{title:"Active Sessions",count:tpList.length}),0===tpList.length?(0,a.jsx)(I,{className:"p-3",children:(0,a.jsx)("p",{className:"text-[10px] text-gray-400",children:"No active injection sessions. Start one above."})}):(0,a.jsx)("div",{className:"space-y-1.5",children:tpList.map(([site,sess])=>{let ok=sess&&"object"==typeof sess&&sess.code;return(0,a.jsxs)(I,{className:"p-2.5 flex items-center justify-between",children:[(0,a.jsxs)("div",{className:"min-w-0",children:[(0,a.jsxs)("div",{className:"flex items-center gap-1.5",children:[ok?(0,a.jsx)(T,{className:"bg-green-100 text-green-700",children:"Active"}):(0,a.jsx)(T,{className:"bg-amber-100 text-amber-700",children:"Re-paste snippet"}),(0,a.jsx)("span",{className:"font-mono text-[10px] text-gray-700",children:ok?sess.containerId:String(sess)})]}),(0,a.jsx)("p",{className:"text-[9px] text-gray-400 truncate mt-0.5",children:site})]}),(0,a.jsx)("button",{className:"text-[10px] font-semibold text-red-600 underline shrink-0",onClick:()=>tpStop(site),children:"Disconnect"})]},site)})})]})}'''

dash = out / "tabs/dashboard.f703292e.js"
patch(dash, "function ec(e){let t=window;t.google_tag_manager", "let ef={meta:", DASHBOARD_GTM, keep_end=True)

# Cookie Finder note referred to a "planned" chrome.cookies feature — Chrome's
# review rejects permissions requested for planned features, so drop that hint.
replace_once(
    dash,
    "httpOnly cookies aren't visible to page scripts \\u2014 a full list needs the chrome.cookies API (planned).",
    "httpOnly cookies aren't visible to page scripts, so they don't appear here.",
)

# ---------------------------------------------------------------------------
# 3. Manifest: permissions + version.
# ---------------------------------------------------------------------------
mf_path = out / "manifest.json"
mf = json.loads(mf_path.read_text(encoding="utf-8"))
mf["version"] = "0.2.1"
mf["permissions"] = [p for p in mf["permissions"] if p not in ("cookies", "activeTab", "webNavigation")] + ["userScripts"]
mf["minimum_chrome_version"] = "120"
mf["homepage_url"] = "https://mdniamul.com"
mf_path.write_text(json.dumps(mf, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# ---------------------------------------------------------------------------
# 4. Build-tool naming: rename "*.plasmo.*" files and internal labels so the
#    extension only carries TrackPro's name. References updated everywhere.
# ---------------------------------------------------------------------------
renames = []
for f in out.rglob("*"):
    if f.is_file() and ".plasmo." in f.name:
        new_name = f.name.replace(".plasmo.", ".trackpro.")
        f.rename(f.with_name(new_name))
        renames.append((f.name, new_name))
renames += [("__plasmo", "__trackpro"), ("@plasmo-static-common", "@trackpro-static-common")]
for f in out.rglob("*"):
    if f.is_file() and f.suffix in (".js", ".html", ".json", ".css"):
        t = f.read_text(encoding="utf-8")
        n = t
        for a_, b_ in renames:
            n = n.replace(a_, b_)
        if n != t:
            f.write_text(n, encoding="utf-8")

print(f"✓ Patched build written to {out}")
