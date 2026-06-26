# Baking the course database (the 45,000)

`bake.mjs` turns OpenStreetMap golf data into static course files you own — no per-course
license, no runtime dependency on the public API. Same extraction logic the app uses live.

## Requirements
- Node 18+ (uses built-in `fetch`). No npm install needed.

## 1. Harvest the course list
```
node bake.mjs harvest --bbox=24,-125,50,-66      # continental US (~16k courses)
# or, region by region (kinder to the API than one planet-wide query):
node bake.mjs harvest --bbox=49,-11,61,2         # UK & Ireland
node bake.mjs harvest                            # everything (~40k worldwide)
```
Writes `course-list.json` (merges across runs).

## 2. Bake them
```
node bake.mjs run 0 500       # first 500
node bake.mjs run 500 500     # next 500 … resumable, skips finished courses
```
Each course becomes `courses/<slug>.json`; `courses/index.json` is the manifest the app reads.
Rate-limited to ~1 req/sec. Baking ~16k US courses takes a few hours unattended; run it on a
small server or cron job and commit the `courses/` folder.

## Scaling notes
- For heavy/continuous baking, run your own Overpass instance or a planet extract instead of
  the public endpoints (edit `ENDPOINTS` in `bake.mjs`).
- Courses with no mapped holes are skipped — that's the coverage gap your in-app crowdsource
  editing and re-bakes fill over time.
- Imagery in the app is Esri's free tier; for production swap to public-domain USDA NAIP.

## Attribution
Course geometry is © OpenStreetMap contributors, ODbL. Keep the in-app attribution.
