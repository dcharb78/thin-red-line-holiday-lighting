(function () {
  const menuToggle = document.querySelector('.menu-toggle');
  const navMobile = document.querySelector('.nav-mobile');

  menuToggle?.addEventListener('click', () => {
    navMobile?.classList.toggle('open');
    const expanded = navMobile?.classList.contains('open');
    menuToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });

  navMobile?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => navMobile.classList.remove('open'));
  });

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const contactForm = document.getElementById('contact-form');
  const contactFormError = document.getElementById('contact-form-error');

  contactForm?.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      window.LeadCapture?.showFieldError(input, '');
      if (contactFormError) contactFormError.hidden = true;
    });
  });

  contactForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const lc = window.LeadCapture;
    if (!lc?.validateContactForm(contactForm)) {
      if (contactFormError) {
        contactFormError.textContent = 'Please fix the highlighted fields before sending.';
        contactFormError.hidden = false;
      }
      return;
    }

    if (contactFormError) contactFormError.hidden = true;
    const lead = lc.readContactLead(contactForm);
    lc.openQuoteSms(lead, lead.message ? [] : ['Please send my free personalized quote.']);
  });

  const estimatorPanel = document.querySelector('#estimator .estimator-panel');
  const syncLeadToContact = () => {
    if (!estimatorPanel || !contactForm) return;
    const map = [
      ['leadName', 'name'],
      ['leadEmail', 'email'],
      ['leadPhone', 'phone'],
      ['leadAddress', 'address'],
    ];
    map.forEach(([from, to]) => {
      const src = estimatorPanel.querySelector(`[name="${from}"]`);
      const dst = contactForm.querySelector(`[name="${to}"]`);
      if (src?.value && dst && !dst.value.trim()) dst.value = src.value.trim();
    });
  };

  estimatorPanel?.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', syncLeadToContact);
  });

  document.querySelector('a[href="#contact-form"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    contactForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    contactForm?.querySelector('[name="name"]')?.focus();
  });
})();
