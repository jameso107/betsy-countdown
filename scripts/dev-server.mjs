/* Local dev server: serves public/ and runs the /api/flight function, which
 * `serve` alone can't do. Vercel provides both in production.
 *
 *   npm run dev
 *   MOCK_FLIGHT=+90m npm run dev   # pretend the flight lands 90 minutes out
 *
 * MOCK_FLIGHT takes "+90m" / "+45s" (relative) or an ISO instant, and fakes a
 * live provider answer so the retargeting path can be exercised without a key.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.env.PORT || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav'
};

function mockArrival() {
  const spec = process.env.MOCK_FLIGHT;
  if (!spec) return null;
  const rel = /^\+(\d+)([smh])$/.exec(spec.trim());
  const mult = { s: 1e3, m: 6e4, h: 36e5 };
  const at = rel ? Date.now() + Number(rel[1]) * mult[rel[2]] : Date.parse(spec);
  if (!Number.isFinite(at)) throw new Error(`MOCK_FLIGHT not understood: ${spec}`);
  return at;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/flight') {
    const mock = mockArrival();
    if (mock != null) {
      const scheduled = Date.UTC(2026, 7, 2, 3, 11, 0);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        flight: process.env.FLIGHT_NUMBER || 'G4537',
        fetchedAt: Date.now(),
        ok: true,
        provider: 'mock',
        arrival: { ms: mock, iso: new Date(mock).toISOString(), kind: 'revised' },
        scheduled: { ms: scheduled },
        delayMinutes: Math.round((mock - scheduled) / 60000),
        status: 'Expected',
        route: { from: 'LAS', to: 'GRR' }
      }));
      return;
    }
    const { default: handler } = await import('../api/flight.js');
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.end(JSON.stringify(body)); return res; };
    return handler(req, res);
  }

  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  if (!extname(p)) p += '.html'; // matches vercel.json cleanUrls

  try {
    const body = await readFile(join(ROOT, p));
    res.setHeader('Content-Type', TYPES[extname(p)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`betsy-countdown  http://localhost:${PORT}`);
  if (process.env.MOCK_FLIGHT) console.log(`mock arrival     ${new Date(mockArrival()).toISOString()}`);
});
