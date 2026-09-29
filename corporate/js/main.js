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

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Stat counters ---------- */
  const statEls = document.querySelectorAll('.stat__num[data-count]');
  if (statEls.length) {
    const animateCount = (el) => {
      const target = parseInt(el.getAttribute('data-count'), 10);
      const duration = 1400;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const statIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            statIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    statEls.forEach((el) => statIo.observe(el));
  }

  /* ---------- Contact form validation ---------- */
  const form = document.getElementById('contactForm');
  if (!form) return;

  const successEl = document.getElementById('formSuccess');

  const validators = {
    name: (value) => value.trim().length > 0,
    email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
    subject: (value) => value.trim().length > 0,
    message: (value) => value.trim().length > 0,
    agree: (value, field) => field.checked,
  };

  const errorMessages = {
    name: 'お名前を入力してください。',
    email: '正しいメールアドレスを入力してください。',
    subject: 'ご用件を選択してください。',
    message: 'お問い合わせ内容を入力してください。',
    agree: 'プライバシーポリシーへの同意が必要です。',
  };

  const showError = (field, message) => {
    const row = field.closest('.form-row');
    if (!row) return;
    const errorEl = row.querySelector('.form-error');
    row.classList.toggle('has-error', Boolean(message));
    if (errorEl) errorEl.textContent = message || '';
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    successEl.textContent = '';

    let isValid = true;

    Object.keys(validators).forEach((name) => {
      const field = form.elements[name];
      if (!field) return;
      const ok = validators[name](field.value, field);
      showError(field, ok ? '' : errorMessages[name]);
      if (!ok) isValid = false;
    });

    if (!isValid) return;

    successEl.textContent = 'お問い合わせありがとうございます。内容を確認のうえ、担当者よりご連絡いたします。';
    form.reset();
  });

  Object.keys(validators).forEach((name) => {
    const field = form.elements[name];
    if (!field) return;
    const eventName = field.type === 'checkbox' ? 'change' : 'input';
    field.addEventListener(eventName, () => {
      if (field.closest('.form-row').classList.contains('has-error')) {
        const ok = validators[name](field.value, field);
        showError(field, ok ? '' : errorMessages[name]);
      }
    });
  });
});
