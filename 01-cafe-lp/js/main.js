document.addEventListener('DOMContentLoaded', () => {
  /* ---------- Header: scroll state ---------- */
  const header = document.getElementById('header');
  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 10);
  };
  onScroll();
  window.addEventListener('scroll', onScroll);

  /* ---------- Mobile nav toggle ---------- */
  const navToggle = document.getElementById('navToggle');
  const nav = document.getElementById('nav');

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

  /* ---------- Contact form validation ---------- */
  const form = document.getElementById('contactForm');
  const successEl = document.getElementById('formSuccess');

  const validators = {
    name: (value) => value.trim().length > 0,
    email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
    message: (value) => value.trim().length > 0,
  };

  const errorMessages = {
    name: 'お名前を入力してください。',
    email: '正しいメールアドレスを入力してください。',
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
  });
});
