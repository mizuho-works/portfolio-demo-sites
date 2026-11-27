// v2（photo-picker-v2/）は前の版（photo-picker/）と同じ保存場所を使う。
// 前の版で取り込んだ写真・♥ が v2 でもそのまま見え、v2 を使ったあとも前の版が開けるか。
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), PORT = 8773;
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/blank")) { res.writeHead(200, { "content-type": "text/html" }); return res.end("<p>blank</p>"); }
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" }[path.extname(p)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type + "; charset=utf-8" }); fs.createReadStream(p).pipe(res);
}).listen(PORT);
let fails = 0;
const check = (label, ok, info = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${info ? "  (" + info + ")" : ""}`); if (!ok) fails++; };

(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext()).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
  await pg.goto(`http://localhost:${PORT}/blank`);
  // 前の版で ♥ を付けていた状態
  await pg.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("l-picker", 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("meta", { keyPath: "id" }); d.createObjectStore("thumb"); d.createObjectStore("prev"); d.createObjectStore("kv"); };
    r.onsuccess = () => { const t = r.result.transaction("meta", "readwrite");
      t.objectStore("meta").put({ id: "x1", name: "IMG_0001.jpg", dt: "2025:05:01 12:00:00", month: "2025-05", sel: true, size: 1000, w: 4, h: 3 });
      t.objectStore("meta").put({ id: "x2", name: "IMG_0002.jpg", dt: "2025:05:02 12:00:00", month: "2025-05", sel: false, size: 1000, w: 4, h: 3 });
      t.oncomplete = () => { r.result.close(); res(); }; };
  }));
  await pg.goto(`http://localhost:${PORT}/photo-picker-v2/`); await pg.waitForTimeout(2000);
  check("v2 で前の版の ♥ が見える", (await pg.textContent("#totalCount")) === "1");
  await pg.click(`.cell[data-id="x2"] .hb`); await pg.waitForTimeout(800);
  const ev = await pg.evaluate(() => LP.idb.range("kv", "ev:", "ev:￿"));
  check("v2 の履歴が保存される", ev.length === 1 && ev[0].name === "IMG_0002.jpg");
  await pg.goto(`http://localhost:${PORT}/photo-picker/`); await pg.waitForTimeout(2000);
  check("v2 を使ったあとも前の版が開けて、♥ も同じ", (await pg.textContent("#totalCount")) === "2" && !errs.length, errs.join(" / "));
  // 一時的に公開した版（保存場所の版 2・events あり）を開いてしまった端末でも開けるか
  const pg2 = await (await b.newContext()).newPage(); const errs2 = []; pg2.on("pageerror", (e) => errs2.push(e.message));
  await pg2.goto(`http://localhost:${PORT}/blank`);
  await pg2.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("l-picker", 2);
    r.onupgradeneeded = () => { const d = r.result; for (const n of ["thumb", "prev", "kv", "events"]) d.createObjectStore(n, n === "events" ? { autoIncrement: true } : undefined); d.createObjectStore("meta", { keyPath: "id" }); };
    r.onsuccess = () => { const t = r.result.transaction("meta", "readwrite");
      t.objectStore("meta").put({ id: "y1", name: "IMG_0001.jpg", dt: "2025:05:01 12:00:00", month: "2025-05", sel: true, size: 1000, w: 4, h: 3 });
      t.oncomplete = () => { r.result.close(); res(); }; };
  }));
  for (const dir of ["photo-picker", "photo-picker-v2"]) {
    await pg2.goto(`http://localhost:${PORT}/${dir}/`); await pg2.waitForTimeout(2000);
    check(`保存場所の版が2になっていても ${dir} が開ける`, (await pg2.textContent("#totalCount")) === "1" && !errs2.length, errs2.join(" / "));
  }
  await b.close(); server.close();
  console.log(fails ? `\n${fails}件 失敗` : "\nすべて成功");
  process.exit(fails ? 1 : 0);
})();
