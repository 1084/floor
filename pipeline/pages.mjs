// Static, indexable pages for every roll call and every member, generated from the same data
// the app and the Floor web view use. Search engines cannot index the hash-routed Floor app,
// so these answer "how did the House vote on H.R. 9497" and "how did Don Beyer vote" directly,
// and point readers to Open Chambers for alerts.
//
// Output (under docs/):
//   votes/<vote id>/index.html      one page per roll call (quorum calls skipped)
//   members/<bioguide>/index.html   one page per current member
//   sitemap.xml                     every generated page, for Search Console
//
// Pages are deterministic for unchanged data (no timestamps in vote pages), so nightly runs
// only rewrite pages whose data changed. Plain HTML, no scripts beyond GoatCounter, no cookies.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseBill } from "./bills.mjs";

const SITE = "https://johnhubert.llc";
const BASE = "/floor";                                   // where docs/ is served
const APP_STORE = "https://apps.apple.com/us/app/open-chambers/id6816544012";
const APP_ID = "6816544012";                             // Safari Smart App Banner
const PLAY_URL = "";                                      // set to the Google Play listing when Android ships; badge appears everywhere on the next build
const RECENT_VOTES = 60;                                  // votes listed on a member page

const LABEL = { hr: "H.R.", s: "S.", hjres: "H.J.Res.", sjres: "S.J.Res.", hres: "H.Res.", sres: "S.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res." };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = d => { if (!d) return ""; const [y, m, day] = d.split("-").map(Number); return `${MONTHS[m - 1]} ${day}, ${y}`; };
export function prettyBill(s) {
  if (!s) return "";
  const b = parseBill(s);
  if (b) return `${LABEL[b.type]} ${b.number}`;
  const t = String(s).trim();
  if (/^PN\d+/i.test(t)) return t.toUpperCase().replace(/^PN\s*/, "PN ");
  return t;
}
const chamberName = c => c === "senate" ? "Senate" : "House";
const seat = m => m.chamber === "senate" ? `${m.partyCode}-${m.state}` : `${m.partyCode}-${m.state}-${m.district || "AL"}`;
const title = m => m.chamber === "senate" ? "Sen." : "Rep.";
const POS = { Y: "Yea", N: "Nay", P: "Present", "-": "Not voting" };
const posClass = { Y: "yea", N: "nay", P: "pres", "-": "nv" };

// Headline for a vote: the official bill title when we have one, else the chamber's description.
export function voteHeadline(v, bills) {
  const key = parseBill(v.bill)?.key;
  const t = (key && bills[key]?.title) || v.description || v.question || "Roll call vote";
  return t.replace(/\s+/g, " ").trim();
}

