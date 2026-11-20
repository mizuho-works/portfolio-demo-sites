"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const IMG = /\.(jpe?g|png|webp|heic|heif)$/i;
  const DECODABLE = /\.(jpe?g|png|webp)$/i;
  const YEAR_ONLY = /^(20\d{2})年?$/;
  const canFS = "showDirectoryPicker" in window;
  if (!canFS) $("#unsupported").hidden = false;

  let list = null;   // {items:[{name, dt, month}]}
  let files = [];    // {h, name, path, month, dt?}
  let matches = [];  // [{item, file|null}]

  // ------------------------------------------------------------ フォルダを歩く
  async function walk(dir, since, onFile, path = "") {
    const sinceYear = +since.slice(0, 4);
    const dirMonth = path ? LP.monthFromText(path) : null;
    for await (const [name, h] of dir.entries()) {
      if (name.startsWith(".") || name.startsWith("$") || name.startsWith("._")) continue;
      const p = path ? `${path}/${name}` : name;
      if (h.kind === "directory") {
        const m = LP.monthFromText(p), y = YEAR_ONLY.exec(name);
        if (m && m < since) continue;                 // 対象より前の月は飛ばす
        if (!m && y && +y[1] < sinceYear) continue;   // 対象より前の年も飛ばす
        await walk(h, since, onFile, p);
      } else if (IMG.test(name)) {
        await onFile({ h, name, path: p, dirMonth });
      }
    }
  }

  async function fileMonth(f) {
    if (f.dirMonth) return f.dirMonth;
    const m = LP.monthFromText(f.name);
    if (m) return m;
    const file = await f.h.getFile();
    f.dt = await LP.exifDate(file).catch(() => null);
    return LP.monthFromDt(f.dt) || LP.monthFromTime(file.lastModified);
  }
  async function fileDt(f) {
    if (f.dt === undefined) f.dt = await LP.exifDate(await f.h.getFile()).catch(() => null);
    return f.dt;
  }

  // ------------------------------------------------------------ 1. リスト
  async function loadList(file) {
    try {
      const j = JSON.parse(await file.text());
      if (!Array.isArray(j.items)) throw 0;
      list = j;
    } catch {
      $("#listInfo").textContent = "リストを読めませんでした。スマホで作った L版リスト_….json を選んでください。";
      return;
    }
    const per = {};
    for (const it of list.items) per[it.month] = (per[it.month] || 0) + 1;
    $("#listInfo").innerHTML = `<b>${list.items.length}枚</b> ・ ` +
      Object.keys(per).sort().map((m) => `${m.replace("-", "/")}: ${per[m]}枚`).join(" ／ ");
    $("#pickSrc").disabled = !canFS;
    $("#s1").classList.add("done");
  }
  $("#listFile").addEventListener("change", (e) => e.target.files[0] && loadList(e.target.files[0]));
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => /\.json$/i.test(x.name));
    if (f) loadList(f);
  });

  // ------------------------------------------------------------ 2. 元フォルダ → 照合
  $("#pickSrc").onclick = async () => {
    let dir;
    try { dir = await showDirectoryPicker({ id: "lp-src", mode: "read" }); } catch { return; }
    const info = $("#srcInfo");
    const since = list.items.reduce((a, it) => (it.month < a ? it.month : a), list.since || "2025-05");
    files = [];
    info.textContent = "写真を探しています…";
    await walk(dir, since, async (f) => {
      files.push(f);
      if (files.length % 200 === 0) info.textContent = `写真を探しています… ${files.length}枚`;
    });
    info.textContent = `${files.length}枚の中から照合しています…`;

    const byStem = new Map();
    for (const f of files) {
      const s = LP.stem(f.name);
      if (!byStem.has(s)) byStem.set(s, []);
      byStem.get(s).push(f);
    }
    for (const f of files) f.month = f.dirMonth || LP.monthFromText(f.name);
    matches = [];
    let i = 0;
    for (const it of list.items) {
      matches.push({ item: it, file: await findFile(it, byStem) });
      if (++i % 10 === 0) info.textContent = `照合しています… ${i} / ${list.items.length}`;
    }
    const miss = matches.filter((m) => !m.file);
    info.innerHTML = `<b>${matches.length - miss.length} / ${matches.length}枚</b> 見つかりました（${dir.name}）` +
      (miss.length ? `<details open><summary>見つからない ${miss.length}枚</summary><ul>${miss.map((m) =>
        `<li>${esc(m.item.name)} <small>${m.item.dt || m.item.month}</small></li>`).join("")}</ul>
        <small>別のフォルダにあるかもしれません。もう一度「写真フォルダを選ぶ」で、もっと上のフォルダを選んでみてください。</small></details>` : "");
    $("#pickDest").disabled = matches.length === miss.length;
    $("#s2").classList.add("done");
  };

  async function findFile(it, byStem) {
    const cands = byStem.get(LP.stem(it.name)) || [];
    if (it.dt) {
      for (const f of cands) if ((await fileDt(f)) === it.dt) return f;
    }
    const sameMonth = [];
    for (const f of cands) if ((f.month || (f.month = await fileMonth(f))) === it.month) sameMonth.push(f);
    if (sameMonth.length === 1) return sameMonth[0];
    if (!it.dt) return sameMonth[0] || (cands.length === 1 ? cands[0] : null);
    // 名前が変わっている (iPhoneの共有など) → 同じ月の写真を撮影日時で探す
    for (const f of files) {
      if ((f.month || (f.month = await fileMonth(f))) !== it.month) continue;
      if ((await fileDt(f)) === it.dt) return f;
    }
    return sameMonth[0] || null;
  }

  // ------------------------------------------------------------ 3. コピー
  $("#pickDest").onclick = async () => {
    let root;
    try { root = await showDirectoryPicker({ id: "lp-dest", mode: "readwrite", startIn: "desktop" }); } catch { return; }
    const info = $("#destInfo");
    const top = `L版印刷_${LP.stamp()}`;
    const out = await root.getDirectoryHandle(top, { create: true });
    const dirs = {}, used = new Set(), csv = ["month,file,source"];
    let done = 0, errors = [];
    const todo = matches.filter((m) => m.file);
    for (const { item, file } of todo) {
      try {
        const mo = file.month || item.month;
        const d = (dirs[mo] ||= await out.getDirectoryHandle(mo, { create: true }));
        const ext = file.name.slice(file.name.lastIndexOf("."));
        const base = `${mo}_${file.name.slice(0, -ext.length)}`;
        let name = base + ext, n = 2;
        while (used.has(mo + "/" + name.toLowerCase())) name = `${base}_${n++}${ext}`;
        used.add(mo + "/" + name.toLowerCase());
        const src = await file.h.getFile();
        const w = await (await d.getFileHandle(name, { create: true })).createWritable();
        await w.write(src);
        await w.close();
        csv.push(`${mo},${name},${file.path}`);
        done++;
        info.textContent = `コピー中… ${done} / ${todo.length}`;
      } catch (e) {
        errors.push(`${file.path}: ${e.message}`);
      }
    }
    const cw = await (await out.getFileHandle("一覧.csv", { create: true })).createWritable();
    await cw.write(new Blob(["﻿" + csv.join("\r\n")], { type: "text/csv" }));
    await cw.close();
    info.innerHTML = `<b>✓ ${done}枚</b> を <code>${esc(root.name)}\\${top}</code> にまとめました。` +
      (errors.length ? `<br>⚠ ${errors.length}件失敗: ${errors.slice(0, 5).map(esc).join("<br>")}` : "") +
      `<br><small>HEIC の写真はそのままコピーしています。写真屋さんが HEIC 非対応の場合は、Windows の「フォト」で JPEG に保存してください。</small>`;
    $("#s3").classList.add("done");
  };

  // ------------------------------------------------------------ スマホ用の軽い写真
  $("#mkLight").onclick = async () => {
    if (!canFS) return;
    const info = $("#lightInfo");
    const since = $("#lightSince").value || "2025-05";
    let src, dst;
    try {
      info.textContent = "まず元の写真フォルダを選んでください";
      src = await showDirectoryPicker({ id: "lp-src", mode: "read" });
      info.textContent = "次に作成先を選んでください（例: デスクトップ）";
      dst = await showDirectoryPicker({ id: "lp-light", mode: "readwrite", startIn: "desktop" });
    } catch { info.textContent = ""; return; }
    const out = await dst.getDirectoryHandle("L版えらび_スマホ用", { create: true });
    const all = [];
    info.textContent = "写真を探しています…";
    await walk(src, since, async (f) => { all.push(f); });
    let made = 0, skipped = 0, heic = 0, old = 0;
    const dirs = {};
    for (const f of all) {
      if (!DECODABLE.test(f.name)) { heic++; continue; }
      try {
        const file = await f.h.getFile();
        f.dt = await LP.exifDate(file).catch(() => null);
        const month = f.dirMonth || LP.monthFromDt(f.dt) || LP.monthFromText(f.name) || LP.monthFromTime(file.lastModified);
        if (month < since) { old++; continue; }
        const d = (dirs[month] ||= await out.getDirectoryHandle(month, { create: true }));
        const name = f.name.replace(/\.[^.]+$/, "") + ".jpg";
        try { await d.getFileHandle(name); skipped++; continue; } catch {} // 作成済み
        const img = await LP.decode(file);
        let blob = await LP.resize(img, { long: 2048, q: 0.85 });
        if (img.close) img.close();
        blob = await LP.withExifDate(blob, f.dt || `${month.replace("-", ":")}:01 12:00:00`);
        const w = await (await d.getFileHandle(name, { create: true })).createWritable();
        await w.write(blob);
        await w.close();
        made++;
      } catch (e) {
        console.warn(f.path, e);
      }
      info.textContent = `作成中… ${made + skipped} / ${all.length - heic - old}`;
    }
    info.innerHTML = `<b>✓ ${made}枚</b> を <code>${esc(dst.name)}\\L版えらび_スマホ用</code> に作りました` +
      (skipped ? `（作成済み ${skipped}枚はスキップ）` : "") + (heic ? `<br>HEIC ${heic}枚は作れませんでした。` : "");
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
})();
