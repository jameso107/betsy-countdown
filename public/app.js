/* Craig & Betsy — a countdown to Betsy's flight landing.

   The target is the flight's live arrival time, refreshed from /api/flight
   every fifteen minutes and held as a UTC instant so the clock reads correctly
   from any timezone. When the flight slips, the countdown slips with it. */

// Used until the first live answer arrives, and whenever one can't be had.
const FALLBACK_TARGET_MS = Date.UTC(2026, 7, 2, 4, 26, 0); // 12:26 AM ET, Sun Aug 2 2026
const ARRIVAL_TZ = 'America/New_York';

const FLIGHT_POLL_MS = 15 * 60 * 1000;
// A tab waking from sleep should refresh, but not once per glance.
const FLIGHT_MIN_GAP_MS = 60 * 1000;
const FLIGHT_CACHE_KEY = 'cb-arrival';

/* ?preview=20 rehearses the ending twenty seconds from now. */
const previewIn = Number(new URLSearchParams(location.search).get('preview'));
const PREVIEW = Number.isFinite(previewIn) && previewIn !== 0;

/* The last live arrival survives a reload, so a dead API or an offline phone
   still counts to the right moment instead of snapping back to the fallback. */
function cachedTarget() {
  try {
    const v = JSON.parse(localStorage.getItem(FLIGHT_CACHE_KEY) || 'null');
    return Number.isFinite(v?.ms) ? v.ms : null;
  } catch { return null; }
}

let TARGET_MS = PREVIEW
  ? Date.now() + previewIn * 1000
  : (cachedTarget() ?? FALLBACK_TARGET_MS);

// How far out the photos begin drifting toward each other.
const CONVERGE_WINDOW_MS = 12 * 60 * 60 * 1000;
// Length of the finale animation once the clock lands.
const FINALE_MS = 5200;
const IMMINENT_MS = 10 * 1000;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const smooth = t => t * t * (3 - 2 * t);
const norm = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = sel => document.querySelector(sel);

/* ------------------------------------------------------------------ sky */

