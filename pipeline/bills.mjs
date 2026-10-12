// Bill titles and CRS summaries for every bill that has had a roll-call vote, from the
// Congress.gov API (api.congress.gov; free key from https://api.congress.gov/sign-up/).
//
// Output: docs/data/bills.json  { "hr9340": { title, summary, checked }, ... }
// The file doubles as the cache: bills already summarized are never re-fetched; bills with
// no summary yet are re-checked after RECHECK_DAYS; at most MAX_NEW bills are fetched per
// run, so the first fill spreads over a few nights and stays far under the 5,000/hour limit.
// Nominations (PN…) have no bill text and are skipped. No key → the existing file is kept.

const TYPE = { "H R": "hr", "HR": "hr", "H.R.": "hr", "S": "s", "S.": "s", "H J RES": "hjres", "H.J.RES.": "hjres", "S J RES": "sjres", "S.J.RES.": "sjres", "H RES": "hres", "H.RES.": "hres", "S RES": "sres", "S.RES.": "sres", "H CON RES": "hconres", "H.CON.RES.": "hconres", "S CON RES": "sconres", "S.CON.RES.": "sconres" };
const RECHECK_DAYS = 7, MAX_NEW = 400, DELAY_MS = 250;

export function parseBill(s) {
  if (!s) return null;
  const m = String(s).trim().toUpperCase().replace(/\s+/g, " ").match(/^([A-Z][A-Z .]*?)\s*(\d+)$/);
  if (!m) return null;
  const type = TYPE[m[1].trim()] || TYPE[m[1].replace(/\./g, "").replace(/\s+/g, " ").trim()];
  return type ? { type, number: +m[2], key: `${type}${m[2]}` } : null;
}
export const billKey = s => parseBill(s)?.key || null;

const strip = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/\s+/g, " ").trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function buildBills({ congress, votes, existing = {}, apiKey, log = console.log }) {
  const out = { ...existing };
  const wanted = new Map();
  for (const v of votes) { const b = parseBill(v.bill); if (b) wanted.set(b.key, b); }
  if (!apiKey) { log(`bills: no CONGRESS_API_KEY — keeping ${Object.keys(out).length} cached bills`); return out; }
  const now = Date.now();
  const todo = [...wanted.values()].filter(b => {
    const e = out[b.key];
    return !e || (!e.summary && now - Date.parse(e.checked || 0) > RECHECK_DAYS * 864e5);
  }).slice(0, MAX_NEW);
  log(`bills: ${wanted.size} bills with roll calls, ${todo.length} to fetch`);
  let n = 0;
  for (const b of todo) {
    try {
      const base = `https://api.congress.gov/v3/bill/${congress}/${b.type}/${b.number}`;
      const head = { headers: { "x-api-key": apiKey, accept: "application/json", "user-agent": "the-floor-pipeline (johnhubert.llc; support@johnhubert.llc)" } };
      const r1 = await fetch(`${base}?format=json`, head);
      if (r1.status === 429) { log("bills: rate limited — stopping for tonight"); break; }
      const title = r1.ok ? strip((await r1.json()).bill?.title) : "";
      await sleep(DELAY_MS);
      const r2 = await fetch(`${base}/summaries?format=json`, head);
      const list = r2.ok ? ((await r2.json()).summaries || []) : [];
      const latest = list[list.length - 1];
      out[b.key] = { title: title.slice(0, 300), summary: strip(latest?.text).slice(0, 4000), checked: new Date(now).toISOString().slice(0, 10) };
      n++;
      await sleep(DELAY_MS);
    } catch (e) { log(`bills: ${b.key} failed: ${e.message}`); }
  }
  log(`bills: fetched ${n}; ${Object.values(out).filter(x => x.summary).length} with summaries, ${Object.keys(out).length} total`);
  return out;
}
