// L版えらび の動作テスト（Playwright）。実際の写真・実際のスプシは使いません。
// 使い方: cd photo-picker-v2/tests && python3 make_photos.py photos && node run.js
const { chromium, devices } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const gasmock = require("./gasmock");

const ROOT = path.join(__dirname, ".."), PORT = 8771, SHEET = "https://script.google.com/macros/s/TEST/exec";
const PHOTOS = path.join(__dirname, "photos");
const files = fs.readdirSync(PHOTOS).filter((f) => f.endsWith(".jpg")).sort().map((f) => path.join(PHOTOS, f));
let fails = 0;
const check = (label, ok, info = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${info ? "  (" + info + ")" : ""}`); if (!ok) fails++; };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".gs": "text/plain", ".png": "image/png" }[path.extname(p)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type + "; charset=utf-8" }); fs.createReadStream(p).pipe(res);
}).listen(PORT);

(async () => {
  const b = await chromium.launch();
  const gas = gasmock();
  const mk = async () => {
    const ctx = await b.newContext({ ...devices["Pixel 7"], timezoneId: "Asia/Tokyo", permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.route("https://script.google.com/**", gas.handle);
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => console.log("  page error:", e.message));
    pg.on("dialog", (d) => d.accept());
    await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(500);
    await pg.setInputFiles("#pick2", files);
    await pg.waitForFunction(() => document.querySelectorAll(".mchip").length > 0);
    await pg.waitForSelector("#progress", { state: "hidden" }); await pg.waitForTimeout(1000);
    await pg.tap("#btnSummary"); await pg.fill("#sheetUrl", SHEET); await pg.tap("#sheetSave"); await pg.waitForTimeout(1500); await pg.tap("#sheetClose");
    return pg;
  };
  const total = (pg) => pg.textContent("#totalCount").then(Number);
  const heart = async (pg, name) => {
    const p = await pg.evaluate(async (n) => (await LP.idb.all("meta")).find((x) => x.name === n), name);
    await pg.tap(`.mchip[data-m="${p.month}"]`); await pg.waitForTimeout(200);
    await pg.tap(`.cell[data-id="${p.id}"] .hb`); await pg.waitForTimeout(200);
  };
  const settle = (pg) => pg.waitForTimeout(3000);
  const reload = async (pg) => { await pg.reload(); await pg.waitForTimeout(6000); };

  // 1) ♥ が スプシ と 履歴 に入る
  const A = await mk();
  for (const n of ["IMG_0001.jpg", "IMG_0002.jpg", "IMG_0003.jpg", "IMG_0013.jpg", "IMG_0950.jpg"]) await heart(A, n);
  await settle(A);
  check("1. ♥5枚がスプシに保存される", gas.rows.length === 5, `rows=${gas.rows.length}`);
  check("1. 履歴シートに5件", gas.history.length === 5 && gas.history.every((e) => e.why === "手動"), `history=${gas.history.length}`);

  // 2) 別の端末にも反映、外したのも反映
  const B = await mk(); await settle(B);
  check("2. 別の端末に ♥ が届く", (await total(B)) === 5, `B=${await total(B)}`);
  await heart(B, "IMG_0001.jpg"); await settle(B);
  await reload(A);
  check("2. 別の端末で外した ♥ が元の端末でも外れる", (await total(A)) === 4 && gas.rows.length === 4, `A=${await total(A)} rows=${gas.rows.length}`);

  // 3) スプシを空で読んでしまっても ♥ は消えない
  gas.emptyReads = 1; await reload(A);
  check("3. 空の読み込みで ♥ が消えない", (await total(A)) === 4 && gas.rows.length === 4, `A=${await total(A)} rows=${gas.rows.length}`);

  // 4) 履歴から前の時点に戻す
  const t = await A.evaluate(() => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; });
  await A.waitForTimeout(1200);
  await heart(A, "IMG_0002.jpg"); await heart(A, "IMG_0003.jpg"); await heart(A, "IMG_0004.jpg"); await settle(A);
  check("4. 準備：外して付けて ♥3枚", (await total(A)) === 3, `A=${await total(A)}`);
  await A.tap("#btnSummary"); await A.evaluate(() => { document.querySelector(".more").open = true; document.querySelector("#histOpen").open = true; });
  await A.waitForTimeout(500);
  check("4. 履歴の一覧が出る", (await A.$$("#histList li")).length >= 3);
  await A.fill("#histAt", t); await A.tap("#btnHistRestore"); await A.waitForTimeout(1500); await A.tap("#sheetClose"); await settle(A);
  const selNow = await A.evaluate(async () => (await LP.idb.all("meta")).filter((p) => p.sel).map((p) => p.name).sort().join(","));
  check("4. その時点の ♥ に戻る", selNow === "IMG_0002.jpg,IMG_0003.jpg,IMG_0013.jpg,IMG_0950.jpg", selNow);

  // 5) ショートカット用リストは端末の時刻（ハワイの写真も日本時間）
  await A.tap("#btnSummary"); await A.tap("#btnAlbumList"); await A.waitForTimeout(500);
  const clip = await A.evaluate(() => navigator.clipboard.readText());
  check("5. 時差つきの写真は端末の時刻でリストに入る", clip.includes("2025/06/16 10:51:33|IMG_0950"), clip.split("\n").find((l) => l.includes("0950")));
  check("5. 時差が無い写真はそのまま", clip.includes("2025/05/02 12:00:00|IMG_0002"));

  // 6) GigaFile便と照合
  gas.giga = [
    { no: 1, name: "IMG_0002.jpg", size: "1.2MB", hidden: false },
    { no: 2, name: "2025-05_IMG_0003.jpeg", size: "1.1MB", hidden: false },
    { no: 3, name: "IMG_0013.jpg", size: "1.0MB", hidden: false },
    { no: 4, name: "IMG_0777.jpg", size: "1.0MB", hidden: false },
  ];
  await A.fill("#gigaUrl", "https://77.gigafile.nu/1204-test"); await A.tap("#btnGiga"); await A.waitForTimeout(1500);
  const giga = await A.textContent("#gigaResult");
  check("6. 足りない写真が出る", /足りない 1枚/.test(giga) && giga.includes("IMG_0950"), giga.replace(/\n/g, " / "));
  check("6. 余分なファイルが出る", /余分 1個/.test(giga) && giga.includes("4番目"));

  await b.close(); server.close();
  console.log(fails ? `\n${fails}件 失敗` : "\nすべて成功");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
