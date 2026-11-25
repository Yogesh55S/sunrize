/* main.js — boots the modules in order. Nothing else to start. */

(function (NW) {
  'use strict';

  const { initStory, initServiceRing, initSteps, initQuote, initUI, initProtect,
    initQuoteForm, initReviews, initContact } = NW;

  const scrollToQuote = () => {
    const quote = document.getElementById('quote');
    if (!quote) return;
    const top = quote.getBoundingClientRect().top + window.scrollY - 12;
    if (NW.smoothScroll && NW.smoothScroll.enabled) { NW.smoothScroll.to(top); return; }
    const behave = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    window.scrollTo({ top, behavior: behave });
  };

  /* opened straight from the folder: browsers refuse font files there, so use the
     embedded copies (never requested on a web server) */
  if (location.protocol === 'file:') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/fonts-embedded.css';
    document.head.append(link);
  }

  /* each page loads only the modules it uses; run whichever are here */
  const run = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : null);

  const boot = () => {
    run(initUI);
    run(initStory);
    run(initSteps);

    const quote = run(initQuote);
    run(initServiceRing, (service) => {
      /* the ring's "Get a quote": preselect that service in the quote starter below */
      if (quote && quote.setService) { quote.setService(service); scrollToQuote(); }
      else window.location.href = 'quote.html?service=' + encodeURIComponent(service);
    });

    run(initQuoteForm);
    run(initReviews);
    run(initContact);
    run(initProtect);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Sunrise = window.Sunrise || {});
