/* reviews.js — reviews.html.
   1. Shows the reviews listed in js/reviews-data.js (real, checked reviews only):
      the rating summary, the filters, the sort and the cards.
   2. The "write a review" form. A sent review is not added to the page: it reaches
      the business first (see forms.js) and is published once checked. */

(function (NW) {
  'use strict';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const clampRating = (r) => Math.min(5, Math.max(1, Math.round(Number(r) || 0)));
  const time = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? 0 : t; };
  const monthYear = (d) => {
    const t = time(d);
    return t ? new Date(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
  };
  const starRow = (r) => '★'.repeat(r) + '☆'.repeat(5 - r);

  function initReviewList() {
    const list = document.getElementById('rv-list');
    if (!list) return;

    const data = (Array.isArray(NW.reviewsData) ? NW.reviewsData : [])
      .filter((r) => r && r.text && r.name)
      .map((r) => ({ ...r, rating: clampRating(r.rating) }));

    /* ---- summary ---- */
    const total = data.length;
    const avg = total ? data.reduce((s, r) => s + r.rating, 0) / total : 0;
    const avgEl = document.getElementById('rv-avg');
    avgEl.textContent = total ? avg.toFixed(1) : '';
    avgEl.hidden = !total;                      // no number until there is a real one
    document.querySelector('#rv-avg-stars .rv-stars-fill').style.width = `${(avg / 5) * 100}%`;
    document.getElementById('rv-count').textContent = total
      ? `Based on ${total} review${total === 1 ? '' : 's'}`
      : 'No reviews yet';
    document.getElementById('rv-avg-stars').setAttribute('aria-label',
      total ? `Average ${avg.toFixed(1)} out of 5` : 'No ratings yet');

    const bars = document.getElementById('rv-bars');
    bars.innerHTML = [5, 4, 3, 2, 1].map((n) => {
      const c = data.filter((r) => r.rating === n).length;
      const pct = total ? Math.round((c / total) * 100) : 0;
      return `<li><span class="rv-bar-label">${n} ★</span>`
        + `<span class="rv-bar-track"><span class="rv-bar-fill" style="width:${pct}%"></span></span>`
        + `<span class="rv-bar-num">${c}<span class="sr-only"> ${n}-star review${c === 1 ? '' : 's'}</span></span></li>`;
    }).join('');

    /* ---- filters and sort ---- */
    const state = { rating: 'all', service: 'all', sort: 'new' };
    const chips = [...document.querySelectorAll('.rv-chip')];
    const serviceSel = document.getElementById('rv-service');
    const sortSel = document.getElementById('rv-sort');
    const showing = document.getElementById('rv-showing');
    const empty = document.getElementById('rv-empty');
    const emptyH = document.getElementById('rv-empty-h');
    const emptyP = document.getElementById('rv-empty-p');
    const emptyBtn = document.getElementById('rv-empty-btn');

    const matches = (r) => {
      if (state.rating === 'low' && r.rating > 2) return false;
      if (state.rating !== 'all' && state.rating !== 'low' && r.rating !== Number(state.rating)) return false;
      if (state.service !== 'all' && r.service !== state.service) return false;
      return true;
    };
    const order = {
      new: (a, b) => time(b.date) - time(a.date),
      high: (a, b) => b.rating - a.rating || time(b.date) - time(a.date),
      low: (a, b) => a.rating - b.rating || time(b.date) - time(a.date),
    };

    const card = (r) => {
      const meta = [r.town, r.service].filter(Boolean).map(esc).join(' · ');
      const when = monthYear(r.date);
      return `<article class="rv-card">
          <div class="rv-card-top">
            <span class="rv-card-stars" aria-label="${r.rating} out of 5">${starRow(r.rating)}</span>
            ${when ? `<time datetime="${esc(r.date)}">${esc(when)}</time>` : ''}
          </div>
          ${r.title ? `<h3>${esc(r.title)}</h3>` : ''}
          <p>${esc(r.text)}</p>
          <footer><span class="rv-avatar" aria-hidden="true">${esc(String(r.name).trim().charAt(0).toUpperCase())}</span>
            <span><b>${esc(r.name)}</b>${meta ? `<small>${meta}</small>` : ''}</span></footer>
        </article>`;
    };

    const filtered = () => total > 0 && (state.rating !== 'all' || state.service !== 'all');

    const render = () => {
      const rows = data.filter(matches).sort(order[state.sort]);
      list.innerHTML = rows.map(card).join('');
      list.hidden = rows.length === 0;
      empty.hidden = rows.length > 0;
      showing.textContent = total
        ? (rows.length === total ? `Showing all ${total} review${total === 1 ? '' : 's'}`
          : `Showing ${rows.length} of ${total} reviews`)
        : '';
      if (!rows.length && filtered()) {
        emptyH.textContent = 'No reviews match these filters';
        emptyP.textContent = 'Try another rating or service.';
        emptyBtn.textContent = 'Show all reviews';
        emptyBtn.setAttribute('href', '#list-h');
        emptyBtn.dataset.reset = '1';
      } else {
        emptyH.textContent = 'No reviews here yet';
        emptyP.textContent = "If we've moved you, yours could be the first.";
        emptyBtn.textContent = 'Write a review';
        emptyBtn.setAttribute('href', '#write');
        delete emptyBtn.dataset.reset;
      }
    };

    const reset = () => {
      state.rating = 'all'; state.service = 'all';
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.rating === 'all')));
      serviceSel.value = 'all';
      render();
    };

    chips.forEach((c) => c.addEventListener('click', () => {
      state.rating = c.dataset.rating;
      chips.forEach((o) => o.setAttribute('aria-pressed', String(o === c)));
      render();
    }));
    serviceSel.addEventListener('change', () => { state.service = serviceSel.value; render(); });
    sortSel.addEventListener('change', () => { state.sort = sortSel.value; render(); });
    emptyBtn.addEventListener('click', (e) => {
      if (!emptyBtn.dataset.reset) return;
      e.preventDefault();
      reset();
    });

    render();
  }

  function initReviewForm() {
    const form = document.getElementById('rform');
    if (!form) return;
    const { forms } = NW;
    const status = document.getElementById('rstatus');
    forms.liveClear(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.querySelector('[name="company"]').value) return;      // a bot filled the trap
      if (!forms.check(form)) return;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      const name = form.querySelector('[name="name"]').value.trim();
      try {
        const how = await forms.send(form, `New review from ${name}`);
        status.classList.remove('is-bad');
        status.textContent = how === 'sent'
          ? "Thank you! Your review has been sent to us. It will appear here once we've checked it."
          : 'Thank you! Your email app has opened with your review filled in. Press send to share it with us.';
        if (how === 'sent') form.reset();
      } catch (err) {
        status.classList.add('is-bad');
        status.textContent = "Sorry, that didn't go through. Please try again.";
      }
      btn.disabled = false;
      status.focus();
    });
  }

  NW.initReviews = function initReviews() {
    initReviewList();
    initReviewForm();
  };
})(window.Sunrise = window.Sunrise || {});
