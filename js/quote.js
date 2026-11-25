/* quote.js — the quote starter on the home page and its growing box stack.
   Three quick answers (service, postcodes, roughly how many boxes); the stack of boxes
   grows with the answer, and "Continue" opens the full quote form with the answers
   filled in (quote.html reads them from the address). No prices are shown or invented. */

(function (NW) {
  'use strict';

  const { config, makePlayer, reducedMotion } = NW;

  function initQuote() {
    const form = document.getElementById('quote-form');
    const canvas = document.getElementById('stack-canvas');
    if (!form || !canvas) return null;

    const player = makePlayer(canvas, 'assets/frames/stack');
    const rm = reducedMotion();
    const chip = document.getElementById('boxes-chip');
    const serviceSel = form.querySelector('[name="service"]');

    const boxIndex = () => {
      const checked = form.querySelector('[name="boxes"]:checked');
      return Math.max(0, config.boxValues.indexOf(checked ? checked.value : '11-25'));
    };

    const updateStack = (idx) => {
      const targets = config.stackTargets;
      const i = Math.max(0, Math.min(targets.length - 1, idx));
      /* the targets are written for the 48-frame desktop set; the phone set has fewer
         frames, so scale them to whatever sequence actually loaded */
      const last = targets[targets.length - 1] || 1;
      const target = player.count ? (targets[i] / last) * (player.count - 1) : targets[i];
      if (chip) chip.textContent = config.stackLabels[i];
      if (rm || !player.count) { player.want(target); return; }
      player.glideTo(target, 700);
    };

    form.addEventListener('change', (e) => {
      if (e.target.name === 'boxes') updateStack(boxIndex());
    });

    /* first view: build the stack from nothing */
    updateStack(boxIndex());
    player.loaded.then(() => updateStack(boxIndex()));

    /* submit: carry the answers to quote.html in the address (empty ones left out,
       postcodes tidied). Done in script so it also works inside framed previews;
       without script the form's own GET does the same. */
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new URLSearchParams();
      new FormData(form).forEach((v, k) => {
        const val = String(v).trim();
        if (val) q.set(k, /^(from|to)$/.test(k) ? val.toUpperCase() : val);
      });
      const target = (form.getAttribute('action') || 'quote.html') + (q.toString() ? `?${q}` : '');
      window.location.href = target;
    });

    /* called by the services ring: preselect that service and come here */
    const setService = (key) => {
      if ([...serviceSel.options].some((o) => o.value === key)) serviceSel.value = key;
    };

    return { setService };
  }

  NW.initQuote = initQuote;
})(window.Sunrise = window.Sunrise || {});