class Sky {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.stars = [];
    this.shooting = [];
    this.nextShot = 3000;
    this.resize();
    addEventListener('resize', () => this.resize(), { passive: true });
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seed();
  }

  seed() {
    const count = clamp(Math.round((this.w * this.h) / 2600), 140, 620);
    this.stars = Array.from({ length: count }, () => {
      // A few bright foreground stars, mostly faint distant ones.
      const depth = Math.random();
      return {
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: lerp(0.35, 1.5, Math.pow(depth, 2.2)),
        a: lerp(0.18, 0.92, Math.pow(depth, 1.5)),
        tw: Math.random() * Math.PI * 2,
        tws: lerp(0.25, 1.5, Math.random()),
        vx: lerp(0.7, 3.4, depth) * 0.0035,
        vy: lerp(0.7, 3.4, depth) * 0.0012,
        warm: Math.random() < 0.16
      };
    });
  }

  burst(n = 4) {
    for (let i = 0; i < n; i++) this.spawnShot(true);
  }

  spawnShot(fast = false) {
    const fromLeft = Math.random() < 0.5;
    this.shooting.push({
      x: fromLeft ? -60 : this.w + 60,
      y: Math.random() * this.h * 0.66,
      vx: (fromLeft ? 1 : -1) * lerp(0.42, 0.78, Math.random()) * (fast ? 1.5 : 1),
      vy: lerp(0.12, 0.3, Math.random()) * (fast ? 1.5 : 1),
      life: 0,
      max: lerp(620, 1100, Math.random())
    });
  }

  draw(dt, intensity) {
    const { ctx, w, h } = this;
    ctx.fillStyle = '#04060f';
    ctx.fillRect(0, 0, w, h);

    const speed = reduceMotion ? 0 : 1 + intensity * 2.2;

    for (const s of this.stars) {
      s.tw += s.tws * dt * 0.0016;
      s.x += s.vx * dt * 0.06 * speed;
      s.y += s.vy * dt * 0.06 * speed;
      if (s.x > w + 4) s.x = -4;
      if (s.y > h + 4) s.y = -4;

      const a = clamp(s.a * (0.62 + 0.38 * Math.sin(s.tw)) * (1 + intensity * 0.45), 0, 1);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.warm
        ? `rgba(255,232,196,${a})`
        : `rgba(214,228,255,${a})`;
      ctx.fill();
    }

    if (!reduceMotion) {
      this.nextShot -= dt;
      if (this.nextShot <= 0) {
        this.spawnShot();
        this.nextShot = lerp(7000, 20000, Math.random()) / (1 + intensity * 3);
      }
    }

    for (let i = this.shooting.length - 1; i >= 0; i--) {
      const m = this.shooting[i];
      m.life += dt;
      if (m.life > m.max) { this.shooting.splice(i, 1); continue; }
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      const fade = Math.sin((m.life / m.max) * Math.PI);
      const len = 130;
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * len, m.y - m.vy * len);
      g.addColorStop(0, `rgba(255,255,255,${0.85 * fade})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * len, m.y - m.vy * len);
      ctx.stroke();
    }
  }
}

/* --------------------------------------------------------------- photos */

class Photos {
  constructor(root) {
    this.root = root;
    this.items = [];
  }

  load(entries) {
    const n = entries.length;
    if (!n) return;

    entries.forEach((entry, i) => {
      const fig = document.createElement('figure');
      fig.className = 'photo';
      const img = document.createElement('img');
      img.src = entry.src;
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'eager';
      fig.appendChild(img);
      this.root.appendChild(fig);

      // Even distribution, offset so four photos land on the diagonals
      // and leave the centre band clear for the clock.
      const angle = (i / n) * Math.PI * 2 + Math.PI / 4;

      const item = {
        el: fig,
        angle,
        ratio: entry.w && entry.h ? entry.w / entry.h : 1,
        tilt: lerp(-7, 7, i / Math.max(1, n - 1)) + (Math.random() * 2 - 1),
        phase: Math.random() * Math.PI * 2,
        bobSpeed: lerp(0.28, 0.5, Math.random()),
        index: i,
        total: n,
        spot: 0,
        spotTarget: 0,
        revealed: false,
        fade: 0
      };
      this.items.push(item);

      fig.setAttribute('role', 'button');
      fig.setAttribute('tabindex', '0');
      fig.setAttribute('aria-label', `Enlarge photo ${i + 1} of ${n}`);
      fig.addEventListener('click', () => this.toggleSpot(item));
      fig.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.toggleSpot(item);
        }
      });

      const reveal = () => { item.revealed = true; };
      if (img.complete) reveal();
      else img.addEventListener('load', reveal, { once: true });

      // Formats the build step can't measure get sized once decoded.
      if (!entry.w || !entry.h) {
        img.addEventListener('load', () => {
          if (img.naturalWidth && img.naturalHeight) {
            item.ratio = img.naturalWidth / img.naturalHeight;
            this.layout();
          }
        }, { once: true });
      }

      img.addEventListener('error', () => {
        fig.remove();
        this.items = this.items.filter(p => p !== item);
        this.layout();
      }, { once: true });
    });

    this.layout();
  }

  /* Spotlight — one photo at a time; tapping the lit one puts it back. */
  toggleSpot(item) {
    const turnOn = item.spotTarget !== 1;
    for (const p of this.items) p.spotTarget = 0;
    if (turnOn) item.spotTarget = 1;
    for (const p of this.items) p.el.classList.toggle('spot', p.spotTarget === 1);
    if (turnOn) item.el.focus?.({ preventScroll: true });
  }

  clearSpot() {
    if (!this.items.some(p => p.spotTarget)) return;
    for (const p of this.items) {
      p.spotTarget = 0;
      p.el.classList.remove('spot');
    }
  }

  /* Sizes every photo to equal visual area, then precomputes the settled
     gallery positions the finale eases into. */
  layout() {
    const items = this.items;

    const vw = innerWidth, vh = innerHeight;
    const vmin = Math.min(vw, vh);
    this.narrow = vw < 820;

    if (!items.length) { this.compose(0, vmin); return; }

    // Nominal square side; each photo trades width for height around it.
    const base = clamp(vmin * (this.narrow ? 0.20 : 0.175), 92, 196);

    for (const p of items) {
      const r = Math.sqrt(clamp(p.ratio, 0.5, 2));
      p.w = base * r;
      p.h = base / r;
      p.el.style.width = `${p.w.toFixed(1)}px`;
      p.el.style.height = `${p.h.toFixed(1)}px`;
      p.lastW = p.w;
      p.lastH = p.h;
    }

    // Settled arrangement: one row when there's room, otherwise a grid.
    const cols = this.narrow ? Math.min(2, items.length) : items.length;
    const gap = this.narrow ? vmin * 0.035 : vmin * 0.05;
    const rows = [];
    for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));

    // Photos are scaled up in the settled state; the block must allow for it.
    const fs = this.narrow ? 1.06 : 1.18;
    const rowHeights = rows.map(r => Math.max(...r.map(p => p.h)) * fs);
    const gridH = rowHeights.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);

    const gridTop = this.compose(gridH, vmin);

    let y = gridTop;
    rows.forEach((row, ri) => {
      const rowW = row.reduce((a, p) => a + p.w * fs, 0) + gap * (row.length - 1);
      let x = -rowW / 2;
      const cy = y + rowHeights[ri] / 2;
      for (const p of row) {
        p.b2x = x + (p.w * fs) / 2;
        p.b2y = cy;
        x += p.w * fs + gap;
      }
      y += rowHeights[ri] + gap;
    });
  }

  /* Stacks the arrival time, the photo grid and the names into one vertically centred
     block, so the time is never hidden behind a photo. Returns the y the
     photo grid should start at, relative to the viewport centre. */
  compose(gridH, vmin) {
    const eleven = $('#eleven');
    const names = $('.names');
    const clockEl = $('#clock');

    const elevenH = eleven ? eleven.offsetHeight : 0;
    const namesH = names ? names.offsetHeight : 0;
    const vGap = clamp(vmin * 0.05, 18, 54);
    const lowerGap = vGap * 0.85;

    const blockH = elevenH + vGap + gridH + lowerGap + namesH;
    const top = -blockH / 2;
    const gridTop = top + elevenH + vGap;

    const root = document.documentElement;
    root.style.setProperty('--eleven-y', `${(top + elevenH / 2).toFixed(1)}px`);
    root.style.setProperty('--names-final-y', `${(gridTop + gridH + lowerGap + namesH / 2).toFixed(1)}px`);

    // Countdown state: names tuck just under the clock.
    if (clockEl) {
      root.style.setProperty(
        '--names-y',
        `${(clockEl.offsetHeight / 2 + clamp(vmin * 0.06, 30, 58)).toFixed(1)}px`
      );
    }

    return gridTop;
  }

  /* converge: 1 = far apart, 0 = as close as the countdown brings them
     finale:   0 = countdown layout, 1 = settled gallery */
  update(dt, t, converge, finale) {
    if (!this.items.length) return;

    const vw = innerWidth, vh = innerHeight;
    const narrow = this.narrow;

    // Ease each photo toward its spotlight target first, so every photo knows
    // how far the scene as a whole has dimmed before it sets its own opacity.
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt / 170);
    const fk = reduceMotion ? 1 : 1 - Math.exp(-dt / 280);
    let globalSpot = 0;
    for (const p of this.items) {
      p.spot += (p.spotTarget - p.spot) * k;
      if (Math.abs(p.spotTarget - p.spot) < 0.001) p.spot = p.spotTarget;
      if (p.spot > globalSpot) globalSpot = p.spot;
      if (p.revealed && p.fade < 1) {
        p.fade += (1 - p.fade) * fk;
        if (p.fade > 0.999) p.fade = 1;
      }
    }

    document.documentElement.style.setProperty('--spot', globalSpot.toFixed(3));
    document.body.classList.toggle('spotlit', globalSpot > 0.01);

    // Orbit radii — vertical spread is generous so the clock stays clear.
    const ax = vw * 0.315;
    const ay = vh * (narrow ? 0.30 : 0.335);
    const f = 0.70 + 0.30 * converge;

    for (const p of this.items) {
      const bob = reduceMotion ? 0 : Math.sin(t * 0.001 * p.bobSpeed + p.phase);
      const sway = reduceMotion ? 0 : Math.cos(t * 0.00072 * p.bobSpeed + p.phase);

      // --- countdown position ---
      const cx = Math.cos(p.angle) * ax * f + sway * 12;
      const cy = Math.sin(p.angle) * ay * f + bob * 14;
      const cr = p.tilt + sway * 1.6;

      // --- finale beat one: pulled into an overlapping cluster ---
      const spread = (p.index - (p.total - 1) / 2);
      const b1x = spread * 16;
      const b1y = bob * 4;
      const b1r = spread * 7;

      // --- finale beat two: the settled gallery computed in layout() ---
      const b2x = p.b2x;
      const b2y = p.b2y;
      const b2r = spread * 2.4;

      const g1 = smooth(norm(finale, 0, 0.38));   // drift into the cluster
      const g2 = smooth(norm(finale, 0.46, 1));   // settle outward

      const fx = lerp(b1x, b2x, g2);
      const fy = lerp(b1y, b2y, g2);
      const fr = lerp(b1r, b2r, g2);
      const fs = lerp(1.34, narrow ? 1.06 : 1.18, g2);

      let x = lerp(cx, fx, g1);
      let y = lerp(cy, fy, g1);
      let r = lerp(cr, fr, g1);
      let s = lerp(1, fs, g1);

      /* --- spotlight: centre it, level it, and fit it to the viewport ---
         The growth is applied to the element's layout box rather than to
         transform: scale(). A composited layer is rasterised at its layout
         size, so scaling up would just stretch a small texture and look
         blurry no matter how many pixels the source image has. */
      let grow = 1;
      if (p.spot > 0) {
        const e = smooth(p.spot);
        const fit = Math.min((vw * 0.9) / (p.w * s), (vh * 0.84) / (p.h * s));
        grow = lerp(1, fit, e);
        x = lerp(x, 0, e);
        y = lerp(y, 0, e);
        r = lerp(r, 0, e);
      }

      const tw = p.w * grow, th = p.h * grow;
      if (tw !== p.lastW || th !== p.lastH) {
        p.el.style.width = `${tw.toFixed(1)}px`;
        p.el.style.height = `${th.toFixed(1)}px`;
        p.lastW = tw;
        p.lastH = th;
      }

      p.el.style.zIndex = p.spot > 0 ? '2' : '1';

      p.el.style.transform =
        `translate3d(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px), 0) rotate(${r.toFixed(2)}deg) scale(${s.toFixed(3)})`;

      // Load fade, finale lift and spotlight dimming, resolved in one value.
      const base = lerp(0.82, 1, g1);
      const pushedBack = globalSpot * (1 - p.spot);
      p.el.style.opacity =
        (p.fade * lerp(base, 1, p.spot) * (1 - pushedBack * 0.82)).toFixed(3);
    }
  }
}

/* ---------------------------------------------------------------- audio */

class Ambience {
  constructor(src) {
    this.src = src;
    this.on = false;
    this.ctx = null;
    this.nodes = [];
  }

  toggle() { return this.on ? (this.stop(), false) : (this.start(), true); }

  start() {
    this.on = true;
    if (this.src) return this.startFile();
    this.startSynth();
  }

  startFile() {
    if (!this.audio) {
      this.audio = new Audio(this.src);
      this.audio.loop = true;
      this.audio.volume = 0;
    }
    this.audio.play().then(() => this.fadeTo(0.55, 3000)).catch(() => {
      // Autoplay or decode failure — fall back to the generated pad.
      this.src = null;
      this.audio = null;
      if (this.on) this.startSynth();
    });
  }

  fadeTo(target, ms) {
    const a = this.audio;
    if (!a) return;
    const from = a.volume, t0 = performance.now();
    const step = now => {
      const k = clamp((now - t0) / ms, 0, 1);
      a.volume = clamp(lerp(from, target, k), 0, 1);
      if (k < 1 && this.audio === a) requestAnimationFrame(step);
      else if (target === 0 && this.audio === a) a.pause();
    };
    requestAnimationFrame(step);
  }

  /* A slow, generated pad — means the page has music even with no audio file. */
  startSynth() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx || (this.ctx = new AC());
    ctx.resume();

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1150;
    filter.Q.value = 0.6;

    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(ctx, 3.4, 2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    const dry = ctx.createGain(); dry.gain.value = 0.62;

    filter.connect(dry).connect(master);
    filter.connect(verb).connect(wet).connect(master);
    master.connect(ctx.destination);

    // Amaj9-ish, voiced wide and low.
    const chord = [110.0, 164.81, 220.0, 277.18, 329.63, 415.30];
    chord.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? 'sine' : 'triangle';
      osc.frequency.value = hz;
      osc.detune.value = (Math.random() * 2 - 1) * 7;

      const g = ctx.createGain();
      g.gain.value = 0.0001;

      // Each voice breathes on its own slow cycle.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.026 + Math.random() * 0.05;
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.value = 0.5 / chord.length;
      lfo.connect(lfoAmt).connect(g.gain);
      g.gain.setValueAtTime(0.55 / chord.length, ctx.currentTime);

      osc.connect(g).connect(filter);
      osc.start(); lfo.start();
      this.nodes.push(osc, lfo);
    });

    this.master = master;
  }

  impulse(ctx, seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /* A rising shimmer for the moment the clock lands. */
  swell() {
    if (!this.on) return;
    // With a music file playing there's no synth context yet — make one so the
    // chime still lands.
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    const ctx = this.ctx;
    ctx.resume();
    const now = ctx.currentTime;
    [880, 1108.73, 1318.51, 1760].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const g = ctx.createGain();
      const at = now + i * 0.34;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.10, at + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 4.2);
      osc.connect(g).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 4.4);
    });
  }

  stop() {
    this.on = false;
    if (this.audio) return this.fadeTo(0, 900);
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      const nodes = this.nodes.splice(0);
      setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch {} }), 1400);
      this.master = null;
    }
  }
}

/* ----------------------------------------------------------------- boot */

const sky = new Sky($('#sky'));
const photos = new Photos($('#photos'));

const els = {
  clock: $('#clock'),
  days: $('#u-days'),
  daysColon: $('#c-days'),
  dDays: $('#u-days .digits'),
  dHours: $('#d-hours'),
  dMins: $('#d-mins'),
  dSecs: $('#d-secs'),
  sound: $('#sound'),
  eleven: $('#eleven'),
  flight: $('#flight')
};

function setDigits(node, value) {
  const s = String(value).padStart(2, '0');
  const spans = node.children;
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].textContent !== s[i]) spans[i].textContent = s[i];
  }
}

let lastShown = -1;
function renderClock(remaining) {
  const total = Math.max(0, Math.ceil(remaining / 1000));
  if (total === lastShown) return;
  lastShown = total;

  const days = Math.floor(total / 86400);
  const hours = Math.floor(total / 3600) % 24;

  if (days > 0) {
    els.days.hidden = false;
    els.daysColon.hidden = false;
    setDigits(els.dDays, days);
  } else if (!els.days.hidden) {
    els.days.hidden = true;
    els.daysColon.hidden = true;
  }

  setDigits(els.dHours, days > 0 ? hours : Math.floor(total / 3600));
  setDigits(els.dMins, Math.floor(total / 60) % 60);
  setDigits(els.dSecs, total % 60);

  document.title = total > 0 ? `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')} — Craig & Betsy` : 'Craig & Betsy';
}

