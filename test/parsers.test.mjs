// Parser tests against samples shaped like the real feeds. Run: npm test
import assert from "node:assert/strict";
import { parseHouseVote, parseSenateVote, parseSenateMenu, parseVoteviewMembers, parseZipDistricts } from "../pipeline/parsers.mjs";

const house = `<?xml version="1.0"?>
<rollcall-vote>
<vote-metadata>
<majority>R</majority><congress>119</congress><session>2nd</session><chamber>U.S. House of Representatives</chamber>
<rollcall-num>12</rollcall-num><legis-num>H R 1234</legis-num><vote-question>On Passage</vote-question>
<vote-type>YEA-AND-NAY</vote-type><vote-result>Passed</vote-result><action-date>15-Jan-2026</action-date><action-time time-etz="14:05">2:05 PM</action-time>
<vote-desc>Example Act of 2026</vote-desc>
<totals-by-vote><total-stub>Totals</total-stub><yea-total>2</yea-total><nay-total>1</nay-total><present-total>0</present-total><not-voting-total>1</not-voting-total></totals-by-vote>
</vote-metadata>
<vote-data>
<recorded-vote><legislator name-id="A000370" sort-field="Adams" unaccented-name="Adams" party="D" state="NC" role="legislator">Adams</legislator><vote>Yea</vote></recorded-vote>
<recorded-vote><legislator name-id="B000001" sort-field="Bee" unaccented-name="Bee" party="R" state="TX" role="legislator">Bee &amp; Co</legislator><vote>Nay</vote></recorded-vote>
<recorded-vote><legislator name-id="C000002" sort-field="Cee" unaccented-name="Cee" party="R" state="OH" role="legislator">Cee</legislator><vote>Aye</vote></recorded-vote>
<recorded-vote><legislator name-id="D000003" sort-field="Dee" unaccented-name="Dee" party="D" state="CA" role="legislator">Dee</legislator><vote>Not Voting</vote></recorded-vote>
</vote-data>
</rollcall-vote>`;
const h = parseHouseVote(house);
assert.equal(h.id, "h-119-2-012"); assert.equal(h.chamber, "house"); assert.equal(h.date, "2026-01-15");
assert.equal(h.question, "On Passage"); assert.equal(h.bill, "H R 1234"); assert.equal(h.result, "Passed");
assert.deepEqual(h.tally, { yea: 2, nay: 1, present: 0, nv: 1 });
assert.deepEqual(h.positions, { A000370: "Y", B000001: "N", C000002: "Y", D000003: "-" });

const senate = `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
<congress>119</congress><session>2</session><congress_year>2026</congress_year><vote_number>7</vote_number>
<vote_date>January 20, 2026,  05:31 PM</vote_date><modify_date>January 20, 2026,  05:45 PM</modify_date>
<vote_question_text>On the Motion to Proceed (Motion to Proceed to S. 99)</vote_question_text>
<vote_document_text></vote_document_text><vote_result_text>Motion to Proceed Agreed to (2-1)</vote_result_text>
<question>On the Motion to Proceed</question><vote_title>Motion to Proceed to S. 99</vote_title>
<majority_requirement>1/2</majority_requirement><vote_result>Motion to Proceed Agreed to</vote_result>
<document><document_congress>119</document_congress><document_type>S.</document_type><document_number>99</document_number><document_name>S. 99</document_name><document_title>Example Senate Act</document_title></document>
<count><yeas>2</yeas><nays>1</nays><present>0</present><absent>0</absent></count>
<members>
<member><member_full>Cantwell (D-WA)</member_full><last_name>Cantwell</last_name><first_name>Maria</first_name><party>D</party><state>WA</state><vote_cast>Yea</vote_cast><lis_member_id>S275</lis_member_id></member>
<member><member_full>Doe (R-UT)</member_full><last_name>Doe</last_name><first_name>Jane</first_name><party>R</party><state>UT</state><vote_cast>Nay</vote_cast><lis_member_id>S999</lis_member_id></member>
<member><member_full>Roe (I-VT)</member_full><last_name>Roe</last_name><first_name>Rick</first_name><party>I</party><state>VT</state><vote_cast>Yea</vote_cast><lis_member_id>S998</lis_member_id></member>
</members>
</roll_call_vote>`;
const s = parseSenateVote(senate);
assert.equal(s.id, "s-119-2-00007"); assert.equal(s.date, "2026-01-20"); assert.equal(s.bill, "S. 99");
assert.equal(s.question, "On the Motion to Proceed (Motion to Proceed to S. 99)");
assert.deepEqual(s.tally, { yea: 2, nay: 1, present: 0, nv: 0 });
assert.deepEqual(s.positions, { S275: "Y", S999: "N", S998: "Y" });

const menu = `<vote_summary><congress>119</congress><session>2</session><votes>
<vote><vote_number>00007</vote_number><vote_date>20-Jan</vote_date><issue>S. 99</issue><question>On the Motion to Proceed</question><result>Agreed to</result><vote_tally><yeas>2</yeas><nays>1</nays></vote_tally><title>Motion to Proceed to S. 99</title></vote>
</votes></vote_summary>`;
const m = parseSenateMenu(menu); assert.equal(m.length, 1); assert.equal(m[0].number, 7); assert.equal(m[0].issue, "S. 99");

const vv = `congress,chamber,icpsr,state_icpsr,district_code,state_abbrev,party_code,occupancy,last_means,bioname,bioguide_id,born,died,nominate_dim1,nominate_dim2,nominate_log_likelihood,nominate_geo_mean_probability,nominate_number_of_votes,nominate_number_of_errors,conditional,nokken_poole_dim1,nokken_poole_dim2
119,Senate,39310,73,0,WA,100,0,1,"CANTWELL, Maria",C000127,1958,,-0.283,0.147,-50.1,0.8,300,20,,,
119,House,99999,99,1,XX,200,0,1,"NOBODY, Test",,1970,,0.5,0.1,-1,0.9,1,0,,,`;
const scores = parseVoteviewMembers(vv);
assert.equal(scores.C000127.dim1, -0.283); assert.equal(scores.C000127.votes, 300); assert.equal(Object.keys(scores).length, 1);

const zips = parseZipDistricts("state_fips,state_abbr,zcta,cd\n01,AL,35004,3\n01,AL,35004,4\n51,VA,22201,8\n");
assert.deepEqual(zips["35004"], ["AL-3", "AL-4"]); assert.deepEqual(zips["22201"], ["VA-8"]);

console.log("parsers: all tests passed");
