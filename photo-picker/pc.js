"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const IMG = /\.(jpe?g|png|webp|heic|heif)$/i;
  const YEAR_ONLY = /^(20\d{2})年?$/;
  const canFS = "showDirectoryPicker" in window;
  if (!canFS) $("#unsupported").hidden = false;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const say = (sel, html) => { const el = $(sel); el.innerHTML = html; el.scrollIntoView({ block: "nearest" }); };
  const ym = (m) => m.replace("-", "年").replace(/-?(\d+)$/, (_, d) => `${+d}月`);

  let list = null;     // {items:[{name, dt, month}]}
  let srcFiles = null, srcName = "";
  let matches = null;  // [{item, file|null}]
  let lightFiles = null, lightName = "";

  // ------------------------------------------------------------ 写真フォルダを読む (2通り)
  // f = {name, path, dirMonth, getFile()}
  async function walk(dir, since, onFile, path) {
    const sinceYear = +since.slice(0, 4);
    const dirMonth = LP.monthFromText(path);
    for await (const [name, h] of dir.entries()) {
      if (/^[.$]/.test(name)) continue;
      const p = `${path}/${name}`;
      if (h.kind === "directory") {
        const m = LP.monthFromText(p), y = YEAR_ONLY.exec(name);
        if (m && m < since) continue;                 // 対象より前の月は飛ばす
        if (!m && y && +y[1] < sinceYear) continue;   // 対象より前の年も飛ばす
        await walk(h, since, onFile, p);
      } else if (IMG.test(name)) {
        await onFile({ name, path: p, dirMonth, getFile: () => h.getFile() });
      }
    }
  }
  function fromInput(fileList, since) {
    const sinceYear = +since.slice(0, 4), out = [];
    for (const file of fileList) {
      if (!IMG.test(file.name) || file.name.startsWith("._")) continue;
      const p = file.webkitRelativePath || file.name;
      const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
      const dm = LP.monthFromText(dir);
      if (dm && dm < since) continue;
      if (!dm && dir.split("/").some((s) => { const y = YEAR_ONLY.exec(s); return y && +y[1] < sinceYear; })) continue;
      out.push({ name: file.name, path: p, dirMonth: dm, getFile: async () => file });
    }
    return out;
  }
  const rootName = (fileList) => ((fileList[0] && fileList[0].webkitRelativePath) || "").split("/")[0] || "選んだフォルダ";

  // フォルダ選択 → 写真一覧。うまくいかないときは必ず理由を表示する
  async function chooseFolder(infoSel, since, id) {
    if (!canFS) {
      say(infoSel, "このブラウザではこのボタンが使えません。下の「こちらから選ぶ」を使ってください。");
      return null;
    }
    say(infoSel, "フォルダを選んでください…（選んだあと「ファイルを表示しますか？」と出たら「表示」）");
    let dir;
    try {
      dir = await showDirectoryPicker({ id, mode: "read" });
    } catch (e) {
      say(infoSel, e && e.name === "AbortError"
        ? "フォルダ選択がキャンセルされました。<br>Chromeが「このフォルダは開けません」と出した場合や、選んでも進まない場合は、下の <b>「こちらから選ぶ」</b> を使ってください。"
        : `⚠ フォルダを開けませんでした（${esc(e && e.message || e)}）。下の <b>「こちらから選ぶ」</b> を使ってください。`);
      return null;
    }
    say(infoSel, `「${esc(dir.name)}」の写真を探しています…`);
    const files = [];
    try {
      await walk(dir, since, async (f) => {
        files.push(f);
        if (files.length % 100 === 0) say(infoSel, `「${esc(dir.name)}」の写真を探しています… ${files.length}枚`);
      }, dir.name);
    } catch (e) {
      say(infoSel, `⚠ フォルダを読めませんでした（${esc(e.message || e)}）。下の <b>「こちらから選ぶ」</b> を使ってください。`);
      return null;
    }
    return { name: dir.name, files };
  }

  async function fileMonth(f) {
    if (f.month) return f.month;
    if (f.dirMonth) return (f.month = f.dirMonth);
    const m = LP.monthFromText(f.name);
    if (m) return (f.month = m);
    const file = await f.getFile();
    if (f.dt === undefined) f.dt = await LP.exifDate(file).catch(() => null);
    return (f.month = LP.monthFromDt(f.dt) || LP.monthFromTime(file.lastModified));
  }
  async function fileDt(f) {
    if (f.dt === undefined) f.dt = await LP.exifDate(await f.getFile()).catch(() => null);
    return f.dt;
  }

  // ============================================================ A. 月別ZIP
  const lightSince = () => $("#lightSince").value || "2025-05";
  async function gotLight(res) {
    if (!res) return;
    lightName = res.name;
    lightFiles = res.files;
    if (!lightFiles.length) {
      say("#lightInfo", `⚠ 「${esc(lightName)}」の中に ${ym(lightSince())}以降の写真（JPG / HEIC / PNG）が見つかりませんでした。フォルダを確認してください。`);
      return;
    }
    const heic = lightFiles.filter((f) => /\.hei[cf]$/i.test(f.name)).length;
    say("#lightInfo", `✓ 「${esc(lightName)}」で写真 <b>${lightFiles.length}枚</b> 見つかりました` +
      (heic ? `（うちHEIC ${heic}枚は変換に少し時間がかかります）` : "") + `<br>次に <b>② 保存先を選んで作る</b> を押してください。`);
  }
  $("#lightSrc").onclick = async () => gotLight(await chooseFolder("#lightInfo", lightSince(), "lp-src"));
  $("#lightSrcAlt").addEventListener("change", (e) => {
    const fl = e.target.files;
    if (!fl.length) return;
    say("#lightInfo", "読み込み中…");
    gotLight({ name: rootName(fl), files: fromInput(fl, lightSince()) });
    e.target.value = "";
  });

  let lightBusy = false;
  $("#lightGo").onclick = async () => {
    if (lightBusy) return;
    if (!lightFiles || !lightFiles.length) { say("#lightInfo", "先に <b>① 写真フォルダを選ぶ</b> を押してください。"); return; }
    const since = lightSince();
    let dst = null;
    if (canFS) {
      say("#lightInfo", "保存先のフォルダを選んでください…（新しく作ったフォルダがおすすめ）");
      try { dst = await showDirectoryPicker({ id: "lp-light", mode: "readwrite", startIn: "documents" }); } catch (e) {
        say("#lightInfo", e && e.name === "AbortError"
          ? "保存先の選択がキャンセルされました。デスクトップやドライブ直下そのものは選べないので、中に新しいフォルダを作って選んでください。"
          : `⚠ 保存先を開けませんでした（${esc(e.message || e)}）。新しく作ったフォルダを選んでください。`);
        return;
      }
    }
    lightBusy = true;
    try {
      // 月ごとに分ける
      const byMonth = {};
      let i = 0;
      for (const f of lightFiles) {
        const m = await fileMonth(f).catch(() => null);
        if (m && m >= since) (byMonth[m] ||= []).push(f);
        if (++i % 50 === 0) say("#lightInfo", `月を確認しています… ${i} / ${lightFiles.length}`);
      }
      const months = Object.keys(byMonth).sort();
      const total = months.reduce((a, m) => a + byMonth[m].length, 0);
      if (!total) { say("#lightInfo", `⚠ ${ym(since)}以降の写真がありませんでした。`); return; }
      let done = 0, made = 0, failed = 0, skippedMonths = [];
      const t0 = Date.now();
      const results = [];
      for (const m of months) {
        const fname = `L版えらび_${m}.zip`;
        if (dst) {
          try {
            const ex = await (await dst.getFileHandle(fname)).getFile();
            if (await LP.zipComplete(ex)) { skippedMonths.push(m); done += byMonth[m].length; continue; } // 作成済み
          } catch {}
        }
        let writable = null, parts = null;
        if (dst) writable = await (await dst.getFileHandle(fname, { create: true })).createWritable();
        else parts = [];
        const zip = new LP.ZipWriter(async (chunk) => { if (writable) await writable.write(chunk); else parts.push(chunk); });
        let n = 0;
        for (const f of byMonth[m]) {
          try {
            const file = await f.getFile();
            if (f.dt === undefined) f.dt = await LP.exifDate(file).catch(() => null);
            const img = await LP.decode(file);
            let blob = await LP.resize(img, { long: 1600, q: 0.82 });
            if (img.close) img.close();
            blob = await LP.withExifDate(blob, f.dt || `${m.replace("-", ":")}:01 12:00:00`);
            await zip.add(f.name.replace(/\.[^.]+$/, "") + ".jpg", blob);
            n++; made++;
          } catch (e) {
            failed++;
            console.warn(f.path, e);
          }
          done++;
          const left = (Date.now() - t0) / Math.max(1, done - skippedMonths.reduce((a, x) => a + byMonth[x].length, 0)) * (total - done);
          say("#lightInfo", `作成中… ${ym(m)}（${done} / ${total}枚）` + (done > 5 ? ` あと約${Math.max(1, Math.ceil(left / 60000))}分` : "") + (failed ? ` ・ 読めない ${failed}枚` : "") +
            `<br><small>この画面は開いたままにしてください。止まっても②をもう一度押せば、できた月は飛ばして続きから作ります。</small>`);
        }
        await zip.finish();
        if (writable) await writable.close();
        else LP.download(new Blob(parts, { type: "application/zip" }), fname);
        results.push(`${ym(m)}: ${n}枚`);
      }
      say("#lightInfo", `<b>✓ 完成しました</b>（${made}枚）` + (dst ? ` 保存先: <code>${esc(dst.name)}</code>` : "（ダウンロードフォルダ）") +
        `<br>${results.join(" ／ ")}` + (skippedMonths.length ? `<br>作成済みでスキップ: ${skippedMonths.map(ym).join("、")}` : "") +
        (failed ? `<br>⚠ 読めなかった写真 ${failed}枚` : "") +
        `<br><br>次は、できた <code>L版えらび_年-月.zip</code> を iCloud Drive / Googleドライブ に入れて、スマホの「PCで作った月別ZIPから取り込む」で選んでください。`);
    } catch (e) {
      say("#lightInfo", `⚠ 途中で止まりました: ${esc(e.message || e)}<br>もう一度②を押すと、できた月は飛ばして続きから作ります。`);
    } finally {
      lightBusy = false;
    }
  };

  // ============================================================ B-1. リスト
  async function loadList(file) {
    try {
      const j = JSON.parse(await file.text());
      if (!Array.isArray(j.items)) throw 0;
      list = j;
    } catch {
      say("#listInfo", "リストを読めませんでした。スマホで作った L版リスト_….json を選んでください。");
      return;
    }
    const per = {};
    for (const it of list.items) per[it.month] = (per[it.month] || 0) + 1;
    say("#listInfo", `✓ <b>${list.items.length}枚</b> ・ ` + Object.keys(per).sort().map((m) => `${m.replace("-", "/")}: ${per[m]}枚`).join(" ／ ") +
      (srcFiles ? "" : "<br>次に <b>2. 写真フォルダを選ぶ</b> を押してください。"));
    $("#s1").classList.add("done");
    if (srcFiles) await runMatch();
  }
  // 同じPCのブラウザで ♥ を付けた分（スマホ用画面をPCで使った場合）
  (async () => {
    try {
      const sel = (await LP.idb.all("meta")).filter((p) => p.sel).map((p) => ({ name: p.name, dt: p.dt || null, month: p.month }));
      const extra = ((await LP.idb.get("kv", "remoteOnly")) || []).concat((await LP.idb.get("kv", "orphans")) || [])
        .map((o) => ({ name: o.name, dt: o.dt || null, month: o.month }));
      const items = sel.concat(extra);
      if (!items.length) return;
      $("#localCount").textContent = items.length;
      $("#useLocal").hidden = false;
      $("#listLabel").classList.replace("primary", "ghostbtn");
      $("#useLocal").onclick = () => loadList(new File([JSON.stringify({ items })], "local.json"));
    } catch {}
  })();
  $("#listFile").addEventListener("change", (e) => { if (e.target.files[0]) loadList(e.target.files[0]); e.target.value = ""; });
  try { $("#sheetUrl").value = localStorage.getItem("lp.sheetUrl") || ""; } catch {}
  $("#sheetLoad").onclick = async () => {
    const url = $("#sheetUrl").value.trim();
    if (!url) { say("#listInfo", "スマホの設定に貼ったのと同じURL（https://script.google.com/…/exec）を貼ってください。"); return; }
    say("#listInfo", "読み込み中…");
    try {
      const j = await (await fetch(url, { cache: "no-store" })).json();
      if (!j.ok) throw 0;
      try { localStorage.setItem("lp.sheetUrl", url); } catch {}
      const items = j.items.map((it) => ({ ...it, dt: it.dt || null }));
      await loadList(new File([JSON.stringify({ items })], "sheet.json"));
    } catch {
      say("#listInfo", "スプシを読めませんでした。スマホの設定に貼ったのと同じURLか確認してください。");
    }
  };
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => /\.json$/i.test(x.name));
    if (f) loadList(f);
  });

  // ============================================================ B-2. 元フォルダ → 照合
  const listSince = () => (list ? list.items.reduce((a, it) => (it.month < a ? it.month : a), list.since || "2025-05") : "2025-05");
  async function gotSrc(res) {
    if (!res) return;
    srcName = res.name;
    srcFiles = res.files;
    if (!srcFiles.length) { say("#srcInfo", `⚠ 「${esc(srcName)}」の中に ${ym(listSince())}以降の写真が見つかりませんでした。フォルダを確認してください。`); return; }
    if (!list) { say("#srcInfo", `✓ 「${esc(srcName)}」で写真 ${srcFiles.length}枚。<br>次に <b>1. リスト</b> を選ぶと照合します。`); return; }
    await runMatch();
  }
  $("#pickSrc").onclick = async () => gotSrc(await chooseFolder("#srcInfo", listSince(), "lp-src"));
  $("#pickSrcAlt").addEventListener("change", (e) => {
    const fl = e.target.files;
    if (!fl.length) return;
    gotSrc({ name: rootName(fl), files: fromInput(fl, listSince()) });
    e.target.value = "";
  });

  async function runMatch() {
    say("#srcInfo", `${srcFiles.length}枚の中から照合しています…`);
    const byStem = new Map();
    for (const f of srcFiles) {
      const s = LP.stem(f.name);
      if (!byStem.has(s)) byStem.set(s, []);
      byStem.get(s).push(f);
    }
    matches = [];
    let i = 0;
    for (const it of list.items) {
      matches.push({ item: it, file: await findFile(it, byStem) });
      if (++i % 10 === 0) say("#srcInfo", `照合しています… ${i} / ${list.items.length}`);
    }
    const miss = matches.filter((m) => !m.file);
    say("#srcInfo", `<b>✓ ${matches.length - miss.length} / ${matches.length}枚</b> 見つかりました（${esc(srcName)}）` +
      (miss.length ? `<details open><summary>見つからない ${miss.length}枚</summary><ul>${miss.map((m) =>
        `<li>${esc(m.item.name)} <small>${m.item.dt || m.item.month}</small></li>`).join("")}</ul>
        <small>別のフォルダにあるかもしれません。もっと上のフォルダを選び直してみてください。</small></details>` : "") +
      (matches.length > miss.length ? "<br>次に <b>3. まとめ先を選んでコピー</b> を押してください。" : ""));
    $("#s2").classList.add("done");
  }

  async function findFile(it, byStem) {
    const cands = byStem.get(LP.stem(it.name)) || [];
    if (it.dt) for (const f of cands) if ((await fileDt(f)) === it.dt) return f;
    const sameMonth = [];
    for (const f of cands) if ((await fileMonth(f)) === it.month) sameMonth.push(f);
    if (sameMonth.length === 1) return sameMonth[0];
    if (!it.dt) return sameMonth[0] || (cands.length === 1 ? cands[0] : null);
    // 名前が変わっている (iPhoneの共有など) → 同じ月の写真を撮影日時で探す
    for (const f of srcFiles) {
      if ((await fileMonth(f)) !== it.month) continue;
      if ((await fileDt(f)) === it.dt) return f;
    }
    return sameMonth[0] || null;
  }

  // ============================================================ B-3. コピー
  $("#pickDest").onclick = async () => {
    if (!list) { say("#destInfo", "先に <b>1. リスト</b> を選んでください。"); return; }
    if (!matches) { say("#destInfo", "先に <b>2. 写真フォルダ</b> を選んでください。"); return; }
    const todo = matches.filter((m) => m.file);
    if (!todo.length) { say("#destInfo", "コピーできる写真がありません（2. で見つかった写真が0枚です）。"); return; }
    if (!canFS) { say("#destInfo", "このブラウザはフォルダに書き込めません。Windows の Chrome か Edge で開いてください。"); return; }
    say("#destInfo", "まとめ先のフォルダを選んでください…（新しく作ったフォルダがおすすめ）");
    let root;
    try { root = await showDirectoryPicker({ id: "lp-dest", mode: "readwrite", startIn: "documents" }); } catch (e) {
      say("#destInfo", e && e.name === "AbortError"
        ? "まとめ先の選択がキャンセルされました。デスクトップやドライブ直下そのものは選べないので、中に新しいフォルダを作って選んでください。"
        : `⚠ まとめ先を開けませんでした（${esc(e.message || e)}）`);
      return;
    }
    const top = `L版印刷_${LP.stamp()}`;
    const out = await root.getDirectoryHandle(top, { create: true });
    const dirs = {}, used = new Set(), csv = ["month,file,source"];
    let done = 0;
    const errors = [];
    for (const { item, file } of todo) {
      try {
        const mo = (await fileMonth(file)) || item.month;
        const d = (dirs[mo] ||= await out.getDirectoryHandle(mo, { create: true }));
        const ext = file.name.slice(file.name.lastIndexOf("."));
        const base = `${mo}_${file.name.slice(0, -ext.length)}`;
        let name = base + ext, n = 2;
        while (used.has(mo + "/" + name.toLowerCase())) name = `${base}_${n++}${ext}`;
        used.add(mo + "/" + name.toLowerCase());
        const w = await (await d.getFileHandle(name, { create: true })).createWritable();
        await w.write(await file.getFile());
        await w.close();
        csv.push(`${mo},${name},${file.path}`);
        done++;
        say("#destInfo", `コピー中… ${done} / ${todo.length}`);
      } catch (e) {
        errors.push(`${file.path}: ${e.message}`);
      }
    }
    const cw = await (await out.getFileHandle("一覧.csv", { create: true })).createWritable();
    await cw.write(new Blob(["﻿" + csv.join("\r\n")], { type: "text/csv" }));
    await cw.close();
    say("#destInfo", `<b>✓ ${done}枚</b> を <code>${esc(root.name)}\\${top}</code> にまとめました。` +
      (errors.length ? `<br>⚠ ${errors.length}件失敗: ${errors.slice(0, 5).map(esc).join("<br>")}` : ""));
    $("#s3").classList.add("done");
  };
})();
