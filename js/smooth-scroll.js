/* smooth-scroll.js — glides the page on mouse wheels and trackpads.

   A mouse wheel moves a page in hard 100px jumps. Here a wheel tick only moves a
   target, and the page eases toward it every frame (the same idea as Lenis), so the
   scroll-driven animations get a continuous position instead of steps.
   Touch, keyboard, the scrollbar, find-in-page and anchor jumps stay native; the
   target simply follows them. Off for prefers-reduced-motion.

   NW.smoothScroll.to(y)   glide to a position (used by the in-page links)
   NW.smoothScroll.active  true while a glide is running
   NW.smoothScroll.sync(t) step the glide now (rAF time t) if it has not stepped this frame */

(function (NW) {
  'use strict';

  const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const LERP = 0.24;                         // share of the distance covered per 60 Hz frame:
                                             // a wheel tick settles in about 0.2 s, no long slide
  const st = { y: 0, target: 0, raf: 0, last: 0, ours: -1, at: -1 };
  const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  /* an inner element that can still scroll this way keeps the wheel */
  function innerScroller(el, dy) {
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
        if (dy < 0 && el.scrollTop > 0) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  /* one step of the glide. Each frame runs it once, whoever asks first: the scroll-driven
     scenes call sync(now) before they read the scroll position, so they always draw the
     position the page is shown at in this same frame (a frame late reads as lag) */
  function advance(now) {
    if (!api.active || now === st.at) return;
    st.at = now;
    const dt = Math.min(64, now - (st.last || now - 16.7));
    st.last = now;
    const k = 1 - Math.pow(1 - LERP, dt / 16.7);
    st.y += (st.target - st.y) * k;
    if (Math.abs(st.target - st.y) < 0.35) st.y = st.target;
    st.ours = st.y;
    window.scrollTo(0, st.y);
    if (st.y === st.target) {
      st.last = 0;
      api.active = false;
    }
  }

  function tick(now) {
    st.raf = 0;
    advance(now);
    if (api.active) st.raf = requestAnimationFrame(tick);
  }

  function run() {
    api.active = true;
    if (!st.raf) st.raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
    st.last = 0;
    api.active = false;
    st.y = st.target = window.scrollY;
  }

  function onWheel(e) {
    if (rm.matches || e.ctrlKey || e.defaultPrevented) return;      // pinch-zoom stays native
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;                                  // lines
    else if (e.deltaMode === 2) dy *= window.innerHeight;             // pages
    if (!dy || Math.abs(e.deltaX) > Math.abs(dy)) return;             // sideways gestures stay native
    if (innerScroller(e.target, dy)) return;
    if (document.documentElement.classList.contains('no-smooth')) return;
    e.preventDefault();
    if (!api.active) st.y = st.target = window.scrollY;
    st.target = Math.max(0, Math.min(maxY(), st.target + dy));
    run();
  }

  /* a jump we did not make (keyboard, scrollbar, anchor, find): follow it */
  function onScroll() {
    if (Math.abs(window.scrollY - st.ours) > 3) {
      if (api.active) stop();
      else st.y = st.target = window.scrollY;
    }
  }

  const api = {
    active: false,
    enabled: false,
    sync: advance,
    to(y) {
      if (rm.matches || !api.enabled) { window.scrollTo(0, y); return; }
      if (!api.active) st.y = window.scrollY;
      st.target = Math.max(0, Math.min(maxY(), y));
      st.ours = window.scrollY;
      run();
    },
  };
  NW.smoothScroll = api;

  /* only where there is a wheel or trackpad; touch screens keep their own momentum */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    api.enabled = true;
    st.y = st.target = st.ours = window.scrollY;
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { st.target = Math.min(st.target, maxY()); }, { passive: true });
  }
})(window.Sunrise = window.Sunrise || {});
