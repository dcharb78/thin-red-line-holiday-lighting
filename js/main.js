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
  contactForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const cfg = window.SITE_CONFIG?.business;
    const name = contactForm.querySelector('[name="name"]')?.value || '';
    const phone = contactForm.querySelector('[name="phone"]')?.value || '';
    const message = contactForm.querySelector('[name="message"]')?.value || '';
    const body = encodeURIComponent(
      `Hi, I'm ${name}. Phone: ${phone}\n\n${message}`
    );
    window.location.href = `sms:${cfg?.phonePrimaryTel || '+19258954443'}?&body=${body}`;
  });
})();
