## SL Eazy

Nästa avgång från hållplatsen där du står. A mobile-first PWA for Stockholm public transport
with no API of its own: it reads SL's timetable from files published nightly and SL's
public APIs for live data.

**Live:** https://sl.korist.se

- Opens on the nearest station; search and nearby lookup are local and instant
- The whole timetable for the coming week, scrolling as far as you like, timetable time
  first with live delay beside it
- Tap a departure for its stops; tap a stop to see every direct way there ("Till Hornstull"),
  scrolling into later departures, or move on to that stop
- Disruption notices, installable, dark

### Development

```bash
cd apps/web
npm install
npm run dev      # http://localhost:5173
npm run check && npm test
```

Vite + React + TypeScript + Tailwind. Hosting is S3 + CloudFront via CDK (`infra/`);
`scripts/deploy-web.sh` builds and deploys. A nightly job (`timetable/`, installed with
`scripts/deploy-timetable.sh`) turns SL's GTFS feed into the timetable files. See `CLAUDE.md`
for how the data sources shape the app.

### Data

Timetable: SL's GTFS feed from [Trafiklab](https://www.trafiklab.se) (GTFS Regional, needs a
key). Live data, SL's integration APIs (no key): [Transport](https://transport.integration.sl.se),
[Journey planner](https://journeyplanner.integration.sl.se),
[Deviations](https://deviations.integration.sl.se). Data licensed under
[CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) by [Trafiklab](https://www.trafiklab.se) / SL.
