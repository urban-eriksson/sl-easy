## SL Easy - v3

Real-time Stockholm public transport departures. A mobile-first PWA with no backend — uses SL's public APIs directly.

**Live:** [urban-eriksson.github.io/sl-easy](https://urban-eriksson.github.io/sl-easy/)

### Features

- Station search with autocomplete
- Real-time departure board with live countdown
- Nearby stations via geolocation
- Transport type filtering (Metro/Bus/Train/Tram/Ferry)
- Future departure time picker
- Service disruption alerts
- Recent stations (persisted in localStorage)
- Auto-refresh every 30 seconds
- Installable PWA with offline shell caching
- Dark theme with SL metro line colors

### Tech

Plain HTML/CSS/JS with ES modules. No build step, no dependencies, no framework. Push-to-deploy on GitHub Pages.

### Development

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

### Data

Uses SL's public integration APIs (no API key required):
- [Transport API](https://transport.integration.sl.se) — departures and sites
- [Journey Planner](https://journeyplanner.integration.sl.se) — station search
- [Deviations API](https://deviations.integration.sl.se) — service disruptions

Data licensed under [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) by [Trafiklab](https://www.trafiklab.se) / SL.

### Roadmap

- [ ] Direction grouping (group departures by direction)
- [ ] Favorites with custom ordering
- [ ] Push notifications for disruptions
- [ ] Trip planner integration
- [ ] Accessibility improvements (ARIA, screen reader testing)
