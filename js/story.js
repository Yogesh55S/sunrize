/* story.js — one rAF loop drives the whole pinned story (section 12).
   Progress is smoothed, the sequence scrubs, the plate hands off to frame 0,
   and each beat (hero, promise, moving day, record) is placed by its own segment. */

(function (NW) {
  'use strict';

  const { reducedMotion, makePlayer } = NW;

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /* trapezoid speed: ease in over the first 15%, steady, ease out over the last 25% */
  const glide = (t) => {
    const a = .15, b = .25, v = 1 / (1 - a / 2 - b / 2);
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (t < a) return (v * t * t) / (2 * a);
    if (t > 1 - b) { const r = 1 - t; return 1 - (v * r * r) / (2 * b); }
    return v * (t - a / 2);
  };

  function initStory() {
    const story = document.getElementById('story');
    const stage = document.getElementById('stage');
    const canvas = document.getElementById('hero-canvas');
    const plate = document.querySelector('.cam .plate');
    const front = document.querySelector('.cam-front');
    const cams = [...document.querySelectorAll('.cam')];
    const bar = document.getElementById('story-progress');
    if (!story || !stage || !canvas) return;

    const player = makePlayer(canvas, 'assets/frames/hero');
    const rm = reducedMotion();

    /* ---------- word spans ---------- */
    const promise = document.querySelector('.promise');
    const promiseH = promise.querySelector('h2');
    promiseH.innerHTML = promiseH.textContent.trim().split(/(\s+)/).map((w) =>
      w.trim() ? `<span class="w">${w}</span>` : ' ').join('');
    const promiseWords = [...promiseH.querySelectorAll('.w')];
    const promiseChip = promise.querySelector('.chip');
    const promiseP = promise.querySelector('p');
    const promiseInner = promise.querySelector('.promise-in') || promise;

    const mdText = document.querySelector('.moving-day p');
    mdText.innerHTML = mdText.textContent.trim().split(/\s+/)
      .map((w) => `<span class="w">${w}</span>`).join(' ');
    const mdWords = [...mdText.querySelectorAll('.w')];
    const glass = document.querySelector('.md-glass');
    const hots = [...document.querySelectorAll('.hot')];

    const heroCopy = document.querySelector('.hero-copy');
    const heroChip = heroCopy.querySelector('.chip');
    const heroLine = heroCopy.querySelector('.hero-line');
    const heroActions = heroCopy.querySelector('.hero-actions');
    const badge = document.querySelector('.hero-badge');
    const caption = document.querySelector('.caption');
    const hint = document.querySelector('.scroll-hint');
    const floats = [...document.querySelectorAll('.float')].map((el) => ({
      el,
      x: parseFloat(el.dataset.x || 0),
      y: parseFloat(el.dataset.y || 0),
      depth: parseFloat(el.dataset.depth || 1),
    }));

    const recHead = document.querySelector('.record');
    const recCard = document.querySelector('.record-card');
    const recNum = document.querySelector('.record-num');
    const spark = document.querySelector('.spark-line');
    const sparkDot = document.querySelector('.spark-dot');
    const included = document.querySelector('.included');
    const incRows = [...document.querySelectorAll('.included-row')];
    const layers = [...document.querySelectorAll('.layer')];

    /* sparkline prep */
    let sparkLen = 0;
    if (spark) {
      sparkLen = spark.getTotalLength ? spark.getTotalLength() : 240;
      spark.style.strokeDasharray = sparkLen;
      spark.style.strokeDashoffset = sparkLen;
    }

    /* ---------- layout the headline over the town ---------- */
    const portraitQ = window.matchMedia(NW.config.portraitStory);
    const layoutHero = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const span = heroLine.querySelector('span');
      const portrait = portraitQ.matches;
      if (W <= 820) {
        /* phone layout: the stylesheet places the copy */
        heroCopy.style.removeProperty('--hero-fs');
        heroCopy.style.removeProperty('top');
        heroChip.style.display = '';
        front.style.display = 'none';
        return;
      }
      /* the town cut-out belongs to the 16:9 picture only */
      front.style.display = portrait ? 'none' : '';
      const fit = (fs) => {
        // measure and shrink if the line would run past 92% of the screen
        span.style.fontSize = fs + 'px';
        const lineW = span.getBoundingClientRect().width;
        const maxW = W * 0.92;
        return lineW > maxW ? fs * (maxW / lineW) : fs;
      };
      const headerRoom = 74;                 // the fixed nav
      if (portrait) {
        /* a tall screen: the 9:16 picture has open sky in its top third */
        const fs = fit(Math.min(176, 0.11 * W));
        heroCopy.style.setProperty('--hero-fs', fs + 'px');
        heroCopy.style.top = Math.max(headerRoom + 16, H * 0.12) + 'px';
        return;
      }
      const bw = W * 1.06;
      const bh = H * 1.07;
      const k = Math.max(bw / 2560, bh / 1440);
      const ridgeY = -0.04 * H + (bh - 1440 * k) / 2 + 0.46 * 1440 * k;
      const fs = fit(Math.min(176, 0.11 * W, 132 * k));
      heroCopy.style.setProperty('--hero-fs', fs + 'px');
      /* measure the block with the sizes applied, then put its baseline on the ridge */
      const block = heroCopy.getBoundingClientRect();
      const blockTop = ridgeY + 0.3 * fs - (block.height || fs * 2.4);
      heroCopy.style.top = Math.max(headerRoom, Math.min(blockTop, H * .34)) + 'px';
    };
    layoutHero();
    window.addEventListener('resize', layoutHero, { passive: true });
    if (portraitQ.addEventListener) portraitQ.addEventListener('change', layoutHero);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutHero);

    requestAnimationFrame(() => heroLine.querySelector('span').classList.add('is-in'));

    /* ---------- pointer drift (mouse only) ---------- */
    let mx = 0, my = 0, sx = 0, sy = 0;
    const fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    if (fine && !rm) {
      window.addEventListener('pointermove', (e) => {
        mx = e.clientX / window.innerWidth - .5;
        my = e.clientY / window.innerHeight - .5;
      }, { passive: true });
    }

    /* ---------- loop state ---------- */
    let p = 0, sp = 0, last = performance.now(), running = true, settling = false;
    let prevP = -1, movedAt = 0;      // when the scroll position last changed
    let lastDrawn = -1;
    let lastCam = '';
    let plateDone = false;
    let idle = false;
    const lastWrite = new Map();
    const set = (el, prop, val, unit = '') => {
      const key = prop;
      const v = val + unit;
      if (lastWrite.get(el)?.get(key) === v) return;
      if (!lastWrite.has(el)) lastWrite.set(el, new Map());
      lastWrite.get(el).set(key, v);
      if (unit) el.style.setProperty(prop, v);
      else el.style[prop] = v;
    };

    const near = () => {
      const r = story.getBoundingClientRect();
      return r.bottom > -window.innerHeight * 0.8 && r.top < window.innerHeight * 1.2;
    };

    const frame = (now) => {
      if (NW.smoothScroll && NW.smoothScroll.sync) NW.smoothScroll.sync(now);
      const visible = near();
      if (!visible && !settling) { running = false; return; }
      const dt = rm ? 16.7 : Math.min(64, now - last);
      last = now;
      const H = window.innerHeight;
      const total = story.offsetHeight - H;
      p = clamp(-story.getBoundingClientRect().top / Math.max(1, total));
      /* exact: the picture follows the scroll position itself, with no extra easing
         (the wheel glide in smooth-scroll.js and touch momentum already make the
         position smooth, and a second ease made the picture trail the page) */
      sp = p;
      if (Math.abs(p - prevP) > 1e-5) { prevP = p; movedAt = now; }
      /* glass panels blur what is behind them only once the scroll has come to rest
         (a live backdrop blur over a moving picture costs too much while scrolling) */
      const still = now - movedAt > 180;
      /* pointer drift eased by time, not per frame, so it feels the same at 60 and 120 Hz */
      const kd = 1 - Math.pow(0.94, dt / 16.7);
      sx += ((rm ? 0 : mx) - sx) * kd;
      sy += ((rm ? 0 : my) - sy) * kd;

      /* frames */
      const vp = glide(seg(sp, .10, .50));
      const count = player.count || 121;
      /* fractional on purpose: the player crossfades the two neighbouring frames,
         so the picture glides instead of stepping one frame at a time */
      const frameNo = vp * (count - 1);
      if (Math.abs(frameNo - lastDrawn) > 0.002) {
        lastDrawn = frameNo;
        if (player.ready() || sp > .06) player.want(frameNo);
      }

      /* camera */
      const camT = `translate3d(${(-sx * 18).toFixed(1)}px, ${(-sy * 12).toFixed(1)}px, 0) ` +
        `scale(${(1 + .02 * (1 - vp)).toFixed(3)})`;
      if (camT !== lastCam) { lastCam = camT; cams.forEach((c) => set(c, 'transform', camT)); }

      /* hand-off from the plate to frame 0. The canvas is already showing frame 0
         underneath, so the dissolve is free; we only drop the plate once it is invisible */
      const ho = player.ready() ? seg(sp, .06, .105) : 0;
      if (plate) {
        set(plate, 'opacity', 1 - ho);
        const done = ho >= 1;
        if (done !== plateDone) {
          plateDone = done;
          plate.classList.toggle('is-done', done);
          plate.style.visibility = done ? 'hidden' : 'visible';
        }
      }
      if (front) {
        set(front, 'opacity', 1 - ho);
        front.style.visibility = ho >= 1 ? 'hidden' : 'visible';
      }

      /* hero copy + badge */
      const h = seg(sp, .02, .10);
      /* fade and rise; no blur on text (half-blurred words read as a glitch) */
      set(heroCopy, 'transform', `translate3d(${(-sx * 10).toFixed(1)}px, ${(-h * 50 - sy * 6).toFixed(1)}px, 0)`);
      set(heroCopy, 'opacity', 1 - ease(h));
      heroChip.style.display = h > 0.9 ? 'none' : '';
      if (badge) {
        const bo = 1 - seg(sp, .02, .08);
        set(badge, 'transform', `translate3d(${(sx * 26).toFixed(1)}px, ${(sy * 18 - h * 40).toFixed(1)}px, 0)`);
        set(badge, 'opacity', bo);
      }
      const fade = 1 - seg(sp, .01, .05);
      if (caption) set(caption, 'opacity', fade);
      if (hint) set(hint, 'opacity', fade);

      /* floating objects fly past */
      const fp = seg(sp, .02, .22);
      const fe = fp * fp;
      floats.forEach((f, i) => {
        const d = f.depth;
        const tx = f.x * fp * 70 + sx * -24 * d;
        const ty = f.y * fp * 60 + sy * -16 * d;
        set(f.el, 'transform',
          `translate3d(${tx.toFixed(1)}vw, ${ty.toFixed(1)}vh, 0) rotate(${(fp * 30).toFixed(1)}deg) ` +
          `scale(${(1 + fe * 1.6 * d).toFixed(3)})`);
        /* no blur on these: they are large scaled images, and re-blurring them every
           frame cost more than it added; scale and speed already read as depth */
        f.el.style.opacity = fp >= 1 ? '0' : '1';
        f.el.style.visibility = fp >= 1 ? 'hidden' : 'visible';
      });

      /* layer visibility so hidden controls are never focusable.
         Each layer's own fade decides when it hides; h alone would hide L0 on load. */
      layers.forEach((l) => {
        const key = l.dataset.layer;
        let hidden = false;
        if (key === 'l0') hidden = h >= 0.98;
        else if (key === 'l1') hidden = fade <= 0.001;
        else if (key === 'l2') hidden = sp >= .42 || sp < .155;
        else if (key === 'l3') hidden = sp >= .685 || sp < .445;
        else if (key === 'l4') hidden = sp < .695;
        l.classList.toggle('is-hidden', hidden);
      });

      /* promise: a light card, so the words never sit on the moving picture. It comes
         up from below and leaves through the top like page content, fully opaque the
         whole time, so there is never half-faded text left over the picture */
      const vh = window.innerHeight;
      const vIn = seg(sp, .155, .215);
      const vOut = seg(sp, .355, .395);
      const pIn = ease(vIn), pOut = vOut * vOut;              // leaves gently, then quickly
      set(promise, 'opacity', (clamp(vIn * 4) * (1 - clamp((vOut - .75) * 4))).toFixed(3));
      if (sp < .44) {
        promiseInner.style.transform =
          `translate3d(0, ${((1 - pIn) * vh * .32 - pOut * vh * .85).toFixed(1)}px, 0)`;
        promiseWords.forEach((w, i) => {
          const k = ease(clamp((vIn - .3 - i * .05) / .3));
          w.style.transform = `translate3d(0, ${((1 - k) * 12).toFixed(1)}px, 0)`;
          w.style.opacity = k.toFixed(3);
        });
        promiseP.style.opacity = ease(clamp((vIn - .6) / .35)).toFixed(3);
      }

      /* moving day: the same, a card that rises in and scrolls away; its words light up
         one after another, quickly */
      const aIn = seg(sp, .45, .53);
      const aOut = seg(sp, .635, .675);
      if (sp > .43 && sp < .70) {
        mdWords.forEach((w, i) => {
          const k = clamp(aIn * 3.2 - .5 - (i / mdWords.length) * 1.2);
          w.style.opacity = (.3 + .7 * k).toFixed(3);
        });
        const mIn = ease(aIn), mOut = aOut * aOut;
        glass.style.transform = `translate3d(0, ${((1 - mIn) * vh * .22 - mOut * vh * .6).toFixed(1)}px, 0)`;
      }
      glass.style.opacity = (clamp(aIn * 4) * (1 - clamp((aOut - .75) * 4))).toFixed(3);
      glass.classList.toggle('is-still', still && aIn > .8 && aOut < .1);
      hots.forEach((el, i) => {
        const k = seg(sp, .49 + i * .02, .53 + i * .02);
        el.style.transform = `translate3d(${(sx * -30).toFixed(1)}px, ${(sy * -20).toFixed(1)}px, 0) scale(${(k * (1 - aOut)).toFixed(3)})`;
      });

      /* track record */
      const sIn = seg(sp, .72, .82);
      if (recHead) {
        recHead.style.opacity = sIn.toFixed(3);
        recHead.style.transform = `translate3d(0, ${((1 - sIn) * 30).toFixed(1)}px, 0)`;

      }
      const cIn = ease(seg(sp, .74, .86));
      if (recCard) {
        /* blurring the backdrop under a moving card is the single most expensive paint
           on this beat; switch it on only once the card has stopped travelling */
        recCard.classList.toggle('is-still', still && cIn >= .999);
        recCard.style.opacity = cIn.toFixed(3);
        recCard.style.transform =
          `perspective(900px) translate3d(${(sx * -14).toFixed(1)}px, ${((1 - cIn) * 60 + sy * -10).toFixed(1)}px, 0) ` +
          `rotateY(${(sx * 8).toFixed(2)}deg) rotateX(${(-sy * 8).toFixed(2)}deg)`;
      }

      if (spark) spark.style.strokeDashoffset = (sparkLen * (1 - seg(sp, .77, .92))).toFixed(1);
      if (sparkDot) {
        const sk = seg(sp, .77, .92);
        sparkDot.style.opacity = sk > .9 ? '1' : String(sk);
      }
      /* the glass list arrives just ahead of its rows, so it is never an empty box */
      if (included) {
        const k = ease(seg(sp, .735, .79));
        set(included, 'opacity', k.toFixed(3));
        set(included, 'transform', `translate3d(${((1 - k) * 40).toFixed(1)}px, 0, 0)`);
      }
      incRows.forEach((row, i) => {
        const k = ease(seg(sp, .765 + i * .022, .815 + i * .022));
        row.style.opacity = k.toFixed(3);
        row.style.transform = `translate3d(${((1 - k) * 40).toFixed(1)}px, 0, 0)`;
        row.classList.toggle('on', k > .8);
      });

      /* progress bar */
      if (bar) {
        bar.style.transform = `scaleX(${sp.toFixed(4)})`;
        bar.classList.toggle('is-on', story.getBoundingClientRect().top < 0 && sp < .999);
      }

      settling = !still;               // keep drawing until the scroll has rested, to set is-still
      /* idle: hand the main thread back until the next scroll or the section leaving */
      if (!settling && !player.active && Math.abs(sx) < .001 && Math.abs(sy) < .001) {
        idle = true;
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    /* wake from idle on any scroll or pointer move */
    const wake = () => {
      if (!idle) return;
      idle = false;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    };
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('resize', wake, { passive: true });

    /* restart the loop when the story comes back into view */
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !running) {
          running = true;
          last = performance.now();
          requestAnimationFrame(frame);
        }
      });
    }, { threshold: 0 });
    io.observe(story);

    /* hotspot placement. data-desktop / data-mobile hold points on the final still
       (percent of its width, height), so they stay on the van, the boxes and the door
       on any screen shape: we apply the same cover fit, camera inset and end-frame
       zoom that the canvas uses. Near the right edge the label opens to the left. */
    const camEl = canvas.closest('.cam');
    const placeHots = () => {
      if (!player.set || !camEl) return;
      const sw = player.set.width;
      const sh = player.set.height;
      /* per set: the phone frames are measured on their own final frame (endScale 1) */
    const end = (player.set && player.set.endScale) || (player.man && player.man.endScale) || 1;
      const cw = camEl.offsetWidth;
      const ch = camEl.offsetHeight;
      const k = Math.max(cw / sw, ch / sh) * end;
      const cx = camEl.offsetLeft + cw / 2;
      const cy = camEl.offsetTop + ch / 2;
      const W = stage.clientWidth;
      const Hs = stage.clientHeight;
      const navH = (document.getElementById('nav') || {}).offsetHeight || 70;
      /* the moving-day card, untransformed, with a little air around it */
      const md = document.querySelector('.moving-day');
      const card = md && md.offsetWidth ? {
        l: md.offsetLeft - 8, t: md.offsetTop - 8,
        r: md.offsetLeft + md.offsetWidth + 8, b: md.offsetTop + md.offsetHeight + 8,
      } : null;
      const placed = [];                     // label boxes already on screen
      const hit = (a, b) => a.r > b.l && a.l < b.r && a.b > b.t && a.t < b.b;
      hots.forEach((el) => {
        const [ix, iy] = (player.usingMobile ? el.dataset.mobile : el.dataset.desktop)
          .split(',').map(parseFloat);
        const x = cx + (ix / 100 - .5) * sw * k;
        const y = cy + (iy / 100 - .5) * sh * k;
        let flip = x > W * .62;
        el.classList.toggle('flip', flip);
        el.style.setProperty('--hx', (x - 12).toFixed(1) + 'px');
        el.style.setProperty('--hr', (W - x - 12).toFixed(1) + 'px');
        el.style.setProperty('--hy', (y - 22).toFixed(1) + 'px');
        /* a hotspot whose point is off the visible picture (the crop differs by screen
           shape) or that would sit under the card stays hidden rather than half shown */
        el.classList.remove('is-off');       // measurable again
        const lab = el.querySelector('.hot-label');
        const lw = 24 + 8 + (lab ? lab.offsetWidth : 90) + 6;   // dot, gap, resting label
        const box = (f) => ({ l: f ? x - lw : x - 14, r: f ? x + 14 : x + lw, t: y - 20, b: y + 20 });
        let b = box(flip);
        /* two labels would collide (narrow phones): open this one the other way */
        if (placed.some((p) => hit(b, p))) {
          const other = box(!flip);
          if (!placed.some((p) => hit(other, p)) && other.l > 8 && other.r < W - 8) {
            flip = !flip;
            b = other;
            el.classList.toggle('flip', flip);
          }
        }
        const off = x < 16 || x > W - 16 || y < navH + 10 || y > Hs - 24;
        const under = !!card && hit(b, card);
        const clash = placed.some((p) => hit(b, p));
        const hide = off || under || clash;
        el.classList.toggle('is-off', hide);
        if (!hide) placed.push(b);
      });
    };
    player.loaded.then(placeHots);
    window.addEventListener('resize', placeHots, { passive: true });
    canvas.addEventListener('framesetchange', placeHots);   // rotated: other frame set

    /* the glide: steady speed in the middle, gentle start and stop
       (trapezoid velocity), so frames never rush past three times faster
       in the middle of the story */
    /* hotspots: one open at a time, click toggles */
    hots.forEach((el) => {
      el.addEventListener('click', () => {
        const on = el.classList.contains('on');
        hots.forEach((o) => { o.classList.remove('on'); o.setAttribute('aria-expanded', 'false'); });
        if (!on) { el.classList.add('on'); el.setAttribute('aria-expanded', 'true'); }
      });
    });
  }

  NW.initStory = initStory;
})(window.Sunrise = window.Sunrise || {});
