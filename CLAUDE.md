# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SL Eazy: the fastest way to see when the next bus or train leaves from where you stand.
A mobile-first, Swedish-language PWA for Stockholm public transport, hosted at
https://sl.korist.se (S3 + CloudFront, first deployed 2026-11-25).
No API of its own: the browser calls SL's public APIs directly, with no key, and reads
timetable files that a nightly job publishes beside the app.

Two things to protect: it opens on the nearest station without being asked, and it is fast.
It is a departure board you can walk through station by station, not a trip planner.

## Layout

- `apps/web`: the app. Vite + React 19 + TypeScript + Tailwind v4, Biome, Vitest. No router
  and no component library: the house look (fonts, header, tokens) is copied from
  `../sopkoll` / `../bike-my-day`, dark only.
- `timetable`: the nightly job, Python standard library only. `build_timetable.py` cuts
  SL's GTFS zip into per-station files, `run.sh` downloads and publishes, `provision.sh`
  installs both on the shared dev box as `sl-easy-timetable.timer` (03:00 Stockholm).
- `infra`: CDK in Python (uv). `SlEasyCert` (us-east-1) and `SlEasy` (eu-north-1): the web
  bucket, the data bucket behind `/tt/*`, and a grant on the dev box's role.
- `scripts/deploy-web.sh`: refresh stations, check, test, build, `cdk deploy SlEasy`.
- `scripts/deploy-timetable.sh`: test and install the job on the box over S3 + SSM;
  `--run` also runs it now. `scripts/push-trafiklab-key.sh` puts the key in SSM.

The app is "SL Eazy" to its users; the repo, stacks, box user and paths say `sl-easy`.

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
npm run icons                            # icons from icon-source.jpg
```

```bash
python3 -m unittest discover -s timetable   # the generator's tests (repo root)
python3 timetable/build_timetable.py --zip sl.zip --sites apps/web/src/data/stations.json --out /tmp/tt
```

`npm run dev` proxies `/tt` to the live site, so development uses the published timetable;
`TT_PROXY=http://localhost:…` points it at a local build instead.

