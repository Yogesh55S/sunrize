/* config.js — owner details, the domain lock and the box-stack settings. */

(function (NW) {
  'use strict';

  const config = {
    owner: 'Sunrise Transit Limited',
    // Screens that get the portrait (9:16) story: phones, portrait tablets and portrait
    // monitors. The same query is in css/layout.css, index.html and the hero manifest.
    portraitStory: '(orientation: portrait) and (max-aspect-ratio: 5/6)',
    // Domain lock: add the live domain before launch, e.g. ['sunrisetransit.co.uk'].
    // While the list is empty the lock is off. Subdomains (www.) are accepted, and it
    // never locks localhost, private network addresses or the page opened from a folder.
    hosts: [],
    // Also allow hosting previews, e.g. ['.vercel.app', '.netlify.app'] (optional).
    previewHosts: [],
    url: 'https://www.sunrisetransit.co.uk',
    email: 'info@sunrisetransit.co.uk',
    phone: '+44 (0)000 000 0000',          // placeholder from the supplied site: replace before launch
    phoneHref: 'tel:+440000000000',
    // Where the quote and review forms post to (multipart, HTTPS), e.g. a Formspree URL.
    // Empty: the forms open the visitor's email app with their answers filled in instead.
    formEndpoint: '',

    // Box-stack frames for each answer to "roughly how many boxes or bags?" on the home
    // page (the stack sequence has 48 frames), and the label shown on the picture.
    stackTargets: [0, 6, 14, 24, 34, 47],
    stackLabels: ['No boxes', '1–10 boxes', '11–25 boxes', '26–50 boxes', '51–100 boxes', '100+ boxes'],
    boxValues: ['none', '1-10', '11-25', '26-50', '51-100', '100+'],
  };

  NW.config = config;
})(window.Sunrise = window.Sunrise || {});
