"""Prepare the train's retained image_gen originals with Pillow; no game code."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import json, re, math, hashlib, sys

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art_src/train_v3'
OUT = ROOT / 'assets/textures/train'
PAL = [tuple(bytes.fromhex(x)) for x in re.search(r'```\s*([\s\S]*?)```', (ROOT/'docs/STYLE.md').read_text(encoding='utf-8'))[1].split()]
ENTRIES = []

def write_json(name, value):
    (SRC/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def material(im, flatten=False):
    """Separate rust pigment and iron; suppress generated broad lighting gradients."""
    im = im.convert('RGB')
    local = im.filter(ImageFilter.BoxBlur(5))
    out = Image.new('RGBA', im.size)
    for y in range(im.height):
        for x in range(im.width):
            r,g,b = im.getpixel((x,y)); avg = sum(local.getpixel((x,y)))/3
            lum = (r+g+b)/3
            if r > g*1.32 and r > b*1.15 and r > 40:
                idx = 6 if r<83 else 7 if r<135 else 8
            elif lum < 25 or (flatten and lum < avg-15): idx=1
            elif flatten: idx = 20 if lum>avg+21 else 19
            else: idx=19 if lum>45 else 2
            out.putpixel((x,y), (*PAL[idx],255))
    return out

def save(name, im, purpose, **extra):
    im.save(OUT/f'{name}.png')
    ENTRIES.append(dict(file=f'assets/textures/train/{name}.png',size_px=list(im.size),frames=1,
                        pivot=[.5,.5],purpose=purpose,**extra))
    return im

def main_textures():
    src=Image.open(SRC/'drafts/boiler.png')
    face=material(src.crop((40,304,576,840)).resize((80,80),Image.Resampling.BOX))
    d=ImageDraw.Draw(face)
    # Octagonal solid cap, matching the exact cross section in the manifest.
    poly=[(24,0),(55,0),(79,24),(79,55),(55,79),(24,79),(0,55),(0,24)]
    mask=Image.new('L',(80,80)); ImageDraw.Draw(mask).polygon(poly,fill=255)
    d.line(poly+[poly[0]], fill=PAL[2],width=2)
    face.putalpha(mask)
    # Headlamp socket is deliberately OFF; the emitter is a separate later file.
    d.ellipse((32,32,47,47),fill=PAL[1])
    save('boiler_face',face,'Круглая дверь дымовой коробки, фара выключена',face_units=[1,1],source_crop=[40,304,576,840])
    side=material(src.crop((745,372,1460,790)).resize((160,80),Image.Resampling.BOX), True)
    d=ImageDraw.Draw(side)
    # Equal edge material and continuous belt attachment positions on all faces.
    d.rectangle((0,0,159,79),outline=PAL[2],width=1)
    for x in [27,113]:
        d.rectangle((x,1,x+3,78),fill=PAL[6]); d.line((x+1,1,x+1,78),fill=PAL[8])
        for y in [8,28,48,68]: d.point((x+2,y),fill=PAL[2])
    save('boiler_side',side,'Плоская обшивка котла: U от носа к кабине, V сверху вниз',face_units=[2,1],source_crop=[745,372,1460,790])
    return face,side

def validate():
    rows=[]
    for e in ENTRIES:
        path=ROOT/e['file']; im=Image.open(path).convert('RGBA'); colors=set(im.getdata())
        bad={p[:3] for p in colors if p[:3] not in PAL}
        soft={p[3] for p in colors if p[3] not in [0,255]}
        rows.append(dict(file=e['file'],size_px=list(im.size),colors_outside_palette=len(bad),
                         alpha_outside_binary=len(soft),visible_colors=len({p[:3] for p in colors if p[3]}),sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    write_json('validation.json',dict(game_png_count=len(rows),colors_outside_palette=sum(r['colors_outside_palette'] for r in rows),files=rows))
    assert all(r['colors_outside_palette']==r['alpha_outside_binary']==0 for r in rows)

def first_pass():
    face,side=main_textures()
    board=Image.new('RGB',(860,320),PAL[0]); board.paste(face.resize((240,240),Image.Resampling.NEAREST),(20,40),face.resize((240,240),Image.Resampling.NEAREST))
    board.paste(side.resize((480,240),Image.Resampling.NEAREST),(330,40))
    board.save(SRC/'previews/face_side.png')
    write_json('train_manifest_v3.json',dict(version=3,stage='face_and_side',unit='front boiler width = 1 = 80 source pixels',assets=ENTRIES,
        boiler=dict(length_units=2,center_y_units=.8,cross_section_xy_units=[[-.2,1.3],[.2,1.3],[.5,1],[.5,.6],[.2,.3],[-.2,.3],[-.5,.6],[-.5,1]],front_z=0,rear_z=2)))
    validate()

if __name__=='__main__':
    first_pass()
