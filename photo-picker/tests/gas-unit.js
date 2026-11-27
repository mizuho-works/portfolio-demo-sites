// sheet-sync.gs を Node で動かして確かめる（Googleのサービスは簡単な偽物に置き換え）
const fs = require("fs"), path = require("path");
let fails = 0;
const check = (label, ok, info = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${info ? "  (" + info + ")" : ""}`); if (!ok) fails++; };

// --- 偽のスプレッドシート
const sheets = {};
const mkSheet = () => {
  const cells = [];
  const sh = {
    cells,
    getLastRow: () => cells.length, getLastColumn: () => Math.max(0, ...cells.map((r) => r.length)),
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues(v) { v.forEach((row, i) => { cells[r - 1 + i] = cells[r - 1 + i] || []; row.forEach((x, j) => { cells[r - 1 + i][c - 1 + j] = x; }); }); return this; },
      getDisplayValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => String((cells[r - 1 + i] || [])[c - 1 + j] ?? ""))),
      clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (cells[r - 1 + i]) cells[r - 1 + i][c - 1 + j] = ""; return this; },
      setFontWeight() { return this; }, setNumberFormat() { return this; },
    }),
    setFrozenRows() {},
  };
  return sh;
};
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n], insertSheet: (n) => (sheets[n] = mkSheet()) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
  ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
  Session: { getScriptTimeZone: () => "Asia/Tokyo" },
  Utilities: { formatDate: (d) => d.toISOString() },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => FAKE_PAGE }) },
};
const FAKE_PAGE = `
<div id="matomete_file[0]"><span class="matomete_file_name">IMG_0001.jpg</span><span>（1.2MB）</span></div>
<div id="matomete_file[1]"><span class="matomete_file_name">A&amp;B.jpg</span><span>（512KB）</span></div>
<div id="matomete_file[2]"><span class="matomete_file_name_hide">******</span>（2.3MB）</div>`;
const code = fs.readFileSync(path.join(__dirname, "..", "sheet-sync.gs"), "utf8");
const api = new Function(...Object.keys(ctx), code + "; return { doGet, doPost };")(...Object.values(ctx));

const post = (d) => api.doPost({ postData: { contents: JSON.stringify(d) } });
let r = post({ items: [{ month: "2025-05", name: "IMG_0001.jpg", dt: "2025:05:01 12:00:00" }], months: [{ month: "2025-05", sel: 1, all: 10 }],
  events: [{ t: Date.UTC(2026, 0, 1), on: 1, month: "2025-05", name: "IMG_0001.jpg", dt: "2025:05:01 12:00:00", dev: "iPhone", why: "手動" }] });
check("POST が v3 で返る", r.ok && r.version === 3 && r.events === 1, JSON.stringify(r));
check("選んだ写真シートに1行", sheets["選んだ写真"].cells.filter((x) => x[1]).length === 2);
check("履歴シートに見出し＋1行", sheets["履歴"].cells.length === 2 && sheets["履歴"].cells[1][1] === "♥ を付けた", JSON.stringify(sheets["履歴"].cells[1]));
post({ items: [], events: [{ t: Date.now(), on: 0, month: "2025-05", name: "IMG_0001.jpg", dev: "PC", why: "手動" }] });
check("履歴は消さずに下へ足す", sheets["履歴"].cells.length === 3 && sheets["履歴"].cells[2][1] === "♥ を外した");

r = api.doGet({ parameter: { gigafile: "https://77.gigafile.nu/1204-abc" } });
check("GigaFile便の一覧を読める", r.ok && r.files.length === 3 && r.files[1].name === "A&B.jpg" && r.files[2].hidden && r.files[2].size === "2.3MB", JSON.stringify(r.files));
r = api.doGet({ parameter: { gigafile: "https://example.com/x" } });
check("GigaFile便以外のURLは読まない", r.ok === false);
r = api.doGet({});
check("通常の読み込みは v3", r.ok && r.version === 3 && r.items.length === 0);

console.log(fails ? `\n${fails}件 失敗` : "\nすべて成功");
process.exit(fails ? 1 : 0);
