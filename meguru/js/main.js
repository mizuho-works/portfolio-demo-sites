document.addEventListener('DOMContentLoaded', () => {
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

  /* ---------- Entry form validation ---------- */
  const form = document.getElementById('entryForm');
  const successEl = document.getElementById('formSuccess');

  const validators = {
    name: (value) => value.trim().length > 0,
    email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
    course: (value) => value.trim().length > 0,
  };

  const errorMessages = {
    name: 'お名前を入力してください。',
    email: '正しいメールアドレスを入力してください。',
    course: '参加コースを選択してください。',
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

    successEl.textContent = 'ご予約ありがとうございます！当日、受付でお名前をお伝えください。';
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
