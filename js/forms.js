/* forms.js — shared sending for the quote and review forms.

   Going live: set NW.config.formEndpoint (in js/config.js) to a form service that accepts
   a multipart POST over HTTPS (for example Formspree or your own server). Until then the
   forms still reach you: they open the visitor's email app with every answer written
   into a message to the business address (photos can't ride along on that route, so
   the visitor is asked to attach them or send them by WhatsApp). */

(function (NW) {
  'use strict';

  /* every answer as "Label: value" lines, in form order, for the email fallback */
  const summary = (form) => {
    const lines = [];
    const seen = new Set();
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name || el.name === 'company' || el.type === 'file' || seen.has(el.name)) return;
      const group = form.querySelectorAll(`[name="${el.name}"]`);
      let value;
      if (el.type === 'checkbox' || el.type === 'radio') {
        seen.add(el.name);
        value = [...group].filter((g) => g.checked).map((g) => g.value).join(', ');
      } else if (el.tagName === 'SELECT') {
        value = el.value ? el.options[el.selectedIndex].text : '';
      } else {
        value = el.value.trim();
      }
      if (!value) return;
      /* a group (stars, ticks, choices) is named by its group label or legend */
      const grouped = el.type === 'checkbox' || el.type === 'radio';
      const id = !grouped && el.id && form.querySelector(`label[for="${el.id}"]`);
      let label = id ? id.textContent : '';
      if (!label) {
        const legend = el.closest('fieldset') && el.closest('fieldset').querySelector('legend');
        const aria = el.closest('[aria-labelledby]');
        label = (aria && document.getElementById(aria.getAttribute('aria-labelledby')) || {}).textContent ||
          (legend && legend.textContent) || el.name;
      }
      label = label.replace('*', '').replace(/\s+/g, ' ').trim();
      if (el.name === 'consent') { label = 'Consent'; value = 'Yes'; }
      lines.push(`${label}: ${value}`);
    });
    return lines.join('\n');
  };

  /* send: POST to the endpoint, or fall back to an email draft. Resolves with
     'sent' or 'email'. */
  const send = async (form, subject) => {
    const endpoint = NW.config && NW.config.formEndpoint;
    if (endpoint) {
      const data = new FormData(form);
      data.append('_subject', subject);
      const res = await fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('send failed');
      return 'sent';
    }
    const to = (NW.config && NW.config.email) || 'info@sunrisetransit.co.uk';
    const body = summary(form);
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return 'email';
  };

  /* standard field check: marks the first problem, writes a short message under it */
  const check = (scope) => {
    let ok = true;
    scope.querySelectorAll('.err-msg').forEach((m) => m.remove());
    scope.querySelectorAll('.is-bad').forEach((f) => f.classList.remove('is-bad'));
    const done = new Set();
    scope.querySelectorAll('[required]').forEach((f) => {
      if (done.has(f.name)) return;
      done.add(f.name);
      if (f.checkValidity()) return;
      ok = false;
      const host = f.type === 'radio' ? f.closest('fieldset') : (f.type === 'checkbox' ? f.closest('label') : f);
      host.classList.add('is-bad');
      const msg = document.createElement('p');
      msg.className = 'err-msg';
      msg.textContent = f.type === 'radio' ? 'Please choose one.'
        : f.type === 'checkbox' ? 'Please tick this box to continue.'
        : f.validity.typeMismatch ? `Please enter a valid ${f.type === 'email' ? 'email address' : f.type}.`
        : 'This field is required.';
      (f.type === 'radio' ? host : host.closest('.form-col') || host).append(msg);
    });
    const first = scope.querySelector('.is-bad');
    if (first) {
      const target = first.matches('input, select, textarea') ? first : first.querySelector('input');
      if (target) target.focus({ preventScroll: true });
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return ok;
  };

  /* clear a field's error as soon as it is fixed */
  const liveClear = (form) => {
    form.addEventListener('input', (e) => {
      const f = e.target;
      if (!f.checkValidity || !f.checkValidity()) return;
      const host = f.type === 'radio' ? f.closest('fieldset') : (f.type === 'checkbox' ? f.closest('label') : f);
      if (!host) return;
      host.classList.remove('is-bad');
      const col = f.type === 'radio' ? host : host.closest('.form-col') || host;
      const m = col.querySelector('.err-msg');
      if (m) m.remove();
    });
  };

  NW.forms = { send, check, liveClear, summary };
})(window.Sunrise = window.Sunrise || {});
