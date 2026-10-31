"""Demon art production only. Python 3.12 + Pillow; no runtime code."""
from pathlib import Path
import hashlib, json, re, sys
from PIL import Image, ImageDraw, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'assets/sprites/demon_v3'
PRE = HERE / 'previews'
HEX = re.search(r'```\s*([0-9a-f\s]+)```', (ROOT/'docs/STYLE.md').read_text(encoding='utf-8')).group(1).split()
COLORS = [tuple(bytes.fromhex(h)) for h in HEX]
N = Image.Resampling.NEAREST
SIZE = (160, 160)
records = []

def blank(size=SIZE):
    return Image.new('RGBA', size, COLORS[0]+(0,))

def finish(im):
    im = im.convert('RGBA')
    cache = {}
    pixels = []
    for r,g,b,a in im.getdata():
        if a < 128:
            pixels.append(COLORS[0]+(0,))
        else:
            key = r,g,b
            if key not in cache:
                cache[key] = min(COLORS, key=lambda c: sum((x-y)**2 for x,y in zip(c,key)))
            pixels.append(cache[key]+(255,))
    im.putdata(pixels)
    return im

def source(name, size, box=None):
    im = Image.open(HERE/'drafts'/name).convert('RGBA')
    if box:
        im = im.crop(box)
    bounds = im.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
    return finish(im.crop(bounds).resize(size,N))

def save(phase, index, im, duration, pivot, **extra):
    name = f'{phase}_{index:02d}'
    im = finish(im)
    im.save(OUT/(name+'.png'))
    records.append(dict(id=name, phase=phase, index=index, file='assets/sprites/demon_v3/'+name+'.png',
        size=list(SIZE), rect=[0,0,*SIZE], pivot=pivot, duration_ms=duration,
        character='furnace_mason_01', **extra))
    return im

def perch():
    base = source('perch.png',(110,124))
    # Keep both feet fixed; only the upper torso breathes by one native pixel.
    for i,dy in enumerate([0,-1,-2,-1]):
        im = blank()
        im.alpha_composite(base.crop((0,88,110,124)),(25,98))
        im.alpha_composite(base.crop((0,0,110,91)).resize((110,91-dy),N),(25,10+dy))
        # Hand-tuned eye slits: same position relative to the head, no stray antialias.
        save('perch',i,im,160,[103,134],wall_contact=[103,134],gaze='toward camera and screen left')

def previews():
    tiles=[]
    for record in records:
        im=Image.open(ROOT/record['file'])
        tile=Image.new('RGBA',(180,188),COLORS[0]+(255,))
        tile.alpha_composite(im,(10,5))
        ImageDraw.Draw(tile).text((10,170),record['id'],fill=COLORS[11]+(255,))
        tiles.append(tile)
    cols=4
    board=Image.new('RGBA',(cols*180,((len(tiles)+cols-1)//cols)*188),COLORS[0]+(255,))
    for i,tile in enumerate(tiles): board.alpha_composite(tile,((i%cols)*180,(i//cols)*188))
    board.convert('RGB').save(PRE/'contact_sheet.png')
    ref=Image.open(ROOT/'art_src/keyframes_v1/01_furnace_390x844.png').convert('RGBA')
    a=Image.open(OUT/'perch_00.png')
    ref.alpha_composite(a,(225,102))
    ref.alpha_composite(ImageOps.mirror(a),(2,210))
    ref.convert('RGB').save(PRE/'perch_390x844.png')

def validate():
    result=[]
    for path in sorted(OUT.glob('*.png')):
        im=Image.open(path).convert('RGBA')
        pixels=list(im.getdata())
        outside=sorted(set(p[:3] for p in pixels)-set(COLORS))
        badalpha=sorted(set(p[3] for p in pixels)-{0,255})
        assert not outside and not badalpha, path
        result.append(dict(file=path.relative_to(ROOT).as_posix(),size=list(im.size),
            colors_outside_palette=len(outside),nonbinary_alpha=len(badalpha),
            opaque_pixels=sum(p[3]==255 for p in pixels),sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    (HERE/'validation.json').write_text(json.dumps(dict(files=result,frame_count=len(result),colors_outside_palette=0),indent=2)+'\n',encoding='utf-8')
    print(f'{len(result)} frames; 0 colors outside palette; binary alpha in every file')

if __name__=='__main__':
    if '--check-only' not in sys.argv:
        OUT.mkdir(parents=True,exist_ok=True)
        PRE.mkdir(parents=True,exist_ok=True)
        perch()
        manifest=dict(version=3,character='furnace_mason_01',palette_source='docs/STYLE.md',
            filter='nearest',alpha='0 or 255',canvas=list(SIZE),
            left_wall='Mirror X; transform every anchor x to 159-x.',
            durations='Art playback suggestions only; gameplay timing belongs to task 36.',frames=records)
        (HERE/'demon_manifest_v3.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        previews()
    validate()
