/* service-ring.js — the 3D services ring on the home page.
   Ten bodies in a ring, critically damped spring, autoplay every 5s, drag + fling,
   arrow keys, click-to-front, a light sweep on each change and a detail panel. */

(function (NW) {
  'use strict';

  const { reducedMotion } = NW;

  /* the five services, as on services.html (key = the quote form's service value) */
  const SERVICES = [
    {
      key: 'house',
      anchor: 'house',
      name: 'House removals',
      line: 'Part of a home or all of it',
      includes: ['full or partial moves', 'furniture handled with care', 'loading and unloading'],
    },
    {
      key: 'flat',
      anchor: 'flat',
      name: 'Flat and apartment removals',
      line: 'Stairs, lifts and tight corners',
      includes: ['any floor', 'narrow entrances', 'one room or the whole flat'],
    },
    {
      key: 'office',
      anchor: 'office',
      name: 'Office and business removals',
      line: 'Moved without stopping your work',
      includes: ['desks and chairs', 'boxed equipment', 'evenings and weekends'],
    },
    {
      key: 'courier',
      anchor: 'courier',
      name: 'Courier and delivery',
      line: 'Collected and delivered around the clock',
      includes: ['same-day or scheduled', 'parcels and documents', 'bulky items'],
    },
    {
      key: 'manvan',
      anchor: 'man-and-van',
      name: 'Man and van',
      line: 'Smaller loads and single items',
      includes: ['single pieces', 'part loads', 'flexible timing'],
    },
  ];

  function initServiceRing(onQuote) {
    const stage = document.getElementById('ring-stage');
    const panel = document.getElementById('ring-panel');
    const ticks = [...document.querySelectorAll('.tick')];
    const btnPrev = document.getElementById('ring-prev');
    const btnNext = document.getElementById('ring-next');
    const btnPause = document.getElementById('ring-pause');
    const sweep = document.querySelector('.ring-sweep');
    const stageWrap = document.querySelector('.ring-stage-wrap');
    if (sweep && stageWrap) stageWrap.append(sweep);
    if (!stage || !panel) return;

    const rm = reducedMotion();
    const N = 10;

    /* panel */
    panel.innerHTML = SERVICES.map((s, i) => `
      <div class="ring-slide${i === 0 ? ' is-on' : ''}" data-i="${i}">
        <h3 class="ring-name">${s.name}</h3>
        <p class="ring-line">${s.line}</p>
        <div class="ring-chips">${s.includes.map((c) => `<span>${c}</span>`).join('')}</div>
        <a class="ring-more" href="services.html#${s.anchor}">More about ${s.name.toLowerCase()} <span aria-hidden="true">→</span></a>
        <button class="btn btn-primary" data-quote="${s.key}">Get a quote</button>
      </div>`).join('');
    const slides = [...panel.querySelectorAll('.ring-slide')];

    /* bodies */
    const bodies = [];
    const imgs = SERVICES.map((s, i) => `assets/img/service-${i + 1}.webp`);
    for (let a = 0; a < N; a++) {
      const fig = document.createElement('figure');
      fig.className = 'ring-body';
      const img = document.createElement('img');
      img.src = imgs[a % 5];
      img.alt = a < 5 ? SERVICES[a].name : '';
      img.width = 1000; img.height = 1000;
      img.loading = 'lazy';
      fig.append(img);
      const sh = document.createElement('div');
      sh.className = 'ring-shadow';
      fig.append(sh);
      stage.append(fig);
      bodies.push(fig);
    }

    let target = 0;
    let cur = rm ? 0 : -1.15;
    let vel = 0;
    let W = 0, H = 0;
    let autoplay = !rm;
    let stopped = false;
    let hovered = false;
    let dragging = false;
    const started = { v: false };

    const measure = () => {
      const r = stage.getBoundingClientRect();
      W = r.width; H = r.height;
      const size = Math.max(140, Math.round(H * (W < 700 ? .48 : .52)));
      bodies.forEach((b) => { b.style.width = size + 'px'; b.style.height = size + 'px'; });
      layout();
    };

    const layout = () => {
      const phone = W < 700;
      const cx = .5 * W;
      const R = (phone ? .72 : .62) * W;
      const P = (phone ? 1.9 : 1.65) * W;
      const floor = H - 40;
      const horizon = .38 * H;
      const step = (2 * Math.PI) / N;
      /* the front object should stand about 46% of the stage height */
      bodies.forEach((b, a) => {
        let phi = ((a - cur) * step) % (2 * Math.PI);
        if (phi <= -Math.PI) phi += 2 * Math.PI;
        if (phi > Math.PI) phi -= 2 * Math.PI;
        const z = R * (1 - Math.cos(phi));
        const persp = P / (P + z);
        const sl = Math.abs(phi) / step;
        const scale = persp * (1 + .08 * Math.max(0, Math.min(1, 1 - sl)));
        const x = cx + R * Math.sin(phi) * persp;
        const feet = horizon + (floor - horizon) * persp;
        const bottom = H - feet;
        /* blur in quarter-pixel steps: every change re-rasterises a large image, so a
           value that changes by 0.01px each frame makes the ring stutter while it turns */
        const blur = Math.round((sl <= 1 ? 1.8 * sl : Math.min(1.8 + (sl - 1) * 2, 6.5)) * 4) / 4;
        const opacity = Math.max(0, Math.min(1, (Math.cos(phi) + .55) / .3));
        b.style.transform = `translate3d(${x.toFixed(1)}px, ${-bottom.toFixed(1)}px, 0) translateX(-50%) scale(${scale.toFixed(4)})`;
        if (blur > 0) {
          if (b.dataset.blur !== blur.toFixed(2)) {
            b.style.filter = `blur(${blur.toFixed(2)}px)`;
            b.dataset.blur = blur.toFixed(2);
          }
        } else if (b.dataset.blur) {
          b.style.filter = '';
          delete b.dataset.blur;
        }
        b.style.opacity = opacity.toFixed(3);
        const zi = String(Math.round(scale * 1000));
        if (b.style.zIndex !== zi) b.style.zIndex = zi;
        b.style.visibility = opacity < .01 ? 'hidden' : 'visible';
        b.dataset.index = String(a);
      });
    };

    /* spring */
    let raf = 0, lastT = 0;
    const tick = (now) => {
      const dt = Math.min(.034, (now - (lastT || now)) / 1000);
      lastT = now;
      if (!rm) {
        const K = 95, C = 2 * Math.sqrt(K);
        for (let i = 0; i < 3; i++) {
          const h = dt / 3;
          const acc = -K * (cur - target) - C * vel;
          vel += acc * h;
          cur += vel * h;
        }
        if (Math.abs(cur - target) < .0005 && Math.abs(vel) < .0005) { cur = target; vel = 0; }
      } else { cur = target; }
      layout();
      if (Math.abs(cur - target) > .0004 || vel !== 0) raf = requestAnimationFrame(tick);
      else raf = 0;
    };
    const wake = () => { if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); } };

    const setActive = (animate = true) => {
      const i = ((Math.round(target) % 5) + 5) % 5;
      slides.forEach((s, k) => s.classList.toggle('is-on', k === i));
      ticks.forEach((t, k) => t.classList.toggle('is-on', k === i));
      if (sweep && animate) {
        sweep.classList.remove('is-run');
        void sweep.offsetWidth;
        sweep.classList.add('is-run');
      }
    };

    const go = (n, animate = true) => {
      target = n;
      wake();
      setActive(animate);
    };

    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      if (!autoplay || stopped || rm) return;
      timer = setTimeout(() => {
        if (!hovered && !dragging && !document.hidden && !stopped) {
          target = Math.round(target) + 1;
          wake();
          setActive();
        }
        schedule();
      }, 5000);
    };

    /* controls */
    btnPrev && btnPrev.addEventListener('click', () => { go(Math.round(target) - 1); schedule(); });
    btnNext && btnNext.addEventListener('click', () => { go(Math.round(target) + 1); schedule(); });
    btnPause && btnPause.addEventListener('click', () => {
      autoplay = !autoplay;
      btnPause.setAttribute('aria-pressed', String(!autoplay));
      btnPause.textContent = autoplay ? 'Pause autoplay' : 'Play autoplay';
      clearTimeout(timer);
      if (autoplay) schedule();
    });
    ticks.forEach((t, i) => t.addEventListener('click', () => { go(i); schedule(); }));

    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quote]');
      if (!btn) return;
      stopped = true;
      clearTimeout(timer);
      onQuote && onQuote(btn.dataset.quote);
    });

    /* drag + fling */
    let startX = 0, startY = 0, startTarget = 0, lastX = 0, lastV = 0, lastTime = 0, axis = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = lastX = e.clientX; startY = e.clientY;
      startTarget = target; axis = null; lastV = 0; lastTime = performance.now();
      dragging = true;
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (axis === null) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > 1.2 * Math.abs(dy)) axis = 'x';
        else if (Math.abs(dy) > 8) { axis = 'y'; }
      }
      if (axis !== 'x') return;
      const unit = Math.max(120, .3 * W);
      const now = performance.now();
      if (now - lastTime > 0) lastV = (e.clientX - lastX) / (now - lastTime);
      lastX = e.clientX; lastTime = now;
      target = startTarget - dx / unit;
      wake();
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (axis === 'x') {
        const unit = Math.max(120, .3 * W);
        const fling = Math.round(target - (lastV * 160) / unit);
        const clampTo = Math.max(Math.round(startTarget) - 2, Math.min(Math.round(startTarget) + 2, fling));
        go(clampTo);
      }
      schedule();
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', endDrag);

    stage.addEventListener('click', (e) => {
      const b = e.target.closest('.ring-body');
      if (!b) return;
      const i = Number(b.dataset.index);
      if (!Number.isNaN(i)) go(i);
    });

    stage.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.round(target) - 1); schedule(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.round(target) + 1); schedule(); }
    });

    stage.addEventListener('pointerenter', () => { hovered = true; });
    stage.addEventListener('pointerleave', () => { hovered = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else schedule(); });

    window.addEventListener('resize', measure, { passive: true });

    /* entrance: turn into place when the stage is 22% into view */
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && !started.v) {
          started.v = true;
          measure();
          target = 0;
          wake();
          setActive(false);
          schedule();
        }
      });
    }, { threshold: .45 });
    io.observe(stage);

    /* the ring also wakes if it is already in view on load */
    const bootCheck = () => {
      const r = stage.getBoundingClientRect();
      if (r.top < innerHeight * .78 && r.bottom > innerHeight * .22 && !started.v) {
        started.v = true; measure(); target = 0; wake(); setActive(false); schedule();
      }
    };
    window.addEventListener('scroll', bootCheck, { passive: true, once: true });

    measure();
    layout();
  }

  NW.initServiceRing = initServiceRing;
})(window.Sunrise = window.Sunrise || {});
