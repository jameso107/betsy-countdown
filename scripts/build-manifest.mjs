/* Scans public/photos and public/audio and writes public/photos/manifest.json.
   Runs on every Vercel build, so dropping files in and pushing is all it takes. */

import { readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const photoDir = join(pub, 'photos');
const audioDir = join(pub, 'audio');

const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const AUDIO = new Set(['.mp3', '.m4a', '.ogg', '.wav', '.aac']);

/* Intrinsic size for JPEG and PNG, so the page can reserve each photo's exact
   shape before it loads. Other formats return null and the client measures
   them from naturalWidth once decoded. */
function dimensions(file) {
  const b = readFileSync(file);

  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }

  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xda || m === 0xd9) break;
      const len = b.readUInt16BE(i + 2);
      // SOF0-SOF15, excluding the DHT/JPG/DAC markers interleaved in that range
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }

  return null;
}

const list = (dir, allow) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => !f.startsWith('.') && allow.has(extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
};

// og.* is the link-preview image, not part of the montage.
const photos = list(photoDir, IMAGE).filter(f => !/^og\./i.test(f));
const audio = list(audioDir, AUDIO)[0] || null;

writeFileSync(
  join(photoDir, 'manifest.json'),
  JSON.stringify(
    {
      photos: photos.map(f => {
        const d = dimensions(join(photoDir, f));
        return { src: `/photos/${encodeURIComponent(f)}`, w: d?.w ?? null, h: d?.h ?? null };
      }),
      audio: audio ? `/audio/${encodeURIComponent(audio)}` : null
    },
    null,
    2
  ) + '\n'
);

// Point the OpenGraph image at a real file so shared links preview nicely.
const ogFile = list(photoDir, IMAGE).find(f => /^og\./i.test(f)) || photos[0];
if (ogFile) {
  const indexPath = join(pub, 'index.html');
  const html = readFileSync(indexPath, 'utf8');
  const next = html.replace(
    /(<meta property="og:image" content=")[^"]*(")/,
    `$1/photos/${encodeURIComponent(ogFile)}$2`
  );
  if (next !== html) writeFileSync(indexPath, next);
}

console.log(
  `manifest: ${photos.length} photo${photos.length === 1 ? '' : 's'}` +
    `, audio: ${audio ?? 'none (using generated pad)'}`
);
