# betsy-countdown

A cinematic countdown to **12:26 AM Eastern, Sunday August 2 2026** — for Craig & Betsy.

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
clock runs down. At 12:26 they come together in the centre, then settle side by side.

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

Serves on http://localhost:4321.

## Rehearsing the ending

Append `?preview=N` to watch the finale play out `N` seconds from load, without waiting for the
real time — `https://betsy-countdown.vercel.app/?preview=5`. Remove it for the real countdown.

## Changing the target time

One line, [`public/app.js`](public/app.js) — stored as a fixed UTC instant so the clock reads
correctly from any timezone.

```js
const REAL_TARGET_MS = Date.UTC(2026, 7, 2, 4, 26, 0); // 12:26 AM EDT, Sun Aug 2 2026
```

The matching `#eleven` element in [`public/index.html`](public/index.html) prints the time that
lands when the clock hits zero — change it to match.
