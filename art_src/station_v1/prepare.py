"""Prepare station keyframes; preserve game pixels and quantize only new art."""
import hashlib
import json
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
COLORS = [tuple(bytes.fromhex(c)) for c in re.findall(r'\b[0-9a-f]{6}\b',
    (HERE.parents[1] / 'docs/STYLE.md').read_text(encoding='utf-8').split('```')[1])]
BAYER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))
SIZE, GRID = (390, 844), (166, 360)
BASE = Image.open(HERE / 'refs/base_stop_390x844.png').convert('RGB')

@lru_cache(maxsize=131072)
def nearest(rgb):
    return min(COLORS, key=lambda c: sum((a-b)**2 for a,b in zip(c,rgb)))

def palette_art(path):
    small = Image.open(path).convert('RGB').resize(GRID, Image.Resampling.BOX)
    pixels = []
    for i, rgb in enumerate(small.get_flattened_data()):
        x,y = i % GRID[0], i // GRID[0]
        bias = (BAYER[y % 4][x % 4] - 7.5) * .5
        pixels.append(nearest(tuple(max(0,min(255,round(c+bias))) for c in rgb)))
    small.putdata(pixels)
    return small.resize(SIZE, Image.Resampling.NEAREST)

def protected_mask():
    mask = Image.new('L', SIZE)
    d = ImageDraw.Draw(mask)
    d.rectangle((0,0,389,84), fill=255)
    # Entire lower half, all foreground rails and ground remain original game pixels.
    d.rectangle((0,422,389,843), fill=255)
    # Original locomotive including its roof, lamps, rods and front guard.
    d.polygon([(142,215),(162,204),(225,204),(245,218),(252,266),
        (265,320),(277,343),(281,391),(263,403),(256,422),
        (195,450),(132,422),(127,403),(110,393),(111,348),
        (124,323),(132,264)], fill=255)
    # Preserve actual smoke pixels, not a rectangular patch of old tunnel.
    px = BASE.load()
    for y in range(135,223):
        for x in range(172,224):
            r,g,b = px[x,y]
            if g >= r and b >= r and g > 55:
                mask.putpixel((x,y),255)
    # Existing station timer is game UI as well.
    d.rectangle((325,85,389,120), fill=255)
    return mask

def build():
    mask = protected_mask()
    records = []
    for variant in ('A','B'):
        name = f'station_{variant}_390x844.png'
        out = palette_art(HERE / 'drafts' / f'station_{variant}_people.png')
        out.paste(BASE, (0,0), mask)
        out.save(HERE / name)
        rgb, base = list(out.get_flattened_data()), list(BASE.get_flattened_data())
        outside = Counter(c for c in rgb if c not in COLORS)
        changed_outside = sum(c not in COLORS and c != b for c,b in zip(rgb,base))
        protected_changes = sum(m and c != b for m,c,b in zip(mask.get_flattened_data(),rgb,base))
        assert out.size == SIZE and changed_outside == 0 and protected_changes == 0
        assert out.crop((0,0,390,85)).tobytes() == BASE.crop((0,0,390,85)).tobytes()
        assert out.crop((0,701,390,844)).tobytes() == BASE.crop((0,701,390,844)).tobytes()
        records.append(dict(file=name,width=390,height=844,frames=1,pivot=[0,0],
            purpose='Owner choice keyframe; not a runtime sprite',
            off_palette_colors_inherited=len(outside),off_palette_pixels_inherited=sum(outside.values()),
            off_palette_pixels_changed=changed_outside,protected_pixels_changed=protected_changes,
            sha256=hashlib.sha256((HERE/name).read_bytes()).hexdigest()))
    compare = Image.new('RGB',(1170,1200),'#14121a')
    for x,im in zip((0,390,780),(BASE,Image.open(HERE/'station_A_390x844.png'),Image.open(HERE/'station_B_390x844.png'))):
        compare.paste(im,(x,0))
    # Context crops, not sprites: people remain on their own platform background.
    crops = {'A':[(20,330,104,410),(280,330,365,410)],
             'B':[(13,280,107,387),(290,280,382,387)]}
    for variant, start in [('A',0),('B',585)]:
        im = Image.open(HERE/f'station_{variant}_390x844.png')
        x = start + 8
        for box in crops[variant]:
            crop = im.crop(box)
            crop = crop.resize((crop.width*3,crop.height*3),Image.Resampling.NEAREST)
            compare.paste(crop,(x,852))
            x += crop.width+8
    compare.save(HERE/'compare_station_v1.png')
    manifest = dict(schema_version=1,generation_calls=3,palette_source='../../docs/STYLE.md',
        new_art_grid=list(GRID),sampling='BOX reduction, weak Bayer 4x4, nearest RGB palette, NEAREST enlargement',
        preservation='Original base RGB has priority per coordinator: all off-palette pixels must match base at same coordinate',
        compare_order=['base','A','B'],passenger_crops=crops,files=records)
    (HERE/'station_manifest_v1.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(records,indent=2))

if __name__ == '__main__':
    build()
