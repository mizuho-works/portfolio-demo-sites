/**
 * L版えらび ⇔ Googleスプレッドシート 自動保存用スクリプト（v2: 詳細情報つき）
 *
 * はじめて使うとき
 * 1. 新しいスプレッドシートを作る
 * 2. メニュー「拡張機能」→「Apps Script」を開き、最初からある内容を消してこのコードを貼り付けて保存
 * 3. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      次のユーザーとして実行: 自分 / アクセスできるユーザー: 全員
 *    →「デプロイ」(初回は「アクセスを承認」→ 自分のアカウント →「詳細」→「安全ではないページに移動」→「許可」)
 * 4. 表示された「ウェブアプリのURL」(https://script.google.com/macros/s/…/exec) をアプリの設定に貼り付け
 *
 * 前のコードから更新するとき（URLはそのまま）
 * 1. Apps Script のコードを全部このコードに置き換えて保存
 * 2. 「デプロイ」→「デプロイを管理」→ 鉛筆マーク →「バージョン」で「新バージョン」→「デプロイ」
 *
 * 保存されるのは 写真の情報（年月・ファイル名・撮影日時・画像サイズ など）だけで、写真そのものは送りません。
 */
const LIST = '選んだ写真';
const SUMMARY = '月別';
const HEAD = ['年月', 'ファイル名', '撮影日時', '選んだ日時', '画像サイズ', '向き', '機種', '撮影時刻(秒以下)', 'ファイルサイズ(スマホ)', 'PCの場所'];
const KEYS = ['month', 'name', 'dt', 'at', 'dims', 'orient', 'model', 'ss', 'bytes', 'pc'];

function doGet() {
  return json_({ ok: true, version: 2, items: readRows_(), updated: PropertiesService.getScriptProperties().getProperty('updated') });
}

function readRows_() {
  const sh = sheet_(LIST, HEAD);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const cols = Math.min(Math.max(sh.getLastColumn(), 4), HEAD.length);
  return sh.getRange(2, 1, last - 1, cols).getDisplayValues().filter(r => r[1]).map(r => {
    const o = {};
    KEYS.forEach((k, i) => { o[k] = i < r.length ? r[i] : ''; });
    o.dt = o.dt || null;
    return o;
  });
}

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(LIST, HEAD);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold'); // 見出しを最新に
    const rows = (d.items || []).map(it => KEYS.map(k => (it[k] === undefined || it[k] === null) ? '' : String(it[k])));
    const old = Math.max(sh.getLastRow() - 1, 1);
    sh.getRange(2, 1, old, HEAD.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, HEAD.length).setNumberFormat('@').setValues(rows);

    // 月別の集計（アプリから取り込み枚数が来ないときは前の値を残す）
    const sm = sheet_(SUMMARY, ['年月', '選んだ枚数', '取り込んだ枚数']);
    let ms;
    if (d.months && d.months.length) {
      ms = d.months.map(m => [m.month, m.sel, m.all]);
    } else {
      const prev = {};
      if (sm.getLastRow() > 1) sm.getRange(2, 1, sm.getLastRow() - 1, 3).getDisplayValues().forEach(r => { prev[r[0]] = Number(r[2]) || 0; });
      const cnt = {};
      rows.forEach(r => { cnt[r[0]] = (cnt[r[0]] || 0) + 1; });
      const months = Object.keys(Object.assign({}, prev, cnt)).filter(m => /^\d{4}-\d\d$/.test(m)).sort();
      ms = months.map(m => [m, cnt[m] || 0, prev[m] || 0]);
    }
    sm.getRange(2, 1, Math.max(sm.getLastRow() - 1, 1), 3).clearContent();
    if (ms.length) {
      sm.getRange(2, 1, ms.length, 1).setNumberFormat('@');
      sm.getRange(2, 1, ms.length, 3).setValues(ms);
      sm.getRange(ms.length + 2, 1, 1, 3).setValues([['合計', rows.length, ms.reduce((a, m) => a + Number(m[2] || 0), 0)]]);
    }
    const now = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('updated', now);
    return json_({ ok: true, version: 2, count: rows.length, updated: now });
  } finally {
    lock.releaseLock();
  }
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
