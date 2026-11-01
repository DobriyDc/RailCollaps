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

NAMES = ['calm','tense','joy','hit','fire','fall']

def wound_layer(level, eye_dy=0):
    """Shared wound design traced at native resolution from drafts/wounds.png."""
    layer=blank((48,48))
    d=ImageDraw.Draw(layer)
    def line(points,c,width=1): d.line(points,fill=(*PAL[c],255),width=width)
    def poly(points,c): d.polygon(points,fill=(*PAL[c],255))
    # Brow laceration and temple rivulet leave gaze and mouth intact.
    line([(29,18),(32,18),(35,20),(36,23),(37,26),(36,29),(37,33)],12,2)
    line([(30,18),(33,19),(35,21)],13)
    line([(36,25),(37,27),(36,28)],13)
    line([(12,29),(14,30),(15,29)],12)
    line([(12,29),(13,29)],13)
    line([(33,34),(34,35)],13)
    if level == 2:
        ey=24+eye_dy
        poly([(28,ey-2),(33,ey-2),(36,ey),(36,ey+4),(33,ey+6),(29,ey+5),(27,ey+2)],4)
        poly([(29,ey-1),(33,ey-1),(35,ey+1),(34,ey+3),(29,ey+2)],6)
        line([(28,ey+2),(31,ey+3),(34,ey+2)],1)
        line([(30,ey+5),(33,ey+5)],6)
        line([(31,ey-1),(33,ey)],8)
        # Heavier forehead wound and blood around the bruised eye.
        poly([(19,17),(23,17),(25,19),(24,21),(22,20),(20,23),(18,22)],12)
        line([(20,18),(22,19),(22,20),(20,21)],13)
        line([(18,21),(17,24)],12,2)
        line([(35,19),(38,23),(38,30),(36,33),(36,38),(34,42)],12,2)
        line([(37,22),(37,28),(35,30),(36,34)],13)
        poly([(11,28),(14,29),(16,31),(15,34),(13,35),(11,33)],12)
        line([(12,29),(14,31),(13,33),(14,38),(16,40)],13)
        line([(12,34),(12,37)],12,2)
        line([(26,27),(27,29),(28,30)],13)
        line([(31,39),(33,40),(33,43)],12,2)
        line([(32,40),(32,42)],13)
    return layer

def portraits():
    records=[]
    for name in NAMES:
        base=Image.open(HUD/f'portrait_{name}.png').convert('RGBA')
        for level in (1,2):
            im=base.copy()
            if level==2:
                # Shift cap on its own layer; all expression pixels stay original.
                cap=blank((48,48))
                cap.alpha_composite(base.crop((0,0,48,18)),(0,0))
                im.paste((*PAL[0],0),(0,0,48,18))
                cap=cap.rotate(-8,N,center=(24,17))
                im.alpha_composite(cap,(-1,0))
            overlay=wound_layer(level, -1 if name in ('fire','fall') else 1 if name=='hit' else 0)
            # Clip wounds to the original facial silhouette.
            for y in range(48):
                for x in range(48):
                    if base.getpixel((x,y))[3]<128: overlay.putpixel((x,y),(*PAL[0],0))
            im.alpha_composite(overlay)
            im=finish(im)
            filename=f'portrait_{name}_w{level}.png'
            im.save(HUD/filename)
            records.append(dict(file='assets/ui/hud_v3/'+filename,size=[48,48],frames=1,pivot=[24,24],purpose=f'{name}, injury {level}',source=f'assets/ui/hud_v3/portrait_{name}.png',wound_level=level))
    for level in (1,2): finish(wound_layer(level)).save(HERE/f'wounds_w{level}.png')
    write_json('portraits_manifest_v1.json',dict(palette='docs/STYLE.md',alpha=[0,255],files=records))
    sheet=Image.new('RGBA',(1152,576),(*PAL[1],255))
    for col,name in enumerate(NAMES):
        for row,suffix in enumerate(['','_w1','_w2']):
            im=Image.open(HUD/f'portrait_{name}{suffix}.png')
            sheet.alpha_composite(im.resize((192,192),N),(col*192,row*192))
    sheet.save(HERE/'portraits_preview.png')

if __name__ == '__main__':
    if sys.argv[1] == 'icons': icons()
    if sys.argv[1] == 'portraits': portraits()
