document.addEventListener('DOMContentLoaded', () => {
  /* ---------- Mobile nav toggle ---------- */
  const navToggle = document.getElementById('navToggle');
  const nav = document.getElementById('nav');

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      navToggle.classList.toggle('is-active', isOpen);
      navToggle.setAttribute('aria-label', isOpen ? 'メニューを閉じる' : 'メニューを開く');
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        navToggle.classList.remove('is-active');
      });
    });
  }

  /* ---------- Contact form validation ---------- */
  const form = document.getElementById('contactForm');
  if (!form) return;

  const successEl = document.getElementById('formSuccess');

  const validators = {
    company: (value) => value.trim().length > 0,
    name: (value) => value.trim().length > 0,
    email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
    inquiryType: (value) => value.trim().length > 0,
    message: (value) => value.trim().length > 0,
  };

  const errorMessages = {
    company: '会社名を入力してください。',
    name: 'ご担当者名を入力してください。',
    email: '正しいメールアドレスを入力してください。',
    inquiryType: 'お問い合わせ種別を選択してください。',
    message: 'お問い合わせ内容を入力してください。',
  };

  const showError = (field, message) => {
    const row = field.closest('.form-row');
    const errorEl = row.querySelector('.form-error');
    row.classList.toggle('has-error', Boolean(message));
    errorEl.textContent = message || '';
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    successEl.textContent = '';

    let isValid = true;

    Object.keys(validators).forEach((name) => {
      const field = form.elements[name];
      const ok = validators[name](field.value);
      showError(field, ok ? '' : errorMessages[name]);
      if (!ok) isValid = false;
    });

    if (!isValid) return;

    successEl.textContent = 'お問い合わせありがとうございます。内容を確認のうえ、担当者よりご連絡いたします。';
    form.reset();
  });

  Object.keys(validators).forEach((name) => {
    const field = form.elements[name];
    field.addEventListener('input', () => {
      if (field.closest('.form-row').classList.contains('has-error')) {
        const ok = validators[name](field.value);
        showError(field, ok ? '' : errorMessages[name]);
      }
    });
    field.addEventListener('change', () => {
      if (field.closest('.form-row').classList.contains('has-error')) {
        const ok = validators[name](field.value);
        showError(field, ok ? '' : errorMessages[name]);
      }
    });
  });
});
