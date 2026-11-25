/* contact.js — the "send a message" form on contact.html.
   Sends through forms.js: to config.formEndpoint when one is set, otherwise it opens
   the visitor's email app with the message written out. */

(function (NW) {
  'use strict';

  function initContact() {
    const form = document.getElementById('mform');
    if (!form) return;
    const { forms } = NW;
    const status = document.getElementById('mstatus');
    forms.liveClear(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.querySelector('[name="company"]').value) return;      // a bot filled the trap
      if (!forms.check(form)) return;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      const name = form.querySelector('[name="name"]').value.trim();
      try {
        const how = await forms.send(form, `Website message from ${name}`);
        status.classList.remove('is-bad');
        status.textContent = how === 'sent'
          ? "Thank you, your message is on its way. We'll be in touch soon."
          : 'Your email app has opened with your message filled in. Press send to reach us.';
        if (how === 'sent') form.reset();
      } catch (err) {
        status.classList.add('is-bad');
        status.textContent = "Sorry, that didn't go through. Please try again, or call us.";
      }
      btn.disabled = false;
      status.focus();
    });
  }

  NW.initContact = initContact;
})(window.Sunrise = window.Sunrise || {});
