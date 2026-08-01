/* Live arrival time for a single flight, normalised across providers.
 *
 * The page polls this every 15 minutes. Cached at the edge so a hundred open
 * tabs still cost one upstream call per FRESH_S — free flight-API tiers are
 * measured in hundreds of calls per month, so this matters.
 *
 * Always answers 200 with a usable `arrival`. A countdown that breaks because
 * an API rate-limited us is worse than one showing a slightly stale time, so
 * every failure path falls back to the last known good time instead. */

const FLIGHT = (process.env.FLIGHT_NUMBER || 'G4537').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ARR_IATA = (process.env.FLIGHT_ARRIVAL_IATA || '').toUpperCase();
const TZ = process.env.FLIGHT_TZ || 'America/New_York';
const FALLBACK_ISO = process.env.FALLBACK_ARRIVAL_ISO || '2026-08-02T04:26:00Z';

// How long the edge serves a cached answer, and how long a stale one may be
// re-served while a fresh fetch happens behind it.
const FRESH_S = 300;
const STALE_S = 3600;

// A flight already this far past its arrival is history, not our countdown.
const PAST_GRACE_MS = 3 * 60 * 60 * 1000;

const ms = v => {
  if (v == null) return null;
  const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/* Dates to ask about, in the arrival airport's own timezone. A red-eye landing
   at 00:26 belongs to tomorrow's schedule while it is still tonight, so ask for
   both and let pickFlight sort out which one is actually upcoming. */
function queryDates(now) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return [0, 1].map(d => fmt.format(new Date(now + d * 86400000)));
}

/* --------------------------------------------------------------- providers */

/* Each adapter returns a flat list of candidates:
   { arrivalMs, scheduledMs, kind, status, from, to } */

async function aerodatabox(key, dates) {
  const out = [];
  for (const date of dates) {
    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${FLIGHT}/${date}?withAircraftImage=false&withLocation=false`;
    const r = await fetch(url, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' }
    });
    if (r.status === 404) continue; // no such flight that day
    if (!r.ok) throw new Error(`aerodatabox ${r.status}`);
    const body = await r.json();
    for (const f of Array.isArray(body) ? body : []) {
      const a = f.arrival || {};
      const actual = ms(a.actualTime?.utc);
      const revised = ms(a.revisedTime?.utc) ?? ms(a.predictedTime?.utc);
      const sched = ms(a.scheduledTime?.utc);
      const arrivalMs = actual ?? revised ?? sched;
      if (arrivalMs == null) continue;
      out.push({
        arrivalMs,
        scheduledMs: sched,
        kind: actual ? 'actual' : revised ? 'revised' : 'scheduled',
        status: f.status || null,
        from: f.departure?.airport?.iata || null,
        to: a.airport?.iata || null
      });
    }
  }
  return out;
}

async function aviationstack(key) {
  const url = `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(key)}&flight_iata=${FLIGHT}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`aviationstack ${r.status}`);
  const body = await r.json();
  if (body?.error) throw new Error(`aviationstack ${body.error.code || 'error'}`);
  return (body?.data || []).flatMap(f => {
    const a = f.arrival || {};
    const actual = ms(a.actual);
    const est = ms(a.estimated);
    const sched = ms(a.scheduled);
    const arrivalMs = actual ?? est ?? sched;
    if (arrivalMs == null) return [];
    return [{
      arrivalMs,
      scheduledMs: sched,
      kind: actual ? 'actual' : est ? 'revised' : 'scheduled',
      status: f.flight_status || null,
      from: f.departure?.iata || null,
      to: a.iata || null
    }];
  });
}

async function airlabs(key) {
  const url = `https://airlabs.co/api/v9/flight?api_key=${encodeURIComponent(key)}&flight_iata=${FLIGHT}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`airlabs ${r.status}`);
  const body = await r.json();
  if (body?.error) throw new Error(`airlabs ${body.error.message || 'error'}`);
  const f = body?.response;
  if (!f) return [];
  const actual = ms(f.arr_actual_ts);
  const est = ms(f.arr_estimated_ts);
  const sched = ms(f.arr_time_ts);
  const arrivalMs = actual ?? est ?? sched;
  if (arrivalMs == null) return [];
  return [{
    arrivalMs,
    scheduledMs: sched,
    kind: actual ? 'actual' : est ? 'revised' : 'scheduled',
    status: f.status || null,
    from: f.dep_iata || null,
    to: f.arr_iata || null
  }];
}

/* First configured provider wins, so a spare key can sit in the project
   without changing behaviour. */
function pickProvider() {
  const k = process.env;
  if (k.AERODATABOX_KEY) return { name: 'aerodatabox', run: dates => aerodatabox(k.AERODATABOX_KEY, dates) };
  if (k.AVIATIONSTACK_KEY) return { name: 'aviationstack', run: () => aviationstack(k.AVIATIONSTACK_KEY) };
  if (k.AIRLABS_KEY) return { name: 'airlabs', run: () => airlabs(k.AIRLABS_KEY) };
  return null;
}

/* ------------------------------------------------------------------ choose */

/* G4 537 is flown on several different routes, so a flight number alone can
   match more than one leg. Prefer the configured destination, drop anything
   long finished, then take the soonest of what is left. */
function pickFlight(list, now) {
  let pool = list;
  if (ARR_IATA) {
    const onRoute = pool.filter(f => f.to === ARR_IATA);
    if (onRoute.length) pool = onRoute;
  }
  const live = pool.filter(f => f.arrivalMs > now - PAST_GRACE_MS);
  return (live.length ? live : pool).sort((a, b) => a.arrivalMs - b.arrivalMs)[0] || null;
}

export default async function handler(req, res) {
  const now = Date.now();
  const fallbackMs = ms(FALLBACK_ISO) ?? Date.UTC(2026, 7, 2, 4, 26, 0);

  const answer = (code, body) => {
    // Errors stay cacheable but only briefly, so an outage recovers fast.
    res.setHeader('Cache-Control', body.ok
      ? `public, s-maxage=${FRESH_S}, stale-while-revalidate=${STALE_S}`
      : 'public, s-maxage=60, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(code).json({ flight: FLIGHT, fetchedAt: now, ...body });
  };

  const provider = pickProvider();
  if (!provider) {
    return answer(200, {
      ok: false,
      reason: 'no_api_key',
      arrival: { ms: fallbackMs, iso: new Date(fallbackMs).toISOString(), kind: 'fallback' }
    });
  }

  try {
    const list = await provider.run(queryDates(now));
    const hit = pickFlight(list, now);
    if (!hit) {
      return answer(200, {
        ok: false,
        reason: 'flight_not_found',
        provider: provider.name,
        arrival: { ms: fallbackMs, iso: new Date(fallbackMs).toISOString(), kind: 'fallback' }
      });
    }

    const delayMinutes = hit.scheduledMs != null
      ? Math.round((hit.arrivalMs - hit.scheduledMs) / 60000)
      : null;

    return answer(200, {
      ok: true,
      provider: provider.name,
      arrival: { ms: hit.arrivalMs, iso: new Date(hit.arrivalMs).toISOString(), kind: hit.kind },
      scheduled: hit.scheduledMs != null ? { ms: hit.scheduledMs } : null,
      delayMinutes,
      status: hit.status,
      route: { from: hit.from, to: hit.to }
    });
  } catch (err) {
    return answer(200, {
      ok: false,
      reason: 'provider_error',
      provider: provider.name,
      detail: String(err && err.message || err).slice(0, 200),
      arrival: { ms: fallbackMs, iso: new Date(fallbackMs).toISOString(), kind: 'fallback' }
    });
  }
}
