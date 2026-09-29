(() => {
  "use strict";

  /* ==================== Mobile nav ==================== */
  const navToggle = document.getElementById("navToggle");
  const navMobile = document.getElementById("navMobile");

  const closeMobileNav = () => {
    navMobile.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "メニューを開く");
    document.body.style.overflow = "";
  };
  const openMobileNav = () => {
    navMobile.classList.add("is-open");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "メニューを閉じる");
    document.body.style.overflow = "hidden";
  };
  navToggle.addEventListener("click", () => {
    navMobile.classList.contains("is-open") ? closeMobileNav() : openMobileNav();
  });
  navMobile.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMobileNav));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMobileNav(); });

  /* ==================== Scroll reveal ==================== */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ==================== Back to top ==================== */
  const toTopBtn = document.getElementById("toTop");
  let ticking = false;
  const updateToTop = () => {
    toTopBtn.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.6);
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(updateToTop); ticking = true; }
  }, { passive: true });
  toTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  updateToTop();

  /* ==================== Generic modal helpers ==================== */
  const modals = {
    gallery: document.getElementById("galleryModal"),
    confirm: document.getElementById("confirmModal"),
  };

  const openModal = (key) => {
    const modal = modals[key];
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  };
  const closeModal = (key) => {
    const modal = modals[key];
    if (!modal) return;
    modal.hidden = true;
    const anyOpen = Object.values(modals).some((m) => !m.hidden);
    if (!anyOpen) document.body.style.overflow = "";
  };

  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.dataset.close));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    Object.keys(modals).forEach((key) => { if (!modals[key].hidden) closeModal(key); });
  });

  /* ==================== Menu tabs ==================== */
  const menuTabs = document.querySelectorAll(".menu-tab");
  const menuTables = document.querySelectorAll(".menu-table");
  menuTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      menuTabs.forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      menuTables.forEach((table) => {
        table.classList.toggle("is-active", table.dataset.menuPanel === tab.dataset.menu);
      });
    });
  });

  /* ==================== Gallery lightbox ==================== */
  document.querySelectorAll(".gallery-item").forEach((item) => {
    item.addEventListener("click", () => {
      document.getElementById("galleryModalImg").src = item.dataset.full;
      document.getElementById("galleryModalImg").alt = item.dataset.caption;
      document.getElementById("galleryModalCaption").textContent = item.dataset.caption;
      openModal("gallery");
    });
  });

  /* ==================== Reservation flow ==================== */
  const state = { menu: null, staff: null, date: null, time: null };

  const initChipGroup = (containerId, stateKey) => {
    const container = document.getElementById(containerId);
    container.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        container.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-selected"));
        chip.classList.add("is-selected");
        state[stateKey] = chip.dataset.value;
        updateSummary();
      });
    });
  };
  initChipGroup("reserveMenuSelect", "menu");
  initChipGroup("reserveStaffSelect", "staff");

  const monthLabelEl = document.getElementById("calMonthLabel");
  const daysEl = document.getElementById("calendarDays");
  const timeGridEl = document.getElementById("timeGrid");
  const timeHintEl = document.getElementById("timeHint");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  const closedWeekday = 1; // Monday

  const formatDate = (d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

  const renderCalendar = () => {
    monthLabelEl.textContent = `${viewYear}年 ${viewMonth + 1}月`;
    daysEl.innerHTML = "";

    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) {
      const span = document.createElement("span");
      span.className = "calendar-empty";
      daysEl.appendChild(span);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(day);
      const cellDate = new Date(viewYear, viewMonth, day);

      const isPast = cellDate < today;
      const isClosed = cellDate.getDay() === closedWeekday;
      if (isPast || isClosed) btn.disabled = true;

      if (state.date && formatDate(state.date) === formatDate(cellDate)) {
        btn.classList.add("is-selected");
      }

      btn.addEventListener("click", () => {
        state.date = cellDate;
        state.time = null;
        renderCalendar();
        renderTimeGrid();
        updateSummary();
      });

      daysEl.appendChild(btn);
    }
  };

  const seededBooked = (dateKey, hour) => {
    let hash = 0;
    const str = dateKey + "-" + hour;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return hash % 5 === 0;
  };

  const renderTimeGrid = () => {
    timeGridEl.innerHTML = "";
    if (!state.date) {
      timeHintEl.textContent = "先に日付を選択してください";
      timeHintEl.style.display = "block";
      return;
    }
    timeHintEl.style.display = "none";

    const slots = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
    const dateKey = formatDate(state.date);

    slots.forEach((slot) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = slot;

      const booked = seededBooked(dateKey, slot);
      if (booked) btn.disabled = true;

      if (state.time === slot) btn.classList.add("is-selected");

      btn.addEventListener("click", () => {
        state.time = slot;
        renderTimeGrid();
        updateSummary();
      });

      timeGridEl.appendChild(btn);
    });
  };

  document.getElementById("calPrev").addEventListener("click", () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    renderCalendar();
  });
  document.getElementById("calNext").addEventListener("click", () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderCalendar();
  });

  const sumMenu = document.getElementById("sumMenu");
  const sumStaff = document.getElementById("sumStaff");
  const sumDate = document.getElementById("sumDate");
  const sumTime = document.getElementById("sumTime");
  const reserveSubmit = document.getElementById("reserveSubmit");

  const updateSummary = () => {
    sumMenu.textContent = state.menu || "未選択";
    sumStaff.textContent = state.staff || "未選択";
    sumDate.textContent = state.date ? formatDate(state.date) : "未選択";
    sumTime.textContent = state.time || "未選択";
    reserveSubmit.disabled = !(state.menu && state.staff && state.date && state.time);
  };

  reserveSubmit.addEventListener("click", () => {
    if (reserveSubmit.disabled) return;
    document.getElementById("confirmModalBody").textContent =
      `${formatDate(state.date)} ${state.time} / ${state.menu} / 担当:${state.staff} でご予約(仮)を承りました。`;
    openModal("confirm");
  });

  renderCalendar();
  renderTimeGrid();
  updateSummary();
})();
