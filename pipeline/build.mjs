// The Floor — data pipeline.
// Pulls public sources, normalizes them, and writes static JSON into docs/data/.
// Runs nightly in GitHub Actions (see .github/workflows/data.yml) or locally: `npm run build`.
//
// Sources (all public, no keys):
//   1. unitedstates/congress-legislators  — who is in Congress, terms, districts, ids
//   2. Voteview (UCLA)                     — DW-NOMINATE ideology scores, by bioguide id
//   3. House Clerk roll-call XML           — every House vote, member positions by bioguide id
//   4. Senate LIS roll-call XML            — every Senate vote, member positions by LIS id
//   5. OpenSourceActivismTech zccd.csv      — ZIP code → congressional district(s)
//
// Set CONGRESS (default 119) and SESSIONS (default "1,2"). Network failures for a
// single source are logged and skipped, so one broken feed doesn't block the rest.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { parseHouseVote, parseSenateVote, parseSenateMenu, parseVoteviewMembers, parseZipDistricts } from "./parsers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../docs/data");
const CACHE = resolve(here, "cache");
const CONGRESS = +(process.env.CONGRESS || 119);
const SESSIONS = (process.env.SESSIONS || "1,2").split(",").map(Number);
const FIRST_YEAR = 1789 + (CONGRESS - 1) * 2; // 119th → 2025
mkdirSync(OUT, { recursive: true }); mkdirSync(resolve(OUT, "members"), { recursive: true }); mkdirSync(resolve(OUT, "votes"), { recursive: true }); mkdirSync(CACHE, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function fetchText(url, { cache = true, retries = 2 } = {}) {
  const key = resolve(CACHE, url.replace(/[^a-z0-9]+/gi, "_").slice(-150));
  if (cache && existsSync(key)) return readFileSync(key, "utf8");
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "the-floor-pipeline (johnhubert.llc; support@johnhubert.llc)" } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      if (cache) writeFileSync(key, t);
      return t;
    } catch (e) { if (i === retries) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}

/* ---------- 1. Members ---------- */
log("legislators…");
const legisYaml = await fetchText("https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml", { cache: false });
const socialYaml = await fetchText("https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-social-media.yaml", { cache: false }).catch(() => "");
const legis = yaml.load(legisYaml);
const social = Object.fromEntries((yaml.load(socialYaml || "[]") || []).map(s => [s.id.bioguide, s.social || {}]));
const lisToBio = {};
const members = legis.map(l => {
  const terms = l.terms; const cur = terms[terms.length - 1]; const first = terms[0];
  const chamber = cur.type === "sen" ? "senate" : "house";
  if (l.id.lis) lisToBio[l.id.lis] = l.id.bioguide;
  const yearsInOffice = terms.reduce((s, t) => s + (Date.parse(t.end) - Date.parse(t.start)), 0) / (365.25 * 864e5);
  const termEnd = cur.end; const electionYear = +termEnd.slice(0, 4) - 1;
  return {
    id: l.id.bioguide,
    name: l.name.official_full || `${l.name.first} ${l.name.last}`,
    first: l.name.first, last: l.name.last,
    chamber, state: cur.state,
    district: chamber === "house" ? (cur.district ?? 0) : null,
    senateClass: chamber === "senate" ? cur.class : null,
    party: cur.party,
    partyCode: cur.party === "Democrat" ? "D" : cur.party === "Republican" ? "R" : "I",
    birthday: l.bio?.birthday || null,
    gender: l.bio?.gender || null,
    firstElected: first.start.slice(0, 4),
    since: first.start,
    yearsInOffice: Math.round(yearsInOffice * 10) / 10,
    termsServed: terms.length,
    termEnd, nextElection: electionYear,
    url: cur.url || null, phone: cur.phone || null, office: cur.office || null,
    contactForm: cur.contact_form || null,
    twitter: social[l.id.bioguide]?.twitter || null,
    ids: { lis: l.id.lis || null, icpsr: l.id.icpsr || null, govtrack: l.id.govtrack || null, wikipedia: l.id.wikipedia || null, opensecrets: l.id.opensecrets || null },
    nominate: null, // filled below
    votes: { total: 0, yea: 0, nay: 0, present: 0, missed: 0, withParty: 0, partyVotes: 0 },
  };
});
log(`${members.length} current members (${members.filter(m => m.chamber === "senate").length} senators)`);
const byId = Object.fromEntries(members.map(m => [m.id, m]));

/* ---------- 2. Voteview DW-NOMINATE ---------- */
try {
  log("voteview…");
  const csv = await fetchText(`https://voteview.com/static/data/out/members/HS${CONGRESS}_members.csv`, { cache: false });
  const vv = parseVoteviewMembers(csv);
  let n = 0;
  for (const m of members) if (vv[m.id]) { m.nominate = vv[m.id]; n++; }
  log(`nominate scores matched for ${n} members`);
} catch (e) { log("voteview FAILED:", e.message); }

/* ---------- 3 + 4. Roll-call votes ---------- */
const votes = [];
const memberVotes = Object.fromEntries(members.map(m => [m.id, []]));

