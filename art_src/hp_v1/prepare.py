"""Offline art assembly, Python + Pillow only. Does not change existing assets."""
from pathlib import Path
from PIL import Image, ImageDraw
import json, re, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
HEX = re.search(r'```\s*([0-9a-f\s]+)```', (ROOT/'docs/STYLE.md').read_text(encoding='utf-8')).group(1).split()
PAL = [tuple(bytes.fromhex(h)) for h in HEX]
N = Image.Resampling.NEAREST
HUD = ROOT/'assets/ui/hud_v3'
DEMON = ROOT/'assets/sprites/demon_v3'

def blank(size):
    return Image.new('RGBA', size, (*PAL[0], 0))

def finish(im):
    im = im.convert('RGBA')
    cache = {}
    out = []
    for r,g,b,a in im.getdata():
        rgb = r,g,b
        if a < 128:
            out.append((*PAL[0],0))
        else:
            if rgb not in cache:
                cache[rgb] = min(PAL, key=lambda c: sum((v-w)**2 for v,w in zip(c,rgb)))
            out.append((*cache[rgb],255))
    im.putdata(out)
    return im

def write_json(name, data):
    (HERE/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def icons():
    src = Image.open(HERE/'drafts/hp.png').convert('RGBA')
    crop = src.crop(src.getchannel('A').point(lambda a: 255 if a>=128 else 0).getbbox())
    full = blank((24,24))
    full.alpha_composite(crop.resize((20,22),N),(2,1))
    full = finish(full)
    # Two stable 2px lamp cores survive presentation at approximately 30px.
    d=ImageDraw.Draw(full)
    for x in (5,16):
        d.rectangle((x,14,x+2,16),fill=(*PAL[16],255))
        d.rectangle((x,14,x+1,15),fill=(*PAL[18],255))
    full.save(HUD/'icon_hp_full.png')
    empty=full.copy()
    empty.putdata([((*PAL[20 if max(r,g,b)>100 else 19 if max(r,g,b)>45 else 2],255) if a else (*PAL[0],0)) for r,g,b,a in full.getdata()])
    empty.save(HUD/'icon_hp_empty.png')
    write_json('icons_manifest_v1.json',dict(palette='docs/STYLE.md',alpha=[0,255],files=[dict(file='assets/ui/hud_v3/icon_hp_'+state+'.png',size=[24,24],frames=1,pivot=[12,12],purpose='train life '+state) for state in ('full','empty')]))

if __name__ == '__main__':
    if sys.argv[1] == 'icons': icons()
