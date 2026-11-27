// 前の版（データベース v1）で ♥ を付けていた端末が、新しい版を開いても ♥ が残るか
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), PORT = 8772;
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (req.url.startsWith("/blank")) { res.writeHead(200, { "content-type": "text/html" }); return res.end("<p>blank</p>"); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" }[path.extname(p)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type + "; charset=utf-8" }); fs.createReadStream(p).pipe(res);
}).listen(PORT);

(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext()).newPage();
  await pg.goto(`http://localhost:${PORT}/blank`);
  await pg.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("l-picker", 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("meta", { keyPath: "id" }); d.createObjectStore("thumb"); d.createObjectStore("prev"); d.createObjectStore("kv"); };
    r.onsuccess = () => { const t = r.result.transaction("meta", "readwrite");
      t.objectStore("meta").put({ id: "x1", name: "IMG_0001.jpg", dt: "2025:05:01 12:00:00", month: "2025-05", sel: true, size: 1000, w: 4, h: 3 });
      t.oncomplete = () => { r.result.close(); res(); }; };
  }));
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(2000);
  const r = await pg.evaluate(async () => ({ total: document.querySelector("#totalCount").textContent, stores: [...(await new Promise((res) => { const q = indexedDB.open("l-picker"); q.onsuccess = () => { res(q.result.objectStoreNames); q.result.close(); }; }))] }));
  const ok = r.total === "1" && r.stores.includes("events");
  console.log(ok ? "PASS" : "FAIL", " 前の版の ♥ が残り、履歴の保存場所が追加される", JSON.stringify(r));
  await b.close(); server.close(); process.exit(ok ? 0 : 1);
})();
