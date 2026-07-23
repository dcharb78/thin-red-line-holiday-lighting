/**
 * Shared lead capture validation and SMS body formatting.
 */
(function () {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function digitsOnly(value) {
    return (value || '').replace(/\D/g, '');
  }

  function getFieldError(input, label) {
    const value = (input?.value || '').trim();
    if (!value) return `${label} is required.`;
    if (input.type === 'email' && !EMAIL_RE.test(value)) {
      return 'Enter a valid email address.';
    }
    if (input.type === 'tel' && digitsOnly(value).length < 10) {
      return 'Enter a valid 10-digit phone number.';
    }
    if ((input.name === 'name' || input.name === 'leadName') && value.length < 2) {
      return 'Enter your full name.';
    }
    if ((input.name === 'address' || input.name === 'leadAddress') && value.length < 5) {
      return 'Enter a complete property address.';
    }
    return '';
  }

  function showFieldError(input, message) {
    if (!input) return;
    const group = input.closest('.form-group');
    const errorId = `${input.id}-error`;
    let errorEl = document.getElementById(errorId);
    if (!errorEl && group) {
      errorEl = document.createElement('p');
      errorEl.id = errorId;
      errorEl.className = 'field-error';
      errorEl.setAttribute('role', 'alert');
      group.appendChild(errorEl);
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    input.setAttribute('aria-describedby', message ? errorId : '');
    input.classList.toggle('input-invalid', Boolean(message));
  }

  function clearFieldErrors(form) {
    form?.querySelectorAll('input, textarea').forEach((input) => {
      showFieldError(input, '');
    });
  }

  function validateFields(fields) {
    let firstInvalid = null;
    let valid = true;
    fields.forEach(({ input, label }) => {
      const message = getFieldError(input, label);
      showFieldError(input, message);
      if (message) {
        valid = false;
        if (!firstInvalid) firstInvalid = input;
      }
    });
    firstInvalid?.focus();
    return valid;
  }

  function validateLeadFields(panel) {
    const name = panel.querySelector('[name="leadName"]');
    const email = panel.querySelector('[name="leadEmail"]');
    const phone = panel.querySelector('[name="leadPhone"]');
    const address = panel.querySelector('[name="leadAddress"]');
    return validateFields([
      { input: name, label: 'Name' },
      { input: email, label: 'Email' },
      { input: phone, label: 'Phone' },
      { input: address, label: 'Address' },
    ]);
  }

  function validateContactForm(form) {
    return validateFields([
      { input: form.querySelector('[name="name"]'), label: 'Name' },
      { input: form.querySelector('[name="email"]'), label: 'Email' },
      { input: form.querySelector('[name="phone"]'), label: 'Phone' },
      { input: form.querySelector('[name="address"]'), label: 'Address' },
    ]);
  }

  function readLeadFromEstimator() {
    const panel = document.querySelector('#estimator .estimator-panel');
    return {
      name: panel?.querySelector('[name="leadName"]')?.value.trim() || '',
      email: panel?.querySelector('[name="leadEmail"]')?.value.trim() || '',
      phone: panel?.querySelector('[name="leadPhone"]')?.value.trim() || '',
      address: panel?.querySelector('[name="leadAddress"]')?.value.trim() || '',
    };
  }

  function readContactLead(form) {
    return {
      name: form.querySelector('[name="name"]')?.value.trim() || '',
      email: form.querySelector('[name="email"]')?.value.trim() || '',
      phone: form.querySelector('[name="phone"]')?.value.trim() || '',
      address: form.querySelector('[name="address"]')?.value.trim() || '',
      message: form.querySelector('[name="message"]')?.value.trim() || '',
    };
  }

  function buildSmsBody(lead, extraLines) {
    const lines = [
      `Hi, I'm ${lead.name}.`,
      `Email: ${lead.email}`,
      `Phone: ${lead.phone}`,
      `Address: ${lead.address}`,
    ];
    if (lead.message) lines.push('', lead.message);
    if (extraLines?.length) {
      lines.push('', ...extraLines);
    }
    return encodeURIComponent(lines.join('\n'));
  }

  function openQuoteSms(lead, extraLines) {
    const cfg = window.SITE_CONFIG?.business;
    const body = buildSmsBody(lead, extraLines);
    window.location.href = `sms:${cfg?.phonePrimaryTel || '+19258954443'}?&body=${body}`;
  }

  window.LeadCapture = {
    validateFields,
    validateLeadFields,
    validateContactForm,
    clearFieldErrors,
    showFieldError,
    readLeadFromEstimator,
    readContactLead,
    buildSmsBody,
    openQuoteSms,
  };
})();
