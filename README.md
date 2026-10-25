# Atmos — Weather Dashboard

A premium, responsive weather dashboard with a server-side WeatherAPI proxy and a raw/formatted JSON inspector. Built with HTML, CSS, vanilla JavaScript, and a Node.js Vercel Function.

## Features

- Search any city supported by WeatherAPI, or use the ten quick-look city chips.
- Current conditions, local time, temperature, feels-like temperature, humidity, wind, UV, and cloud cover.
- Deterministic mood engine with documented priority order in `public/app.js`.
- Raw response and syntax-highlighted formatted JSON, with copy support.
- Loading/error states, request sequencing to avoid stale results, keyboard support, reduced-motion support, and responsive layouts.
- Server-side API key, request timeout, input validation, no-store response headers, and a best-effort per-instance request throttle.

## Deploy to Vercel

1. Create a new GitHub repository or use your existing `weatherlive-1` repository.
2. Add the project files to the repository root. Do not commit real API keys or access tokens.
3. In Vercel, choose **Add New → Project**, import the GitHub repository, and deploy.
4. In **Project Settings → Environment Variables**, add `WEATHERAPI_KEY` with your WeatherAPI key for Production (and Preview/Development if needed).
5. Redeploy after adding or changing environment variables.
6. Open the production URL and test a city search, each chip, both JSON tabs, copy, unknown-city handling, and a mobile viewport.

Vercel should detect the static files in `public/` and the serverless function in `api/weather.js` automatically. `vercel.json` sets baseline security headers.

## Local development

Install the Vercel CLI and run:

```sh
npm install --global vercel
vercel dev
```

Set `WEATHERAPI_KEY` in your local shell or in a local `.env` file (ignored by Git). Do not use a real secret in `.env.example`.

## Mood priority

Rules are evaluated in this order:

1. `temp_c >= 38` → Scorching
2. `temp_c <= 5` → Freezing
3. `humidity >= 80 && temp_c >= 28` → Muggy
4. `wind_kph >= 30` → Windy
5. `20 <= temp_c <= 30 && humidity <= 60 && wind_kph <= 20` → Pleasant
6. `15 <= temp_c <= 30 && humidity <= 75 && wind_kph <= 30` → Comfortable
7. Otherwise → Mixed

## Notes

- The `/api/weather` endpoint forwards WeatherAPI's response status and body to the browser. The browser only calls the same-origin endpoint, not WeatherAPI directly.
- The in-memory throttle is best-effort and is not a global distributed rate limiter across Vercel instances. For stronger abuse protection, configure a WAF/edge rate limit or shared rate-limit store.
- Production deployment and live API checks require access to your GitHub/Vercel accounts and a valid `WEATHERAPI_KEY`; this source package alone does not claim those steps have been completed.
