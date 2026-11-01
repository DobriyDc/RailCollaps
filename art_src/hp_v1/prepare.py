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

GRIP = [43,56]

def hanging():
    src=Image.open(HERE/'drafts/hang.png').convert('RGBA')
    poses=[]
    # Identical sampling scale and vertical origin, measured from the draft.
    # Each source's leftmost supporting claw is aligned before resampling.
    for col,left in enumerate((45,13,10)):
        cut=src.crop((col*564+left,156,col*564+left+520,786))
        pose=blank((160,160))
        pose.alpha_composite(cut.resize((78,126),N),(40,20))
        poses.append(finish(pose))
    # One shared support arm: it cannot slide on the cabin during the strike.
    support=poses[0].crop((40,50,70,74))
    idle=poses[0]
    breathing=blank((160,160))
    breathing.alpha_composite(idle,(0,-1))
    frames=[idle,breathing,poses[1],poses[2]]
    records=[]
    for index,im in enumerate(frames):
        im.paste((*PAL[0],0),(40,49,70,75))
        im.alpha_composite(support,(40,50))
        im=finish(im)
        im.save(DEMON/f'hang_{index:02d}.png')
        bbox=im.getchannel('A').getbbox()
        records.append(dict(file=f'assets/sprites/demon_v3/hang_{index:02d}.png',size=[160,160],frames=1,pivot=GRIP,grip=GRIP,character='furnace_mason_01',purpose=['hang','breathe','windup','claw strike'][index],duration_ms=[180,180,150,100][index],opaque_bbox=list(bbox),opaque_width_world=round((bbox[2]-bbox[0])*1.2,1)))
    write_json('demon_manifest_v1.json',dict(palette='docs/STYLE.md',alpha=[0,255],side='right',mirror_left='x -> 159-x; mirrored grip [116,56]',world_units_per_pixel=1.2,locomotive_width_world=290,max_allowed_width_world=290/3,grip_note='Permanent support hand remains fixed; the other hand winds up and strikes.',files=records))
    preview=Image.new('RGBA',(1280,320),(*PAL[1],255))
    for i,im in enumerate(frames): preview.alpha_composite(im.resize((320,320),N),(i*320,0))
    preview.save(HERE/'demon_preview.png')

def comparison():
    sheet=Image.new('RGBA',(1440,1120),(*PAL[1],255))
    sheet.alpha_composite(Image.open(HERE/'portraits_preview.png'),(144,0))
    for i,state in enumerate(('full','empty')):
        im=Image.open(HUD/f'icon_hp_{state}.png')
        sheet.alpha_composite(im.resize((96,96),N),(560+i*128,600))
        sheet.alpha_composite(im.resize((30,30),N),(825+i*40,630))
    train=Image.open(ROOT/'assets/px/train/loco_run_0.png').convert('RGBA')
    # 290 world units / 1.2 world units per sprite pixel = 241.6667 px.
    train=train.resize((242,round(train.height*242/train.width)),N)
    for i in range(4):
        x=i*360
        sheet.alpha_composite(train,(x+15,744))
        sheet.alpha_composite(Image.open(DEMON/f'hang_{i:02d}.png'),(x+155,792))
    finish(sheet).save(HERE/'compare.png')

def validate():
    records=[]
    for filename in ('icons_manifest_v1.json','portraits_manifest_v1.json','demon_manifest_v1.json'):
        records.extend(json.loads((HERE/filename).read_text(encoding='utf-8'))['files'])
    bad_colors=set()
    for record in records:
        im=Image.open(ROOT/record['file']).convert('RGBA')
        assert list(im.size)==record['size'], record['file']
        assert set(im.getchannel('A').getdata()) <= {0,255}, record['file']
        bad_colors.update(tuple(p[:3]) for p in im.getdata() if tuple(p[:3]) not in PAL)
    assert not bad_colors, bad_colors
    assert Image.open(HUD/'icon_hp_full.png').getchannel('A').tobytes()==Image.open(HUD/'icon_hp_empty.png').getchannel('A').tobytes()
    hands=[]
    widths=[]
    for i in range(4):
        im=Image.open(DEMON/f'hang_{i:02d}.png')
        hands.append(im.crop((40,50,70,74)).tobytes())
        assert im.getpixel(tuple(GRIP))[3]==255
        bbox=im.getchannel('A').getbbox()
        width=(bbox[2]-bbox[0])*1.2
        assert width <= 290/3
        widths.append(round(width,1))
    assert len(set(hands))==1
    # All delivered source/preview PNGs also obey the palette and binary alpha.
    for p in HERE.rglob('*.png'):
        im=Image.open(p).convert('RGBA')
        assert set(im.getchannel('A').getdata()) <= {0,255}, p
        assert all(tuple(c[:3]) in PAL for c in im.getdata()), p
    result=dict(groups=[2,12,4],outside_palette_colors=0,alpha=[0,255],grip=GRIP,demon_widths_world=widths,max_allowed_width_world=290/3,assets_checked=len(records),all_package_pngs_checked=True)
    write_json('validation_v1.json',result)
    print(json.dumps(result))

if __name__ == '__main__':
    if sys.argv[1] == 'icons': icons()
    if sys.argv[1] == 'portraits': portraits()
    if sys.argv[1] == 'hanging': hanging()
    if sys.argv[1] == 'comparison': comparison()
    if sys.argv[1] == 'normalize':
        for p in HERE.rglob('*.png'): finish(Image.open(p)).save(p)
    if sys.argv[1] == 'validate': validate()
