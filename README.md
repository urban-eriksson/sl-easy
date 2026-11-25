## SL Eazy

Nästa avgång från hållplatsen där du står. A mobile-first PWA for Stockholm public transport
with no backend: it uses SL's public APIs directly.

**Live:** https://sl.korist.se

- Opens on the nearest station; search and nearby lookup are local and instant
- Each line's next departures, timetable time first with live delay beside it
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
`scripts/deploy-web.sh` builds and deploys. See `CLAUDE.md` for how the SL APIs shape the app.

### Data

SL's integration APIs (no key): [Transport](https://transport.integration.sl.se),
[Journey planner](https://journeyplanner.integration.sl.se),
[Deviations](https://deviations.integration.sl.se). Data licensed under
[CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) by [Trafiklab](https://www.trafiklab.se) / SL.
