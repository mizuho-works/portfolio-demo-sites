"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const HEART = '<svg viewBox="0 0 24 24" class="heart"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4h2c.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  const L_RATIO = 127 / 89; // L版 89×127mm

  const store = {
    get(k, d) { try { const v = localStorage.getItem("lp." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("lp." + k, JSON.stringify(v)); } catch {} },
  };

  let photos = [];          // {id, month, name, v, sel}
  let byId = new Map();
  let months = [];          // ["2025-05", ...]
  let curMonth = store.get("month", null);
  let filter = store.get("filter", "all");
  let info = {};
  let viewList = [], viewIdx = 0, guide = store.get("guide", false);

  // ------------------------------------------------------------ data
  async function load() {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (!r.ok) throw new Error(await r.text());
    info = await r.json();
    const prevLen = photos.length;
    photos = info.photos.map(([id, month, name, v, sel]) => ({ id, month, name, v, sel: !!sel }));
    byId = new Map(photos.map((p) => [p.id, p]));
    months = [...new Set(photos.map((p) => p.month))];
    if (!months.includes(curMonth)) curMonth = months[0] || null;
    return prevLen !== photos.length;
  }

  async function setSel(p, on) {
    if (p.sel === on) return;
    p.sel = on;
    paintSel(p);
    if (navigator.vibrate) navigator.vibrate(8);
    try {
      const r = await fetch("/api/select", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [p.id], on }),
      });
      if (!r.ok) throw 0;
      flashSaved();
    } catch {
      p.sel = !on;
      paintSel(p);
      toast("保存できませんでした。PCのサーバーが起動しているか確認してください");
    }
  }

  // ------------------------------------------------------------ counts
  function counts() {
    const m = {};
    let total = 0;
    for (const p of photos) {
      const c = (m[p.month] ||= { all: 0, sel: 0 });
      c.all++;
      if (p.sel) { c.sel++; total++; }
    }
    return { m, total };
  }

  function renderChips() {
    const { m, total } = counts();
    $("#totalCount").textContent = total;
    const nav = $("#months");
    nav.innerHTML = months.map((mo) => {
      const [y, mm] = mo.split("-");
      return `<button class="mchip${mo === curMonth ? " on" : ""}" data-m="${mo}">
        <span class="y">${y}</span><span class="m">${+mm}月</span>
        <span class="c"><b>${m[mo].sel}</b>/${m[mo].all}</span></button>`;
    }).join("");
    const c = m[curMonth] || { all: 0, sel: 0 };
    $("#monthInfo").textContent = curMonth ? `${c.sel}枚 選択中 / ${c.all}枚` : "";
    if (!$("#viewer").hidden) $("#vMonthCount").textContent = `${+curMonth.slice(5)}月 ♥${c.sel}`;
  }

  function scrollChipIntoView() {
    const el = $(`.mchip[data-m="${curMonth}"]`);
    if (el) el.scrollIntoView({ inline: "center", block: "nearest" });
  }

  // ------------------------------------------------------------ grid
  function listFor(month, f) {
    return photos.filter((p) => p.month === month && (f === "all" || (f === "sel" ? p.sel : !p.sel)));
  }

  function renderGrid() {
    const grid = $("#grid");
    const list = listFor(curMonth, filter);
    const frag = document.createDocumentFragment();
    for (const p of list) {
      const d = document.createElement("div");
      d.className = "cell" + (p.sel ? " sel" : "");
      d.dataset.id = p.id;
      d.innerHTML = `<img loading="lazy" decoding="async" alt="" src="/t/${p.id}?v=${p.v}"><button class="hb" aria-label="印刷に選ぶ">${HEART}</button>`;
      d.firstChild.onload = function () { this.classList.add("ok"); };
      frag.appendChild(d);
    }
    grid.replaceChildren(frag);
    const empty = $("#empty");
    empty.hidden = list.length > 0;
    if (!photos.length) empty.textContent = info.scanning ? "読み込み中…" : "写真が見つかりませんでした。フォルダの場所を確認してください。";
    else if (!list.length) empty.textContent = filter === "sel" ? "この月はまだ選んでいません" : "この月は全部選びました";
  }

  function paintSel(p) {
    const cell = $(`.cell[data-id="${p.id}"]`);
    if (cell) cell.classList.toggle("sel", p.sel);
    if (!$("#viewer").hidden && viewList[viewIdx] === p) $("#vFav").setAttribute("aria-pressed", p.sel);
    renderChips();
  }

  $("#grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    const p = byId.get(cell.dataset.id);
    if (e.target.closest(".hb")) return setSel(p, !p.sel);
    const list = listFor(curMonth, filter);
    openViewer(list, list.indexOf(p));
  });

  $("#months").addEventListener("click", (e) => {
    const b = e.target.closest(".mchip");
    if (!b) return;
    curMonth = b.dataset.m;
    store.set("month", curMonth);
    renderChips();
    renderGrid();
    scrollChipIntoView();
    window.scrollTo(0, 0);
  });

  document.querySelectorAll(".filters button").forEach((b) => {
    b.classList.toggle("on", b.dataset.f === filter);
    b.onclick = () => {
      filter = b.dataset.f;
      store.set("filter", filter);
      document.querySelectorAll(".filters button").forEach((x) => x.classList.toggle("on", x === b));
      renderGrid();
      window.scrollTo(0, 0);
    };
  });

  // ------------------------------------------------------------ 続きから再開 (見ていた位置を記憶)
  let scrollTimer;
  window.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!$("#viewer").hidden) return;
      const top = $(".top").getBoundingClientRect().bottom + 4;
      for (const c of document.querySelectorAll(".cell")) {
        if (c.getBoundingClientRect().bottom > top) { savePos(c.dataset.id); break; }
      }
    }, 250);
  }, { passive: true });

  let posTimer, lastSent = null;
  function savePos(id) {
    store.set("last", id);
    clearTimeout(posTimer);
    posTimer = setTimeout(() => {
      if (id === lastSent) return;
      lastSent = id;
      fetch("/api/pos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
    }, 300);
  }
  window.addEventListener("pagehide", () => {
    const id = store.get("last", null);
    if (id && id !== lastSent) navigator.sendBeacon("/api/pos", new Blob([JSON.stringify({ id })], { type: "application/json" }));
  });

  function resumePosition() {
    // PC側に保存した位置を優先 (スマホ⇔PCで続きができる)
    const p = byId.get(info.lastId || "") || byId.get(store.get("last", ""));
    if (!p) return;
    if (p.month !== curMonth) { curMonth = p.month; renderChips(); renderGrid(); }
    const cell = $(`.cell[data-id="${p.id}"]`);
    if (cell) {
      const head = $(".top").getBoundingClientRect().height;
      window.scrollTo(0, cell.getBoundingClientRect().top + scrollY - head - 2);
      toast("前回の続きから表示しています");
    }
  }

  // ------------------------------------------------------------ history (スマホの戻るで閉じる)
  function pushLayer(name) { history.pushState({ layer: name }, ""); }
  window.addEventListener("popstate", () => {
    if (!$("#viewer").hidden) closeViewer(true);
    else if (!$("#sheet").hidden) closeSheet(true);
  });

  // ------------------------------------------------------------ viewer
  const vImg = $("#vImg"), vBox = $("#vBox"), vStage = $("#vStage"), vCrop = $("#vCrop");
  let loadToken = 0;

  function openViewer(list, idx) {
    viewList = list;
    $("#viewer").hidden = false;
    document.body.style.overflow = "hidden";
    pushLayer("viewer");
    show(idx);
  }

  function closeViewer(fromPop) {
    $("#viewer").hidden = true;
    document.body.style.overflow = "";
    const p = viewList[viewIdx];
    if (filter !== "all") renderGrid();
    if (p) {
      const cell = $(`.cell[data-id="${p.id}"]`);
      if (cell) cell.scrollIntoView({ block: "center" });
    }
    if (!fromPop) history.back();
  }

  function fitBox(w, h) {
    const sw = vStage.clientWidth, sh = vStage.clientHeight;
    const s = Math.min(sw / w, sh / h);
    const bw = Math.round(w * s), bh = Math.round(h * s);
    vBox.style.width = bw + "px";
    vBox.style.height = bh + "px";
    // L版で印刷される範囲 (フチなし・中央合わせ)
    const land = bw >= bh, long = land ? bw : bh, short = land ? bh : bw, r = long / short;
    let cl, cs;
    if (r < L_RATIO) { cl = long; cs = long / L_RATIO; } else { cs = short; cl = short * L_RATIO; }
    vCrop.style.width = (land ? cl : cs) + "px";
    vCrop.style.height = (land ? cs : cl) + "px";
    vCrop.hidden = !guide;
  }

  function show(idx) {
    viewIdx = Math.max(0, Math.min(viewList.length - 1, idx));
    const p = viewList[viewIdx];
    if (!p) return closeViewer();
    const token = ++loadToken;
    vBox.style.transform = "";
    $("#vPos").textContent = `${viewIdx + 1} / ${viewList.length}`;
    $("#vName").textContent = `${p.month.replace("-", "年")}月  ${p.name}`;
    $("#vFav").setAttribute("aria-pressed", p.sel);
    savePos(p.id);
    // まずキャッシュ済みのサムネで即表示 → 高画質に差し替え
    vImg.onload = () => { if (token === loadToken) fitBox(vImg.naturalWidth, vImg.naturalHeight); };
    vImg.src = `/t/${p.id}?v=${p.v}`;
    const big = new Image();
    big.onload = () => { if (token === loadToken) vImg.src = big.src; };
    big.src = `/p/${p.id}?v=${p.v}`;
    for (const d of [1, -1, 2]) {
      const n = viewList[viewIdx + d];
      if (n) new Image().src = `/p/${n.id}?v=${n.v}`;
    }
    if (p.month !== curMonth) { curMonth = p.month; renderChips(); }
    else renderChips();
  }

  function popHeart() {
    const s = document.createElement("div");
    s.className = "pop";
    s.innerHTML = HEART;
    vStage.appendChild(s);
    setTimeout(() => s.remove(), 650);
  }

  function toggleCurrent(withPop) {
    const p = viewList[viewIdx];
    if (!p) return;
    setSel(p, !p.sel);
    if (withPop && p.sel) popHeart();
  }

  $("#vClose").onclick = () => closeViewer();
  $("#vPrev").onclick = () => show(viewIdx - 1);
  $("#vNext").onclick = () => show(viewIdx + 1);
  $("#vFav").onclick = () => toggleCurrent(false);
  $("#vGuide").setAttribute("aria-pressed", guide);
  $("#vGuide").onclick = () => {
    guide = !guide;
    store.set("guide", guide);
    $("#vGuide").setAttribute("aria-pressed", guide);
    vCrop.hidden = !guide;
  };
  window.addEventListener("resize", () => { if (!$("#viewer").hidden && vImg.naturalWidth) fitBox(vImg.naturalWidth, vImg.naturalHeight); });

  // スワイプ: 左右で前後、下で閉じる、ダブルタップで♥
  let tx = 0, ty = 0, dx = 0, dy = 0, tracking = false, lastTap = 0, moved = false, lastTouch = 0;
  vStage.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    tracking = true; moved = false;
    tx = e.touches[0].clientX; ty = e.touches[0].clientY; dx = dy = 0;
    vBox.style.transition = "none";
  }, { passive: true });
  vStage.addEventListener("touchmove", (e) => {
    if (!tracking) return;
    dx = e.touches[0].clientX - tx; dy = e.touches[0].clientY - ty;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
    if (Math.abs(dx) > Math.abs(dy)) vBox.style.transform = `translateX(${dx}px)`;
    else if (dy > 0) vBox.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy, 300) / 1200})`;
  }, { passive: true });
  vStage.addEventListener("touchend", (e) => {
    lastTouch = Date.now();
    if (!tracking) return;
    tracking = false;
    vBox.style.transition = "";
    const w = vStage.clientWidth;
    if (moved && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > Math.min(70, w * 0.18)) {
      const next = dx < 0 ? viewIdx + 1 : viewIdx - 1;
      if (next < 0 || next >= viewList.length) { vBox.style.transform = ""; return; }
      vBox.style.transform = `translateX(${dx < 0 ? -w : w}px)`;
      setTimeout(() => {
        vBox.style.transition = "none";
        show(next);
        requestAnimationFrame(() => { vBox.style.transition = ""; });
      }, 140);
      return;
    }
    if (moved && dy > 110 && dy > Math.abs(dx)) { closeViewer(); return; }
    vBox.style.transform = "";
    if (!moved) {
      const now = Date.now();
      if (now - lastTap < 300) { lastTap = 0; toggleCurrent(true); e.preventDefault(); }
      else lastTap = now;
    }
  });
  vStage.addEventListener("dblclick", () => { if (Date.now() - lastTouch > 1000) toggleCurrent(true); });

  document.addEventListener("keydown", (e) => {
    if ($("#viewer").hidden) {
      if (e.key === "Escape" && !$("#sheet").hidden) closeSheet();
      return;
    }
    if (e.key === "ArrowRight") show(viewIdx + 1);
    else if (e.key === "ArrowLeft") show(viewIdx - 1);
    else if (e.key === "Escape") closeViewer();
    else if (e.key === " " || e.key === "f" || e.key === "Enter") { e.preventDefault(); toggleCurrent(true); }
    else if (e.key === "g") $("#vGuide").click();
  });

  // ------------------------------------------------------------ summary / export
  function renderSummary() {
    const { m, total } = counts();
    $("#sumTotal").textContent = total;
    const max = Math.max(1, ...months.map((mo) => m[mo].sel));
    $("#sumList").innerHTML = months.map((mo) => {
      const c = m[mo];
      return `<li><button data-m="${mo}">${mo.replace("-", "/")}</button>
        <div class="track"><div class="fill" style="width:${(c.sel / max) * 100}%"></div></div>
        <span class="n"><b>${c.sel}</b> / ${c.all}</span></li>`;
    }).join("");
    $("#exportRoot").textContent = info.exportRoot || "";
    $("#heicRow").hidden = !info.heic;
  }

  function openSheet() {
    renderSummary();
    $("#exportResult").textContent = "";
    $("#sheet").hidden = false;
    pushLayer("sheet");
  }
  function closeSheet(fromPop) {
    $("#sheet").hidden = true;
    if (!fromPop) history.back();
  }
  $("#btnSummary").onclick = openSheet;
  $("#sheetClose").onclick = () => closeSheet();
  $("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });
  $("#sumList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]");
    if (!b) return;
    curMonth = b.dataset.m;
    store.set("month", curMonth);
    filter = "sel";
    store.set("filter", filter);
    document.querySelectorAll(".filters button").forEach((x) => x.classList.toggle("on", x.dataset.f === filter));
    closeSheet();
    renderChips(); renderGrid(); scrollChipIntoView(); window.scrollTo(0, 0);
  });

  $("#btnExport").onclick = async () => {
    const btn = $("#btnExport"), out = $("#exportResult");
    const { total } = counts();
    if (!total) { out.textContent = "まだ1枚も選んでいません"; return; }
    btn.disabled = true;
    out.textContent = `${total}枚をコピー中…`;
    try {
      const r = await fetch("/api/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convertHeic: $("#convertHeic").checked }),
      });
      const res = await r.json();
      out.textContent = `✓ ${res.copied}枚をまとめました\n${res.dir}` +
        (res.errors.length ? `\n\n⚠ ${res.errors.length}件失敗:\n${res.errors.slice(0, 5).join("\n")}` : "");
    } catch {
      out.textContent = "失敗しました。PCのサーバー画面を確認してください";
    } finally {
      btn.disabled = false;
    }
  };

  $("#btnRescan").onclick = async () => {
    toast("読み込み直しています…");
    await fetch("/api/rescan", { method: "POST" });
    await load();
    renderChips(); renderGrid(); renderSummary();
    toast(`${photos.length}枚を読み込みました`);
  };

  // ------------------------------------------------------------ PC banner (QR)
  function setupBanner() {
    if (!info.isLocal || store.get("hideBanner", false)) return;
    const a = $("#lanUrl");
    a.textContent = a.href = info.lanUrl;
    $("#pcBanner").hidden = false;
    const draw = () => {
      if (!window.qrcode) return false;
      const q = qrcode(0, "M");
      q.addData(info.lanUrl);
      q.make();
      $("#qr").innerHTML = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
      return true;
    };
    if (!draw()) window.addEventListener("load", draw, { once: true });
    $("#pcBannerClose").onclick = () => { $("#pcBanner").hidden = true; store.set("hideBanner", true); };
  }

  // ------------------------------------------------------------ misc
  let savedTimer;
  function flashSaved() {
    const el = $("#saved");
    el.hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (el.hidden = true), 1400);
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  // 他の端末で選んだ分を反映 (アプリに戻ってきたとき)
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const changed = await load();
      renderChips();
      if (changed) renderGrid();
      else for (const p of photos) { const c = $(`.cell[data-id="${p.id}"]`); if (c) c.classList.toggle("sel", p.sel); }
    } catch {}
  });

  (async () => {
    try {
      await load();
    } catch (e) {
      $("#empty").hidden = false;
      $("#empty").textContent = "サーバーにつながりません: " + e.message;
      return;
    }
    setupBanner();
    renderChips();
    renderGrid();
    resumePosition();
    scrollChipIntoView();
  })();
})();
