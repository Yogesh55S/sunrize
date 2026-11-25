/* ui.js — nav, mobile menu, tilt cards, FAQ, reveals, the closing loop player,
   the phone bottom bar and the footer year. Shared by every page. */

(function (NW) {
  'use strict';

  const { makePlayer, reducedMotion } = NW;

  const rm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const easeIO = (t) => Math.max(0, t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function initUI() {
    /* ---------- the year in the footer ---------- */
    document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

    /* ---------- nav ---------- */
    const nav = document.getElementById('nav');
    const burger = document.getElementById('nav-burger');
    const menu = document.getElementById('nav-menu');
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (burger) {
      const close = () => { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); };
      burger.addEventListener('click', () => {
        const open = !nav.classList.contains('is-open');
        nav.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', String(open));
      });
      menu.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }

    /* smooth anchors */
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (id.length < 2) return;
        const el = document.querySelector(id);
        if (!el) return;
        e.preventDefault();
        const top = el.getBoundingClientRect().top + window.scrollY - 12;
        if (NW.smoothScroll && NW.smoothScroll.enabled) NW.smoothScroll.to(top);
        else window.scrollTo({ top, behavior: rm() ? 'auto' : 'smooth' });
      });
    });

    /* ---------- counts up: stats ---------- */
    const statVals = [...document.querySelectorAll('.stat b')];
    const runCount = (el) => {
      const to = Number(el.dataset.to);
      const suffix = el.dataset.suffix || '';
      if (rm()) { el.textContent = to.toLocaleString('en-GB') + suffix; return; }
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 1600);
        const v = Math.max(0, Math.round(to * easeIO(t)));
        el.textContent = v.toLocaleString('en-GB') + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const statGrid = document.querySelector('.stats');
    if (statGrid) {
      let ran = false;
      const fire = () => {
        if (ran) return;
        ran = true;
        statVals.forEach(runCount);
      };
      if (rm()) fire();
      /* the first time the top of the grid passes 60% of the screen height */
      const watch = () => {
        const top = statGrid.getBoundingClientRect().top;
        if (top < window.innerHeight * .62) {
          fire();
          window.removeEventListener('scroll', watch);
        }
      };
      window.addEventListener('scroll', watch, { passive: true });
      window.addEventListener('resize', watch, { passive: true });
      /* a light check while the page settles, so restored scroll positions still count up */
      let frames = 0;
      const settle = () => {
        watch();
        if (!ran && frames++ < 240) requestAnimationFrame(settle);
      };
      settle();
    }

    /* ---------- reveals ---------- */
    const revealIO = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
      });
    }, { threshold: .1, rootMargin: '0px 0px -5% 0px' });
    document.querySelectorAll('.reveal, .area-chips, .footer .reveal').forEach((el) => revealIO.observe(el));

    /* reviews open like doors */
    const cards = [...document.querySelectorAll('.review')];
    const cardIO = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        cards.forEach((c, i) => setTimeout(() => c.classList.add('is-in'), i * 90));
        cardIO.disconnect();
      });
    }, { threshold: .1 });
    if (cards.length) cardIO.observe(cards[0].parentElement);

    /* tilt on fine pointers. The pointer only sets a target; one frame loop eases the
       card toward it, so the tilt glides at the screen's refresh rate instead of
       stepping (and restarting a CSS transition) on every mouse event. The card's
       position is read from its untilted layout box, so the tilt never feeds back into
       itself, and the light moves by transform behind the text, so nothing repaints. */
    const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
    if (fine && !rm()) {
      cards.forEach((card) => {
        const glare = card.querySelector('.glare');
        const st = { tx: 0, ty: 0, x: 0, y: 0, gx: .5, gy: .5, tgx: .5, tgy: .5,
          left: 0, top: 0, w: 1, h: 1, dirty: true, over: false, raf: 0, last: 0 };
        const measure = () => {
          const parent = card.offsetParent || document.body;
          const pr = parent.getBoundingClientRect();
          st.left = pr.left + card.offsetLeft;
          st.top = pr.top + card.offsetTop;
          st.w = card.offsetWidth || 1;
          st.h = card.offsetHeight || 1;
          st.dirty = false;
        };
        const tick = (now) => {
          const dt = Math.min(48, now - (st.last || now));
          st.last = now;
          const k = 1 - Math.pow(1 - 0.14, dt / 16.7);
          st.x += (st.tx - st.x) * k;
          st.y += (st.ty - st.y) * k;
          st.gx += (st.tgx - st.gx) * k;
          st.gy += (st.tgy - st.gy) * k;
          card.style.transform =
            `perspective(900px) rotateX(${(-st.y * 7).toFixed(3)}deg) rotateY(${(st.x * 7).toFixed(3)}deg)`;
          if (glare) {
            glare.style.transform =
              `translate3d(${(st.gx * st.w).toFixed(1)}px, ${(st.gy * st.h).toFixed(1)}px, 0) translate(-50%, -50%)`;
          }
          const settling = Math.abs(st.tx - st.x) + Math.abs(st.ty - st.y) +
            Math.abs(st.tgx - st.gx) + Math.abs(st.tgy - st.gy) > 0.0006;
          if (settling || st.over) {
            st.raf = requestAnimationFrame(tick);
          } else {
            st.raf = 0;
            st.last = 0;
            /* back at rest: hand the card back to its stylesheet */
            card.classList.remove('is-tilting');
            card.style.transform = '';
          }
        };
        const run = () => { if (!st.raf) st.raf = requestAnimationFrame(tick); };
        card.addEventListener('pointerenter', () => {
          if (!card.classList.contains('is-in')) return;     // not revealed yet
          st.over = true;
          st.dirty = true;
          card.classList.add('is-tilting');
          run();
        });
        card.addEventListener('pointermove', (e) => {
          if (!st.over) return;
          if (st.dirty) measure();
          const x = Math.max(0, Math.min(1, (e.clientX - st.left) / st.w));
          const y = Math.max(0, Math.min(1, (e.clientY - st.top) / st.h));
          st.tx = x - .5;
          st.ty = y - .5;
          st.tgx = x;
          st.tgy = y;
          run();
        });
        card.addEventListener('pointerleave', () => {
          st.over = false;
          st.tx = 0;
          st.ty = 0;
          run();
        });
        window.addEventListener('scroll', () => { st.dirty = true; }, { passive: true });
        window.addEventListener('resize', () => { st.dirty = true; }, { passive: true });
      });
    }

    /* ---------- FAQ ---------- */
    document.querySelectorAll('.faq-item').forEach((item) => {
      const btn = item.querySelector('.faq-q');
      const panel = item.querySelector('.faq-a');
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        document.querySelectorAll('.faq-q').forEach((b) => {
          b.setAttribute('aria-expanded', 'false');
          b.closest('.faq-item').querySelector('.faq-a').classList.remove('is-open');
        });
        if (!open) {
          btn.setAttribute('aria-expanded', 'true');
          panel.classList.add('is-open');
        }
      });
    });

    /* ---------- phone bottom bar ---------- */
    const bar = document.getElementById('mobile-bar');
    if (bar) {
      /* home: after the opening screen, and out of the way at the quote starter;
         other pages: as soon as the reader scrolls a little */
      const quoteSec = document.getElementById('quote');
      const home = document.body.classList.contains('home');
      const sync = () => {
        const past = window.scrollY > (home ? window.innerHeight * .8 : 120);
        let atForm = false;
        if (quoteSec) {
          const qr = quoteSec.getBoundingClientRect();
          atForm = qr.top < window.innerHeight * .8 && qr.bottom > 80;
        }
        bar.classList.toggle('is-on', past && !atForm);
      };
      sync();
      window.addEventListener('scroll', sync, { passive: true });
    }

    /* ---------- closing loop ---------- */
    const loopCanvas = document.getElementById('loop-canvas');
    const loopBtn = document.getElementById('loop-btn');
    if (loopCanvas) {
      const player = makePlayer(loopCanvas, 'assets/frames/loop');
      let playing = false;
      let visible = false;
      const setBtn = () => {
        if (!loopBtn) return;
        loopBtn.setAttribute('aria-pressed', String(playing));
        loopBtn.textContent = playing ? 'Pause animation' : 'Play animation';
      };
      const start = () => { if (!playing && !rm()) { playing = true; player.play(16); setBtn(); } };
      const stop = () => { playing = false; player.pause(); setBtn(); };
      loopBtn && loopBtn.addEventListener('click', () => { playing ? stop() : start(); });
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => {
          visible = e.isIntersecting;
          if (visible && !rm()) start(); else stop();
        });
      }, { threshold: .25 });
      io.observe(loopCanvas);
      if (rm()) setBtn();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else if (visible) start();
      });
    }

    /* footer stands up into view */
    const footer = document.querySelector('.footer');
    if (footer) {
      const fio = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) { footer.classList.add('is-in'); fio.disconnect(); } });
      }, { threshold: .08 });
      fio.observe(footer);
    }
  }

  NW.initUI = initUI;
})(window.Sunrise = window.Sunrise || {});