function shell({ pageTitle, description, canonical, body, schema, lastmod }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="apple-itunes-app" content="app-id=${APP_ID}">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}${BASE}/icon.png">
<link rel="icon" href="${BASE}/icon.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root { --bg:#F7F6F2; --surface:#FFFFFF; --surface-2:#EFEDE7; --ink:#1A1D21; --ink-2:#4A4F57; --ink-3:#7C818A; --line:#E1DFD8; --line-2:#CFCCC3;
    --accent:#1F3A5F; --accent-ink:#fff; --accent-soft:#E4EAF2; --gold:#D9A441;
    --dem:#3B6FB6; --rep:#C4423A; --ind:#6B8E23; --yea:#2E7D4F; --nay:#B23A3A; --pres:#8a5a0b; --nv:#A5A9B0;
    --serif:"Newsreader",Georgia,"Times New Roman",serif; --sans:"Public Sans","Helvetica Neue",Arial,sans-serif; --mono:"JetBrains Mono",Menlo,Consolas,monospace; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14171B; --surface:#1C2026; --surface-2:#242930; --ink:#ECEEF1; --ink-2:#B4B9C1; --ink-3:#7C818A; --line:#2C323A; --line-2:#3C434D; --accent:#8FB3E0; --accent-ink:#14171B; --accent-soft:#1E2A3A; --dem:#6D9BDC; --rep:#E06A62; --ind:#9BBF4A; --yea:#5BB47F; --nay:#E07070; --pres:#f0c169; --nv:#6C7079; } }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans); font-size:16px; line-height:1.5; -webkit-font-smoothing:antialiased }
  a { color:var(--accent) }
  .wrap { max-width:860px; margin:0 auto; padding:0 20px 56px }
  nav.top { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 0; border-bottom:1px solid var(--line); margin-bottom:28px; font-size:14px }
  nav.top .logo { font-family:var(--serif); font-weight:600; font-size:21px; color:var(--ink); text-decoration:none; display:flex; align-items:center; gap:10px }
  nav.top .logo img { width:26px; height:26px; border-radius:7px }
  nav.top .links { display:flex; gap:16px } nav.top .links a { color:var(--ink-2); text-decoration:none }
  .crumbs { font-family:var(--mono); font-size:12px; color:var(--ink-3); margin:0 0 10px; letter-spacing:.02em }
  .crumbs a { color:var(--ink-3); text-decoration:none }
  h1 { font-family:var(--serif); font-weight:500; font-size:clamp(28px,4.6vw,42px); line-height:1.1; letter-spacing:-.015em; margin:0 0 10px; text-wrap:balance }
  h2 { font-family:var(--serif); font-weight:600; font-size:24px; letter-spacing:-.01em; margin:36px 0 10px }
  .lede { color:var(--ink-2); font-size:17px; margin:0 0 18px; max-width:62ch; text-wrap:pretty }
  .meta { display:flex; flex-wrap:wrap; gap:6px 18px; font-family:var(--mono); font-size:12.5px; color:var(--ink-3); margin:0 0 22px }
  .meta b { color:var(--ink-2); font-weight:500 }
  .result { display:inline-block; font-family:var(--mono); font-size:12px; letter-spacing:.06em; text-transform:uppercase; padding:4px 10px; border-radius:999px; background:var(--surface-2); color:var(--ink-2) }
  .result.pass { background:#dcefe1; color:#22683f } .result.fail { background:#f6dcdc; color:#8b2c2c }
  @media (prefers-color-scheme: dark) { .result.pass { background:#163122; color:#86d9a5 } .result.fail { background:#3a1c1c; color:#f0a0a0 } }
  .tally { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:0 0 10px }
  .t { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:12px 14px }
  .t .n { font-family:var(--serif); font-size:30px; line-height:1; font-weight:500 } .t .l { font-family:var(--mono); font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3); margin-top:6px }
  .t.yea .n { color:var(--yea) } .t.nay .n { color:var(--nay) }
  .bar { display:flex; height:10px; border-radius:999px; overflow:hidden; background:var(--surface-2); margin:0 0 8px }
  .bar i { display:block; height:100% }
  .party { font-size:14px; color:var(--ink-2); display:flex; flex-wrap:wrap; gap:4px 18px; margin:0 0 6px }
  .party b { font-weight:600 } .D { color:var(--dem) } .R { color:var(--rep) } .I { color:var(--ind) }
  .summary { background:var(--surface); border:1px solid var(--line); border-left:4px solid var(--gold); border-radius:12px; padding:16px 18px; font-size:15.5px; color:var(--ink-2) }
  .summary .src { font-family:var(--mono); font-size:11.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); margin:0 0 6px }
  .summary p { margin:0 }
  .app { display:grid; grid-template-columns:auto 1fr; gap:16px; align-items:center; background:linear-gradient(135deg,#1F3A5F,#163049); color:#F7F6F2; border-radius:14px; padding:18px 20px; margin:28px 0 }
  .app img.icon { width:56px; height:56px; border-radius:13px }
  .app h3 { font-family:var(--serif); font-weight:500; font-size:21px; margin:0 0 4px; line-height:1.2 }
  .app p { margin:0 0 10px; color:#C8D2E0; font-size:15px; max-width:60ch }
  .app .badges { display:flex; flex-wrap:wrap; gap:10px; align-items:center }
  .app .badges img { height:40px; display:block }
  .app .fine { font-size:12.5px; color:#8FA3BD; margin:8px 0 0 }
  @media (max-width:560px) { .app { grid-template-columns:1fr } .tally { grid-template-columns:repeat(2,minmax(0,1fr)) } }
  details.roll { margin:0 0 8px } details.roll summary { cursor:pointer; font-weight:600; color:var(--ink) }
  .roll table { width:100%; border-collapse:collapse; font-size:14.5px; margin-top:10px }
  .roll td { padding:5px 8px 5px 0; border-bottom:1px solid var(--line); vertical-align:top }
  .roll td.p { font-family:var(--mono); font-size:12.5px; white-space:nowrap; width:1% }
  .roll td a { color:var(--ink); text-decoration:none } .roll td a:hover { text-decoration:underline }
  .roll .state { font-family:var(--mono); font-size:12px; color:var(--ink-3); white-space:nowrap; width:1%; padding-right:12px }
  .pos { font-family:var(--mono); font-size:12px; font-weight:500; white-space:nowrap }
  .pos.yea { color:var(--yea) } .pos.nay { color:var(--nay) } .pos.pres { color:var(--pres) } .pos.nv { color:var(--nv) }
  .votes { list-style:none; margin:0; padding:0; display:grid; gap:8px }
  .votes li { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px 14px; display:grid; grid-template-columns:1fr auto; gap:4px 14px; align-items:start }
  .votes li a { color:var(--ink); text-decoration:none; font-weight:500 } .votes li a:hover { text-decoration:underline }
  .votes li .m { font-family:var(--mono); font-size:12px; color:var(--ink-3); grid-column:1 }
  .contact { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px 18px; font-size:15px; display:grid; gap:6px }
  .contact .k { font-family:var(--mono); font-size:11.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3) }
  .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:0 0 6px }
  footer { border-top:1px solid var(--line); margin-top:40px; padding-top:16px; font-size:13.5px; color:var(--ink-3) }
  footer a { color:var(--ink-2) }
</style>
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<script data-goatcounter="https://johnhubert.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</head>
<body>
<div class="wrap">
  <nav class="top">
    <a class="logo" href="${BASE}/"><img src="${BASE}/icon.png" alt="">Open Chambers</a>
    <div class="links"><a href="${BASE}/#/votes">All votes</a><a href="${BASE}/#/house">House</a><a href="${BASE}/#/senate">Senate</a><a href="${APP_STORE}">Get the app</a></div>
  </nav>
${body}
  <footer>
    Roll-call data from the <a href="https://clerk.house.gov/Votes">House Clerk</a> and the <a href="https://www.senate.gov/legislative/votes_new.htm">U.S. Senate</a>; members and offices from the <a href="https://github.com/unitedstates/congress-legislators">unitedstates project</a>; bill titles and summaries from <a href="https://www.congress.gov">Congress.gov</a> (Congressional Research Service). Rebuilt nightly. &nbsp;·&nbsp; <a href="${SITE}/">John Hubert LLC</a> &nbsp;·&nbsp; <a href="${SITE}/privacy.html">Privacy</a>
  </footer>
</div>
</body>
</html>
`;
}

function appBlock(lead, text) {
  const play = PLAY_URL ? `<a href="${PLAY_URL}"><img src="${BASE}/badges/google-play.png" alt="Get it on Google Play"></a>` : "";
  return `  <aside class="app">
    <img class="icon" src="${BASE}/icon.png" alt="">
    <div>
      <h3>${esc(lead)}</h3>
      <p>${esc(text)}</p>
      <div class="badges"><a href="${APP_STORE}"><img src="${BASE}/badges/app-store.svg" alt="Download on the App Store"></a>${play}</div>
      <p class="fine">Free. No account, no ads, no tracking.${PLAY_URL ? "" : " Android version in the works."}</p>
    </div>
  </aside>`;
}

function votePage(v, byId, bills) {
  const head = voteHeadline(v, bills);
  const bill = prettyBill(v.bill);
  const key = parseBill(v.bill)?.key; const summary = key && bills[key]?.summary;
  const ch = chamberName(v.chamber);
  const t = v.tally || {}; const total = (t.yea || 0) + (t.nay || 0) + (t.present || 0) + (t.nv || 0) || 1;
  const passed = /pass|agreed|confirm|adopt|succeed/i.test(v.result || "") && !/not |rejected|fail/i.test(v.result || "");
  const failed = /reject|fail|not /i.test(v.result || "");
  const pageTitle = `How the ${ch} voted${bill ? ` on ${bill}` : ""}: ${head} (${longDate(v.date)})`;
  const description = `${ch} roll call ${v.number}, ${longDate(v.date)}: ${v.question}${bill ? ` on ${bill}` : ""}. ${t.yea ?? 0} yea, ${t.nay ?? 0} nay. ${v.result}. See how every ${v.chamber === "senate" ? "senator" : "representative"} voted.`;
  const canonical = `${SITE}${BASE}/votes/${v.id}/`;
  const bp = v.byParty || {};
  const partyLine = ["D", "R", "I"].filter(p => bp[p] && (bp[p].Y + bp[p].N + bp[p].P + bp[p]["-"])).map(p => `<span><b class="${p}">${p === "D" ? "Democrats" : p === "R" ? "Republicans" : "Independents"}</b> ${bp[p].Y} yea · ${bp[p].N} nay${bp[p].P ? ` · ${bp[p].P} present` : ""}${bp[p]["-"] ? ` · ${bp[p]["-"]} not voting` : ""}</span>`).join("");
  const rows = Object.entries(v.positions || {}).map(([id, p]) => ({ m: byId[id], p })).filter(x => x.m)
    .sort((a, b) => a.m.state.localeCompare(b.m.state) || (a.m.district ?? 0) - (b.m.district ?? 0) || a.m.last.localeCompare(b.m.last))
    .map(({ m, p }) => `<tr><td class="state">${esc(m.chamber === "senate" ? m.state : `${m.state}-${m.district || "AL"}`)}</td><td><a href="${BASE}/members/${m.id}/">${esc(m.name)}</a> <span class="${m.partyCode}">(${m.partyCode})</span></td><td class="p"><span class="pos ${posClass[p] || "nv"}">${POS[p] || p}</span></td></tr>`).join("\n");
  const body = `  <p class="crumbs"><a href="${BASE}/">Open Chambers</a> / <a href="${BASE}/#/${v.chamber}">${ch}</a> / Roll call ${v.number}</p>
  <h1>${esc(head)}</h1>
  <p class="lede">${esc(ch)} roll call vote ${v.number}${bill ? ` on <b>${esc(bill)}</b>` : ""}, ${longDate(v.date)}. Question: ${esc(v.question || "")}. ${v.description && v.description !== head ? esc(v.description) + "." : ""}</p>
  <p class="meta"><span class="result ${passed ? "pass" : failed ? "fail" : ""}">${esc(v.result || "")}</span> <span>Congress <b>${v.congress || v.id.split("-")[1]}</b></span> <span>Session <b>${v.session || v.id.split("-")[2]}</b></span> <span>Roll call <b>${v.number}</b></span></p>
  <div class="tally">
    <div class="t yea"><div class="n">${t.yea ?? 0}</div><div class="l">Yea</div></div>
    <div class="t nay"><div class="n">${t.nay ?? 0}</div><div class="l">Nay</div></div>
    <div class="t"><div class="n">${t.present ?? 0}</div><div class="l">Present</div></div>
    <div class="t"><div class="n">${t.nv ?? 0}</div><div class="l">Not voting</div></div>
  </div>
  <div class="bar" aria-hidden="true"><i style="width:${(t.yea || 0) / total * 100}%;background:var(--yea)"></i><i style="width:${(t.nay || 0) / total * 100}%;background:var(--nay)"></i><i style="width:${(t.present || 0) / total * 100}%;background:var(--pres)"></i></div>
  <p class="party">${partyLine}</p>
${appBlock("Next time, don't search.", `Open Chambers sends you an alert when your representatives vote, with the official summary. Enter your ZIP code, follow your members, and you'll hear about the next vote like this one as soon as the record posts.`)}
${summary ? `  <h2>What the bill does</h2>
  <div class="summary"><p class="src">Official summary · Congressional Research Service</p><p>${esc(summary)}</p></div>` : ""}
  <h2>How each ${v.chamber === "senate" ? "senator" : "representative"} voted</h2>
  <p class="lede">Sorted by state${v.chamber === "house" ? " and district" : ""}. Not sure who represents you? <a href="${BASE}/#/zip/">Look up your ZIP code</a>.</p>
  <details class="roll" open>
    <summary>${rows ? Object.keys(v.positions).length : 0} members</summary>
    <table><tbody>
${rows}
    </tbody></table>
  </details>
  <p class="lede" style="margin-top:18px">Explore this vote with filters and comparisons in the <a href="${BASE}/#/vote/${v.id}">interactive view</a>.</p>`;
  const schema = { "@context": "https://schema.org", "@type": "Article", headline: pageTitle, datePublished: v.date, dateModified: v.date, description, mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: "John Hubert LLC", url: SITE }, publisher: { "@type": "Organization", name: "Open Chambers", url: SITE + BASE + "/" },
    about: bill ? { "@type": "Legislation", name: head, legislationIdentifier: bill, legislationType: v.chamber === "senate" ? "Senate" : "House" } : undefined };
  return { html: shell({ pageTitle, description, canonical, body, schema }), canonical, lastmod: v.date };
}

function memberPage(m, mv, voteById, bills, builtDate) {
  const ch = m.chamber === "senate" ? "Senate" : "House";
  const where = m.chamber === "senate" ? `${m.state}` : `${m.state}${m.district ? `-${m.district}` : " (at large)"}`;
  const party = m.party === "Democrat" ? "Democrat" : m.party === "Republican" ? "Republican" : "Independent";
  const pageTitle = `How ${title(m)} ${m.name} voted: ${ch} voting record (${party}, ${where})`;
  const recent = mv.slice().map(([id, p]) => ({ v: voteById[id], p })).filter(x => x.v).sort((a, b) => (b.v.date || "").localeCompare(a.v.date || "") || b.v.number - a.v.number).slice(0, RECENT_VOTES);
  const s = m.votes || {};
  const description = `Every recorded vote by ${title(m)} ${m.name} (${m.partyCode}-${where}) in the ${ch}: ${s.total || 0} roll calls this Congress, ${s.attendance ?? "—"}% attendance, votes with party ${s.partyUnity ?? "—"}% of the time. Office phone and addresses.`;
  const canonical = `${SITE}${BASE}/members/${m.id}/`;
  const items = recent.map(({ v, p }) => `      <li><a href="${BASE}/votes/${v.id}/">${esc(voteHeadline(v, bills))}</a><span class="pos ${posClass[p] || "nv"}">${POS[p] || p}</span><span class="m">${esc(longDate(v.date))} · ${esc(prettyBill(v.bill) || v.question || "")} · ${esc(v.result || "")}</span></li>`).join("\n");
  const offices = (m.offices || []).map(o => `<div><span class="k">${esc(o.city || "District office")}${o.state ? `, ${esc(o.state)}` : ""}</span><br>${[o.address, o.zip].filter(Boolean).map(esc).join(" ")}${o.phone ? ` · <a href="tel:${esc(o.phone.replace(/[^\d+]/g, ""))}">${esc(o.phone)}</a>` : ""}</div>`).join("\n");
  const body = `  <p class="crumbs"><a href="${BASE}/">Open Chambers</a> / <a href="${BASE}/#/${m.chamber}">${ch}</a> / <a href="${BASE}/#/state/${m.state}">${m.state}</a></p>
  <h1>${esc(title(m))} ${esc(m.name)}</h1>
  <p class="lede"><b class="${m.partyCode}">${party}</b>, ${m.chamber === "senate" ? `U.S. Senator from ${m.state}` : `U.S. Representative for ${m.state}${m.district ? `'s ${m.district}${ord(m.district)} district` : " at large"}`}. In office since ${m.firstElected}${m.nextElection ? `; next election ${m.nextElection}` : ""}.</p>
  <div class="stats">
    <div class="t"><div class="n">${s.total || 0}</div><div class="l">Roll calls</div></div>
    <div class="t"><div class="n">${s.attendance ?? "—"}%</div><div class="l">Attendance</div></div>
    <div class="t"><div class="n">${s.partyUnity ?? "—"}%</div><div class="l">With party</div></div>
  </div>
${appBlock(`Get an alert when ${esc(title(m))} ${esc(m.last)} votes.`, `Open Chambers notifies you the moment a recorded vote posts, with the official summary of what was decided. Enter your ZIP code, follow your members, done.`)}
  <h2>Recent votes</h2>
  <p class="lede">The ${recent.length} most recent recorded votes. Full record in the <a href="${BASE}/#/member/${m.id}">interactive view</a>.</p>
  <ul class="votes">
${items}
  </ul>
  <h2>Contact</h2>
  <div class="contact">
    ${m.phone ? `<div><span class="k">Washington office</span><br>${esc(m.address || m.office || "")}${m.address || m.office ? " · " : ""}<a href="tel:${esc(m.phone.replace(/[^\d+]/g, ""))}">${esc(m.phone)}</a></div>` : ""}
    ${m.url ? `<div><span class="k">Website</span><br><a href="${esc(m.url)}">${esc(m.url.replace(/^https?:\/\//, ""))}</a>${m.contactForm ? ` · <a href="${esc(m.contactForm)}">Write to ${esc(title(m))} ${esc(m.last)}</a>` : ""}</div>` : ""}
${offices}
  </div>`;
  const schema = { "@context": "https://schema.org", "@type": "ProfilePage", dateModified: builtDate, mainEntity: { "@type": "Person", name: m.name, jobTitle: m.chamber === "senate" ? "United States Senator" : "United States Representative", url: m.url || undefined, telephone: m.phone || undefined,
    affiliation: { "@type": "Organization", name: party === "Democrat" ? "Democratic Party" : party === "Republican" ? "Republican Party" : "Independent" },
    memberOf: { "@type": "Organization", name: m.chamber === "senate" ? "United States Senate" : "United States House of Representatives" } } };
  return { html: shell({ pageTitle, description, canonical, body, schema }), canonical, lastmod: builtDate };
}
const ord = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; };

export function buildPages({ votes, members, memberVotes, bills = {}, docs, log = console.log }) {
  const byId = Object.fromEntries(members.map(m => [m.id, m]));
  const voteById = Object.fromEntries(votes.map(v => [v.id, v]));
  const builtDate = new Date().toISOString().slice(0, 10);
  const urls = [{ loc: `${SITE}${BASE}/`, lastmod: builtDate }];
  let nv = 0, nm = 0, unchanged = 0;
  const put = (file, html) => { if (existsSync(file) && readFileSync(file, "utf8") === html) { unchanged++; return; } writeFileSync(file, html); };
  for (const v of votes) {
    if (v.type === "QUORUM" || /quorum/i.test(v.question || "")) continue;
    const dir = resolve(docs, "votes", v.id); mkdirSync(dir, { recursive: true });
    const p = votePage(v, byId, bills); put(resolve(dir, "index.html"), p.html); urls.push({ loc: p.canonical, lastmod: p.lastmod }); nv++;
  }
  for (const m of members) {
    const dir = resolve(docs, "members", m.id); mkdirSync(dir, { recursive: true });
    const p = memberPage(m, memberVotes[m.id] || [], voteById, bills, builtDate); put(resolve(dir, "index.html"), p.html); urls.push({ loc: p.canonical, lastmod: p.lastmod }); nm++;
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`;
  writeFileSync(resolve(docs, "sitemap.xml"), sitemap);
  log(`pages: ${nv} vote pages, ${nm} member pages, sitemap ${urls.length} urls (${unchanged} unchanged)`);
  return { votes: nv, members: nm };
}
