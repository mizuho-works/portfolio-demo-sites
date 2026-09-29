(() => {
  "use strict";

  /* ==================== Product data ==================== */
  const PRODUCTS = [
    {
      id: "tee-white",
      name: "オーガニックコットン半袖Tシャツ(ホワイト)",
      price: 2200,
      category: "baby",
      categoryLabel: "ベビー",
      tag: "NEW",
      img: "images/product-tee-white.jpg",
      images: ["images/product-tee-white.jpg"],
      desc: "とろけるような肌ざわりのオーガニックコットン天竺を使った、毎日着たくなる半袖Tシャツ。汗をよく吸い、動きやすいゆったりシルエットです。",
    },
    {
      id: "tee-macaron",
      name: "刺繍ワンポイント半袖Tシャツ",
      price: 2400,
      category: "kids",
      categoryLabel: "キッズ",
      tag: "",
      img: "images/product-tee-macaron.jpg",
      images: ["images/product-tee-macaron.jpg"],
      desc: "さりげない刺繍がアクセントの半袖Tシャツ。シンプルなボトムスにも合わせやすく、コーディネートの主役にもなる一枚です。",
    },
    {
      id: "romper-bear",
      name: "くまさん刺繍ロンパース",
      price: 3200,
      category: "baby",
      categoryLabel: "ベビー",
      tag: "NEW",
      img: "images/product-romper-bear.jpg",
      images: ["images/product-romper-bear.jpg"],
      desc: "スナップボタンで着替えやすいロンパース。くまさんの刺繍がワンポイントの、おでかけにも普段着にも使える定番アイテムです。",
    },
    {
      id: "knit-pink",
      name: "ローゲージニットプルオーバー(ピンク)",
      price: 4600,
      category: "knit",
      categoryLabel: "ニット・アウター",
      tag: "",
      img: "images/product-knit-pink.jpg",
      images: ["images/product-knit-pink.jpg"],
      desc: "ふっくらとしたローゲージ編みが可愛らしいプルオーバー。あたたかみのあるピンクは、デニムとの相性も抜群です。",
    },
    {
      id: "pajama-check",
      name: "コットンチェック柄パジャマセット",
      price: 3800,
      category: "kids",
      categoryLabel: "キッズ",
      tag: "",
      img: "images/product-pajama-check.jpg",
      images: ["images/product-pajama-check.jpg"],
      desc: "やわらかいダブルガーゼ素材のチェック柄パジャマ上下セット。通気性がよく、寝苦しい季節も快適に過ごせます。",
    },
    {
      id: "dress-mustard",
      name: "リネンコットンワンピース(マスタード)",
      price: 5200,
      category: "dress",
      categoryLabel: "ワンピース・スカート",
      tag: "SALE",
      img: "images/product-dress-mustard.jpg",
      images: ["images/product-dress-mustard.jpg", "images/product-dress-mustard-2.jpg"],
      desc: "リネン混のコットン生地を使った、ふんわりシルエットのワンピース。深みのあるマスタードカラーが差し色になる、お出かけにぴったりの一枚です。",
    },
    {
      id: "dress-floral",
      name: "小花柄エプロンワンピース",
      price: 4400,
      category: "dress",
      categoryLabel: "ワンピース・スカート",
      tag: "",
      img: "images/product-dress-floral.jpg",
      images: ["images/product-dress-floral.jpg"],
      desc: "後ろ姿まで可愛い、小花柄のエプロンワンピース。Tシャツの上から重ね着もできる、着回し力の高いデザインです。",
    },
    {
      id: "dress-blue",
      name: "ボタニカル柄シャツワンピース",
      price: 4800,
      category: "dress",
      categoryLabel: "ワンピース・スカート",
      tag: "",
      img: "images/product-dress-blue.jpg",
      images: ["images/product-dress-blue.jpg"],
      desc: "上品なボタニカル柄のシャツワンピース。襟付きデザインでフォーマルな場面にも活躍する、上質なコットン生地です。",
    },
    {
      id: "overall-denim",
      name: "コーデュロイオーバーオール",
      price: 4200,
      category: "baby",
      categoryLabel: "ベビー",
      tag: "",
      img: "images/product-overall-denim.jpg",
      images: ["images/product-overall-denim.jpg"],
      desc: "肩紐の長さ調節ができるコーデュロイ素材のオーバーオール。カットソーと合わせるだけで、こなれた雰囲気に仕上がります。",
    },
    {
      id: "cardigan-knit",
      name: "カラーブロックニットカーディガン",
      price: 5400,
      category: "knit",
      categoryLabel: "ニット・アウター",
      tag: "NEW",
      img: "images/product-cardigan-knit.jpg",
      images: ["images/product-cardigan-knit.jpg"],
      desc: "配色使いが目を引くニットカーディガン。肌寒い季節の羽織りものとして、長く活躍してくれる一着です。",
    },
  ];

  const YEN = (n) => "¥" + n.toLocaleString("ja-JP");
  const FREE_SHIPPING_THRESHOLD = 6000;
  const SHIPPING_FEE = 550;

  /* ==================== Cart storage ==================== */
  const CART_KEY = "cottondays_cart";

  const readCart = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  };
  const writeCart = (cart) => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  };
  const addToCart = (id, size, qty) => {
    const cart = readCart();
    const existing = cart.find((item) => item.id === id && item.size === size);
    if (existing) existing.qty += qty;
    else cart.push({ id, size, qty });
    writeCart(cart);
  };
  const updateCartCount = () => {
    const badge = document.getElementById("cartCount");
    if (!badge) return;
    const total = readCart().reduce((sum, item) => sum + item.qty, 0);
    badge.textContent = total;
    badge.hidden = total === 0;
  };

  /* ==================== Toast ==================== */
  let toastTimer = null;
  const showToast = (message) => {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
  };

  /* ==================== Mobile nav ==================== */
  const navToggle = document.getElementById("navToggle");
  const navMobile = document.getElementById("navMobile");
  if (navToggle && navMobile) {
    const closeMobileNav = () => {
      navMobile.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };
    const openMobileNav = () => {
      navMobile.classList.add("is-open");
      navToggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    };
    navToggle.addEventListener("click", () => {
      navMobile.classList.contains("is-open") ? closeMobileNav() : openMobileNav();
    });
    navMobile.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMobileNav));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMobileNav(); });
  }

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
  if (toTopBtn) {
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
  }

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
    const anyOpen = Object.values(modals).some((m) => m && !m.hidden);
    if (!anyOpen) document.body.style.overflow = "";
  };
  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.dataset.close));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    Object.keys(modals).forEach((key) => { if (modals[key] && !modals[key].hidden) closeModal(key); });
  });

  /* ==================== Gallery lightbox (index page) ==================== */
  const galleryItems = document.querySelectorAll(".gallery-item");
  const galleryModalImg = document.getElementById("galleryModalImg");
  const galleryModalCaption = document.getElementById("galleryModalCaption");
  galleryItems.forEach((item) => {
    item.addEventListener("click", () => {
      if (galleryModalImg) galleryModalImg.src = item.dataset.full;
      if (galleryModalCaption) galleryModalCaption.textContent = item.dataset.caption || "";
      openModal("gallery");
    });
  });

  /* ==================== Product card builder ==================== */
  const buildProductCard = (product) => {
    const article = document.createElement("article");
    article.className = "product-card";
    article.dataset.category = product.category;
    article.innerHTML = `
      <a href="product.html?id=${product.id}" class="product-photo">
        ${product.tag ? `<span class="product-tag${product.tag === "SALE" ? " is-sale" : ""}">${product.tag}</span>` : ""}
        <img src="${product.img}" alt="${product.name}" loading="lazy">
        <span class="product-photo-actions">
          <button type="button" class="product-quickadd" data-quickadd="${product.id}">カートに入れる</button>
        </span>
      </a>
      <p class="product-cat">${product.categoryLabel}</p>
      <h3 class="product-name"><a href="product.html?id=${product.id}">${product.name}</a></h3>
      <p class="product-price">${YEN(product.price)}</p>
    `;
    return article;
  };

  const attachQuickAdd = (container) => {
    container.querySelectorAll("[data-quickadd]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        addToCart(btn.dataset.quickadd, "100", 1);
        showToast("カートに追加しました");
      });
    });
  };

  /* ==================== Shop grid + filter (index page) ==================== */
  const productGrid = document.getElementById("productGrid");
  if (productGrid) {
    const renderGrid = (filter) => {
      productGrid.innerHTML = "";
      const list = filter === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.category === filter);
      list.forEach((p) => productGrid.appendChild(buildProductCard(p)));
      attachQuickAdd(productGrid);
    };
    renderGrid("all");

    const shopTabs = document.querySelectorAll(".shop-tab");
    const setFilter = (filter) => {
      shopTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.filter === filter));
      renderGrid(filter);
    };
    shopTabs.forEach((tab) => tab.addEventListener("click", () => setFilter(tab.dataset.filter)));

    document.querySelectorAll(".category-card[data-filter]").forEach((card) => {
      card.addEventListener("click", () => {
        setFilter(card.dataset.filter);
        document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  /* ==================== Newsletter form (index page) ==================== */
  const newsletterForm = document.getElementById("newsletterForm");
  if (newsletterForm) {
    newsletterForm.addEventListener("submit", (e) => {
      e.preventDefault();
      showToast("ご登録ありがとうございます(デモ)");
      newsletterForm.reset();
    });
  }

  /* ==================== Product detail page ==================== */
  const pdName = document.getElementById("pdName");
  if (pdName) {
    const params = new URLSearchParams(window.location.search);
    const product = PRODUCTS.find((p) => p.id === params.get("id")) || PRODUCTS.find((p) => p.id === "dress-mustard");

    document.title = `${product.name} | COTTON DAYS(コットンデイズ)`;
    document.getElementById("breadcrumbCurrent").textContent = product.name;
    document.getElementById("pdCategory").textContent = product.categoryLabel;
    pdName.textContent = product.name;
    document.getElementById("pdPrice").textContent = YEN(product.price);
    document.getElementById("pdDesc").textContent = product.desc;

    const pdTag = document.getElementById("pdTag");
    if (product.tag) {
      pdTag.textContent = product.tag;
      pdTag.hidden = false;
      pdTag.classList.toggle("is-sale", product.tag === "SALE");
    }

    const mainImage = document.getElementById("pdMainImage");
    mainImage.src = product.images[0];
    mainImage.alt = product.name;

    const thumbsWrap = document.getElementById("pdThumbs");
    product.images.forEach((src, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = i === 0 ? "is-active" : "";
      btn.innerHTML = `<img src="${src}" alt="${product.name} 画像${i + 1}">`;
      btn.addEventListener("click", () => {
        mainImage.src = src;
        thumbsWrap.querySelectorAll("button").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
      });
      thumbsWrap.appendChild(btn);
    });
    if (product.images.length < 2) thumbsWrap.hidden = true;

    let selectedSize = "100";
    const sizeChips = document.querySelectorAll("#pdSizes .chip");
    sizeChips.forEach((chip) => {
      if (chip.dataset.size === selectedSize) chip.classList.add("is-active");
      chip.addEventListener("click", () => {
        sizeChips.forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        selectedSize = chip.dataset.size;
      });
    });

    let qty = 1;
    const qtyValue = document.getElementById("pdQtyValue");
    document.getElementById("pdQtyMinus").addEventListener("click", () => {
      qty = Math.max(1, qty - 1);
      qtyValue.textContent = qty;
    });
    document.getElementById("pdQtyPlus").addEventListener("click", () => {
      qty = Math.min(10, qty + 1);
      qtyValue.textContent = qty;
    });

    document.getElementById("pdAddToCart").addEventListener("click", () => {
      addToCart(product.id, selectedSize, qty);
      showToast("カートに追加しました");
    });

    document.querySelectorAll(".accordion-trigger").forEach((trigger, i) => {
      const panel = trigger.nextElementSibling;
      trigger.addEventListener("click", () => {
        const isOpen = trigger.getAttribute("aria-expanded") === "true";
        document.querySelectorAll(".accordion-trigger").forEach((t) => {
          t.setAttribute("aria-expanded", "false");
          t.nextElementSibling.style.maxHeight = "0px";
        });
        if (!isOpen) {
          trigger.setAttribute("aria-expanded", "true");
          panel.style.maxHeight = panel.scrollHeight + "px";
        }
      });
      if (i === 0) panel.style.maxHeight = panel.scrollHeight + "px";
    });

    const relatedGrid = document.getElementById("relatedGrid");
    if (relatedGrid) {
      const related = PRODUCTS.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
      const fallback = related.length ? related : PRODUCTS.filter((p) => p.id !== product.id).slice(0, 4);
      fallback.forEach((p) => relatedGrid.appendChild(buildProductCard(p)));
      attachQuickAdd(relatedGrid);
    }
  }

  /* ==================== Cart page ==================== */
  const cartContent = document.getElementById("cartContent");
  if (cartContent) {
    const renderCart = () => {
      const cart = readCart();
      if (cart.length === 0) {
        cartContent.innerHTML = `
          <div class="cart-empty">
            <h3>カートは空です</h3>
            <p>お気に入りのアイテムをカートに追加してください。</p>
            <a href="index.html#shop" class="btn btn-primary">商品を見る</a>
          </div>
        `;
        return;
      }

      const rows = cart.map((item) => {
        const product = PRODUCTS.find((p) => p.id === item.id);
        if (!product) return null;
        return { ...item, product };
      }).filter(Boolean);

      const subtotal = rows.reduce((sum, r) => sum + r.product.price * r.qty, 0);
      const shipping = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FEE;
      const total = subtotal + shipping;

      cartContent.innerHTML = `
        <div class="cart-layout">
          <div class="cart-list">
            ${rows.map((r, i) => `
              <div class="cart-row" data-index="${i}">
                <div class="cart-row-photo"><img src="${r.product.img}" alt="${r.product.name}"></div>
                <div>
                  <h3 class="cart-row-name">${r.product.name}</h3>
                  <p class="cart-row-meta">サイズ:${r.size} / ${YEN(r.product.price)}</p>
                  <div class="cart-row-controls">
                    <div class="qty-stepper">
                      <button type="button" class="qty-btn" data-action="minus" data-index="${i}" aria-label="数量を減らす">−</button>
                      <span>${r.qty}</span>
                      <button type="button" class="qty-btn" data-action="plus" data-index="${i}" aria-label="数量を増やす">+</button>
                    </div>
                    <span class="cart-row-remove" data-action="remove" data-index="${i}">削除</span>
                  </div>
                </div>
                <p class="cart-row-total">${YEN(r.product.price * r.qty)}</p>
              </div>
            `).join("")}
          </div>
          <div class="cart-summary">
            <h3>注文内容</h3>
            <div class="cart-summary-row"><span>小計</span><span>${YEN(subtotal)}</span></div>
            <div class="cart-summary-row"><span>送料</span><span>${shipping === 0 ? "無料" : YEN(shipping)}</span></div>
            <div class="cart-summary-row is-total"><span>合計</span><span>${YEN(total)}</span></div>
            <p class="cart-summary-note">¥${FREE_SHIPPING_THRESHOLD.toLocaleString("ja-JP")}以上のご購入で送料無料です。</p>
            <button type="button" class="btn btn-primary btn-block" id="checkoutBtn">レジに進む</button>
          </div>
        </div>
      `;

      cartContent.querySelectorAll("[data-action]").forEach((el) => {
        el.addEventListener("click", () => {
          const idx = Number(el.dataset.index);
          const cartNow = readCart();
          if (el.dataset.action === "plus") cartNow[idx].qty = Math.min(10, cartNow[idx].qty + 1);
          if (el.dataset.action === "minus") cartNow[idx].qty = Math.max(1, cartNow[idx].qty - 1);
          if (el.dataset.action === "remove") cartNow.splice(idx, 1);
          writeCart(cartNow);
          renderCart();
        });
      });

      const checkoutBtn = document.getElementById("checkoutBtn");
      if (checkoutBtn) {
        checkoutBtn.addEventListener("click", () => {
          document.getElementById("confirmModalBody").textContent =
            `ご注文ありがとうございます。合計金額 ${YEN(total)} のご注文(仮)を受け付けました。`;
          openModal("confirm");
          writeCart([]);
          renderCart();
        });
      }
    };
    renderCart();
  }

  /* ==================== Init ==================== */
  updateCartCount();
})();
