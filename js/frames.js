/* frames.js — the image-sequence player (section 6).

   How it stays smooth:
   1. Every frame is fetched once as a compressed WebP blob (a few MB for a whole
      sequence), nearest-to-the-playhead first, then coarse-to-fine.
   2. Only a window of frames around the playhead is decoded into ImageBitmaps,
      at the size they are drawn. The window leans ahead in the scroll direction
      and frames that fall out of it are closed, so memory stays flat.
   3. Decoding is serial on phones (two at a time on desktops) so it never starves
      the main thread, and an evicted frame is simply decoded again from its blob.
   4. The playhead is fractional: two neighbouring frames are crossfaded, so the
      picture moves continuously instead of stepping frame by frame.
   5. Small proxies paint the gap if the reader scrubs faster than decoding.
   6. Players far off screen drop their decoded frames and start loading only when
      the reader gets near, so the hero gets the bandwidth first.

   Public API (unchanged): makePlayer(canvas, base, opts) → player with
   init(), want(frame), glideTo(frame, ms), play(fps), pause(), ready(), refresh(),
   count, active. */

(function (NW) {
  'use strict';

  const saveData = typeof navigator !== 'undefined' && navigator.connection &&
    navigator.connection.saveData;

  const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pad = (i) => String(i + 1).padStart(4, '0');
  const phone = () => window.innerWidth < 820;

  /* Opened straight from the folder (file://), browsers refuse fetch(), so frames are
     loaded as images instead. On a web server they are fetched as compressed blobs. */
  const fromDisk = location.protocol === 'file:';

  async function loadSource(url) {
    if (fromDisk) {
      /* wait for the file only; decoding happens later, for the frames near the
         playhead (img.decode() here would hold every frame decoded at full size) */
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image failed: ' + url));
        img.src = url;
      });
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return res.blob();
  }

  /* createImageBitmap with resize options; falls back once if the browser refuses them.
     If a browser will not make a bitmap from a disk image, the image itself is drawn. */
  let canResize = true;
  async function decodeBlob(src, w, h) {
    /* a disk image is decoded off the main thread and drawn as it is (making a
       bitmap from it would copy every frame again on the main thread) */
    if (src instanceof HTMLImageElement) {
      if (src.decode) await src.decode();
      return src;
    }
    if (canResize && w && h) {
      try {
        return await createImageBitmap(src, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
      } catch (err) { canResize = false; }
    }
    try {
      return await createImageBitmap(src);
    } catch (err) {
      if (src instanceof HTMLImageElement) return src;
      throw err;
    }
  }

  class FramePlayer {
    constructor(canvas, base, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.base = base;                    // e.g. "assets/frames/hero"
      this.opts = opts;
      this.man = null;
      this.count = 0;
      this.blobs = new Map();              // index -> Blob (compressed; cheap to keep)
      this.bitmaps = new Map();            // index -> ImageBitmap (decoded, near the playhead)
      this.atlasSrc = null;                // all the small stand-in frames, one image
      this.atlasBmp = null;
      this.fetching = new Set();
      this.decoding = new Set();
      this.failed = new Set();
      this.retrying = new Set();
      this.evicted = new Set();            // dropped since the playhead last moved a frame
      this.evictedAt = 0;
      this.order = [];
      this.orderPos = 0;
      this.active = 0;                     // fetches + decodes in flight
      this.wantFrame = 0;
      this.dir = 1;
      this.exact = false;                  // canvas shows the sharp frame(s) for the playhead
      this.frame0Ready = false;
      this.near = false;
      this.gen = 0;
      this.setGen = 0;                     // bumped when the frame set changes
      this.stats = { fetched: 0, decoded: 0, evicted: 0, atlasDraws: 0, total: 0 };
      this._initP = null;
      /* resolves once the manifest is in and count is known */
      this.loaded = new Promise((r) => { this._resolveLoaded = r; });
      this._fill('#eef4fb');

      this._onResize = () => this._sizeUp();
      window.addEventListener('resize', this._onResize, { passive: true });

      /* load when the reader is within three screens; decode only within one */
      if ('IntersectionObserver' in window) {
        const far = new IntersectionObserver((es) => {
          if (es.some((e) => e.isIntersecting)) { far.disconnect(); this.init(); }
        }, { rootMargin: '300% 0px' });
        far.observe(canvas);
        const nearIO = new IntersectionObserver((es) => {
          es.forEach((e) => this._setNear(e.isIntersecting));
        }, { rootMargin: '100% 0px' });
        nearIO.observe(canvas);
      } else {
        this.near = true;
      }
    }

    init() {
      if (!this._initP) this._initP = this._start();
      return this._initP;
    }

    async _start() {
      /* manifest.json is the source of truth on a server; js/manifests.js is the copy
         used from disk (or if the fetch fails) */
      const embedded = NW.manifests && NW.manifests[this.base];
      this.man = null;
      if (!fromDisk) {
        try {
          const res = await fetch(`${this.base}/manifest.json`);
          if (!res.ok) throw new Error(String(res.status));
          this.man = await res.json();
        } catch (err) { /* fall back to the embedded copy */ }
      }
      if (!this.man) this.man = embedded || null;
      if (!this.man) {
        this._resolveLoaded(false);
        return false;
      }
      this.pickSet();
      this._sizeUp();
      this._buildOrder();
      this._schedule();
      this._watchSet();
      this._resolveLoaded(true);
      return true;
    }

    /* a rotated tablet or a resized window can cross the phone-set query: reload with
       the other frame set and tell the page (the story re-places its hotspots) */
    _watchSet() {
      const m = this.man && this.man.mobile;
      if (!m || !m.media || this._mq) return;
      this._mq = window.matchMedia(m.media);
      const swap = () => {
        const was = this.set;
        this.pickSet();
        if (this.set === was) return;
        this.gen++;
        this.setGen++;
        this.atlasFetching = false;
        for (const bmp of this.bitmaps.values()) bmp.close && bmp.close();
        this.bitmaps.clear();
        this.blobs.clear();
        this.failed.clear();
        if (this.atlasBmp && this.atlasBmp !== this.atlasSrc && this.atlasBmp.close) this.atlasBmp.close();
        this.atlasBmp = null;
        this.atlasSrc = null;
        this.atlasFailed = false;
        this.frame0Ready = false;
        this.exact = false;
        this.decW = 0;
        this._sizeUp();
        this._buildOrder();
        this._schedule();
        this.canvas.dispatchEvent(new Event('framesetchange'));
      };
      if (this._mq.addEventListener) this._mq.addEventListener('change', swap);
    }

    pickSet() {
      if (!this.man) return;
      const m = this.man.mobile;
      const wantMobile = m && (!m.media || window.matchMedia(m.media).matches);
      this.usingMobile = !!wantMobile;
      this.set = wantMobile ? m : this.man.desktop;
      this.count = this.set.count;
      this.fps = this.man.fps || 24;
      this.blend = this.man.blend !== false;
      this.fit = this.man.fit || 'cover';
      this.bg = this.man.background || '#e4f0fb';
      this.loop = !!(this.man.loop || this.opts.loop);
      this.atlasSet = (this.man.atlas && this.man.atlas[wantMobile ? 'mobile' : 'desktop']) || null;
      this.wantFrame = Math.max(0, Math.min(this.count - 1, this.wantFrame));
      this.stats.total = this.count;
      this._fill(this.bg);
    }

    /* ---------- sizing ---------- */
    _sizeUp() {
      if (!this.set) return;
      const box = this.canvas.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sw = this.set.width;
      const sh = this.set.height;
      let w = box.width * dpr;
      let h = box.height * dpr;
      const fitOf = (W, H) => (this.fit === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh));
      /* one factor for both sides keeps the canvas the same shape as its box, so
         object-fit never crops a second time. Never store more pixels than the
         source can fill, and never more than the cap. */
      const maxPx = this.opts.maxPixels || (phone() ? 1.4e6 : 2.1e6);
      const k = Math.min(1, 1 / Math.max(1e-6, fitOf(w, h)), Math.sqrt(maxPx / (w * h)));
      w = Math.max(2, Math.round(w * k));
      h = Math.max(2, Math.round(h * k));

      /* frames are decoded at the size they are drawn, but only when that saves real
         memory: a resizing decode is slower than a plain one */
      let dk = Math.min(1, fitOf(w, h));
      if (dk > 0.72) dk = 1;
      const dw = Math.max(2, Math.round(sw * dk));
      const dh = Math.max(2, Math.round(sh * dk));
      if (!this.decW || Math.abs(dw - this.decW) / this.decW > 0.12) {
        if (this.decW) this._dropDecoded();
        this.decW = dw;
        this.decH = dh;
      }
      const budget = this.opts.budget || (phone() ? 48e6 : 160e6);
      this.budgetFrames = Math.max(8, Math.min(this.count, Math.floor(budget / (this.decW * this.decH * 4))));
      this.ahead = Math.ceil(this.budgetFrames * 0.62);
      this.behind = Math.max(2, this.budgetFrames - this.ahead - 1);

      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this._draw();
      }
      this._schedule();
    }

    _fill(color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /* ---------- loading ---------- */
    _buildOrder() {
      const n = this.count;
      const order = [];
      const seen = new Set();
      const add = (i) => { if (i >= 0 && i < n && !seen.has(i)) { seen.add(i); order.push(i); } };
      add(0);
      (this.man.keyframes || [0, .25, .5, .75, 1]).forEach((k) => add(Math.round(k * (n - 1))));
      const steps = saveData || this.opts.keyOnly ? [8, 4] : [16, 8, 4, 2, 1];
      steps.forEach((s) => { for (let i = 0; i < n; i += s) add(i); });
      this.order = order;
      this.orderPos = 0;
    }

    /* signed distance from the playhead, measured in the direction of travel;
       looping sequences wrap around */
    _rel(i) {
      let d = i - this.wantFrame;
      if (this.loop) {
        const n = this.count;
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }
      return d * (this.dir || 1);
    }

    _idx(i) {
      const n = this.count;
      if (this.loop) return ((i % n) + n) % n;
      return i;
    }

    /* playhead-out: one step behind for every two ahead */
    * _around(maxAhead, maxBehind) {
      const c = Math.round(this.wantFrame);
      const d = this.dir || 1;
      yield this._idx(c);
      let a = 1, b = 1;
      while (a <= maxAhead || b <= maxBehind) {
        for (let k = 0; k < 2 && a <= maxAhead; k++, a++) yield this._idx(c + a * d);
        if (b <= maxBehind) { yield this._idx(c - b * d); b++; }
      }
    }

    _nextFetch() {
      const n = this.count;
      for (const i of this._around(10, 4)) {
        if (i >= 0 && i < n && !this.blobs.has(i) && !this.fetching.has(i) && !this.failed.has(i) &&
            !this.retrying.has(i)) return i;
      }
      while (this.orderPos < this.order.length) {
        const i = this.order[this.orderPos];
        if (!this.blobs.has(i) && !this.fetching.has(i) && !this.failed.has(i) && !this.retrying.has(i)) return i;
        this.orderPos++;
      }
      return -1;
    }

    _nextDecode() {
      if (!this.near) return -1;
      /* a frame dropped at this playhead position is not decoded again until the
         playhead moves, so decode and eviction can never chase each other */
      const c = Math.round(this.wantFrame);
      if (c !== this.evictedAt) { this.evicted.clear(); this.evictedAt = c; }
      const n = this.count;
      for (const i of this._around(this.ahead, this.behind)) {
        if (i >= 0 && i < n && this.blobs.has(i) && !this.bitmaps.has(i) && !this.decoding.has(i) &&
            !this.failed.has(i) && !this.evicted.has(i)) return i;
      }
      return -1;
    }

    _schedule() {
      if (!this.count) return;
      const maxFetch = phone() ? 3 : 5;
      while (this.fetching.size < maxFetch) {
        const i = this._nextFetch();
        if (i < 0) break;
        this._fetch(i);
      }
      const maxDecode = phone() ? 1 : 2;
      while (this.decoding.size < maxDecode) {
        const i = this._nextDecode();
        if (i < 0) break;
        this._decode(i);
      }
      this._pumpAtlas();
    }

    async _fetch(i, tries = 0) {
      this.fetching.add(i);
      this.active++;
      let ok = false;
      const setGen = this.setGen;
      try {
        const src = await loadSource(`${this.base}/${this.set.dir}/${pad(i)}.webp`);
        if (setGen === this.setGen) this.blobs.set(i, src);   // not from a set we left
        this.stats.fetched++;
        ok = true;
      } catch (err) {
        if (tries >= 2) this.failed.add(i);
      }
      this.fetching.delete(i);
      this.active--;
      if (setGen !== this.setGen) { this._schedule(); return; }
      if (!ok && tries < 2 && !this.failed.has(i)) {
        this.retrying.add(i);
        setTimeout(() => { this.retrying.delete(i); this._fetch(i, tries + 1); }, 300 * (tries + 1));
        return;
      }
      this._schedule();
    }

    async _decode(i) {
      const gen = this.gen;
      this.decoding.add(i);
      this.active++;
      try {
        const native = this.decW >= this.set.width;
        const bmp = await decodeBlob(this.blobs.get(i), native ? 0 : this.decW, native ? 0 : this.decH);
        if (gen !== this.gen || !this.near) {
          bmp.close && bmp.close();
        } else {
          this.bitmaps.set(i, bmp);
          this.stats.decoded++;
          if (i === 0) this.frame0Ready = true;
          this._evict();
          if (!this.exact && Math.abs(this._rel(i)) <= 3) this._draw();
        }
      } catch (err) {
        this.failed.add(i);
      }
      this.decoding.delete(i);
      this.active--;
      this._schedule();
    }

    /* offset from the rounded playhead in the direction of travel: exactly the
       measure _around() uses, so eviction and decoding agree on the window */
    _winRel(i) {
      let d = i - Math.round(this.wantFrame);
      if (this.loop) {
        const n = this.count;
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }
      return d * (this.dir || 1);
    }

    _evict() {
      while (this.bitmaps.size > this.budgetFrames) {
        let worst = -1;
        let worstD = -1;
        for (const i of this.bitmaps.keys()) {
          const r = this._winRel(i);
          if (r >= -this.behind && r <= this.ahead) continue;   // inside the window: keep
          const d = r > 0 ? r - this.ahead : (-r - this.behind) * 1.8;   // behind goes first
          if (d > worstD) { worstD = d; worst = i; }
        }
        if (worst < 0) break;
        const bmp = this.bitmaps.get(worst);
        bmp.close && bmp.close();
        this.bitmaps.delete(worst);
        this.evicted.add(worst);
        this.stats.evicted++;
      }
    }

    _dropDecoded() {
      this.gen++;
      for (const bmp of this.bitmaps.values()) bmp.close && bmp.close();
      this.bitmaps.clear();
      if (this.atlasBmp && this.atlasBmp !== this.atlasSrc && this.atlasBmp.close) this.atlasBmp.close();
      this.atlasBmp = null;
      this.exact = false;
    }

    _setNear(v) {
      if (v === this.near) return;
      this.near = v;
      clearTimeout(this._dropT);
      if (v) {
        this._sizeUp();
        this._schedule();
        this._draw();
      } else {
        /* give the memory back once the section has been gone for a moment */
        this._dropT = setTimeout(() => { if (!this.near) this._dropDecoded(); }, 1500);
      }
    }

    /* the atlas: every stand-in frame in one small image, fetched alongside frame 0, so
       any scroll position has a correct (soft) picture from the first second */
    _pumpAtlas() {
      if (!this.atlasSet || this.atlasFailed) return;
      if (!this.atlasSrc && !this.atlasFetching) this._fetchAtlas();
      else if (this.atlasSrc && !this.atlasBmp && !this.atlasDecoding && this.near) this._decodeAtlas();
    }

    async _fetchAtlas() {
      this.atlasFetching = true;
      this.active++;
      const setGen = this.setGen;
      try {
        const src = await loadSource(`${this.base}/${this.atlasSet.file}`);
        if (setGen === this.setGen) this.atlasSrc = src;
      } catch (err) {
        if (setGen === this.setGen) this.atlasFailed = true;
      }
      if (setGen === this.setGen) this.atlasFetching = false;
      this.active--;
      this._schedule();
    }

    async _decodeAtlas() {
      const gen = this.gen;
      this.atlasDecoding = true;
      this.active++;
      try {
        const bmp = await decodeBlob(this.atlasSrc, 0, 0);
        if (gen !== this.gen || !this.near) {
          if (bmp !== this.atlasSrc && bmp.close) bmp.close();
        } else {
          this.atlasBmp = bmp;
          if (!this.exact) this._draw();
        }
      } catch (err) {
        this.atlasFailed = true;
      }
      this.atlasDecoding = false;
      this.active--;
    }

    /* ---------- drawing ---------- */
    _paint(bmp, alpha) {
      if (!bmp) return false;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const sw = this.set.width;
      const sh = this.set.height;
      const k = this.fit === 'contain' ? Math.min(cw / sw, ch / sh) : Math.max(cw / sw, ch / sh);
      const dw = sw * k;
      const dh = sh * k;
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(bmp, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      this.ctx.globalAlpha = 1;
      return true;
    }

    /* one stand-in tile from the atlas, fitted like a full frame (half-pixel inset so
       the scaled tile never samples its neighbour) */
    _paintTile(t, alpha) {
      const A = this.atlasSet;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const sw = this.set.width;
      const sh = this.set.height;
      const k = this.fit === 'contain' ? Math.min(cw / sw, ch / sh) : Math.max(cw / sw, ch / sh);
      const dw = sw * k;
      const dh = sh * k;
      const sx = (t % A.cols) * A.w;
      const sy = Math.floor(t / A.cols) * A.h;
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(this.atlasBmp, sx + .5, sy + .5, A.w - 1, A.h - 1, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      this.ctx.globalAlpha = 1;
    }

    _nearestIn(map, f, maxD) {
      let best = null;
      let bestD = Infinity;
      for (const [i, bmp] of map) {
        if (!bmp) continue;
        let d = Math.abs(i - f);
        if (this.loop) d = Math.min(d, this.count - d);
        if (d < bestD) { bestD = d; best = bmp; }
      }
      return bestD <= maxD ? best : null;
    }

    _draw() {
      if (!this.count || !this.set) return;
      const n = this.count;
      const f = this.wantFrame;
      let f0 = Math.floor(f);
      let frac = f - f0;
      if (frac < 0.003) frac = 0;
      let f1 = f0 + 1;
      if (f1 >= n) f1 = this.loop ? 0 : n - 1;
      if (frac > 0.997) { f0 = f1; frac = 0; }
      if (!this.blend && frac) { if (frac >= .5) f0 = f1; frac = 0; }

      const contain = this.fit === 'contain';
      const a = this.bitmaps.get(f0);
      const b = frac ? this.bitmaps.get(f1) : null;

      /* 1. the sharp frames for this exact position */
      if (a && (!frac || b)) {
        if (contain) this._fill(this.bg);
        this._paint(a, 1);
        if (b) this._paint(b, frac);
        this.exact = true;
        return;
      }
      this.exact = false;

      /* 2. one sharp neighbour within a frame and a half: a tiny lag, still sharp */
      const sharp = this._nearestIn(this.bitmaps, f, 1.5);
      if (sharp) {
        if (contain) this._fill(this.bg);
        this._paint(sharp, 1);
        return;
      }

      /* 3. the atlas stand-ins, crossfaded the same way */
      if (this.atlasBmp) {
        const A = this.atlasSet;
        const last = A.count - 1;
        const tf = f / A.step;
        let t0 = Math.min(last, Math.floor(tf));
        const tfrac = tf - t0;
        let t1 = t0 + 1;
        if (t1 > last) t1 = this.loop ? 0 : last;
        if (contain) this._fill(this.bg);
        this._paintTile(t0, 1);
        if (tfrac > .003 && t1 !== t0) this._paintTile(t1, tfrac);
        this.stats.atlasDraws++;
        return;
      }

      /* 4. anything close */
      const any = this._nearestIn(this.bitmaps, f, Infinity);
      if (any) {
        if (contain) this._fill(this.bg);
        this._paint(any, 1);
      }
    }

    refresh() { this._draw(); }

    /* ---------- public API ---------- */
    want(f) {
      const n = this.count;
      if (!n) { this.wantFrame = Math.max(0, f); return; }
      const t = this.loop ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1, f));
      let d = t - this.wantFrame;
      if (this.loop && Math.abs(d) > n / 2) d -= Math.sign(d) * n;
      if (Math.abs(d) > 1e-4) this.dir = d > 0 ? 1 : -1;
      this.wantFrame = t;
      const eps = this.opts.epsilon != null ? this.opts.epsilon : 0.004;
      if (Math.abs(d) >= eps || !this.exact) this._draw();
      this._schedule();
    }

    glideTo(f, ms = 700) {
      if (!this.count) { this.want(f); return; }
      const from = this.wantFrame;
      const to = Math.max(0, Math.min(this.count - 1, f));
      const t0 = performance.now();
      const token = {};
      this._glide = token;
      const step = (now) => {
        if (this._glide !== token) return;          // a newer glide took over
        const t = Math.min(1, (now - t0) / ms);
        const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        this.want(from + (to - from) * e);
        if (t < 1) requestAnimationFrame(step);
        else this._glide = null;
      };
      requestAnimationFrame(step);
    }

    ready() { return this.frame0Ready; }

    play(fps = this.fps) {
      if (this._playing) return;
      this._playing = true;
      this.opts.loop = true;
      this.loop = true;
      this.init();
      let last = performance.now();
      const tick = (now) => {
        if (!this._playing) return;
        const dt = Math.min(100, now - last);
        last = now;
        if (this.count) {
          /* time-based and fractional: every display refresh gets its own blend */
          this._loopT = ((this._loopT || 0) + (dt * fps) / 1000) % this.count;
          this.want(this._loopT);
        }
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }

    pause() {
      this._playing = false;
      cancelAnimationFrame(this._raf);
    }
  }

  function makePlayer(canvas, base, opts) {
    return new FramePlayer(canvas, base, opts);
  }

  NW.reducedMotion = reducedMotion;
  NW.FramePlayer = FramePlayer;
  NW.makePlayer = makePlayer;
})(window.Sunrise = window.Sunrise || {});