let ambience = new Ambience(null);
let arrived = false;
let burstFired = false;

els.sound.addEventListener('click', () => {
  const on = ambience.toggle();
  els.sound.setAttribute('aria-pressed', String(on));
  els.sound.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
  els.sound.classList.remove('hint');
  try { localStorage.setItem('cb-sound-seen', '1'); } catch {}
});

try {
  if (!localStorage.getItem('cb-sound-seen')) els.sound.classList.add('hint');
} catch { els.sound.classList.add('hint'); }

/* ---------------------------------------------------------------- flight */

const AIRLINES = { G4: 'Allegiant' };

const fmtArrival = new Intl.DateTimeFormat('en-US', {
  timeZone: ARRIVAL_TZ, hour: 'numeric', minute: '2-digit', hour12: true
});

/* "12:26 AM" -> ["12:26", "AM"]. Recent ICU puts a narrow no-break space
   before the meridiem, so normalise it before splitting. */
function splitArrival(msVal) {
  const [clock, suffix = ''] = fmtArrival.format(new Date(msVal)).replace(/ /g, ' ').split(' ');
  return [clock, suffix];
}

function flightName(code) {
  const m = /^([A-Z]{1,3}?\d?)(\d{1,4})$/.exec(code || '');
  if (!m) return code || 'Flight';
  return `${AIRLINES[m[1]] ? AIRLINES[m[1]] + ' ' : ''}${m[1]} ${m[2]}`;
}

