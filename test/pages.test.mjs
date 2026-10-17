// Static page generator tests. Run: npm test
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prettyBill, voteHeadline, longDate, buildPages } from "../pipeline/pages.mjs";

assert.equal(prettyBill("H R 9497"), "H.R. 9497");
assert.equal(prettyBill("S 2403"), "S. 2403");
assert.equal(prettyBill("H.J.RES. 12"), "H.J.Res. 12");
assert.equal(prettyBill("PN1129"), "PN 1129");
assert.equal(prettyBill(""), "");
assert.equal(longDate("2026-09-16"), "September 16, 2026");

const members = [
  { id: "B001292", name: "Donald S. Beyer, Jr.", first: "Donald", last: "Beyer", chamber: "house", state: "VA", district: 8, party: "Democrat", partyCode: "D", firstElected: "2015", nextElection: 2026, phone: "202-225-4376", url: "https://beyer.house.gov", address: "1226 Longworth", offices: [], votes: { total: 1, attendance: 100, partyUnity: 100 } },
  { id: "W000805", name: "Mark R. Warner", first: "Mark", last: "Warner", chamber: "senate", state: "VA", district: null, party: "Democrat", partyCode: "D", firstElected: "2009", nextElection: 2026, offices: [], votes: { total: 0 } },
];
const votes = [
  { id: "h-119-2-313", chamber: "house", congress: 119, session: 2, number: 313, date: "2026-09-16", question: "On Passage", description: "Water Resources Development Act", bill: "H R 9497", result: "Passed", tally: { yea: 1, nay: 0, present: 0, nv: 0 }, positions: { B001292: "Y" }, byParty: { D: { Y: 1, N: 0, P: 0, "-": 0 }, R: { Y: 0, N: 0, P: 0, "-": 0 }, I: { Y: 0, N: 0, P: 0, "-": 0 } } },
  { id: "h-119-1-001", chamber: "house", number: 1, date: "2025-01-03", question: "Call by States", bill: "QUORUM", type: "QUORUM", result: "Passed", tally: {}, positions: {} },
];
const bills = { hr9497: { title: "Water Resources Development Act of 2026", summary: "Authorizes <b>projects</b>." } };
assert.equal(voteHeadline(votes[0], bills), "Water Resources Development Act of 2026");
assert.equal(voteHeadline(votes[0], {}), "Water Resources Development Act");

const docs = mkdtempSync(join(tmpdir(), "pages-"));
const r = buildPages({ votes, members, memberVotes: { B001292: [["h-119-2-313", "Y"]] }, bills, docs, log: () => {} });
assert.deepEqual(r, { votes: 1, members: 2 });                       // quorum call skipped
assert.ok(!existsSync(join(docs, "votes", "h-119-1-001")));
const vp = readFileSync(join(docs, "votes", "h-119-2-313", "index.html"), "utf8");
assert.ok(vp.includes('<link rel="canonical" href="https://johnhubert.llc/floor/votes/h-119-2-313/">'));
assert.ok(vp.includes('apple-itunes-app" content="app-id=6816544012"'));
assert.ok(vp.includes("Authorizes &lt;b&gt;projects&lt;/b&gt;."));        // summaries are escaped
assert.ok(vp.includes('href="/floor/members/B001292/"'));
assert.ok(vp.includes("apps.apple.com/us/app/open-chambers"));
const mp = readFileSync(join(docs, "members", "B001292", "index.html"), "utf8");
assert.ok(mp.includes("Rep. Donald S. Beyer, Jr.") && mp.includes('href="/floor/votes/h-119-2-313/"') && mp.includes("202-225-4376"));
const sm = readFileSync(join(docs, "sitemap.xml"), "utf8");
assert.equal((sm.match(/<url>/g) || []).length, 4);                  // root + 1 vote + 2 members
// Unchanged data rewrites nothing (keeps nightly commits small).
const before = readFileSync(join(docs, "votes", "h-119-2-313", "index.html"), "utf8");
buildPages({ votes, members, memberVotes: { B001292: [["h-119-2-313", "Y"]] }, bills, docs, log: () => {} });
assert.equal(readFileSync(join(docs, "votes", "h-119-2-313", "index.html"), "utf8"), before);
rmSync(docs, { recursive: true, force: true });
console.log("pages: all tests passed");
