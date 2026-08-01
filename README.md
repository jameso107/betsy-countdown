# betsy-countdown

A cinematic countdown to **11:11 PM Eastern, Saturday August 1 2026** — for Craig & Betsy.

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
clock runs down. At 11:11 they come together in the centre, then settle side by side.

### Link preview

Name one file `og.jpg` (or `og.png`) and it becomes the share-preview image instead of appearing in
the montage. Otherwise the first photo is used.

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
const TARGET_MS = Date.UTC(2026, 7, 2, 3, 11, 0); // 11:11 PM EDT, Sat Aug 1 2026
```
