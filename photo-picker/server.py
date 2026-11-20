#!/usr/bin/env python3
"""L版えらび - 年月別フォルダの写真をスマホで見て、印刷する写真を選ぶローカルサーバー.

使い方 (Windows):
    start.bat をダブルクリック
または:
    python server.py "D:\\03_年月別バックアップ" --since 2025-05

写真はこのPCの中だけで扱い、外部にはアップロードしません。
スマホは同じWi-Fiにつないで、表示されたURL(QRコード)を開きます。
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import re
import secrets
import shutil
import socket
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    print("Pillow が必要です:  python -m pip install pillow pillow-heif")
    sys.exit(1)

HEIC_OK = False
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
    HEIC_OK = True
except Exception:
    pass

APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
DATA_DIR = APP_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"
SEL_FILE = DATA_DIR / "selections.json"
CONF_FILE = DATA_DIR / "config.json"
POS_FILE = DATA_DIR / "position.json"

DEFAULT_ROOT = r"D:\03_年月別バックアップ"
DEFAULT_SINCE = "2025-05"
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
SIZES = {"t": 480, "p": 2048}  # グリッド用 / 拡大表示用
MONTH_RE = re.compile(
    r"(?<!\d)(20\d{2})(?:\D{1,3}?(1[0-2]|0?[1-9])(?!\d)|(0[1-9]|1[0-2])(?:[0-3]\d)?(?!\d))"
)
YEAR_RE = re.compile(r"^(20\d{2})(?:年)?$")


# ---------------------------------------------------------------- utilities
def month_from_text(text: str) -> str | None:
    m = MONTH_RE.search(text)
    if not m:
        return None
    return f"{m.group(1)}-{int(m.group(2) or m.group(3)):02d}"


def month_from_exif(path: Path) -> str | None:
    try:
        with Image.open(path) as im:
            exif = im.getexif()
            raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)  # DateTimeOriginal / DateTime
            if raw:
                return f"{raw[0:4]}-{raw[5:7]}"
    except Exception:
        pass
    return None


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def atomic_write_json(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


# ---------------------------------------------------------------- library
class Library:
    def __init__(self, root: Path, since: str):
        self.root = root
        self.since = since
        self.lock = threading.Lock()
        self.photos: list[dict] = []
        self.by_id: dict[str, dict] = {}
        self.selected: dict[str, float] = {}  # rel path -> timestamp
        self.key_locks: dict[str, threading.Lock] = {}
        self.scanning = False
        if SEL_FILE.exists():
            try:
                self.selected = json.loads(SEL_FILE.read_text(encoding="utf-8"))
            except Exception:
                print("! selections.json を読めませんでした。バックアップを作って新規にします。")
                shutil.copy(SEL_FILE, SEL_FILE.with_suffix(".broken.json"))

    # -- scan
    def scan(self) -> None:
        self.scanning = True
        t0 = time.time()
        since_year = int(self.since[:4])
        found: list[dict] = []
        for dirpath, dirnames, filenames in os.walk(self.root):
            dpath = Path(dirpath)
            rel_dir = dpath.relative_to(self.root).as_posix()
            dirnames[:] = sorted(d for d in dirnames if not d.startswith((".", "$")))
            # 対象期間より前のフォルダは丸ごと飛ばす
            keep = []
            for d in dirnames:
                sub = f"{rel_dir}/{d}" if rel_dir != "." else d
                mm = month_from_text(sub)
                ym = YEAR_RE.match(d)
                if mm and mm < self.since:
                    continue
                if not mm and ym and int(ym.group(1)) < since_year:
                    continue
                keep.append(d)
            dirnames[:] = keep
            dir_month = month_from_text(rel_dir) if rel_dir != "." else None
            for fn in filenames:
                p = dpath / fn
                if p.suffix.lower() not in IMG_EXT or fn.startswith("._"):
                    continue
                month = dir_month or month_from_text(fn) or month_from_exif(p)
                try:
                    st = p.stat()
                except OSError:
                    continue
                if not month:
                    month = datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m")
                if month < self.since:
                    continue
                rel = p.relative_to(self.root).as_posix()
                pid = hashlib.sha1(rel.encode("utf-8")).hexdigest()[:12]
                ver = hashlib.sha1(f"{st.st_size}:{int(st.st_mtime)}".encode()).hexdigest()[:8]
                found.append({"id": pid, "rel": rel, "name": fn, "month": month, "v": ver, "mtime": st.st_mtime})
        found.sort(key=lambda x: (x["month"], x["rel"].lower()))
        with self.lock:
            self.photos = found
            self.by_id = {p["id"]: p for p in found}
        self.scanning = False
        print(f"  写真 {len(found)} 枚を読み込みました ({time.time() - t0:.1f}秒)")

    # -- selections
    def set_selected(self, pid: str, on: bool) -> bool:
        p = self.by_id.get(pid)
        if not p:
            return False
        with self.lock:
            if on:
                self.selected[p["rel"]] = time.time()
            else:
                self.selected.pop(p["rel"], None)
            atomic_write_json(SEL_FILE, self.selected)
        return True

    def state(self) -> dict:
        with self.lock:
            sel = self.selected
            photos = [[p["id"], p["month"], p["name"], p["v"], 1 if p["rel"] in sel else 0] for p in self.photos]
        last = None
        try:
            rel = json.loads(POS_FILE.read_text(encoding="utf-8")).get("rel")
            last = next((p["id"] for p in self.photos if p["rel"] == rel), None)
        except Exception:
            pass
        return {"since": self.since, "root": str(self.root), "photos": photos, "heic": HEIC_OK,
                "scanning": self.scanning, "lastId": last}

    def set_position(self, pid: str) -> None:
        p = self.by_id.get(pid)
        if p:
            with self.lock:
                atomic_write_json(POS_FILE, {"rel": p["rel"], "at": time.time()})

    # -- images
    def cache_path(self, p: dict, kind: str) -> Path:
        return CACHE_DIR / kind / p["id"][:2] / f"{p['id']}_{p['v']}.jpg"

    def render(self, p: dict, kind: str) -> Path:
        out = self.cache_path(p, kind)
        if out.exists():
            return out
        key = f"{kind}:{p['id']}"
        with self.lock:
            klock = self.key_locks.setdefault(key, threading.Lock())
        with klock:
            if out.exists():
                return out
            size = SIZES[kind]
            src = self.root / p["rel"]
            with Image.open(src) as im:
                if im.format == "JPEG":
                    im.draft("RGB", (size, size))  # JPEGは縮小デコードで高速化
                im = ImageOps.exif_transpose(im)
                im.thumbnail((size, size), Image.LANCZOS if kind == "p" else Image.BILINEAR)
                if im.mode != "RGB":
                    bg = Image.new("RGB", im.size, (255, 255, 255))
                    im = im.convert("RGBA")
                    bg.paste(im, mask=im.split()[-1])
                    im = bg
                out.parent.mkdir(parents=True, exist_ok=True)
                tmp = out.with_suffix(f".{threading.get_ident()}.tmp")
                im.save(tmp, "JPEG", quality=82 if kind == "t" else 86, optimize=False, progressive=kind == "p")
                os.replace(tmp, out)
        with self.lock:
            self.key_locks.pop(key, None)
        return out

    def prewarm(self) -> None:
        workers = max(1, (os.cpu_count() or 2) - 1)
        with self.lock:
            todo = [p for p in self.photos if not self.cache_path(p, "t").exists()]
        if not todo:
            return
        print(f"  サムネイルを準備中: {len(todo)} 枚 (バックグラウンド、見ながらでもOK)")
        t0 = time.time()

        def job(p):
            try:
                self.render(p, "t")
            except Exception as e:  # 壊れた画像などはスキップ
                print(f"  ! {p['rel']}: {e}")

        with ThreadPoolExecutor(workers) as ex:
            list(ex.map(job, todo))
        print(f"  サムネイル準備完了 ({time.time() - t0:.0f}秒)")

    # -- export
    def export(self, dest_root: Path, convert_heic: bool = True) -> dict:
        stamp = datetime.now().strftime("%Y%m%d_%H%M")
        dest = dest_root / f"L版印刷_{stamp}"
        with self.lock:
            items = [p for p in self.photos if p["rel"] in self.selected]
        copied, errors, per_month = 0, [], {}
        lines = ["month,file,source"]
        for p in items:
            mdir = dest / p["month"]
            mdir.mkdir(parents=True, exist_ok=True)
            src = self.root / p["rel"]
            stem, ext = os.path.splitext(p["name"])
            is_heic = ext.lower() in (".heic", ".heif")
            if is_heic and convert_heic and HEIC_OK:
                ext = ".jpg"
            target = mdir / f"{p['month']}_{stem}{ext}"
            n = 2
            while target.exists():
                target = mdir / f"{p['month']}_{stem}_{n}{ext}"
                n += 1
            try:
                if is_heic and ext == ".jpg":
                    with Image.open(src) as im:
                        exif = im.info.get("exif")
                        im = ImageOps.exif_transpose(im).convert("RGB")
                        im.save(target, "JPEG", quality=95, **({"exif": exif} if exif else {}))
                else:
                    shutil.copy2(src, target)
                copied += 1
                per_month[p["month"]] = per_month.get(p["month"], 0) + 1
                lines.append(f"{p['month']},{target.name},{p['rel']}")
            except Exception as e:
                errors.append(f"{p['rel']}: {e}")
        if items:
            (dest / "一覧.csv").write_text("\n".join(lines), encoding="utf-8-sig")
        return {"dir": str(dest), "copied": copied, "errors": errors, "perMonth": per_month}


# ---------------------------------------------------------------- http
class Handler(BaseHTTPRequestHandler):
    lib: Library
    token: str
    export_root: Path
    lan_url: str
    server_version = "LPicker/1.0"

    def log_message(self, fmt, *args):  # 静かに
        pass

    # -- helpers
    def is_local(self) -> bool:
        return self.client_address[0] in ("127.0.0.1", "::1")

    def authed(self, qs: dict) -> bool:
        if self.is_local():
            return True
        if qs.get("k", [""])[0] == self.token:
            return True
        c = SimpleCookie(self.headers.get("Cookie", ""))
        return "pp_k" in c and secrets.compare_digest(c["pp_k"].value, self.token)

    def send_bytes(self, body: bytes, ctype: str, cache: str = "no-store", extra: dict | None = None):
        if ctype.startswith(("application/json", "text/")) and "gzip" in self.headers.get("Accept-Encoding", "") and len(body) > 1024:
            body = gzip.compress(body, 5)
            extra = {**(extra or {}), "Content-Encoding": "gzip"}
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, obj, extra=None):
        self.send_bytes(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), "application/json; charset=utf-8", extra=extra)

    def fail(self, code: int, msg: str = ""):
        body = msg.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    # -- routes
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)
        path = u.path
        if not self.authed(qs):
            return self.fail(403, "アクセスキーが違います。PCの画面に出ているQRコード/URLから開いてください。")
        cookie = None
        if "k" in qs and not self.is_local():
            cookie = {"Set-Cookie": f"pp_k={self.token}; Max-Age=31536000; Path=/; SameSite=Lax"}

        if path in ("/", "/index.html"):
            return self.static("index.html", cookie)
        if path.startswith("/static/"):
            return self.static(path[len("/static/"):])
        if path == "/api/state":
            st = self.lib.state()
            st.update(isLocal=self.is_local(), lanUrl=self.lan_url, exportRoot=str(self.export_root))
            return self.send_json(st)
        m = re.fullmatch(r"/(t|p)/([0-9a-f]{12})", path)
        if m:
            p = self.lib.by_id.get(m.group(2))
            if not p:
                return self.fail(404)
            try:
                f = self.lib.render(p, m.group(1))
            except Exception as e:
                return self.fail(500, str(e))
            return self.send_bytes(f.read_bytes(), "image/jpeg", "private, max-age=31536000, immutable")
        return self.fail(404)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if not self.authed({}):
            return self.fail(403)
        try:
            body = self.read_json()
        except Exception:
            return self.fail(400)
        if u.path == "/api/select":
            ok = all(self.lib.set_selected(i, bool(body.get("on"))) for i in body.get("ids", []))
            return self.send_json({"ok": ok})
        if u.path == "/api/pos":
            self.lib.set_position(str(body.get("id", "")))
            return self.send_json({"ok": True})
        if u.path == "/api/export":
            res = self.lib.export(self.export_root, convert_heic=bool(body.get("convertHeic", True)))
            if self.is_local() and res["copied"] and os.name == "nt":
                try:
                    os.startfile(res["dir"])  # エクスプローラーで開く
                except Exception:
                    pass
            return self.send_json(res)
        if u.path == "/api/rescan":
            self.lib.scan()
            threading.Thread(target=self.lib.prewarm, daemon=True).start()
            return self.send_json({"ok": True})
        return self.fail(404)

    def static(self, name: str, extra=None):
        f = (WEB_DIR / name).resolve()
        if WEB_DIR.resolve() not in f.parents or not f.is_file():
            return self.fail(404)
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".svg": "image/svg+xml",
            ".json": "application/json",
            ".png": "image/png",
        }.get(f.suffix, "application/octet-stream")
        self.send_bytes(f.read_bytes(), ctype, "no-cache", extra)


def main():
    ap = argparse.ArgumentParser(description="L版えらび")
    ap.add_argument("root", nargs="?", default=None, help=f"写真フォルダ (既定: {DEFAULT_ROOT})")
    ap.add_argument("--since", default=None, help="この年月以降を対象 (例 2025-05)")
    ap.add_argument("--export-to", default=None, help="まとめ先フォルダ (既定: 写真フォルダと同じ場所)")
    ap.add_argument("--port", type=int, default=None)
    args = ap.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conf = {}
    if CONF_FILE.exists():
        try:
            conf = json.loads(CONF_FILE.read_text(encoding="utf-8"))
        except Exception:
            conf = {}
    conf.setdefault("token", secrets.token_urlsafe(8))
    for key, val in (("root", args.root), ("since", args.since), ("exportTo", args.export_to), ("port", args.port)):
        if val is not None:
            conf[key] = val
    conf.setdefault("root", DEFAULT_ROOT)
    conf.setdefault("since", DEFAULT_SINCE)
    conf.setdefault("port", 8765)
    atomic_write_json(CONF_FILE, conf)

    root = Path(conf["root"])
    if not root.is_dir():
        print(f"写真フォルダが見つかりません: {root}")
        print('  例) python server.py "D:\\03_年月別バックアップ"')
        sys.exit(1)
    since = month_from_text(conf["since"]) or DEFAULT_SINCE
    export_root = Path(conf.get("exportTo") or root.parent)

    lib = Library(root, since)
    print(f"■ 写真フォルダ: {root}  ({since} 以降)")
    lib.scan()

    url = f"http://{lan_ip()}:{conf['port']}/?k={conf['token']}"
    Handler.lib, Handler.token, Handler.export_root, Handler.lan_url = lib, conf["token"], export_root, url
    httpd = ThreadingHTTPServer(("0.0.0.0", conf["port"]), Handler)
    httpd.daemon_threads = True
    threading.Thread(target=lib.prewarm, daemon=True).start()

    print()
    print("■ PCで開く:    http://localhost:%d/" % conf["port"])
    print("■ スマホで開く: " + url)
    print("   (同じWi-Fiで。PCのページにQRコードも出ます)")
    print(f"■ まとめ先:    {export_root}\\L版印刷_日時\\")
    print("   終了するには このウィンドウを閉じる か Ctrl+C")
    print()
    if os.name == "nt":
        try:
            import webbrowser

            webbrowser.open(f"http://localhost:{conf['port']}/")
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
