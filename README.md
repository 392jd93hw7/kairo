# Kairo

A dark, modern anime discovery frontend built with React, TypeScript, and Vite.

## Current slice

- Responsive Kairo homepage and navigation shell.
- Real-time navbar search with 300 ms debounce.
- Search dropdown loading, empty, error, and result states.
- Keyboard controls: Up/Down, Enter, Escape, and Ctrl/Cmd+K.
- Search result caching and cancellation of stale requests.
- Kitsu artwork fallback for results that have a MAL ID but no poster.
- Streaming provider decision: Anikoto only. No other streaming-source fallback is configured.
- TMDB is not used.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Set `VITE_ANIVAULT_API_BASE` to the AniVault Scraper API base URL if you need to override the default.

## Build checks

```bash
npm run typecheck
npm run build
```

## API calls used by navbar search

- `GET /api/search?q={query}`
- `GET /api/kitsu/anime?malId={malId}` only when a search result has no artwork.

The app currently expects the search endpoint to return an array or an object containing `results`, `data`, or `anime`. Field normalization is defensive because API response shapes can vary.

## Next build steps

1. Validate the live API response shape and search in a running browser.
2. Add anime detail routes and the MAL/Kitsu detail view.
3. Add episode and server selection using Anikoto only.
4. Add the watch page and playback flow.
5. Add watchlist, history, and schedule.
