# テスト

実際の写真やスプレッドシートは使わず、色の板の写真と偽のスプシで確かめます。

```bash
cd photo-picker-v2/tests
python3 make_photos.py photos   # テスト用の写真（撮影日時・時差つき）を作る（Pillow が必要）
node run.js                     # スマホ2台・スプシ同期・空読み・履歴から戻す・ショートカット用の時刻・GigaFile便の照合
node shared.js                  # 前の版（photo-picker/）と同じデータを使えて、前の版も壊れないか
node gas-unit.js                # sheet-sync.gs（Apps Script）の単体テスト
```

`run.js` と `shared.js` には Playwright（Chromium）が必要です。

## 何を確かめているか

| テスト | 内容 |
|---|---|
| 1 | ♥ がスプシと「履歴」に保存される |
| 2 | 別の端末に ♥ が届き、外した ♥ も反映される |
| 3 | スプシを空で読んでしまっても ♥ が消えない |
| 4 | 履歴から「この日時の状態」に戻せる |
| 5 | 旅行先（時差あり）の写真も、ショートカット用リストでは端末の時刻になる |
| 6 | GigaFile便と照合して、足りない写真・余分なファイルが出る |
