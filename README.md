# betsy-countdown

A cinematic countdown to Betsy's flight landing — for Craig & Betsy.

The target isn't a fixed time. The page tracks **Allegiant G4 537** and re-checks every 15 minutes,
so when the flight slips, the countdown slips with it.

Live: https://betsy-countdown.vercel.app

## Adding the photos

Drop image files into **`public/photos/`** — any names, any of `.jpg .jpeg .png .webp .avif .gif`.
They're picked up in filename order (`1.jpg`, `2.jpg`, … sorts naturally), so prefix with numbers
if you care about the sequence.

```bash
git add public/photos && git commit -m "add photos" && git push
```

Vercel regenerates the manifest on every build — there is no list of filenames to maintain.

The photos drift in the starfield the entire time and are slowly pulled **toward each other** as the
clock runs down. On landing they come together in the centre, then settle side by side.

**Click or tap any photo** to spotlight it full-screen. Tap it again, tap the backdrop, or press
Escape to put it back.

> The spotlight grows the photo's actual layout box rather than using `transform: scale()`. A
> composited layer is rasterised at its layout size, so scaling up would stretch a small texture and
> look blurry however large the source image is.

### Link preview

Name one file `og.jpg` (or `og.png`) and it becomes the share-preview image instead of appearing in
the montage. Otherwise the first photo is used.

The current `og.jpg` is a 1200×630 crop of the Hollywood photo — social cards are 1.91:1, so a
full-height portrait would get sliced badly by iMessage and most scrapers.

## Music

Optional. Drop one audio file into **`public/audio/`** (`.mp3 .m4a .ogg .wav .aac`) and it loops as
the ambient bed. With no file present the page synthesises a slow pad in the browser, so the sound
toggle works either way.

Browsers block autoplay, so audio starts on the first tap of the speaker button — bottom right.

## Local preview

```bash
npm run dev
```

Serves on http://localhost:4321, including `/api/flight` — plain static hosting can't run the
function, so this uses a small Node server instead of `serve`.

To exercise the live-retargeting path without an API key, fake an arrival:

```bash
MOCK_FLIGHT=+90m npm run dev          # lands 90 minutes from now
MOCK_FLIGHT=2026-08-02T04:26:00Z npm run dev
```

## Rehearsing the ending

Append `?preview=N` to watch the finale play out `N` seconds from load, without waiting for the
real time — `https://betsy-countdown.vercel.app/?preview=5`. Remove it for the real countdown.

## The flight

[`api/flight.js`](api/flight.js) is a serverless function that asks a flight-data provider when
G4 537 is now expected, and normalises the answer. The page polls it every 15 minutes, on becoming
visible again, and whenever the network comes back.

**No account or API key is required.** By default it reads FlightAware's public
tracking page for the flight, which carries the scheduled, estimated and actual gate times in an
embedded `trackpollBootstrap` blob. `robots.txt` allows `/live/flight/<ident>` — only
`/live/flight/id/` is disallowed — and the edge cache holds it to roughly one request every five
minutes, with a User-Agent that says what it is.

That is a public web page, not a supported API, so treat it as best-effort: FlightAware can change
the markup or block us at any time. Nothing breaks if they do — see below — but for something
durable, set one of these keys instead and it takes precedence automatically:

| Variable | Provider | Notes |
| --- | --- | --- |
| `AERODATABOX_KEY` | [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) via RapidAPI | Best delay data of the three; queries by flight number and date |
| `AVIATIONSTACK_KEY` | [Aviationstack](https://aviationstack.com/) | Free tier is ~100 calls/month — thin, but enough for one night |
| `AIRLABS_KEY` | [AirLabs](https://airlabs.co/docs/flight) | |

Set `DISABLE_FLIGHTAWARE=1` to turn the keyless path off entirely.

Optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FLIGHT_NUMBER` | `G4537` | IATA flight code, no space |
| `FLIGHT_ARRIVAL_IATA` | `GRR` | Destination filter — G4 537 is flown on several routes, so the number alone can match more than one leg. A leg elsewhere is used only if nothing matches |
| `FLIGHT_TRACK_IDENT` | derived (`AAY537`) | ICAO ident for the keyless lookup |
| `FLIGHT_TZ` | `America/New_York` | Timezone the arrival date is resolved in |
| `FALLBACK_ARRIVAL_ISO` | `2026-08-02T04:54:00Z` | Used when no live answer is available |

Times come from **gate arrival**, not wheels-down: it's the published schedule, so it's both what
"late" is measured against and the moment you actually see her.

### When the data isn't there

The countdown never blanks or breaks. If the source is blocked, changes shape, or returns no
matching flight, the function still answers `200` with the fallback time and `ok: false`, and the
page keeps counting to the last live time it saw — cached in `localStorage`, so it survives a reload
on a dead network. Only a genuinely live answer is allowed to move the clock. The status line says
`live updates unavailable` when what's on screen isn't fresh.

Responses are cached at the edge for 5 minutes (60s for failures), so a hundred open tabs cost one
upstream call, not a hundred — free tiers are metered in the low hundreds per month.

If the flight is delayed *after* the countdown has already hit zero and played the finale, the page
rewinds itself and resumes counting.
