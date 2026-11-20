# Weather Atlas

Explore the weather anywhere in the world, the way a TV weather presenter does, except that you are in control.

- **Move and zoom the map**: coloured chips show the weather across whatever area you are looking at, so you can see how it changes from place to place.
- **Switch the chart**: temperature, rain or wind (wind chips show an arrow pointing the way the wind blows).
- **Press ▶**: watch the next 24 hours play out across the map, or drag the time slider.
- **Dive in**: click anywhere on the map or search for a town to see current conditions, the next 24 hours and the next 7 days.
- **Build your own picture**: save places to **My places**, where they stay side by side (also after a reload). They follow the same chart and hour as the map, with a one-line "highest / lowest" summary.
- **Where am I**: one button shows the weather at your current location. If you allowed location before, the app goes there on load.

Data: [Open-Meteo Forecast API](https://open-meteo.com/en/docs) and [Geocoding API](https://open-meteo.com/en/docs/geocoding-api). No API key needed.

---

## 1. Installation and setup

**Prerequisites:** Node.js 22.22+, 24.15+ or 26+ (what Angular 22 supports) and npm.

```bash
git clone https://github.com/aposasik/weather-explorer.git
cd weather-explorer
npm install
npm start            # http://localhost:4200
```

Other commands:

```bash
npm test -- --watch=false   # unit tests (Vitest)
npm run build               # production build in dist/weather-explorer/browser
```

**Environment variables:** none. Open-Meteo and the map tiles need no key.

## 2. Implementation choices

| What | Choice | Why |
|---|---|---|
| Framework | **Angular 22** (standalone components, signals, zoneless) | The framework I use most. Signals keep state simple without a store library. |
| Map | **Leaflet 1.9** | Small, stable, no API key. Esri "Dark Gray Canvas" tiles, with place names drawn above the weather chips so the area stays recognisable. |
| HTTP / async | Angular `HttpClient` + RxJS | `debounceTime` + `switchMap` for typing and map moves: one request when the user pauses, and old answers are ignored. |
| Charts | Hand-written SVG | Two small charts (24 h line, sparklines) don't justify a chart library. |
| Tests | **Vitest** (Angular's default runner) | Grid sampling, cache, request batching and weather codes. |
| Styling | Plain SCSS + CSS variables | Dark theme, responsive down to phone width. |

**Runtime dependencies:** Angular, RxJS, Leaflet. Nothing else.

### Project structure

```
src/app/
  core/                       no UI: data, rules, state
    open-meteo.service.ts     the ONLY place that calls Open-Meteo (batching, cache, de-duplication)
    grid.ts                   turns the visible map into a small, snapped grid of sample points
    expiring-cache.ts         cache whose entries expire (memory + localStorage)
    places.store.ts           saved places / selected place (signals, persisted)
    scales.ts                 colour scales and value formatting for the 3 charts
    weather-codes.ts          WMO weather code → label + icon
  map/world-map.ts            Leaflet map: draws chips and pins, emits clicks and view changes
  search/search-box.*         geocoding search with keyboard navigation (combobox)
  detail/place-detail.*       one place: now, 24 h chart, 7 days
  places/my-places.*          saved places side by side
  app.*                       layout; connects map moves → grid → service → map
```

### Being careful with the free API limits

Open-Meteo's free tier allows 600 calls/minute, 5,000/hour and 10,000/day, and counts each location in a multi-location request. The app:

1. **Batches.** All chips in a view come from **one** request with comma-separated coordinates. Saved places are also fetched together in one request.
2. **Snaps the grid.** Sample points depend only on the zoom level (fixed step list), not on the exact pixel position. Panning back to an area produces the same coordinates, so they come from the cache. Only points not already cached are requested.
3. **Caps each view** at 60 locations, whatever the screen size.
4. **Caches** map timelines and forecasts for 15 minutes and searches for 24 hours, in memory and in `localStorage` (a reload costs nothing).
5. **Waits for the user to stop.** Map moves are debounced (450 ms) and typing too (350 ms); search needs 3+ characters, because Open-Meteo returns nothing for 2.
6. **Fetches 24 hours once** per point and plays the time slider from that data. Pressing ▶ makes no new requests.

The footer shows how many requests the visit has made so far.

## 3. Incomplete requirements

All the requirements in the brief are covered. Simplifications:

- A place picked by clicking the map is named by its coordinates (e.g. `40.6°N 22.9°E`), because the Open-Meteo geocoding API has no reverse lookup. It is still possible to search for it by name.
- The map chips are sampled on a grid, not interpolated into a smooth coloured surface like a real TV chart.
- The map shows one copy of the world (no wrap-around past ±180°), which keeps the grid code simple.
- No end-to-end tests. The unit tests cover the logic that keeps requests low.

## 4. Next steps

- Smooth colour layer (interpolated heatmap or contour) under the chips, and a precipitation-radar style animation.
- Reverse geocoding (e.g. a small proxy to an open service) so clicked points get a town name.
- Compare view with an overlaid chart: the saved places' 7-day curves on one graph.
- Units switch (°C/°F, km/h/mph) and a language switch.
- Clean old cache entries from `localStorage`, and use a service worker for offline use.
- End-to-end tests (Playwright) for search → save → compare, and an accessibility audit with a screen reader.
- Deploy to GitHub Pages from a GitHub Actions workflow.

## 5. Additional notes

- **AI tools:** I used an AI coding assistant (Claude) as the brief allows: for scaffolding, first drafts, changes and reviews (commits it helped with say `Co-Authored-By: Claude`). I set the goals and the approach (snapped grid + one batched request + cache, to respect Open-Meteo's limits), checked every flow in the browser and with tests, and can explain or change any line.
  Issues found while testing, and fixed:
  - the first map tiles (CARTO) needed an API key → switched to Esri Dark Gray, which doesn't;
  - the 60-point limit was not respected at the widest grid step → caught by a unit test;
  - search started at 2 letters, but Open-Meteo returns nothing for 2 → now 3, and the list no longer says "No places found" while you are still typing;
  - old cached forecasts had no sunrise/sunset → new cache key (`wx:fc2:`).
  I also simplified the code on purpose so every part is easy to explain: one-world map (no coordinate wrapping), a plain HTTP `get`, a simple loop in the grid.
- **Accessibility:** search is a keyboard-navigable combobox (↑ ↓ Enter Esc), layer switches are a radio group, buttons have labels, focus is visible, and the shimmer animation respects "reduce motion".
- **Time zones:** the map timeline uses UTC so every point lines up on the same hour. The detail panel shows the place's own local time (`timezone=auto`).
