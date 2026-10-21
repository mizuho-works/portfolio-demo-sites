"""Outline the display texts with the licensed font and write images/title.svg.

The font file is NOT part of this repo (its licence forbids web-font use and
redistribution). Usage:  python tools/make-title-sprite.py path/to/font.ttf
"""
import sys, json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

font = TTFont(sys.argv[1]); gs = font.getGlyphSet(); cmap = font.getBestCmap(); hmtx = font['hmtx']
UPM = 1024; BASE = 880; BOX_H = 1280; LINE = 1280

# id: (lines, tracking(units), stroke(units), align)
ITEMS = {
  'logo':      (['mogu'], 10, 56, 'left'),
  'l-m':       (['m'], 0, 64, 'left'), 'l-g': (['g'], 0, 64, 'left'), 'l-u': (['u'], 0, 64, 'left'),
  'hero-copy': (['ふわっと、とろける。', 'しあわせを、ひとくちで。'], 8, 30, 'center'),
  'foot-copy': (['ふわっと、とろける。しあわせを、ひとくちで。'], 8, 30, 'left'),
  't-menu':    (['全20種の、しあわせ。'], 8, 30, 'left'),
  't-drink':   (['ドリンクと一緒に。'], 8, 30, 'left'),
  't-gift':    (['手みやげにも、ごほうびにも。'], 8, 30, 'left'),
  't-news':    (['お知らせ'], 8, 30, 'left'),
  't-access':  (['お店への道のり。'], 8, 30, 'left'),
  'f1':        (['空気をまとう、', 'ふわとろ生地。'], 8, 30, 'left'),
  'f2':        (['なめらか、', 'とろけるクリーム。'], 8, 30, 'left'),
  'f3':        (['素材の香りを、', 'そのまま。'], 8, 30, 'left'),
}
def line_paths(text, track):
    x = 0; out = []
    for ch in text:
        g = cmap[ord(ch)]; pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        d = pen.getCommands()
        if d: out.append((x, d))
        x += hmtx[g][0] + track
    return out, x - track
syms = []; meta = {}
for id_, (lines, track, stroke, align) in ITEMS.items():
    rows = [line_paths(t, track) for t in lines]
    W = max(w for _, w in rows) + stroke * 2
    H = BOX_H + LINE * (len(lines) - 1)
    body = []
    for i, (paths, w) in enumerate(rows):
        ox = stroke + ((W - stroke * 2 - w) / 2 if align == 'center' else 0)
        oy = BASE + LINE * i
        body.append(f'<g transform="translate({ox:.0f} {oy})">' + ''.join(f'<path d="{d}"/>' for _, d in paths) + '</g>')
    syms.append(f'<symbol id="{id_}" viewBox="0 0 {W:.0f} {H}"><g stroke-width="{stroke}" stroke-linejoin="round">{"".join(body)}</g></symbol>')
    meta[id_] = [round(W), H]
open('images/title.svg', 'w', encoding='utf8').write('<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor">' + ''.join(syms) + '</svg>')
json.dump(meta, open('tools/title-sizes.json', 'w'))
