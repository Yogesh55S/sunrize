/* steps.js — the pinned "Your move in 4 steps" section (section 14).
   Scrolls the S2 pack sequence and opens one step at a time. */

(function (NW) {
  'use strict';

  const { reducedMotion, makePlayer } = NW;

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function initSteps() {
    const sec = document.getElementById('steps');
    const canvas = document.getElementById('pack-canvas');
    const steps = [...document.querySelectorAll('.step')];
    const chip = document.getElementById('step-chip');
    if (!sec || !canvas) return;

    const player = makePlayer(canvas, 'assets/frames/pack');
    const rm = reducedMotion();
    const labels = ['Survey', 'Packing day', 'Moving day', 'Home'];
    let q = 0, sq = 0, last = performance.now(), running = false, looping = false;

    const frame = (now) => {
      if (NW.smoothScroll && NW.smoothScroll.sync) NW.smoothScroll.sync(now);
      last = now;
      const r = sec.getBoundingClientRect();
      q = clamp(-r.top / Math.max(1, sec.offsetHeight - window.innerHeight));
      /* exact: the box follows the scroll position itself (see story.js) */
      sq = q;
      const count = player.count || 72;
      /* fractional frame: the player crossfades neighbours, so the box glides */
      player.want(ease(seg(sq, .05, .95)) * (count - 1));

      const active = Math.min(3, Math.floor(q * 4));
      steps.forEach((s, i) => s.classList.toggle('is-on', i === active));
      if (chip && chip.dataset.i !== String(active)) {
        chip.dataset.i = String(active);
        chip.style.opacity = '0';
        setTimeout(() => { chip.textContent = labels[active]; chip.style.opacity = '1'; }, 150);
      }

      /* keep going only while the smoothed value is still catching up */
      if (running && Math.abs(q - sq) > .0004) requestAnimationFrame(frame);
      else looping = false;
    };
    const kick = () => {
      if (!running || looping) return;
      looping = true;
      last = performance.now();
      requestAnimationFrame(frame);
    };
    window.addEventListener('scroll', kick, { passive: true });

    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        running = e.isIntersecting;
        if (running) kick();
      });
    }, { threshold: 0 });
    io.observe(sec);
  }

  NW.initSteps = initSteps;
})(window.Sunrise = window.Sunrise || {});
