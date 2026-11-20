"use strict";
/* 共通: EXIF日時 / 年月判定 / IndexedDB / 画像縮小 */
const LP = (() => {
  // ---------------------------------------------------------- EXIF
  function parseTiff(dv, t) {
    const le = dv.getUint16(t) === 0x4949;
    const u16 = (o) => dv.getUint16(t + o, le);
    const u32 = (o) => dv.getUint32(t + o, le);
    if (u16(2) !== 42) return null;
    const ascii = (off, n) => {
      let s = "";
      for (let i = 0; i < n; i++) { const c = dv.getUint8(t + off + i); if (!c) break; s += String.fromCharCode(c); }
      return s;
    };
    const readIfd = (off) => {
      const out = {};
      const n = u16(off);
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12;
        const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
        if (tag === 0x8769) out.exif = u32(e + 8);
        else if ((tag === 0x0132 || tag === 0x9003) && type === 2) out[tag] = ascii(cnt > 4 ? u32(e + 8) : e + 8, cnt);
      }
      return out;
    };
    const ifd0 = readIfd(u32(4));
    let dt = ifd0[0x0132];
    if (ifd0.exif) { const ex = readIfd(ifd0.exif); if (ex[0x9003]) dt = ex[0x9003]; }
    return dt && /^\d{4}:\d\d:\d\d \d\d:\d\d:\d\d/.test(dt) && !dt.startsWith("0000") ? dt.slice(0, 19) : null;
  }

  // JPEG/HEIC どちらも "Exif\0\0" の後ろに TIFF がある
  async function exifDate(file) {
    for (const len of [256 * 1024, 2 * 1024 * 1024]) {
      const buf = await file.slice(0, len).arrayBuffer();
      const u8 = new Uint8Array(buf), dv = new DataView(buf);
      for (let i = 0; i < u8.length - 14; i++) {
        if (u8[i] === 0x45 && u8[i + 1] === 0x78 && u8[i + 2] === 0x69 && u8[i + 3] === 0x66 && u8[i + 4] === 0 && u8[i + 5] === 0) {
          try { const r = parseTiff(dv, i + 6); if (r) return r; } catch {}
        }
      }
      if (file.size <= len) break;
    }
    return null;
  }

  // 縮小JPEGに撮影日時を書き込む (スマホに移しても月がわかるように)
  async function withExifDate(blob, dt) {
    const tiff = new Uint8Array(64);
    const dv = new DataView(tiff.buffer);
    tiff.set([0x4d, 0x4d, 0, 42, 0, 0, 0, 8]);
    dv.setUint16(8, 1); dv.setUint16(10, 0x8769); dv.setUint16(12, 4); dv.setUint32(14, 1); dv.setUint32(18, 26); dv.setUint32(22, 0);
    dv.setUint16(26, 1); dv.setUint16(28, 0x9003); dv.setUint16(30, 2); dv.setUint32(32, 20); dv.setUint32(36, 44); dv.setUint32(40, 0);
    for (let i = 0; i < 19; i++) tiff[44 + i] = dt.charCodeAt(i);
    const app1 = new Uint8Array(4 + 6 + 64);
    app1.set([0xff, 0xe1, 0, 72, 0x45, 0x78, 0x69, 0x66, 0, 0]);
    app1.set(tiff, 10);
    const src = new Uint8Array(await blob.arrayBuffer());
    let at = 2;
    if (src[2] === 0xff && src[3] === 0xe0) at = 4 + ((src[4] << 8) | src[5]); // JFIF APP0 の後ろ
    return new Blob([src.subarray(0, at), app1, src.subarray(at)], { type: "image/jpeg" });
  }

  // ---------------------------------------------------------- 年月
  const MONTH_RE = /(?:^|\D)(20\d{2})(?:\D{1,3}?(1[0-2]|0?[1-9])(?!\d)|(0[1-9]|1[0-2])(?:[0-3]\d)?(?!\d))/;
  function monthFromText(s) {
    const m = MONTH_RE.exec(s || "");
    return m ? `${m[1]}-${String(+(m[2] || m[3])).padStart(2, "0")}` : null;
  }
  const monthFromDt = (dt) => (dt ? `${dt.slice(0, 4)}-${dt.slice(5, 7)}` : null);
  const monthFromTime = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const stem = (name) => name.replace(/\.[^.]+$/, "").toLowerCase();

  // ---------------------------------------------------------- 画像
  // HEIC は ブラウザが読めないことが多いので、必要なときだけ変換ライブラリを読み込む
  let heicLib;
  function loadHeic() {
    return (heicLib ||= new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "vendor/heic2any.min.js";
      s.onload = () => res(window.heic2any);
      s.onerror = () => { heicLib = null; rej(new Error("HEIC変換を読み込めませんでした")); };
      document.head.appendChild(s);
    }));
  }
  const isHeic = (f) => /\.(heic|heif)$/i.test(f.name || "") || /heic|heif/i.test(f.type || "");

  async function decodePlain(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch {}
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  async function decode(file) {
    try {
      return await decodePlain(file);
    } catch (e) {
      if (!isHeic(file)) throw e;
    }
    const conv = await loadHeic();
    let out = await conv({ blob: file, toType: "image/jpeg", quality: 0.92 });
    if (Array.isArray(out)) out = out[0];
    return decodePlain(out);
  }
  const dims = (src) => [src.naturalWidth || src.width, src.naturalHeight || src.height];

  function resize(src, { long, short, q }) {
    const [w, h] = dims(src);
    let s = long ? long / Math.max(w, h) : short / Math.min(w, h);
    s = Math.min(1, s);
    const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, cw, ch);
    return new Promise((res, rej) => c.toBlob((b) => { c.width = c.height = 0; b ? res(b) : rej(new Error("toBlob")); }, "image/jpeg", q));
  }

  // ---------------------------------------------------------- IndexedDB
  let dbp;
  function db() {
    return (dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open("l-picker", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("meta", { keyPath: "id" });
        d.createObjectStore("thumb");
        d.createObjectStore("prev");
        d.createObjectStore("kv");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function tx(stores, mode, fn) {
    const t = (await db()).transaction(stores, mode);
    const out = fn(...[].concat(stores).map((s) => t.objectStore(s)));
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); });
    return out instanceof Promise ? out : out;
  }
  const idb = {
    all: async (s) => req((await db()).transaction(s).objectStore(s).getAll()),
    get: async (s, k) => req((await db()).transaction(s).objectStore(s).get(k)),
    put: (s, v, k) => tx(s, "readwrite", (o) => { o.put(v, k); }),
    del: (s, k) => tx(s, "readwrite", (o) => { o.delete(k); }),
    tx,
  };

  // ---------------------------------------------------------- misc
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };

  return { isHeic, exifDate, withExifDate, monthFromText, monthFromDt, monthFromTime, stem, decode, dims, resize, idb, download, stamp };
})();

// 予期しないエラーを画面に出す（黙って止まらないように）
(() => {
  const show = (msg) => {
    let el = document.getElementById("errbar");
    if (!el) {
      el = document.createElement("div");
      el.id = "errbar";
      el.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#8a1f17;color:#fff;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5";
      el.onclick = () => el.remove();
      document.body.appendChild(el);
    }
    el.textContent = "⚠ エラー: " + msg + "（タップで閉じる。この文面を教えてもらえれば直します）";
  };
  window.addEventListener("error", (e) => show(e.message || String(e.error)));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    if (r && r.name === "AbortError") return;
    show((r && (r.message || r.name)) || String(r));
  });
})();
