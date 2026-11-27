"""テスト用の写真（色の板＋撮影日時などのEXIF）を作る。実際の写真は使わない。
使い方: python3 make_photos.py 出力フォルダ
"""
import sys, os
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else "photos"
os.makedirs(out, exist_ok=True)

def make(name, dt, off="+09:00", model="iPhone 15", size=(400, 300), color=(200, 120, 80)):
    im = Image.new("RGB", size, color)
    ex = Image.Exif()
    ex[0x0110] = model                      # 機種
    sub = ex.get_ifd(0x8769)
    sub[0x9003] = dt                        # 撮影日時 DateTimeOriginal
    sub[0x9291] = "123"                     # 秒以下
    if off: sub[0x9011] = off               # 時差 OffsetTimeOriginal
    im.save(os.path.join(out, name), "JPEG", exif=ex, quality=80)

n = 0
for month, days in (("2025:05", 12), ("2025:06", 8)):
    for d in range(1, days + 1):
        n += 1
        make(f"IMG_{n:04d}.jpg", f"{month}:{d:02d} 12:00:00", color=(n * 9 % 255, 120, 200 - n * 5 % 200))
# 連写（同じ秒・別の名前）
make("IMG_0901.jpg", "2025:06:20 09:00:00", color=(10, 200, 10))
make("IMG_0902.jpg", "2025:06:20 09:00:00", color=(10, 10, 200))
# 旅行先（ハワイ -10:00）の写真。日本の端末では翌日 10:51:33 になる
make("IMG_0950.jpg", "2025:06:15 15:51:33", off="-10:00", color=(250, 220, 0))
print("made", n + 3, "photos in", out)
