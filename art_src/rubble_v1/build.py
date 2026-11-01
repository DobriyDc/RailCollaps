"""Rebuild the two palette-locked assets and the required comparison sheet (Pillow only)."""
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
palette = [tuple(bytes.fromhex(h)) for h in re.findall(r'\b[0-9a-f]{6}\b', (ROOT / 'docs/STYLE.md').read_text(encoding='utf-8'))]
NEAREST = Image.Resampling.NEAREST


def lock(im):
    result = Image.new('RGBA', im.size, (11, 10, 16, 0))
    cache = {}
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = im.getpixel((x, y))
            if a < 128:
                continue
            rgb = (r, g, b)
            if rgb not in cache:
                cache[rgb] = min(palette, key=lambda c: sum((c[i] - rgb[i]) ** 2 for i in range(3)))
            result.putpixel((x, y), (*cache[rgb], 255))
    return result


source = Image.open(HERE / 'generation.png').convert('RGBA')
source.putalpha(source.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
source = source.crop(source.getbbox())
small = lock(source.resize((120, 52), NEAREST))
rubble = Image.new('RGBA', (120, 72), (11, 10, 16, 0))
rubble.alpha_composite(small, (0, 20))
# Settle loose foreground fragments into the ballast, retaining a stepped edge.
# Extend the existing column material only; no rectangular ground tile is added.
for x in range(120):
    ys = [y for y in range(72) if rubble.getpixel((x, y))[3]]
    if not ys:
        continue
    end = 71 if 5 <= x <= 114 else (69 if x % 3 else 70)
    for y in range(max(ys) + 1, end + 1):
        rubble.putpixel((x, y), rubble.getpixel((x, max(ys))))
    if x in (8, 83):
        rubble.putpixel((x, 71), (11, 10, 16, 0))

# Two fallen edge bricks widen the shoulder without flattening the whole mound.
d = ImageDraw.Draw(rubble)
d.polygon([(2, 49), (5, 46), (11, 48), (12, 54), (8, 59), (2, 56)], fill='#241a24')
d.polygon([(3, 49), (5, 47), (10, 49), (8, 52)], fill='#7a4a3a')
d.polygon([(3, 50), (8, 53), (8, 57), (3, 55)], fill='#5c3a35')
d.polygon([(111, 49), (115, 47), (118, 49), (119, 57), (113, 60)], fill='#241a24')
d.polygon([(112, 49), (115, 48), (117, 50), (114, 52)], fill='#7a4a3a')
d.polygon([(114, 53), (118, 51), (118, 56), (114, 58)], fill='#5c3a35')

# A compact glyph from the same heap, with hand-placed material faces and flange.
icon = Image.new('RGBA', (24, 24))
d = ImageDraw.Draw(icon)
# Redraw the same material masses as five broad bricks and two coal chunks:
# the HUD's 24 px glyphs use large planes, not downsampled surface texture.
d.polygon([(0, 19), (2, 14), (5, 12), (7, 7), (12, 8), (16, 10),
           (20, 13), (23, 17), (23, 21), (1, 21)], fill='#0b0a10')
def brick(points):
    a, b, c, e = points
    d.polygon([a, b, c, e], fill='#b07a58')
    d.polygon([e, c, (c[0], c[1]+3), (e[0], e[1]+3)], fill='#7a4a3a')
    d.polygon([a, e, (e[0], e[1]+3), (a[0], a[1]+3)], fill='#5c3a35')
brick([(7, 8), (10, 7), (14, 9), (11, 11)])
brick([(2, 14), (5, 12), (9, 14), (6, 16)])
brick([(14, 13), (18, 12), (22, 15), (18, 16)])
brick([(8, 17), (11, 15), (15, 17), (12, 19)])
brick([(17, 19), (20, 17), (23, 18), (21, 20)])
d.polygon([(1, 19), (3, 17), (6, 18), (7, 21), (1, 21)], fill='#2a3038')
d.line([(2, 18), (4, 18), (5, 19)], fill='#465058')
d.polygon([(12, 12), (14, 10), (17, 11), (16, 14), (13, 15)], fill='#2a3038')
d.line([(14, 11), (16, 12)], fill='#465058')
# Broken rail: bright flange, dark web, rusty foot, partly occluded by front brick.
d.line([(5, 17), (19, 8)], fill='#0b0a10', width=3)
d.line([(5, 18), (19, 9)], fill='#5c3a35')
d.line([(5, 16), (19, 7)], fill='#9aa8ac')
d.line([(5, 17), (19, 8)], fill='#465058')
d.line([(18, 7), (20, 7)], fill='#6c7880')
brick([(8, 17), (11, 15), (14, 17), (11, 19)])
icon = lock(icon)

targets = [('assets/px/pickups/rubble.png', rubble, [60, 71], 'Track-blocking masonry heap'),
           ('assets/ui/hud_v3/icon_rubble.png', icon, [12, 12], 'Rubble hazard HUD glyph')]
manifest = {'palette_source': 'docs/STYLE.md', 'filter': 'nearest', 'assets': []}
for path, im, pivot, purpose in targets:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    im.save(target)
    pixels = [im.getpixel((x, y)) for y in range(im.height) for x in range(im.width)]
    colors = {p[:3] for p in pixels if p[3]}
    assert colors <= set(palette)
    assert {p[:3] for p in pixels} <= set(palette)
    assert {p[3] for p in pixels} <= {0, 255}
    manifest['assets'].append({'file': path, 'size': list(im.size), 'frames': 1, 'pivot_px': pivot,
                               'purpose': purpose, 'colors': len(colors), 'outside_palette': 0,
                               'alpha': [0, 255]})
rows = [sum(rubble.getpixel((x, y))[3] == 255 for x in range(120)) for y in range(48, 72)]
columns = sum(any(rubble.getpixel((x, y))[3] == 255 for y in range(48, 72)) for x in range(120))
manifest['lower_third'] = {'rows_inclusive': [48, 71], 'opaque_columns': columns,
    'width_percent': columns / 120 * 100, 'mean_row_percent': sum(rows) / (120 * 24) * 100,
    'minimum_row_percent': min(rows) / 120 * 100, 'opaque_pixels_per_row': rows}
assert columns >= 108 and min(rows) >= 108
(HERE / 'rubble_manifest_v1.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

sheet = Image.new('RGB', (640, 470), '#17121b')
draw = ImageDraw.Draw(sheet)
draw.text((18, 14), 'RAIL LINK: COLLAPSE / RUBBLE V1', fill='#e8d0a8')
draw.text((18, 38), 'Native scale: loco_run_0 and rubble, shared baseline', fill='#9aa8ac')
loco = Image.open(ROOT / 'assets/px/train/loco_run_0.png').convert('RGBA')
sheet.paste(loco, (40, 65), loco)
sheet.paste(rubble, (210, 193), rubble)
draw.line((20, 266, 350, 266), fill='#47303a')
draw.text((44, 274), '139 x 200', fill='#9aa8ac')
draw.text((218, 274), '120 x 72', fill='#9aa8ac')
draw.text((386, 55), 'Rubble silhouette x2', fill='#9aa8ac')
sheet.paste(rubble.resize((240, 144), NEAREST), (382, 100), rubble.resize((240, 144), NEAREST))
draw.text((18, 314), 'HUD x4: rubble / gap / lava', fill='#e8d0a8')
for x, name, im in [(24, 'RUBBLE', icon), (150, 'GAP', Image.open(ROOT / 'assets/ui/hud_v3/icon_gap.png')),
                    (276, 'LAVA', Image.open(ROOT / 'assets/ui/hud_v3/icon_lava.png'))]:
    draw.rectangle((x - 4, 336, x + 99, 439), fill='#0b0a10')
    up = im.convert('RGBA').resize((96, 96), NEAREST)
    sheet.paste(up, (x, 340), up)
    draw.text((x, 448), name, fill='#9aa8ac')
draw.text((421, 314), 'At display size 54 px', fill='#e8d0a8')
up = icon.resize((54, 54), NEAREST)
sheet.paste(up, (466, 353), up)
sheet.paste(icon, (556, 369), icon)
sheet.save(HERE / 'compare.png')
print(json.dumps(manifest, indent=2))