Never run `scripts/deploy-web.sh`, `scripts/deploy-timetable.sh` or `cdk deploy` without
being asked. The first deploy also needs the certificate stack (see the script's header).

The dev box belongs to `../korist-infra` (see `~/repos/CLAUDE.md`): this repo only installs
its own user, `/opt/sl-easy`, `/var/lib/sl-easy`, `/etc/sl-easy` and its one service and
timer there. Anything else about the box goes through `~/repos/INFRA-INBOX.md`.

Trafiklab allows **65 downloads of the GTFS zip per 30 days**. `run.sh` downloads at most
once per day however often it runs; when experimenting, reuse one local copy of the zip
(key in `~/repos/GTFS_regional_static_data.txt`, never in the repo).

## Where the data comes from, and what each source forces

Three sources. The timetable files are the substance of the plain list; the two SL APIs
(read the header of `src/lib/sl.ts`) add live data and the "till" lists. Their limits are
each verified against the live services:

- **Timetable files** (`/tt/...`, from SL's GTFS feed via Trafiklab, rebuilt nightly):
  every departure from every station for yesterday's service day and eight days on, plus
  each line's stops and running times. `current.json` names the live version and which
  services run on which day; `v/<yyyymmdd>/s/<site>.json` is a station, `r/<n>.json` a
  line. Layouts are documented in `timetable/build_timetable.py`; `lib/timetable.ts` reads
  them. A version is immutable and expires from S3 after nine days. GTFS times count from
  the start of the service day and run past 24:00.

- **Departures** (`transport.integration.sl.se/v1/sites/{id}/departures`) returns at most
  **three departures per line and direction**, whatever `forecast` is (max 1200 minutes, 400
  above). It answers "what leaves next", not "what leaves at 14:00". It is the live layer
  over the timetable, and the whole list only when a station has no timetable file (the
  note at the bottom then says so). Do not build a time-window or scroll-for-later feature
  on this API: two earlier attempts did and showed a thinned-out list.
- **Journey planner** (`journeyplanner.integration.sl.se/v2/trips`) returns at most three
  journeys per call (4 is a 400) but takes any start time and carries each journey's stops.
  It is the source for a "till" list, and for the stops of a row that has no timetable trip.
  It answers with one journey just before the asked time and two after.
- The departures API gives Stockholm wall-clock time with no offset; the planner gives UTC.
  `lib/time.ts` converts; never `new Date()` an SL departure string directly.
- All three hosts answer 429 in short bursts. `getJson` retries once; keep request counts
  low (disruption notices are fetched once per station for this reason).
- IDs: a station ("site") 9117 is `9091001000009117` to the planner; a stop area 1131 is
  `9021001001131000`. A site groups several stop areas (metro, bus, train). Some two hundred
  stop areas are listed under more than one site (the metro at Medborgarplatsen is also under
  "Björns trädgård"); `Stations.ofArea` takes the stop's name to choose.

## Architecture

`App.tsx` wires six hooks; components are presentational.

- `use-nav`: the view is `{ station, departure }` and every step is a browser history entry
  (`?s=<site id>`, the rest in `history.state`). Opening the sheet pushes; following a
  departure to a stop (the arrow in the sheet) replaces the sheet's entry with that station.
  So Back closes an open sheet, and from a followed station it lands on the previous
  station's list with no sheet: the next thing wanted there is another departure. History
  calls must stay out of state updaters (StrictMode runs those twice).
- `use-departures`: one station's board, refetched every 30 s while visible. A failed refresh
  keeps the old list and reports the problem.
- `use-direct`: the "Till Hornstull" list. Tapping a stop in the sheet narrows the list to
  every direct way from this station to that one; the arrow beside the stop moves to that
  station instead. The narrowing lives in the station's history entry (`view.towards`), so
  Back to a station finds it as it was and a station opened anew has none. Those are two
  different operations on purpose. The rows come from the planner (both stations are known
  by id, so nothing is guessed), paged as the user scrolls: an IntersectionObserver sentinel
  in `App` drives it. One stream per transport mode, because the planner hides journeys it
  finds worse (a bus loses to a faster metro); the stream furthest behind is fetched next and
  rows show only up to the point every stream has reached, so nothing is inserted above what
  the user is reading. A row is kept only if the ride itself ends at the station asked
  for: the planner also offers a ride to somewhere near plus a walk (bus 4 for
  Medborgarplatsen). This is also the only place the app can scroll into later departures.
- `use-location` + `stations.ts`: the full station list ships with the app as a fingerprinted
  JSON (`src/data/stations.json`, generated). Nearest-station lookup and search are local and
  instant. After the user has asked for their position once, a cold start (no `?s=`) asks
  again and switches to the nearest station.
- The station panel (`station-picker.tsx`) is the one place to choose where to stand. The
  header's station name and position button both open it: stations nearest first, a search
  box on top. Opening it never changes the station by itself (the position button once jumped
  straight to the nearest station, which surprised). A station picked there becomes the root:
  `openRoot` rewinds the app's history, so there is no Back from it.
- Following a departure to a stop (the arrow in the sheet) carries its timetable arrival time
  in the view (`view.arrival`); the header shows it after the station name and the lists
  start there. A "till" list pages from that time.
- `use-timetable` + `timetable.ts`: the plain list. A station's timetable is expanded a
  service day at a time and `mergeLive` lays the board over it: a board departure found in
  the timetable (same stop area, timetable time within 45 s, same line and platform) gives
  that row its live time, state and sign; one not found becomes a row of its own. Against
  the live board about 98 % match. The rest are mostly cancelled metro runs the timetable
  never had, and now and then a metro train whose timetable time differs between the two
  sources, which then shows twice. `App` shows 60 rows and pages on as the user scrolls,
  day after day to the end of the files. Timetable rows carry a `trip` reference, so the
  sheet reads their stops from the line's file: instant, and right for every sign.
- `journey.ts` (pure, tested) and `journey-lookup.ts` (network): matching a departure to a
  planner journey for the stop list of a row that came from the departures API alone (no
  timetable file, or a board departure the timetable does not have). This is the fragile
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
    Orminge"). The sheet then says the stops could not be found. Timetable rows do not
    have this problem; name tricks have been exhausted.

## Conventions

- All copy is Swedish and lives in `src/lib/i18n.ts`.
- Colour means a line: the pills use SL's line colours (`--line-*` in `index.css`) and
  nothing else in the lists is coloured. Text is ash white; amber is "late", red is "cancelled".
- Pink (`--brand`, #ffbbdd) is the app's neon sign and stays out of the lists: the icon,
  the station name in the header and the line under it. The icon is the user's artwork,
  `apps/web/icon-source.jpg`; `npm run icons` cuts it into the PNGs and the ico.
- The timetable time leads every row; live data (minutes left, `+3`) is the smaller line.
- `public/sw.js` is network-first for the page and cache-first for fingerprinted assets.
  Nothing needs bumping on release.
- The footer's Trafiklab / SL attribution (CC BY 2.0) is a licence requirement.
