"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const { idb } = LP;
  const HEART = '<svg viewBox="0 0 24 24" class="heart"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4h2c.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  const L_RATIO = 127 / 89; // L版 89×127mm

  const store = {
    get(k, d) { try { const v = localStorage.getItem("lp." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("lp." + k, JSON.stringify(v)); } catch {} },
  };

  let photos = [];          // meta: {id, name, dt, month, w, h, sel, at}
  let byId = new Map();
  let months = [];
  let curMonth = null;
  let filter = store.get("filter", "all");
  let since = "2025-05";
  let viewList = [], viewIdx = 0, guide = store.get("guide", false);

  // ------------------------------------------------------------ data
  const sortKey = (p) => `${p.month}|${p.dt || "9"}|${p.name}`;
  // 画面で触っている写真オブジェクトはそのまま使い続ける（読み直しで ♥ が古い状態に戻らないように）
  async function load() {
    const stored = await idb.all("meta");
    photos = stored.map((m) => byId.get(m.id) || m).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
    byId = new Map(photos.map((p) => [p.id, p]));
    recomputeMonths();
  }
  function recomputeMonths() {
    // 他の端末で ♥ を付けた月（この端末に未取り込み）も月ボタンに出す
    months = [...new Set(photos.map((p) => p.month).concat(extras().map((o) => o.month)))].filter(Boolean).sort();
    if (!months.includes(curMonth)) curMonth = months[0] || null;
  }

  async function setSel(p, on) {
    if (inactive) return;
    if (p.sel === on) return;
    p.sel = on;
    p.selAt = Date.now();
    p.synced = false;
    p.userOff = !on; // 自分で外した記録（不具合で外れた分と見分けるため）
    paintSel(p);
    if (navigator.vibrate) navigator.vibrate(8);
    try {
      await idb.put("meta", p);
      markUnsel(p, on);
      flashSaved();
      scheduleSync();
    } catch {
      p.sel = !on;
      paintSel(p);
      toast("保存できませんでした（スマホの空き容量を確認してください）");
    }
  }

  // ------------------------------------------------------------ import
  let cancelImport = false, storageStalled = false;
  const isIOSChrome = /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  async function storageNearlyFull() {
    try {
      const est = await navigator.storage?.estimate?.();
      return !!(est && est.quota && est.usage / est.quota > 0.92);
    } catch { return false; }
  }
  function showStorageHelp(kind) {
    const box = $("#storageHelp");
    box.hidden = false;
    $("#storageHelpTitle").textContent = kind === "full" ? "スマホの保存領域がいっぱいです" : "スマホの保存領域が応答しません";
    $("#storageHelpIOS").hidden = !isIOSChrome;
  }
  async function importFiles(fileList) {
    waiting(false);
    const picked = [...fileList];
    if (!picked.length) return;
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    cancelImport = false;
    const prog = $("#progress");
    prog.hidden = false;
    let skippedOld = 0;
    storageStalled = false;
    if (await storageNearlyFull()) { prog.hidden = true; showStorageHelp("full"); return; }
    // ZIP（PCで作った月別パック）は中の写真に展開
    const files = [];
    let preSkipped = 0;
    for (const f of picked) {
      if (/\.zip$/i.test(f.name) || /zip/.test(f.type)) {
        $("#pTitle").textContent = `ZIPを開いています… ${f.name}`;
        try {
          const hint = LP.monthFromText(f.name);
          for (const ent of await LP.zipEntries(f)) {
            if (/\.(jpe?g|png|webp|heic|heif)$/i.test(ent.name) && !ent.name.split("/").pop().startsWith("._")) files.push({ zip: f, ent, hint });
          }
        } catch (e) { toast(`${f.name}: ${e.message}`); }
      } else {
        if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name) && !/^image\//.test(f.type)) continue; // 動画など
        // PCのフォルダごと取り込み: フォルダ名（202505 など）の年月を優先、対象外の月は開かずに飛ばす
        const rp = f.webkitRelativePath || "";
        const dm = rp.includes("/") ? LP.monthFromText(rp.slice(0, rp.lastIndexOf("/"))) : null;
        if (dm && dm < since) { preSkipped++; continue; }
        files.push(dm ? { file: f, dirHint: dm } : f);
      }
    }
    skippedOld += preSkipped;
    if (!files.length) { prog.hidden = true; toast(preSkipped ? `${since.replace("-", "年")}月以降の写真がありませんでした` : "写真が見つかりませんでした"); return; }
    let added = 0, dup = 0, failed = 0;
    const firstNewMonth = [];
    const upd = (i) => {
      $("#pFill").style.width = `${(i / files.length) * 100}%`;
      $("#pTitle").textContent = `取り込み中… ${i} / ${files.length}`;
      $("#pText").textContent = `追加 ${added}枚` + (skippedOld ? ` ・ ${since.replace("-", "年")}月より前 ${skippedOld}枚は除外` : "") + (dup ? ` ・ 取り込み済み ${dup}枚` : "") + (failed ? ` ・ 読めない ${failed}枚` : "");
    };
    upd(0);
    // 画面が消えると止まるので、取り込み中はスリープさせない
    let wake = null;
    // 待たない（iPhoneのChromeなどでは返事が来ないことがあり、取り込みが 0 のまま止まっていた）
    try { navigator.wakeLock?.request("screen").then((w) => { wake = w; }).catch(() => {}); } catch {}
    const t0 = Date.now();
    let next = 0, done = 0;
    const one = async (f) => {
      try {
        const hint = f.hint, dirHint = f.dirHint;
        if (f.zip) f = await LP.zipFile(f.zip, f.ent);
        else if (f.file) f = f.file;
        const dt = await LP.exifDate(f).catch(() => null);
        const month = dirHint || LP.monthFromDt(dt) || LP.monthFromText(f.name) || hint || LP.monthFromTime(f.lastModified);
        if (month < since) { skippedOld++; return; }
        const id = dt ? `${dt}|${LP.stem(f.name)}` : `${LP.stem(f.name)}|${f.size}`;
        if (byId.has(id)) { dup++; return; }
        byId.set(id, null); // 同時処理での重複防止
        const img = await LP.decode(f);
        const [w, h] = LP.dims(img);
        // 容量節約: 拡大用 1080px・一覧用 240px（1枚あたり 約80KB。1万枚でも 約0.8GB）
        const prev = await LP.resize(img, { long: 1080, q: 0.72 });
        if (img.close) img.close();
        const thumb = await LP.resize(await LP.decode(prev), { short: 240, q: 0.65 });
        const meta = { id, name: f.name, dt, month, w, h, size: f.size, sel: false, at: Date.now() };
        const tb = await thumb.arrayBuffer(), pb = await prev.arrayBuffer();
        await idb.tx(["meta", "thumb", "prev"], "readwrite", (m, t, pv) => { m.put(meta); t.put(tb, id); pv.put(pb, id); });
        byId.set(id, meta);
        photos.push(meta);
        added++;
        if (!firstNewMonth.length) firstNewMonth.push(month);
      } catch (e) {
        failed++;
        if (e && e.name === "StorageStall") storageStalled = true;
        console.warn(f.name, e);
      }
    };
    const worker = async () => {
      while (!cancelImport && next < files.length) {
        const f = files[next++];
        // 1枚で止まらないように時間制限（HEICの変換などで遅い場合も90秒で次へ）
        const slow = setTimeout(() => { $("#pText").textContent += "（時間がかかっている写真があります…）"; }, 15000);
        try { await LP.timeout(one(f), 90000); } catch { failed++; }
        if (storageStalled) cancelImport = true;
        clearTimeout(slow);
        done++;
        upd(done);
        const left = (Date.now() - t0) / done * (files.length - done);
        if (done > 5 && left > 60000) $("#pTitle").textContent += `（あと約${Math.ceil(left / 60000)}分）`;
        if (done % 40 === 0) await refresh(false);
      }
    };
    await Promise.all([worker(), worker()]);
    try { await wake?.release(); } catch {}
    prog.hidden = true;
    if (storageStalled) { showStorageHelp("stall"); return; }
    if (!curMonth && firstNewMonth[0]) curMonth = firstNewMonth[0];
    await load();
    await adoptOrphans();
    await refresh(true);
    if (sheetUrl) syncNow();
    toast(`${added}枚 取り込みました` + (dup ? `（取り込み済み ${dup}枚はスキップ）` : "") + (skippedOld ? `（期間外 ${skippedOld}枚は除外）` : "") + (failed ? ` ・ 読めない写真 ${failed}枚` : ""));
  }
  $("#pCancel").onclick = () => { cancelImport = true; if ($("#pTitle").dataset.wait) { pickAt = 0; waiting(false); } };
  // 写真選択画面から戻ってきたのに写真がまだ届かない＝iPhoneが準備中
  let pickAt = 0, waitTimer;
  function waiting(on) {
    clearTimeout(waitTimer);
    if (!on) { if ($("#pTitle").dataset.wait) { $("#progress").hidden = true; delete $("#pTitle").dataset.wait; } return; }
    $("#pTitle").dataset.wait = "1";
    $("#pTitle").textContent = "写真を受け取っています…";
    $("#pText").textContent = "スマホが写真を準備しています。たくさん選ぶと数分かかることがあります（数千枚以上だと固まることがあるので、1回 1,000枚くらいまでがおすすめ）。";
    $("#pFill").style.width = "0";
    $("#progress").hidden = false;
  }
  for (const id of ["#pick", "#pick2", "#pickZip", "#pickZip2", "#pickDir", "#pickDir2"]) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("click", () => { pickAt = Date.now(); });
    el.addEventListener("cancel", () => { pickAt = 0; waiting(false); });
    el.addEventListener("change", async (e) => { pickAt = 0; await importFiles(e.target.files); e.target.value = ""; });
  }
  const backFromPicker = () => {
    if (!pickAt || Date.now() - pickAt < 800) return;
    waitTimer = setTimeout(() => { if (pickAt) waiting(true); }, 700);
  };
  window.addEventListener("focus", backFromPicker);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") backFromPicker(); });

  async function refresh(full) {
    await load();
    $("#welcome").hidden = photos.length > 0;
    $(".top").hidden = photos.length === 0;
    renderChips();
    if (full) renderGrid();
  }

  // ------------------------------------------------------------ counts
  // この端末に取り込んでいないけど ♥ が付いている写真（他の端末・リスト復元）
  function extras() {
    const seen = new Set(), out = [];
    for (const o of (typeof remoteOnly === "undefined" ? [] : remoteOnly).concat(typeof orphans === "undefined" ? [] : orphans)) {
      const k = (o.dt || "") + "|" + o.name + "|" + o.month;
      if (!seen.has(k)) { seen.add(k); out.push(o); }
    }
    return out;
  }
  function counts() {
    const m = {};
    let total = 0;
    for (const mo of months) m[mo] = { all: 0, sel: 0, other: 0 };
    for (const p of photos) {
      if (p.pruned && !p.sel) continue; // 容量を空けるために消した写真（♥なし）は数えない
      const c = (m[p.month] ||= { all: 0, sel: 0, other: 0 });
      c.all++;
      if (p.sel) { c.sel++; total++; }
    }
    for (const o of extras()) {
      const c = (m[o.month] ||= { all: 0, sel: 0, other: 0 });
      c.sel++; c.other++; total++;
    }
    return { m, total };
  }

  function renderChips() {
    const { m, total } = counts();
    $("#totalCount").textContent = total;
    $("#months").innerHTML = months.map((mo) => {
      const [y, mm] = mo.split("-");
      return `<button class="mchip${mo === curMonth ? " on" : ""}" data-m="${mo}">
        <span class="y">${y}</span><span class="m">${+mm}月</span>
        <span class="c"><b>${m[mo].sel}</b>/${m[mo].all || "–"}</span></button>`;
    }).join("");
    const c = m[curMonth] || { all: 0, sel: 0, other: 0 };
    $("#monthInfo").textContent = curMonth ? `${c.sel}枚 選択中` + (c.other ? `（他の端末 ${c.other}）` : "") + ` / ${c.all}枚` : "";
    if (!$("#viewer").hidden && curMonth) $("#vMonthCount").textContent = `${+curMonth.slice(5)}月 ♥${c.sel}`;
  }

  function scrollChipIntoView() {
    const el = $(`.mchip[data-m="${curMonth}"]`);
    if (el) el.scrollIntoView({ inline: "center", block: "nearest" });
  }

  // ------------------------------------------------------------ thumbnails (IndexedDB → 画面に入ったものだけ)
  const urls = new Map();
  async function thumbUrl(id, kind = "thumb") {
    const key = kind + ":" + id;
    if (urls.has(key)) return urls.get(key);
    const v = await idb.get(kind, id);
    if (!v) return "";
    const u = URL.createObjectURL(v instanceof Blob ? v : new Blob([v], { type: "image/jpeg" }));
    urls.set(key, u);
    return u;
  }
  function dropUrls(keep) {
    for (const [k, u] of urls) {
      if (!keep(k)) { URL.revokeObjectURL(u); urls.delete(k); }
    }
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const cell = e.target;
      io.unobserve(cell);
      thumbUrl(cell.dataset.id).then((u) => {
        const img = cell.firstChild;
        img.onload = () => img.classList.add("ok");
        img.src = u;
      });
    }
  }, { rootMargin: "800px 0px" });

  // ------------------------------------------------------------ grid
  // 一度でも ♥ を付けたことがあるのに、今は ♥ が無い写真（不具合で外れた分の復元用）
  // ・自分で外した（userOff、または修正後の版で外した＝synced:false）→ 戻さない
  // ・スプシ送信済みなのに外れた（synced:true）→ 不具合で外れた → 戻す
  // ・それ以外（昨日の修正より前）→ どちらか分からない → 1枚ずつ確認
  const lostByBug = (p) => !p.pruned && !p.sel && !!p.selAt && !p.userOff && p.synced === true;
  const lostUnknown = (p) => !p.pruned && !p.sel && !!p.selAt && !p.userOff && p.synced === undefined;
  const wasSel = (p) => lostByBug(p) || lostUnknown(p);
  const noFace = (p) => !p.sel && !p.pruned && p.faceChecked && !p.faces;
  function listFor(month, f) {
    return photos.filter((p) => p.month === month && !(p.pruned && !p.sel) && (f === "all" || (f === "sel" ? p.sel : f === "was" ? wasSel(p) : f === "noface" ? noFace(p) : !p.sel)));
  }

  function renderGrid() {
    const grid = $("#grid");
    io.disconnect();
    const list = listFor(curMonth, filter);
    const ids = new Set(list.map((p) => "thumb:" + p.id));
    dropUrls((k) => ids.has(k));
    const frag = document.createDocumentFragment();
    for (const p of list) {
      const d = document.createElement("div");
      d.className = "cell" + (p.sel ? " sel" : "");
      d.dataset.id = p.id;
      d.innerHTML = `<img alt="" decoding="async"><button class="hb" aria-label="印刷に選ぶ">${HEART}</button>`;
      frag.appendChild(d);
      io.observe(d);
    }
    grid.replaceChildren(frag);
    const empty = $("#empty");
    empty.hidden = list.length > 0 || photos.length === 0;
    const other = extras().filter((o) => o.month === curMonth).length;
    if (!photos.some((p) => p.month === curMonth)) {
      empty.hidden = false;
      empty.textContent = `この月の写真は、この端末にはまだ取り込んでいません。` + (other ? `（他の端末で ♥ ${other}枚 選択済み）` : "");
    } else if (!list.length) empty.textContent = filter === "sel" ? "この月はまだ選んでいません" : filter === "was" ? "この月は、外れた ♥ はありません" : filter === "noface" ? "この月は、顔なしと判定された写真はありません" : "この月は全部選びました";
  }

  function paintSel(p) {
    const cell = $(`.cell[data-id="${CSS.escape(p.id)}"]`);
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

  function goMonth(m) {
    curMonth = m;
    store.set("month", curMonth);
    renderChips();
    renderGrid();
    scrollChipIntoView();
    window.scrollTo(0, 0);
  }
  $("#months").addEventListener("click", (e) => {
    const b = e.target.closest(".mchip");
    if (b) goMonth(b.dataset.m);
  });

  function setFilter(f) {
    filter = f;
    store.set("filter", filter);
    document.querySelectorAll(".filters button").forEach((x) => x.classList.toggle("on", x.dataset.f === f));
  }
  document.querySelectorAll(".filters button").forEach((b) => {
    b.onclick = () => { setFilter(b.dataset.f); renderGrid(); window.scrollTo(0, 0); };
  });
  setFilter(filter);

  // ------------------------------------------------------------ 続きから再開
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
  const savePos = (id) => idb.put("kv", id, "last").catch(() => {});

  async function resumePosition() {
    const p = byId.get(await idb.get("kv", "last").catch(() => null));
    if (!p) return;
    if (p.month !== curMonth) { curMonth = p.month; renderChips(); renderGrid(); }
    const cell = $(`.cell[data-id="${CSS.escape(p.id)}"]`);
    if (cell && cell.offsetTop > 200) {
      const head = $(".top").getBoundingClientRect().height;
      window.scrollTo(0, cell.getBoundingClientRect().top + scrollY - head - 2);
      toast("前回の続きから表示しています");
    }
  }

  // ------------------------------------------------------------ history (戻るで閉じる)
  const pushLayer = (name) => history.pushState({ layer: name }, "");
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
    dropUrls((k) => !k.startsWith("prev:"));
    const p = viewList[viewIdx];
    if (filter !== "all") renderGrid();
    if (p) {
      const cell = $(`.cell[data-id="${CSS.escape(p.id)}"]`);
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
    // L版でフチなし印刷される範囲（中央合わせ）
    const land = bw >= bh, long = land ? bw : bh, short = land ? bh : bw, r = long / short;
    let cl, cs;
    if (r < L_RATIO) { cl = long; cs = long / L_RATIO; } else { cs = short; cl = short * L_RATIO; }
    vCrop.style.width = (land ? cl : cs) + "px";
    vCrop.style.height = (land ? cs : cl) + "px";
    vCrop.hidden = !guide;
  }

  async function show(idx) {
    viewIdx = Math.max(0, Math.min(viewList.length - 1, idx));
    const p = viewList[viewIdx];
    if (!p) return closeViewer();
    const token = ++loadToken;
    vBox.style.transform = "";
    $("#vPos").textContent = `${viewIdx + 1} / ${viewList.length}`;
    $("#vName").textContent = `${p.dt ? p.dt.slice(0, 16).replace(/:/, "/").replace(/:/, "/") : p.month}  ${p.name}`;
    $("#vFav").setAttribute("aria-pressed", p.sel);
    if (p.w && p.h) fitBox(p.w, p.h);
    savePos(p.id);
    if (p.month !== curMonth) curMonth = p.month;
    renderChips();
    // まずサムネで即表示 → 大きい画像に差し替え
    const t = await thumbUrl(p.id);
    if (token !== loadToken) return;
    vImg.src = t;
    const big = await thumbUrl(p.id, "prev");
    if (token !== loadToken) return;
    vImg.src = big;
    // 前後を先読み & 遠いものは解放
    const near = new Set();
    for (const d of [-2, -1, 1, 2, 0]) {
      const n = viewList[viewIdx + d];
      if (n) { near.add("prev:" + n.id); thumbUrl(n.id, "prev"); }
    }
    dropUrls((k) => !k.startsWith("prev:") || near.has(k));
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
  window.addEventListener("resize", () => {
    const p = viewList[viewIdx];
    if (!$("#viewer").hidden && p) fitBox(p.w, p.h);
  });

  // スワイプ: 左右で前後、下で閉じる、2回タップで♥
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

  // ------------------------------------------------------------ まとめ
  async function renderSummary() {
    const { m, total } = counts();
    $("#sumTotal").textContent = total;
    const max = Math.max(1, ...months.map((mo) => m[mo].sel));
    $("#sumList").innerHTML = months.map((mo) => {
      const c = m[mo];
      return `<li><button data-m="${mo}">${mo.replace("-", "/")}</button>
        <div class="track"><div class="fill" style="width:${(c.sel / max) * 100}%"></div></div>
        <span class="n"><b>${c.sel}</b> / ${c.all || "–"}</span></li>`;
    }).join("");
    $("#since").value = since;
    renderFaceBox();
    const bug = photos.filter(lostByBug), unk = photos.filter(lostUnknown);
    $("#restoreBox").hidden = !bug.length && !unk.length;
    const perText = (list) => {
      const per = {};
      for (const p of list) per[p.month] = (per[p.month] || 0) + 1;
      return Object.keys(per).sort().map((m) => `${+m.slice(5)}月 ${per[m]}`).join("・");
    };
    $("#restoreCount").textContent = bug.length;
    $("#restoreDetail").textContent = bug.length ? `（${perText(bug)}）` : "";
    $("#btnRestoreAll").hidden = !bug.length;
    $("#unknownCount").textContent = unk.length;
    $("#unknownDetail").textContent = unk.length ? `（${perText(unk)}）` : "";
    $("#unknownRow").hidden = !unk.length;
    $("#pcLink").textContent = location.href.replace(/[^/]*$/, "") + "pc.html";
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      $("#storageInfo").textContent = `このアプリの保存データ: 約${Math.round(est.usage / 1048576)}MB` +
        (persisted ? "（消えにくい設定 ON）" : "");
    }
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
    setFilter("sel");
    closeSheet();
    goMonth(b.dataset.m);
  });

  function buildList() {
    const items = photos.filter((p) => p.sel).map((p) => ({ name: p.name, dt: p.dt, month: p.month, w: p.w, h: p.h }))
      .concat(orphans.concat(remoteOnly).map((o) => ({ name: o.name, dt: o.dt || null, month: o.month })));
    return { app: "l-picker", version: 1, created: new Date().toISOString(), since, count: items.length, items };
  }

  $("#btnExport").onclick = async () => {
    const out = $("#exportResult");
    const list = buildList();
    if (!list.count) { out.textContent = "まだ1枚も選んでいません"; return; }
    const name = `L版リスト_${LP.stamp()}.json`;
    const file = new File([JSON.stringify(list, null, 1)], name, { type: "application/json" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        out.textContent = `✓ ${list.count}枚分のリストを送りました。\nPCで上のページを開いて、このファイルを選んでください。`;
        return;
      }
    } catch (e) {
      if (e.name === "AbortError") return;
    }
    LP.download(file, name);
    out.textContent = `✓ ${name} を保存しました（${list.count}枚分）。\nPCに送って、PCで上のページを開いてください。`;
  };

  $("#btnRestoreAll").onclick = async () => {
    const was = photos.filter(lostByBug);
    if (!was.length) return;
    if (!confirm(`不具合で外れた ${was.length}枚の ♥ を戻します。\n（自分で外した写真は戻しません）`)) return;
    const now = Date.now();
    for (const p of was) {
      p.sel = true; p.selAt = now; p.synced = false;
      delete unsel[skey(p)];
      await idb.put("meta", p);
    }
    await idb.put("kv", unsel, "unsel");
    renderChips(); renderGrid(); renderSummary();
    scheduleSync(300);
    toast(`${was.length}枚の ♥ を戻しました`);
  };
  // ------------------------------------------------------------ 顔が写っていない写真を探す（スマホの中だけで判定）
  let faceLib;
  function loadFaceLib() {
    return (faceLib ||= new Promise((res, rej) => {
      const sc = document.createElement("script");
      sc.src = "vendor/face/face-api.js";
      sc.onload = async () => {
        try {
          await faceapi.nets.tinyFaceDetector.loadFromUri("vendor/face");
          res(faceapi);
        } catch (e) { faceLib = null; rej(e); }
      };
      sc.onerror = () => { faceLib = null; rej(new Error("顔判定を読み込めませんでした")); };
      document.head.appendChild(sc);
    }));
  }
  const faceRange = () => [$("#faceFrom").value || "0000-00", $("#faceTo").value || "9999-99"];
  const faceTargets = () => { const [a, b] = faceRange(); return photos.filter((p) => p.month >= a && p.month <= b && !p.sel && !p.pruned); };
  function renderFaceBox() {
    const [a, b] = faceRange();
    const t = faceTargets(), todo = t.filter((p) => !p.faceChecked).length, nf = t.filter(noFace).length;
    $("#faceInfo").textContent = `対象（♥ なし）${t.length}枚` + (t.length - todo ? ` ・ 判定済み ${t.length - todo}枚` : "") + (nf ? ` ・ 顔なし ${nf}枚` : "");
    $("#faceAfter").hidden = !nf;
    $("#faceNoCount").textContent = nf;
    $("#btnFaceScan").textContent = todo && todo < t.length ? `続きを判定する（残り ${todo}枚）` : "顔が写っていない写真を探す";
    document.querySelector('.filters [data-f="noface"]').hidden = !photos.some(noFace);
  }
  for (const id of ["#faceFrom", "#faceTo"]) $(id).addEventListener("change", renderFaceBox);
  $("#btnFaceScan").onclick = async () => {
    const todo = faceTargets().filter((p) => !p.faceChecked);
    if (!todo.length) { renderFaceBox(); toast("判定する写真はありません"); return; }
    const prog = $("#progress");
    cancelImport = false;
    prog.hidden = false;
    $("#pTitle").textContent = "顔を判定する準備中…";
    $("#pText").textContent = "判定はスマホの中だけで行い、写真はどこにも送りません。";
    $("#pFill").style.width = "0";
    let fa;
    try { fa = await loadFaceLib(); } catch (e) { prog.hidden = true; toast(e.message); return; }
    const opt = new fa.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 });
    const cv = document.createElement("canvas");
    const t0 = Date.now();
    let done = 0, found = 0, pending = [];
    const flush = async () => { const b = pending; pending = []; if (b.length) await idb.tx("meta", "readwrite", (m) => { for (const p of b) m.put(p); }); };
    try {
      for (const p of todo) {
        if (cancelImport) break;
        const v = await idb.get("prev", p.id);
        if (v) {
          const bmp = await createImageBitmap(v instanceof Blob ? v : new Blob([v], { type: "image/jpeg" }));
          cv.width = bmp.width; cv.height = bmp.height;
          cv.getContext("2d").drawImage(bmp, 0, 0);
          if (bmp.close) bmp.close();
          const r = await fa.detectAllFaces(cv, opt);
          p.faces = r.length;
          if (!r.length) found++;
        } else p.faces = 1; // 画像が無いものは消さない側に倒す
        p.faceChecked = true;
        pending.push(p);
        done++;
        if (pending.length >= 50) await flush();
        const left = (Date.now() - t0) / done * (todo.length - done);
        $("#pTitle").textContent = `顔を判定中… ${done} / ${todo.length}`;
        $("#pFill").style.width = `${(done / todo.length) * 100}%`;
        $("#pText").textContent = `顔なし ${found}枚` + (done > 5 ? ` ・ あと約${Math.max(1, Math.ceil(left / 60000))}分` : "") + "（中止しても、判定した分は保存されます）";
      }
      await flush();
    } catch (e) {
      try { await flush(); } catch {}
      if (e && e.name === "StorageStall") { prog.hidden = true; showStorageHelp("stall"); return; }
      toast("途中で止まりました。もう一度押すと続きから判定します");
    }
    prog.hidden = true;
    renderFaceBox();
    toast(`判定しました。顔なし ${found}枚`);
  };
  $("#btnFaceReview").onclick = () => {
    const first = faceTargets().find(noFace) || photos.find(noFace);
    setFilter("noface");
    closeSheet();
    if (first) goMonth(first.month); else renderGrid();
  };
  $("#btnFacePrune").onclick = async () => {
    const t = faceTargets().filter(noFace);
    if (!t.length) return;
    if (!confirm(`顔が写っていないと判定された ${t.length}枚の取り込みデータを消します。\n♥ の写真は消しません。元の写真（iPhone・PC）は消えません。\n（後ろ姿などで顔が見えない写真も含まれます。先に「確認する」で見て、残したい写真に ♥ を付けておくと安全です）`)) return;
    const prog = $("#progress");
    prog.hidden = false;
    let done = 0;
    try {
      for (let i = 0; i < t.length; i += 150) {
        const batch = t.slice(i, i + 150);
        await idb.tx(["meta", "thumb", "prev"], "readwrite", (m, th, pv) => {
          for (const p of batch) { p.pruned = true; m.put(p); th.delete(p.id); pv.delete(p.id); }
        });
        done += batch.length;
        $("#pTitle").textContent = `消しています… ${done} / ${t.length}`;
        $("#pFill").style.width = `${(done / t.length) * 100}%`;
      }
    } catch (e) {
      prog.hidden = true;
      if (e && e.name === "StorageStall") { showStorageHelp("stall"); return; }
    }
    prog.hidden = true;
    dropUrls(() => false);
    if (filter === "noface") setFilter("all");
    renderChips(); renderGrid(); renderSummary();
    toast(`顔なしの ${done}枚を消しました`);
  };

  // ------------------------------------------------------------ 決め終わった月の容量を空ける
  function pruneTargets(until) {
    return photos.filter((p) => p.month <= until && !p.sel && !p.pruned);
  }
  $("#pruneUntil").addEventListener("change", () => {
    const v = $("#pruneUntil").value;
    if (!v) { $("#pruneInfo").textContent = ""; return; }
    const t = pruneTargets(v), keep = photos.filter((p) => p.month <= v && p.sel).length;
    $("#pruneInfo").textContent = `${photos[0] ? photos[0].month.replace("-", "/") : ""}〜${v.replace("-", "/")}：♥ が無い ${t.length}枚 を消します（♥ の ${keep}枚は残します）`;
  });
  $("#btnPrune").onclick = async () => {
    const v = $("#pruneUntil").value;
    if (!v) { $("#pruneInfo").textContent = "どの月まで決め終わったか選んでください"; return; }
    const t = pruneTargets(v);
    if (!t.length) { $("#pruneInfo").textContent = "消せる写真はありません"; return; }
    const keep = photos.filter((p) => p.month <= v && p.sel).length;
    if (!confirm(`${v.replace("-", "年")}月までの、♥ が付いていない ${t.length}枚の取り込みデータを消します。\n♥ の ${keep}枚は残します。iPhone や PC の元の写真は消えません。\n（消した写真は、その月の一覧に出なくなります）`)) return;
    const prog = $("#progress");
    cancelImport = false;
    prog.hidden = false;
    let done = 0;
    try {
      for (let i = 0; i < t.length && !cancelImport; i += 150) {
        const batch = t.slice(i, i + 150);
        await idb.tx(["meta", "thumb", "prev"], "readwrite", (m, th, pv) => {
          for (const p of batch) { p.pruned = true; m.put(p); th.delete(p.id); pv.delete(p.id); }
        });
        done += batch.length;
        $("#pTitle").textContent = `容量を空けています… ${done} / ${t.length}`;
        $("#pFill").style.width = `${(done / t.length) * 100}%`;
        $("#pText").textContent = "♥ の写真はそのまま残します。";
      }
      dropUrls(() => false);
      prog.hidden = true;
      renderChips(); renderGrid(); renderSummary();
      toast(`${done}枚の取り込みデータを消して、容量を空けました`);
    } catch (e) {
      prog.hidden = true;
      if (e && e.name === "StorageStall") showStorageHelp("stall");
      else toast(`途中で止まりました（${done}枚まで完了）。もう一度押すと続きから消します`);
    }
  };

  $("#btnKeepOff").onclick = async () => {
    const unk = photos.filter(lostUnknown);
    if (!unk.length || !confirm(`どちらか分からない ${unk.length}枚を、外したままにします。`)) return;
    for (const p of unk) { p.userOff = true; await idb.put("meta", p); }
    renderGrid(); renderSummary();
    toast(`${unk.length}枚は外したままにしました`);
  };
  $("#btnReviewWas").onclick = () => {
    const first = photos.find(lostUnknown) || photos.find(wasSel);
    setFilter("was");
    closeSheet();
    if (first) goMonth(first.month); else { renderGrid(); }
  };

  $("#since").addEventListener("change", async (e) => {
    const v = e.target.value;
    if (!/^\d{4}-\d\d$/.test(v)) return;
    since = v;
    await idb.put("kv", since, "since");
    $("#sinceLabel").textContent = `${+v.slice(0, 4)}年${+v.slice(5)}月`;
    toast(`${v.replace("-", "年")}月以降を取り込みます`);
  });

  $("#restore").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const list = JSON.parse(await f.text());
      const { hit } = await applyList(list.items || []);
      scheduleSync();
      renderChips(); renderGrid(); renderSummary();
      toast(`${hit} / ${(list.items || []).length}枚の ♥ を復元しました`);
    } catch {
      toast("リストを読めませんでした");
    }
  });

  $("#btnClearAll").onclick = async () => {
    if (!confirm("取り込んだ写真と ♥ をすべて消します（元の写真は消えません）。よろしいですか？")) return;
    await idb.tx(["meta", "thumb", "prev", "kv"], "readwrite", (...s) => s.forEach((o) => o.clear()));
    dropUrls(() => false);
    orphans = [];
    if (sheetUrl) await idb.put("kv", sheetUrl, "sheetUrl");
    closeSheet();
    await refresh(true);
  };

  // ------------------------------------------------------------ 照合 (リスト/スプシ → ♥)
  function findPhoto(it) {
    return indexer()(it);
  }
  // items を ♥ にする。見つからない分は orphans として保持（あとで取り込んだら自動で ♥）
  async function applyList(items) {
    let hit = 0;
    const miss = [];
    const match = indexer();
    for (const it of items) {
      const p = match(it);
      if (!p) { miss.push(it); continue; }
      hit++;
      if (!p.sel) { p.sel = true; p.selAt = Date.parse(it.at) || Date.now(); await idb.put("meta", p); }
    }
    const key = (it) => `${it.dt}|${it.name}`;
    const known = new Set(orphans.map(key));
    for (const it of miss) if (!known.has(key(it))) orphans.push(it);
    await idb.put("kv", orphans, "orphans");
    return { hit, miss: miss.length };
  }
  async function adoptOrphans() {
    if (!orphans.length) return;
    const rest = orphans;
    orphans = [];
    await applyList(rest);
  }

  // ------------------------------------------------------------ Googleスプレッドシートに自動保存（端末どうしで合体）
  // スプシ = 全端末の ♥ の合計。保存のたびに「読む → この端末の変更を合体 → 書く」ので、他の端末の ♥ は消さない。
  //  - スプシにあってこの端末に無い ♥ → この端末でも ♥（未取り込みなら「他の端末の ♥」として数える）
  //  - この端末で前回の同期より後に付けた ♥ → スプシに追加
  //  - この端末で前回の同期より後に外した ♥ → スプシから外す
  //  - 前回の同期では有ったのにスプシから消えている ♥ → 他の端末で外した → この端末でも外す
  let sheetUrl = null, orphans = [], remoteOnly = [], unsel = {}, syncTimer, syncing = false, dirty = false;
  // 写真の見分け方: 撮影日時＋ファイル名（同じ秒に撮った連写も別の写真として扱う）
  const skey = (it) => (it.dt ? `${it.dt}|${LP.stem(it.name)}` : `${LP.stem(it.name)}|${it.month}`);
  // スプシの行 → この端末の写真（名前が変わっていても、同じ撮影日時の写真が1枚だけならそれ）
  function indexer() {
    const byKey = new Map(), byDt = new Map();
    for (const p of photos) {
      byKey.set(skey(p), p);
      if (p.dt) (byDt.get(p.dt) || byDt.set(p.dt, []).get(p.dt)).push(p);
    }
    return (r) => byKey.get(skey(r)) || (r.dt && byDt.get(r.dt)?.length === 1 ? byDt.get(r.dt)[0] : null);
  }
  const rowOf = (p) => ({ month: p.month, name: p.name, dt: p.dt || "", at: new Date(p.selAt || p.at || Date.now()).toISOString() });

  function setCloud(state, msg) {
    const el = $("#cloud");
    el.hidden = !sheetUrl;
    el.dataset.s = state;
    el.textContent = { ok: "☁ スプシ保存済み", wait: "☁ 保存中…", err: "☁ 未保存・再試行します" }[state] || "";
    const st = $("#sheetStatus");
    if (st) st.textContent = msg || (sheetUrl ? el.textContent : "未接続");
  }
  function markUnsel(p, on) {
    const k = skey(p);
    if (on) delete unsel[k]; else unsel[k] = Date.now();
    idb.put("kv", unsel, "unsel").catch(() => {});
  }
  function scheduleSync(delay = 1200) {
    if (!sheetUrl) return;
    dirty = true;
    setCloud("wait");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, delay);
  }
  async function pullSheet(url) {
    const r = await fetch(url, { cache: "no-store", signal: LP.abortAfter(30000) });
    const j = await r.json();
    if (!j.ok) throw new Error("ng");
    return (j.items || []).filter((it) => it.name);
  }
  async function syncNow() {
    if (!sheetUrl || syncing) return;
    syncing = true;
    dirty = false;
    setCloud("wait");
    const start = Date.now();
    let changed = 0;
    try {
      let remote = await pullSheet(sheetUrl);
      const lastSync = (await idb.get("kv", "lastSync")) || 0;
      const match = indexer();
      // この端末で送信済みの ♥ のうち、スプシに見当たらないもの（＝他の端末で外された？）
      const missing = (rows) => {
        const seen = new Set();
        for (const r of rows) { const p = match(r); seen.add(p ? p.id : "r:" + skey(r)); }
        return photos.filter((p) => p.sel && p.synced && (p.selAt || p.at || 0) < lastSync && !seen.has(p.id));
      };
      let drops = missing(remote);
      if (drops.length) {
        // 安全装置: 他の端末が書き込み中のスプシを読んだだけかもしれないので、少し待って読み直して確かめる
        await new Promise((r) => setTimeout(r, 4000));
        remote = await pullSheet(sheetUrl);
        const again = new Set(missing(remote).map((p) => p.id));
        drops = drops.filter((p) => again.has(p.id));
        const syncedCount = photos.filter((p) => p.sel && p.synced).length;
        // 一度にたくさん消えるのは不自然 → 消さずにスプシへ戻す
        if (drops.length > Math.max(3, syncedCount * 0.2)) drops = [];
      }
      const dropIds = new Set(drops.map((p) => p.id));
      const result = new Map();
      for (const r of remote) {
        const p = match(r);
        const k = p ? skey(p) : skey(r);
        if (result.has(k)) continue;
        if (unsel[k] > lastSync || unsel[r.dt || ""] > lastSync) continue;   // この端末で外した
        if (p) {
          if (!p.sel) { p.sel = true; p.synced = true; p.selAt = Math.min(Date.parse(r.at) || 0, start - 1) || start - 1; await idb.put("meta", p); changed++; }
          result.set(k, rowOf(p));
        } else result.set(k, { month: r.month, name: r.name, dt: r.dt || "", at: r.at || "" });
      }
      for (const p of photos) {
        if (!p.sel) continue;
        const k = skey(p);
        if (result.has(k)) continue;
        if (dropIds.has(p.id)) { p.sel = false; await idb.put("meta", p); changed++; }   // 他の端末で外された（2回確認済み）
        else result.set(k, rowOf(p));                                                    // それ以外はスプシに入れる
      }
      for (const o of orphans) {
        const k = skey(o);
        if (!result.has(k) && !(unsel[k] > lastSync)) result.set(k, { month: o.month, name: o.name, dt: o.dt || "", at: o.at || new Date().toISOString() });
      }
      const localKeys = new Set(photos.map(skey));
      remoteOnly = [...result.entries()].filter(([k]) => !localKeys.has(k)).map(([, v]) => v);
      orphans = [];
      recomputeMonths();
      const { m } = counts();
      const items = [...result.values()].sort((a, b) => (a.month + a.dt + a.name < b.month + b.dt + b.name ? -1 : 1));
      const r = await fetch(sheetUrl, {
        signal: LP.abortAfter(30000),
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ items, months: months.map((mo) => ({ month: mo, sel: m[mo].sel, all: m[mo].all })) }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error("ng");
      await idb.put("kv", start, "lastSync");
      for (const p of photos) if (p.sel && !p.synced && result.has(skey(p)) && (p.selAt || 0) < start) { p.synced = true; await idb.put("meta", p); }
      for (const k of Object.keys(unsel)) if (unsel[k] <= start) delete unsel[k];
      await idb.put("kv", unsel, "unsel");
      await idb.put("kv", remoteOnly, "remoteOnly");
      await idb.put("kv", orphans, "orphans");
      if (!dirty) setCloud("ok");
    } catch {
      dirty = true;
      setCloud("err");
      clearTimeout(syncTimer);
      syncTimer = setTimeout(syncNow, 15000);
    } finally {
      syncing = false;
    }
    renderChips();
    if (changed && $("#viewer").hidden) renderGrid();
    if (dirty && $("#cloud").dataset.s !== "err") { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 800); }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && sheetUrl) syncNow(); });
  window.addEventListener("online", () => { if (sheetUrl) syncNow(); });

  $("#sheetSave").onclick = async () => {
    const url = $("#sheetUrl").value.trim();
    if (!url) {
      sheetUrl = null;
      await idb.del("kv", "sheetUrl");
      setCloud("", "未接続");
      return;
    }
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { setCloud("", "URLが違うようです（https://script.google.com/macros/s/…/exec）"); return; }
    setCloud("", "接続テスト中…");
    try {
      await pullSheet(url);
      if (url !== sheetUrl) await idb.put("kv", 0, "lastSync"); // 新しいスプシ → 全部合体し直す
      sheetUrl = url;
      await idb.put("kv", url, "sheetUrl");
      await syncNow();
      renderGrid();
      toast("スプレッドシートに接続しました。他の端末の ♥ とも合体して自動保存します");
    } catch {
      setCloud("", "つながりませんでした。デプロイ時に「アクセスできるユーザー: 全員」になっているか確認してください");
    }
  };
  $("#copyGs").onclick = async () => {
    try {
      const code = await (await fetch("sheet-sync.gs")).text();
      await navigator.clipboard.writeText(code);
      toast("コードをコピーしました。Apps Script に貼り付けてください");
    } catch {
      location.href = "sheet-sync.gs";
    }
  };

  // ------------------------------------------------------------ misc
  let toastTimer, savedTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }
  function flashSaved() {
    const el = $("#saved");
    el.hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (el.hidden = true), 1400);
  }

  $("#iosTip").hidden = !isIOSChrome;
  // 同じアプリを複数のタブで開くと、古いタブが古い ♥ でスプシを書き換えてしまう → 最後に開いたタブだけ動かす
  let inactive = false;
  try {
    const bc = new BroadcastChannel("l-picker");
    const me = Math.random().toString(36).slice(2);
    bc.postMessage({ hello: me });
    bc.onmessage = (e) => {
      if (!e.data || !e.data.hello || e.data.hello === me) return;
      inactive = true;
      sheetUrl = null; // このタブからはもう保存しない
      clearTimeout(syncTimer);
      $("#tabGone").hidden = false;
    };
  } catch {}
  (async () => {
    try {
      since = (await idb.get("kv", "since")) || since;
      sheetUrl = (await idb.get("kv", "sheetUrl")) || null;
      orphans = (await idb.get("kv", "orphans")) || [];
      remoteOnly = (await idb.get("kv", "remoteOnly")) || [];
      unsel = (await idb.get("kv", "unsel")) || {};
      if (sheetUrl) { $("#sheetUrl").value = sheetUrl; setCloud("ok"); }
      $("#sinceLabel").textContent = `${+since.slice(0, 4)}年${+since.slice(5)}月`;
      curMonth = store.get("month", null);
      // 写真が多いと読み込みに時間がかかるので、読み込み中と分かるようにする
      $("#empty").hidden = false;
      $("#empty").textContent = "スマホに保存した写真を読み込み中…（枚数が多いと少しかかります）";
      $("#totalCount").textContent = "…";
      await refresh(true);
      document.querySelector('.filters [data-f="noface"]').hidden = !photos.some(noFace);
      scrollChipIntoView();
      await resumePosition();
      if (sheetUrl) syncNow();
    } catch (e) {
      if (e && e.name === "StorageStall") { showStorageHelp("stall"); return; }
      $("#empty").hidden = false;
      $("#empty").textContent = "このブラウザでは保存領域が使えません（プライベートブラウズをオフにしてください）";
    }
  })();
})();
