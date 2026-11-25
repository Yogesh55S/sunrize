/* protect.js — copy deterrents (section 24).
   These layers slow copying down and make copies easy to prove and remove.
   Nothing in a browser can stop a determined copier: screenshots, saved pages
   and JavaScript turned off all bypass this. Be honest about that in the README. */

(function (NW) {
  'use strict';

  const { config } = NW;

  function initProtect() {
    /* media only: no context menu or drag on images, canvases and video */
    const media = 'img, canvas, video';
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest(media)) e.preventDefault();
    });
    document.addEventListener('dragstart', (e) => {
      if (e.target.closest(media)) e.preventDefault();
    });

    /* domain lock. Off until config.hosts lists the live domain (placeholder .example
       names do not count). It never locks a local preview (localhost, 127.x, private
       network addresses, *.local, or the page opened from the folder), and it accepts
       subdomains of a listed host (www., staging., ...) plus any previewHosts suffix. */
    const host = location.hostname.toLowerCase();
    const hosts = (config.hosts || []).map((h) => String(h).toLowerCase().trim())
      .filter((h) => h && !/\.example$/.test(h));
    const local = !host || host === 'localhost' || host === '::1' || host === '[::1]' ||
      host.endsWith('.local') || host.endsWith('.localhost') ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    const preview = (config.previewHosts || []).some((suffix) => host.endsWith(String(suffix).toLowerCase()));
    const listed = hosts.some((h) => host === h || host.endsWith('.' + h));
    if (hosts.length && !local && !preview && !listed) {
      const main = document.getElementById('main');
      const note = document.createElement('div');
      note.className = 'lock';
      note.setAttribute('role', 'alert');
      note.innerHTML = 'This is an unauthorised copy. The original is at ' +
        `<a href="${config.url}" rel="noopener">${config.url.replace(/^https?:\/\//, '')}</a>`;
      document.body.append(note);
      if (main) { main.setAttribute('inert', ''); }
    }

    /* framed by another site (notice only; the server headers do the blocking) */
    try {
      /* only once the live domain is configured, like the lock above: before that,
         every preview tool that embeds the page would show the notice. On the live
         site the real protection is the frame-ancestors header in server/. */
      if (hosts.length && window.top !== window.self) {
        const note = document.createElement('div');
        note.className = 'lock';
        note.setAttribute('role', 'alert');
        note.innerHTML = `<a href="${config.url}" target="_blank" rel="noopener">Open the original site</a>`;
        document.addEventListener('DOMContentLoaded', () => document.body.append(note));
      }
    } catch (err) { /* cross-origin: same treatment */ }

    /* console notice */
    console.log('%c© Sunrise Transit Limited. Images, text and code are protected by copyright. ' +
      'They may not be copied or used to train AI models without permission.',
      'color:#00396e;font-weight:600');
    console.log('Unauthorised copies: ' + config.url);
  }

  NW.initProtect = initProtect;
})(window.Sunrise = window.Sunrise || {});
