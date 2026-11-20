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
  try { $("#sheetUrl").value = localStorage.getItem("lp.sheetUrl") || ""; } catch {}
  $("#sheetLoad").onclick = async () => {
    const url = $("#sheetUrl").value.trim();
    if (!url) return;
    $("#listInfo").textContent = "読み込み中…";
    try {
      const j = await (await fetch(url, { cache: "no-store" })).json();
      if (!j.ok) throw 0;
      try { localStorage.setItem("lp.sheetUrl", url); } catch {}
      const items = j.items.map((it) => ({ ...it, dt: it.dt || null }));
      await loadList(new File([JSON.stringify({ items })], "sheet.json"));
    } catch {
      $("#listInfo").textContent = "スプシを読めませんでした。スマホの設定に貼ったのと同じURLか確認してください。";
    }
  };
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => /\.json$/i.test(x.name));
    if (f) loadList(f);
  });

  // ------------------------------------------------------------ 2. 元フォルダ → 照合
  $("#pickSrc").onclick = async () => {
    let dir;
    try { dir = await showDirectoryPicker({ id: "lp-src", mode: "read" }); } catch (e) { return pickError(e, $("#srcInfo")); }
    const info = $("#srcInfo");
    const since = list.items.reduce((a, it) => (it.month < a ? it.month : a), list.since || "2025-05");
    files = [];
    info.textContent = "写真を探しています…";
    await walk(dir, since, async (f) => {
      files.push(f);
      if (files.length % 200 === 0) info.textContent = `写真を探しています… ${files.length}枚`;
    }, dir.name);
    if (!files.length) { info.innerHTML = `⚠ 「${esc(dir.name)}」の中に ${since.replace("-", "年")}月以降の写真が見つかりませんでした。フォルダを確認してください。`; return; }
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
    try { root = await showDirectoryPicker({ id: "lp-dest", mode: "readwrite", startIn: "documents" }); } catch (e) { return pickError(e, $("#destInfo")); }
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
      ``;
    $("#s3").classList.add("done");
  };

  // ------------------------------------------------------------ スマホ用の軽い写真
  // ※ フォルダ選択は「クリック1回につき1回」しか開けないので、ボタンを2つに分けている
  const DENIED = "Chromeの制限で、デスクトップやドライブ直下（D:\\ など）そのものは選べません。中に新しいフォルダ（例: D:\\スマホ用）を作って、それを選んでください。";
  function pickError(e, el) {
    if (e && e.name === "AbortError") return; // キャンセル
    el.innerHTML = `⚠ フォルダを開けませんでした（${esc(e && e.message || e)}）<br>${DENIED}`;
  }
  let lightSrc = null, lightFiles = null;
  $("#lightSrc").onclick = async () => {
    const info = $("#lightInfo");
    if (!canFS) { info.textContent = "Windows の Chrome か Edge で開いてください"; return; }
    try { lightSrc = await showDirectoryPicker({ id: "lp-src", mode: "read" }); } catch (e) { return pickError(e, info); }
    const since = $("#lightSince").value || "2025-05";
    lightFiles = [];
    info.textContent = `「${lightSrc.name}」の写真を数えています…`;
    try {
      await walk(lightSrc, since, async (f) => {
        lightFiles.push(f);
        if (lightFiles.length % 100 === 0) info.textContent = `「${lightSrc.name}」の写真を数えています… ${lightFiles.length}枚`;
      }, lightSrc.name);
    } catch (e) {
      info.innerHTML = `⚠ フォルダを読めませんでした: ${esc(e.message || e)}`;
      return;
    }
    if (!lightFiles.length) {
      info.innerHTML = `⚠ 「${esc(lightSrc.name)}」の中に写真（JPG / HEIC / PNG）が見つかりませんでした。`;
      return;
    }
    const heic = lightFiles.filter((f) => /\.hei[cf]$/i.test(f.name)).length;
    info.innerHTML = `✓ 「${esc(lightSrc.name)}」で写真 <b>${lightFiles.length}枚</b> 見つかりました` + (heic ? `（うちHEIC ${heic}枚・少し時間がかかります）` : "") +
      `<br>次に <b>②作成先を選んで作る</b> を押してください。`;
    $("#lightGo").disabled = false;
  };
  $("#lightGo").onclick = async () => {
    const info = $("#lightInfo");
    const since = $("#lightSince").value || "2025-05";
    let dst;
    try { dst = await showDirectoryPicker({ id: "lp-light", mode: "readwrite", startIn: "documents" }); } catch (e) { return pickError(e, info); }
    $("#lightGo").disabled = true;
    try {
      const out = await dst.getDirectoryHandle("L版えらび_スマホ用", { create: true });
      const all = lightFiles || [];
      if (!all.length) { info.innerHTML = `⚠ ${since.replace("-", "年")}月以降の写真が見つかりませんでした。選んだフォルダ（${esc(lightSrc.name)}）が合っているか確認してください。`; return; }
      let made = 0, skipped = 0, old = 0, failed = 0, done = 0;
      const t0 = Date.now();
      const dirs = {};
      for (const f of all) {
        try {
          const file = await f.h.getFile();
          f.dt = await LP.exifDate(file).catch(() => null);
          const month = f.dirMonth || LP.monthFromDt(f.dt) || LP.monthFromText(f.name) || LP.monthFromTime(file.lastModified);
          if (month < since) { old++; continue; }
          const d = (dirs[month] ||= await out.getDirectoryHandle(month, { create: true }));
          const name = f.name.replace(/\.[^.]+$/, "") + ".jpg";
          let exists = false;
          try { await d.getFileHandle(name); exists = true; } catch {}
          if (exists) { skipped++; continue; } // 作成済み（途中から再開できる）
          const img = await LP.decode(file);
          let blob = await LP.resize(img, { long: 2048, q: 0.85 });
          if (img.close) img.close();
          blob = await LP.withExifDate(blob, f.dt || `${month.replace("-", ":")}:01 12:00:00`);
          const w = await (await d.getFileHandle(name, { create: true })).createWritable();
          await w.write(blob);
          await w.close();
          made++;
        } catch (e) {
          failed++;
          console.warn(f.path, e);
        } finally {
          done++;
          const left = (Date.now() - t0) / done * (all.length - done);
          info.textContent = `作成中… ${done} / ${all.length}` + (done > 5 ? `（あと約${Math.max(1, Math.ceil(left / 60000))}分）` : "") + (failed ? ` ・ 失敗 ${failed}` : "");
        }
      }
      info.innerHTML = `<b>✓ ${made}枚</b> を <code>${esc(dst.name)}\\L版えらび_スマホ用</code> に作りました` +
        (skipped ? `（作成済み ${skipped}枚はスキップ）` : "") + (failed ? `<br>⚠ 読めなかった写真 ${failed}枚` : "") +
        `<br>このフォルダをスマホに移して、スマホの「写真を取り込む」で選んでください。`;
    } catch (e) {
      info.innerHTML = `⚠ 途中で止まりました: ${esc(e.message || e)}<br>もう一度②を押すと続きから作ります。`;
    } finally {
      $("#lightGo").disabled = false;
    }
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
})();
