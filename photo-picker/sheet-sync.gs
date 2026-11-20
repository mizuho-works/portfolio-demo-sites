/**
 * L版えらび ⇔ Googleスプレッドシート 自動保存用スクリプト
 *
 * 1. 新しいスプレッドシートを作る
 * 2. メニュー「拡張機能」→「Apps Script」を開き、最初からある内容を消してこのコードを貼り付けて保存
 * 3. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      次のユーザーとして実行: 自分 / アクセスできるユーザー: 全員
 *    →「デプロイ」(初回は「アクセスを承認」→ 自分のアカウント →「詳細」→「安全ではないページに移動」→「許可」)
 * 4. 表示された「ウェブアプリのURL」(https://script.google.com/macros/s/…/exec) をアプリの設定に貼り付け
 *
 * 保存されるのは 年月・ファイル名・撮影日時・選んだ日時 だけです (写真そのものは送りません)。
 */
const LIST = '選んだ写真';
const SUMMARY = '月別';

function doGet() {
  const sh = sheet_(LIST, ['年月', 'ファイル名', '撮影日時', '選んだ日時']);
  const last = sh.getLastRow();
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, 4).getDisplayValues() : [];
  const items = rows.filter(r => r[1]).map(r => ({ month: r[0], name: r[1], dt: r[2] || null, at: r[3] }));
  return json_({ ok: true, items: items, updated: PropertiesService.getScriptProperties().getProperty('updated') });
}

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(LIST, ['年月', 'ファイル名', '撮影日時', '選んだ日時']);
    const rows = (d.items || []).map(it => [it.month, it.name, it.dt || '', it.at || '']);
    const old = Math.max(sh.getLastRow() - 1, 1);
    sh.getRange(2, 1, old, 4).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, 4).setNumberFormat('@').setValues(rows);

    const sm = sheet_(SUMMARY, ['年月', '選んだ枚数', '取り込んだ枚数']);
    const ms = (d.months || []).map(m => [m.month, m.sel, m.all]);
    sm.getRange(2, 1, Math.max(sm.getLastRow() - 1, 1), 3).clearContent();
    if (ms.length) {
      sm.getRange(2, 1, ms.length, 1).setNumberFormat('@');
      sm.getRange(2, 1, ms.length, 3).setValues(ms);
      sm.getRange(ms.length + 2, 1, 1, 3).setValues([['合計', rows.length, ms.reduce((a, m) => a + m[2], 0)]]);
    }
    const now = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('updated', now);
    return json_({ ok: true, count: rows.length, updated: now });
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
