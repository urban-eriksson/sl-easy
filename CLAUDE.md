# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SL Eazy: the fastest way to see when the next bus or train leaves from where you stand.
A mobile-first, Swedish-language PWA for Stockholm public transport, hosted at
https://sl.korist.se (S3 + CloudFront, first deployed 2026-11-25; the old plain-JS version may still be on
GitHub Pages until `main` is pushed).
No backend: the browser calls SL's public APIs directly, with no API key.

Two things to protect: it opens on the nearest station without being asked, and it is fast.
It is a departure board you can walk through station by station, not a trip planner.

## Layout

- `apps/web`: the app. Vite + React 19 + TypeScript + Tailwind v4, Biome, Vitest. No router
  and no component library: the house look (fonts, header, tokens) is copied from
  `../sopkoll` / `../bike-my-day`, dark only.
- `infra`: CDK in Python (uv). `SlEasyCert` (us-east-1) and `SlEasy` (eu-north-1).
- `scripts/deploy-web.sh`: refresh stations, check, test, build, `cdk deploy SlEasy`.

## Commands

Run in `apps/web`:

```bash
npm run dev                              # http://localhost:5173, talks to SL's live APIs
npm run check                            # tsc + biome
npm run fix                              # biome --write
npm test                                 # vitest
npx vitest run src/lib/journey.test.ts   # one file
npx vitest run -t "pickLeg"              # by name
npm run build
npm run stations                         # regenerate src/data/stations.json from SL
npm run icons                            # PNG icons from public/favicon.svg
```

Never run `scripts/deploy-web.sh` or `cdk deploy` without being asked. The first deploy also
needs the certificate stack (see the script's header).

## The two SL APIs, and what they force

Read the header of `src/lib/sl.ts`. Everything about the UI follows from these limits, each
verified against the live APIs:

- **Departures** (`transport.integration.sl.se/v1/sites/{id}/departures`) returns at most
  **three departures per line and direction**, whatever `forecast` is (max 1200 minutes, 400
  above). It answers "what leaves next", not "what leaves at 14:00". So the unfiltered list
  is each line's next three, and it says so at the bottom. Do not build a time-window or
  scroll-for-later feature on this API: two earlier attempts did and showed a thinned-out list.
- **Journey planner** (`journeyplanner.integration.sl.se/v2/trips`) returns at most three
  journeys per call (4 is a 400) but takes any start time and carries each journey's stops.
  It is the source for the stops in the sheet and for paging a filtered list into the future.
  It answers with one journey just before the asked time and two after.
- The departures API gives Stockholm wall-clock time with no offset; the planner gives UTC.
  `lib/time.ts` converts; never `new Date()` an SL departure string directly.
- All three hosts answer 429 in short bursts. `getJson` retries once; keep request counts
  low (disruption notices are fetched once per station for this reason).
- IDs: a station ("site") 9117 is `9091001000009117` to the planner; a stop area 1131 is
  `9021001001131000`. A site groups several stop areas (metro, bus, train).

## Architecture

`App.tsx` wires five hooks; components are presentational.

- `use-nav`: the view is `{ station, departure }` and every step is a browser history entry
  (`?s=<site id>`, the rest in `history.state`). Opening the sheet pushes; tapping a stop in
  the sheet pushes that station. So Back walks station → sheet → station. History calls must
  stay out of state updaters (StrictMode runs those twice).
- `use-departures`: one station's board, refetched every 30 s while visible. A failed refresh
  keeps the old list and reports the problem.
- `use-direct`: the "Till Hornstull" list. Tapping a stop in the sheet narrows the list to
  every direct way from this station to that one (saved per station); the arrow beside the
  stop, or "Avgångar från …" above the list, moves to that station instead. Those are two
  different operations on purpose. The rows come from the planner (both stations are known
  by id, so nothing is guessed), paged as the user scrolls: an IntersectionObserver sentinel
  in `App` drives it. One stream per transport mode, because the planner hides journeys it
  finds worse (a bus loses to a faster metro); the stream furthest behind is fetched next and
  rows show only up to the point every stream has reached, so nothing is inserted above what
  the user is reading. This is also the only place the app can scroll into later departures.
- `use-location` + `stations.ts`: the full station list ships with the app as a fingerprinted
  JSON (`src/data/stations.json`, generated). Nearest-station lookup and search are local and
  instant. After the user has asked for their position once, a cold start (no `?s=`) asks
  again and switches to the nearest station.
- `journey.ts` (pure, tested) and `journey-lookup.ts` (network): matching a departure to a
  planner journey for the stop list of a row from the departures API. This is the fragile
  part (rows in a "till" list are not affected: they carry the planner's terminus id):
  - A departure only carries its sign text ("Björknäs"), so the destination has to be guessed:
    stations with that exact name nearest-first, then names beginning with it, then the
    planner's stop finder if it is confident.
  - The match is by timetable time (within 90 s), line and platform. On the metro the line
    number is ignored: the two APIs disagree on 17/18/19.
  - If the exact departure is not in the answer, a later run of the same line stands in with
    shifted times, shown with "~".
  - Queries are restricted to the departure's mode for bus and metro, or the planner answers
    a bus departure with the faster metro.
  - It fails for bus signs that match no stop name in SL's list ("Hornsberg", "Västra
    Orminge"). The sheet then says the stops could not be found. A real fix needs line
    patterns from Trafiklab's GTFS data (API key, build-time processing); name tricks have
    been exhausted.

## Conventions

- All copy is Swedish and lives in `src/lib/i18n.ts`.
- Colour means a line: the pills use SL's line colours (`--line-*` in `index.css`) and
  nothing else is coloured. Text is ash white; amber is "late", red is "cancelled".
- The timetable time leads every row; live data (minutes left, `+3`) is the smaller line.
- `public/sw.js` is network-first for the page and cache-first for fingerprinted assets.
  Nothing needs bumping on release.
- The footer's Trafiklab / SL attribution (CC BY 2.0) is a licence requirement.