async function houseSession(session) {
  const year = FIRST_YEAR + (session - 1);
  let misses = 0, n = 0;
  for (let roll = 1; roll < 2000; roll++) {
    const url = `https://clerk.house.gov/evs/${year}/roll${String(roll).padStart(3, "0")}.xml`;
    let xml = null;
    try { xml = await fetchText(url); } catch (e) { log("house fetch error", roll, e.message); }
    if (!xml) { if (++misses >= 5) break; continue; }
    misses = 0;
    const v = parseHouseVote(xml); if (!v) continue;
    v.session = session; v.id = `h-${CONGRESS}-${session}-${String(roll).padStart(3, "0")}`;
    votes.push(v); n++;
  }
  log(`house session ${session} (${year}): ${n} roll calls`);
}
async function senateSession(session) {
  const menu = await fetchText(`https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${CONGRESS}_${session}.xml`, { cache: false });
  if (!menu) { log(`senate session ${session}: no menu`); return; }
  const list = parseSenateMenu(menu); let n = 0;
  for (const item of list) {
    const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${CONGRESS}${session}/vote_${CONGRESS}_${session}_${String(item.number).padStart(5, "0")}.xml`;
    let xml = null;
    try { xml = await fetchText(url); } catch (e) { log("senate fetch error", item.number, e.message); continue; }
    if (!xml) continue;
    const v = parseSenateVote(xml); if (!v) continue;
    // map LIS ids → bioguide
    const pos = {}; for (const [lis, p] of Object.entries(v.positions)) { const b = lisToBio[lis]; if (b) pos[b] = p; }
    v.positions = pos; if (!v.description) v.description = item.title || item.issue; if (!v.question) v.question = item.question;
    votes.push(v); n++;
  }
  log(`senate session ${session}: ${n} roll calls`);
}
for (const s of SESSIONS) {
  try { await houseSession(s); } catch (e) { log("house session failed:", e.message); }
  try { await senateSession(s); } catch (e) { log("senate session failed:", e.message); }
}
votes.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.number - a.number);

/* ---------- Per-vote party breakdown + per-member tallies ---------- */
for (const v of votes) {
  const byParty = { D: { Y: 0, N: 0, P: 0, "-": 0 }, R: { Y: 0, N: 0, P: 0, "-": 0 }, I: { Y: 0, N: 0, P: 0, "-": 0 } };
  for (const [id, p] of Object.entries(v.positions)) { const m = byId[id]; if (m) byParty[m.partyCode][p]++; }
  v.byParty = byParty;
  const majority = {}; for (const pc of ["D", "R"]) { const b = byParty[pc]; majority[pc] = b.Y > b.N ? "Y" : b.N > b.Y ? "N" : null; }
  for (const [id, p] of Object.entries(v.positions)) {
    const m = byId[id]; if (!m) continue;
    const t = m.votes; t.total++;
    if (p === "Y") t.yea++; else if (p === "N") t.nay++; else if (p === "P") t.present++; else t.missed++;
    const maj = majority[m.partyCode];
    if (maj && (p === "Y" || p === "N")) { t.partyVotes++; if (p === maj) t.withParty++; }
    memberVotes[id].push([v.id, p]);
  }
}
for (const m of members) { const t = m.votes; t.partyUnity = t.partyVotes ? Math.round(t.withParty / t.partyVotes * 1000) / 10 : null; t.attendance = t.total ? Math.round((t.total - t.missed) / t.total * 1000) / 10 : null; }

/* ---------- 5. ZIP → district ---------- */
let zip = {};
try {
  log("zip districts…");
  zip = parseZipDistricts(await fetchText("https://raw.githubusercontent.com/OpenSourceActivismTech/us-zipcodes-congress/master/zccd.csv", { cache: false }));
  log(`${Object.keys(zip).length} ZIP codes`);
} catch (e) { log("zip FAILED:", e.message); }

/* ---------- Write ---------- */
const slim = v => ({ id: v.id, chamber: v.chamber, date: v.date, number: v.number, question: v.question, description: v.description, bill: v.bill, result: v.result, tally: v.tally });
writeFileSync(resolve(OUT, "members.json"), JSON.stringify(members));
writeFileSync(resolve(OUT, "votes-index.json"), JSON.stringify(votes.map(slim)));
for (const v of votes) writeFileSync(resolve(OUT, "votes", v.id + ".json"), JSON.stringify(v));
for (const m of members) writeFileSync(resolve(OUT, "members", m.id + ".json"), JSON.stringify({ id: m.id, votes: memberVotes[m.id] }));
writeFileSync(resolve(OUT, "zip.json"), JSON.stringify(zip));
writeFileSync(resolve(OUT, "meta.json"), JSON.stringify({ congress: CONGRESS, sessions: SESSIONS, builtAt: new Date().toISOString(), members: members.length, votes: votes.length, house: votes.filter(v => v.chamber === "house").length, senate: votes.filter(v => v.chamber === "senate").length, nominate: members.filter(m => m.nominate).length, sources: { legislators: "https://github.com/unitedstates/congress-legislators", voteview: "https://voteview.com/data", house: "https://clerk.house.gov/Votes", senate: "https://www.senate.gov/legislative/votes_new.htm", zip: "https://github.com/OpenSourceActivismTech/us-zipcodes-congress" } }, null, 2));
log(`done: ${members.length} members, ${votes.length} votes → ${OUT}`);
