# Leander

A Google-style search engine: a Node server plus a search page. The server calls the Tavily
search API, so results are live. It has no npm dependencies.

## Run it

1. Install Node 18 or newer.
2. Sign up at tavily.com and copy your API key (it starts with `tvly-`).
3. Start the server:

       TAVILY_API_KEY=tvly-your_key node server.js

   On Windows PowerShell: `$env:TAVILY_API_KEY="tvly-your_key"; node server.js`

4. Open http://localhost:3000

The key stays on the server and is never sent to the browser.

## Deploy

Any host that runs Node works (Render, Railway, Fly.io, a VPS). Set `TAVILY_API_KEY` as an
environment variable and use `node server.js` as the start command.

## What it does

- Web, Images and News tabs, 10 web results per page with two pages
- One basic search uses 1 Tavily credit. Results are cached for 10 minutes, so the second page is free.
- A monthly cap (default 900 searches, change it with `MONTHLY_LIMIT`) keeps you under the free 1,000 credits.
  The counter resets when the server restarts or sleeps, so it is a safety net, not an exact meter.
- A limit of 30 searches per minute per visitor
- Light and dark themes

## Limits

Tavily is built for AI tools and does not run its own full web index, so results will not match Google's
quality. Image results link straight to the image file.
