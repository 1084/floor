# Open Chambers

Every current member of the U.S. House and Senate — who they are, how long they've
served, when they're next up for election, where they sit on the DW-NOMINATE
ideology scale, and how they voted on every roll call — from official public
records, shown without commentary.

Live at **https://johnhubert.llc/floor/** (GitHub Pages, served from `docs/`).

## How it works

```
pipeline/build.mjs     fetches the sources and writes static JSON into docs/data/
pipeline/parsers.mjs   parsers for the House XML, Senate XML, Voteview CSV, ZIP CSV
test/                  parser tests against feed-shaped samples   (npm test)
docs/index.html        the whole front end: one file, no build step, no framework
docs/data/             generated — members.json, votes-index.json, votes/*.json,
                       members/*.json (each member's positions), zip.json, meta.json
.github/workflows/     nightly data refresh that commits docs/data back to main
```

There is no server. The nightly GitHub Action runs the pipeline, commits the JSON,
and GitHub Pages serves it. The browser loads ~1 MB up front (members + vote index)
and fetches a member's or a vote's detail file on demand.

### Sources (all public, no API keys)

| What | Source |
|---|---|
| Members, terms, districts, ids | https://github.com/unitedstates/congress-legislators |
| House roll calls (positions by bioguide id) | https://clerk.house.gov/evs/<year>/rollNNN.xml |
| Senate roll calls (positions by LIS id) | https://www.senate.gov/legislative/LIS/roll_call_votes/... |
| DW-NOMINATE scores | https://voteview.com/static/data/out/members/HS119_members.csv |
| ZIP → district | https://github.com/OpenSourceActivismTech/us-zipcodes-congress |
| Portraits | https://github.com/unitedstates/images |

## Set up

1. Push this repo to GitHub as `floor` (the repo name becomes the URL path). It can
   stay private only on a paid plan; GitHub Pages on a free account needs it public.
2. **Settings → Pages**: Source *Deploy from a branch*, branch `main`, folder `/docs`.
   The site appears at `https://johnhubert.llc/floor/` within a minute or two.
3. **Actions → Refresh data → Run workflow.** The first run downloads every roll call
   of the current Congress (10–20 minutes). When it finishes, the site shows votes.

The shipped `docs/data` contains members and ZIP data only (the vote feeds were not
reachable from the machine that built this repo), so until the first Action run the
site shows profiles without votes.

## Run locally

```
npm install
npm test
npm run build            # SESSIONS=1 CONGRESS=119 to limit
npx serve docs           # or any static server
```

## Method notes

- **Ideology** is Voteview's DW-NOMINATE first dimension, shown as published. No
  labels are applied to individual votes.
- **With party** = share of a member's yea/nay votes that matched their party's
  majority on that roll call. **Votes cast** = share of roll calls not missed.
- **Next election** = the year before the member's current term ends.
- A ZIP that spans districts shows every matching district.

## Roadmap

- Bill summaries: the Congress.gov API provides official CRS summaries (needs a free
  API key). Show the summary on each vote page.
- Alerts: "your representatives just voted" by SMS or email. Needs a small server,
  a messaging provider, explicit opt-in consent, and a privacy-policy update.
- Historical Congresses; committee assignments; sponsorship records.
