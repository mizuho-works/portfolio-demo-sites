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

  let list = null, listSheetUrl = null, usedFiles = new Set();     // {items:[{name, dt, month}]}
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

  async function fileInfo(f) {
    if (f.dt === undefined) {
      const i = await LP.exifInfo(await f.getFile()).catch(() => ({ dt: null, ss: "", model: "" }));
      f.dt = i.dt; f.ss = i.ss; f.model = i.model;
    }
    return f;
  }
  async function fileMonth(f) {
    if (f.month) return f.month;
    if (f.dirMonth) return (f.month = f.dirMonth);
    const m = LP.monthFromText(f.name);
    if (m) return (f.month = m);
    await fileInfo(f);
    return (f.month = LP.monthFromDt(f.dt) || LP.monthFromTime((await f.getFile()).lastModified));
  }
  async function fileDt(f) { return (await fileInfo(f)).dt; }
  async function fileDims(f) {
    if (f.dims === undefined) f.dims = await LP.imageDims(await f.getFile());
    return f.dims;
  }
  const itemDims = (it) => {
    if (it.w && it.h) return [+it.w, +it.h];
    const m = /^(\d+)\D+(\d+)$/.exec(it.dims || "");
    return m ? [+m[1], +m[2]] : null;
  };
  // 候補が複数あるとき、秒以下 → 画像サイズ → 機種 の順で絞る
  async function narrow(it, list) {
    if (list.length <= 1) return list;
    let l = list;
    if (it.ss) { await Promise.all(l.map(fileInfo)); const x = l.filter((f) => f.ss && f.ss === it.ss); if (x.length) l = x; }
    const d = itemDims(it);
    if (l.length > 1 && d) { const x = []; for (const f of l) if (LP.sameDims(await fileDims(f), d)) x.push(f); if (x.length) l = x; }
    if (l.length > 1 && it.model) { await Promise.all(l.map(fileInfo)); const x = l.filter((f) => f.model && f.model === it.model); if (x.length) l = x; }
    if (l.length > 1 && it.bytes) { const x = []; for (const f of l) if (LP.fmtBytes((await f.getFile()).size) === it.bytes) x.push(f); if (x.length) l = x; }
    // すでに別の写真に使ったファイルは後回し（同じ名前の写真が2枚あっても同じファイルにしない）
    return l.filter((f) => !usedFiles.has(f)).concat(l.filter((f) => usedFiles.has(f)));
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
      const sel = (await LP.idb.all("meta")).filter((p) => p.sel).map((p) => ({ name: p.name, dt: p.dt || null, month: p.month, w: p.w, h: p.h, ss: p.ss || "", model: p.model || "" }));
      const extra = ((await LP.idb.get("kv", "remoteOnly")) || []).concat((await LP.idb.get("kv", "orphans")) || [])
        .map((o) => ({ name: o.name, dt: o.dt || null, month: o.month }));
      const items = sel.concat(extra);
      if (!items.length) return;
      $("#localCount").textContent = items.length;
      $("#useLocal").hidden = false;
      $("#listLabel").classList.replace("primary", "ghostbtn");
      $("#useLocal").onclick = () => (listSheetUrl = null, loadList(new File([JSON.stringify({ items })], "local.json")));
    } catch {}
  })();
  $("#listFile").addEventListener("change", (e) => { listSheetUrl = null; if (e.target.files[0]) loadList(e.target.files[0]); e.target.value = ""; });
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
      listSheetUrl = url;
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

  // more = true: 見つかった分はそのままにして、見つからない分だけ新しいフォルダで探す
  async function runMatch(more) {
    const pool = srcFiles;
    say("#srcInfo", `${pool.length}枚の中から照合しています…`);
    const byStem = new Map();
    for (const f of pool) {
      const s = LP.stem(f.name);
      if (!byStem.has(s)) byStem.set(s, []);
      byStem.get(s).push(f);
    }
    if (!more || !matches) matches = list.items.map((item) => ({ item, file: null }));
    const todo = matches.filter((m) => !m.file);
    let i = 0, gained = 0;
    usedFiles = new Set(matches.filter((m) => m.file).map((m) => m.file));
    for (const m of todo) {
      m.file = await findFile(m.item, byStem);
      if (m.file && usedFiles.has(m.file)) m.file = null; // 同じファイルを2回使わない
      if (m.file) usedFiles.add(m.file);
      if (m.file) gained++;
      if (++i % 5 === 0) say("#srcInfo", `照合しています… ${i} / ${todo.length}`);
    }
    showMatch(more ? gained : null);
    $("#s2").classList.add("done");
    const url = sheetUrlForWrite();
    if (url) writePcPaths(url).catch((e) => { const el = $("#pcPathInfo"); if (el) el.textContent = `⚠ スプシに書き込めませんでした（${e && e.message || e}）`; });
  }
  const sheetUrlForWrite = () => { try { return listSheetUrl || localStorage.getItem("lp.sheetUrl") || null; } catch { return listSheetUrl; } };
  // 見つからない写真がある月 → iPhoneの DCIM のフォルダ名（例: 202509__）
  function missMonths(miss) {
    const per = {};
    for (const m of miss) { const mo = m.item.month || "?"; per[mo] = (per[mo] || 0) + 1; }
    return Object.keys(per).sort().map((mo) => `<code>${mo.replace("-", "")}</code>で始まるフォルダ（${+mo.slice(5)}月・${per[mo]}枚）`).join("、");
  }
  function showMatch(gained) {
    const miss = matches.filter((m) => !m.file);
    const desc = (it) => `${it.name}　${it.dt || it.month}${it.dims ? "　" + it.dims : ""}${it.model ? "　" + it.model : ""}`;
    say("#srcInfo", `<b>✓ ${matches.length - miss.length} / ${matches.length}枚</b> 見つかりました` +
      (gained !== null ? `（今回のフォルダで ${gained}枚 追加）` : `（${esc(srcName)}）`) +
      (miss.length ? `<details open><summary>見つからない ${miss.length}枚</summary><ul>${miss.map((m) =>
        `<li>${esc(m.item.name)} <small>${esc(m.item.dt || m.item.month)}${m.item.dims ? " ・ " + esc(m.item.dims) : ""}${m.item.model ? " ・ " + esc(m.item.model) : ""}</small></li>`).join("")}</ul>
        <button id="copyMiss" class="ghostbtn sm">この一覧をコピー</button></details>
        <div class="morebox"><b>見つからない分を、別のフォルダで探す</b>（見つかった分はそのまま）<br>
        <small>iPhoneの写真は、いったんPCのフォルダにコピーしてから選んでください（下の手順）。<br>
        <b>コピーするのは、iPhoneの「DCIM」の中の次の月のフォルダだけでOK</b>（全部コピーしなくて大丈夫）：<br>
        ${missMonths(miss)}</small><br>
        <button id="pickMore" class="primary sm">別のフォルダを選ぶ</button>
        <label class="alt">選んでも何も起きないときは → <u>こちらから選ぶ</u><input id="pickMoreAlt" type="file" webkitdirectory multiple hidden></label></div>` : "") +
      (matches.length > miss.length ? "<br>次に <b>3. まとめ先を選んでコピー</b> を押してください。" : "") +
      (sheetUrlForWrite() ? `<div id="pcPathInfo" class="note">スプシに「PCの場所」を書き込んでいます…</div>` : ""));
    if (!miss.length) return;
    $("#copyMiss").onclick = async () => {
      try { await navigator.clipboard.writeText(miss.map((m) => desc(m.item)).join("\n")); $("#copyMiss").textContent = "✓ コピーしました"; } catch {}
    };
    const more = async (res) => {
      if (!res) return;
      if (!res.files.length) { say("#srcInfo", `⚠ 「${esc(res.name)}」に写真がありませんでした。`); setTimeout(() => showMatch(null), 2500); return; }
      srcName = res.name;
      srcFiles = res.files;
      await runMatch(true);
    };
    $("#pickMore").onclick = async () => more(await chooseFolder("#srcInfo", "2000-01", "lp-more"));
    $("#pickMoreAlt").addEventListener("change", (e) => { const fl = e.target.files; if (fl.length) more({ name: rootName(fl), files: fromInput(fl, "2000-01") }); });
  }

  async function findFile(it, byStem) {
    const cands = byStem.get(LP.stem(it.name)) || [];
    // ① 同じ名前 ＋ 同じ撮影日時
    if (it.dt) {
      const hit = [];
      for (const f of cands) if ((await fileDt(f)) === it.dt) hit.push(f);
      if (hit.length) return (await narrow(it, hit))[0];
    }
    // ② 同じ名前 ＋ 同じ月（撮影日時が無いとき）
    const sameMonth = [];
    for (const f of cands) if ((await fileMonth(f)) === it.month) sameMonth.push(f);
    if (!it.dt && sameMonth.length) return (await narrow(it, sameMonth))[0];
    if (!it.dt) return cands.length === 1 ? cands[0] : null;
    // ③ 名前が変わっている（iPhoneの共有など）→ 前後の月も含めて撮影日時で探す
    const near = new Set([it.month, shiftMonth(it.month, -1), shiftMonth(it.month, 1)]);
    const hit = [];
    for (const f of srcFiles) {
      if (!near.has(await fileMonth(f))) continue;
      if ((await fileDt(f)) === it.dt) hit.push(f);
    }
    if (hit.length) return (await narrow(it, hit))[0];
    return null;
  }
  function shiftMonth(m, d) {
    const [y, mo] = m.split("-").map(Number);
    const t = new Date(y, mo - 1 + d, 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  }

  // 見つかった写真のPCの場所をスプシに書き込む（同じ名前の写真があっても、どれか分かるように）
  const rowKey = (r) => (r.dt ? `${r.dt}|${LP.stem(r.name)}` : `${LP.stem(r.name)}|${r.month}|${r.bytes || ""}`);
  async function writePcPaths(url) {
    const el = () => $("#pcPathInfo");
    const j = await (await fetch(url, { cache: "no-store" })).json();
    if (!j.ok) throw 0;
    if ((j.version || 1) < 2) {
      if (el()) el().innerHTML = "スプシに「PCの場所」も書き込むには、Apps Script を新しいコードに更新してください（スマホの「選んだ写真」画面に手順があります）。";
      return;
    }
    const found = new Map();
    for (const m of matches) if (m.file) found.set(rowKey(m.item), m.file);
    let n = 0;
    const rows = j.items.map((r) => {
      const f = found.get(rowKey(r));
      if (f) { n++; return { ...r, pc: f.path.replace(/\//g, "\\"), dims: r.dims || (f.dims ? f.dims.join("×") : ""), model: r.model || f.model || "" }; }
      return r;
    });
    const res = await (await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ items: rows }) })).json();
    if (!res.ok) throw 0;
    if (el()) el().textContent = `✓ スプシの「PCの場所」に ${n}枚分を書き込みました`;
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
    const dirs = {}, used = new Set(), csv = ["年月,コピー後の名前,元の場所,撮影日時,画像サイズ,機種"];
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
        const q = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
        csv.push([mo, name, file.path.replace(/\//g, "\\"), item.dt || file.dt || "", item.dims || (file.dims ? file.dims.join("×") : ""), item.model || file.model || ""].map(q).join(","));
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