function minutesText(m) {
  const h = Math.floor(m / 60);
  return h ? `${h} hr${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

/* One line of plain language under the sky: what is being waited on, when it
   lands, and how far that has moved. */
function statusText(d) {
  const [clock, suffix] = splitArrival(TARGET_MS);
  const when = `${clock} ${suffix}`.trim();
  const name = flightName(d?.flight);
  const route = d?.route?.from && d?.route?.to ? ` ${d.route.from}–${d.route.to}` : '';

  if (!d || !d.ok) return `${name}${route} · landing ${when} · live updates unavailable`;
  if (d.arrival?.kind === 'actual') return `${name}${route} · landed ${when}`;

  const late = d.delayMinutes;
  if (late != null && late >= 5) return `${name}${route} · landing ${when} · ${minutesText(late)} late`;
  if (late != null && late <= -5) return `${name}${route} · landing ${when} · ${minutesText(-late)} early`;
  return `${name}${route} · landing ${when}`;
}

function paintArrival(d) {
  const [clock] = splitArrival(TARGET_MS);
  if (els.eleven && els.eleven.textContent !== clock) els.eleven.textContent = clock;
  if (els.flight && !PREVIEW) {
    const line = statusText(d);
    if (els.flight.textContent !== line) els.flight.textContent = line;
    els.flight.classList.add('show');
  }
}

function setTarget(nextMs, d) {
  const moved = Math.abs(nextMs - TARGET_MS) > 1000;
  TARGET_MS = nextMs;

  if (moved) {
    lastShown = -1; // force the digits to redraw against the new target

    /* A later estimate after the finale already played rewinds the page,
       otherwise a delayed flight would leave it stuck on the ending. */
    if (arrived && TARGET_MS - Date.now() > 1000) {
      arrived = false;
      burstFired = false;
      document.body.classList.remove('arrived');
    }
  }

  paintArrival(d);
  if (moved) photos.layout(); // the arrival text can change the composed height
}

let lastFlightFetch = 0;
let flightInFlight = false;

async function refreshFlight(force = false) {
  if (PREVIEW || flightInFlight) return;
  const now = Date.now();
  if (!force && now - lastFlightFetch < FLIGHT_MIN_GAP_MS) return;

  flightInFlight = true;
  lastFlightFetch = now;
  try {
    const r = await fetch('/api/flight', { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const t = Number(d?.arrival?.ms);

    /* Only a genuinely live answer may move the clock. A server-side fallback
       must not overwrite a good time we already hold. */
    if (d.ok && Number.isFinite(t)) {
      try {
        localStorage.setItem(FLIGHT_CACHE_KEY, JSON.stringify({ ms: t, at: now }));
      } catch {}
      setTarget(t, d);
    } else {
      paintArrival(d);
    }
  } catch {
    paintArrival(null); // keep counting to whatever we already have
  } finally {
    flightInFlight = false;
  }
}

// Show the time we already hold; the status line waits for a real answer so it
// never flashes "unavailable" before the first request has even landed.
if (els.eleven) els.eleven.textContent = splitArrival(TARGET_MS)[0];
refreshFlight(true);
setInterval(() => refreshFlight(true), FLIGHT_POLL_MS);
// Phones suspend timers when the screen is off; catch up on the way back.
addEventListener('visibilitychange', () => { if (!document.hidden) refreshFlight(); });
// Connectivity just came back — retry now rather than waiting out the gap.
addEventListener('online', () => refreshFlight(true));

let prev = performance.now();

function frame(now) {
  const dt = Math.min(now - prev, 60);
  prev = now;

  const remaining = TARGET_MS - Date.now();
  const since = -remaining;

  if (remaining > 0) {
    renderClock(remaining);
    document.body.classList.toggle('imminent', remaining <= IMMINENT_MS);
  } else if (!arrived) {
    arrived = true;
    renderClock(0);
    document.body.classList.remove('imminent');
    document.body.classList.add('arrived');
    ambience.swell();
  }

  if (arrived && !burstFired && since > 300) {
    burstFired = true;
    sky.burst(5);
  }

  // 1 = far apart, 0 = fully drawn together.
  const converge = remaining > 0
    ? Math.pow(clamp(remaining / CONVERGE_WINDOW_MS, 0, 1), 0.25)
    : 0;

  const finale = arrived ? easeOut(clamp(since / FINALE_MS, 0, 1)) : 0;

  // Sky brightens through the last ten seconds and stays lifted afterwards.
  const intensity = arrived
    ? lerp(1, 0.45, clamp(since / (FINALE_MS * 1.6), 0, 1))
    : clamp(1 - remaining / IMMINENT_MS, 0, 1);

  sky.draw(dt, intensity);
  photos.update(dt, now, converge, finale);

  requestAnimationFrame(frame);
}

$('#spot-backdrop').addEventListener('click', () => photos.clearSpot());
addEventListener('keydown', e => { if (e.key === 'Escape') photos.clearSpot(); });

photos.layout();
addEventListener('resize', () => photos.layout(), { passive: true });
// Web font metrics change the measured heights, so recompose once it lands.
if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    photos.layout();
    requestAnimationFrame(() => document.body.classList.remove('booting'));
  });
} else {
  requestAnimationFrame(() => document.body.classList.remove('booting'));
}

fetch('/photos/manifest.json', { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : null))
  .then(m => {
    if (m && Array.isArray(m.photos)) {
      photos.load(m.photos.map(p => (typeof p === 'string' ? { src: p } : p)));
    }
    ambience = new Ambience(m && m.audio ? m.audio : null);
  })
  .catch(() => {})
  .finally(() => requestAnimationFrame(frame));
