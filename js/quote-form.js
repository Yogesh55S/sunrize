/* quote-form.js — the four-step quote form on quote.html.
   Steps show one at a time; each is checked before moving on. Answers started on the
   home page (service, postcodes, boxes) arrive in the address and are filled in. */

(function (NW) {
  'use strict';

  function initQuoteForm() {
    const form = document.getElementById('qform');
    if (!form) return;
    const { forms } = NW;
    const panels = [...form.querySelectorAll('.qpanel')];
    const steps = [...document.querySelectorAll('#qsteps li')];
    const done = document.getElementById('qdone');
    let cur = 0;

    /* answers carried over from the home page or a service page */
    const q = new URLSearchParams(location.search);
    const fill = (name, value) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el && value && (el.tagName !== 'SELECT' || [...el.options].some((o) => o.value === value))) el.value = value;
    };
    fill('service', q.get('service'));
    fill('from_postcode', (q.get('from') || '').toUpperCase());
    fill('to_postcode', (q.get('to') || '').toUpperCase());
    fill('boxes', q.get('boxes'));

    /* no dates in the past */
    const today = new Date();
    const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    form.querySelectorAll('input[type="date"]').forEach((d) => { d.min = iso; });

    const show = (i, focus = true) => {
      panels[cur].classList.remove('is-on');
      panels[cur].hidden = true;
      cur = i;
      panels[cur].hidden = false;
      panels[cur].classList.add('is-on');
      steps.forEach((s, j) => {
        s.classList.toggle('is-on', j === cur);
        s.classList.toggle('is-done', j < cur);
        if (j === cur) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
      });
      const top = form.getBoundingClientRect().top + window.scrollY - 96;
      if (NW.smoothScroll && NW.smoothScroll.enabled) NW.smoothScroll.to(top);
      else window.scrollTo({ top, behavior: 'smooth' });
      if (focus) {
        const first = panels[cur].querySelector('input:not([type="hidden"]), select, textarea');
        if (first) first.focus({ preventScroll: true });
      }
    };

    form.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => {
      if (forms.check(panels[cur])) show(cur + 1);
    }));
    form.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => show(cur - 1)));
    forms.liveClear(form);

    /* photos: at most ten, shown as thumbnails */
    const photos = form.querySelector('#q-photos');
    const previews = document.getElementById('previews');
    const drop = form.querySelector('.drop');
    const showPhotos = () => {
      previews.innerHTML = '';
      const files = [...photos.files].slice(0, 10);
      if (photos.files.length > 10) {
        const note = document.createElement('p');
        note.className = 'hint';
        note.textContent = 'Only the first 10 photos will be sent.';
        previews.append(note);
      }
      files.forEach((f) => {
        const img = document.createElement('img');
        img.alt = f.name;
        img.src = URL.createObjectURL(f);
        img.onload = () => URL.revokeObjectURL(img.src);
        previews.append(img);
      });
    };
    photos.addEventListener('change', showPhotos);
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) {
        photos.files = e.dataTransfer.files;
        showPhotos();
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.querySelector('[name="company"]').value) return;      // a bot filled the trap
      if (!forms.check(panels[cur])) return;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      const name = form.querySelector('[name="name"]').value.trim();
      const method = (form.querySelector('[name="contact_method"]:checked') || {}).value || 'phone';
      try {
        const how = await forms.send(form, `Quote request from ${name}`);
        panels[cur].hidden = true;
        document.getElementById('qsteps').hidden = true;
        done.hidden = false;
        done.querySelector('.qdone-text').textContent = how === 'sent'
          ? `Your quote request has been received. We'll be in touch shortly by ${method.toLowerCase()}.`
          : 'Your email app has opened with your answers filled in. Press send to reach us' +
            (photos.files.length ? ', and attach your photos to that email or send them by WhatsApp.' : '.') +
            " We'll reply by " + method.toLowerCase() + '.';
        done.focus();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Request my free quote';
        alertBox('Sorry, that didn\'t go through. Please try again, or call us any time.');
      }
    });

    const alertBox = (text) => {
      let s = form.querySelector('.form-status');
      if (!s) {
        s = document.createElement('p');
        s.className = 'form-status is-bad';
        s.setAttribute('role', 'alert');
        panels[panels.length - 1].append(s);
      }
      s.textContent = text;
    };
  }

  NW.initQuoteForm = initQuoteForm;
})(window.Sunrise = window.Sunrise || {});
