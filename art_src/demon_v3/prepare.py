"""Demon art production only. Python 3.12 + Pillow; no runtime code."""
from pathlib import Path
import hashlib, json, random, re, sys
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
        # Bounding boxes overlap neighbouring claws: retain only this figure's
        # connected alpha component before resizing, never a neighbour's pixels.
        w,h=im.size
        live=set(i for i,a in enumerate(im.getchannel('A').getdata()) if a>=128)
        largest=set()
        while live:
            seed=live.pop()
            component={seed}
            queue=[seed]
            while queue:
                i=queue.pop()
                for j in (i-1,i+1,i-w,i+w):
                    if j in live:
                        live.remove(j)
                        component.add(j)
                        queue.append(j)
            if len(component)>len(largest): largest=component
        mask=Image.new('L',im.size)
        mask.putdata([255 if i in largest else 0 for i in range(w*h)])
        im.putalpha(mask)
    bounds = im.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
    return finish(im.crop(bounds).resize(size,N))

def material_pass(im,heat):
    # Remove orange baked rim lighting from masonry. Only eyes/sternum emit.
    warm={COLORS[a]:COLORS[b] for a,b in [(13,6),(14,7),(15,8),(16,9),(17,10),(18,11)]}
    pixels=[]
    for i,(r,g,b,a) in enumerate(im.getdata()):
        x,y=(i%im.width)/im.width,(i//im.width)/im.height
        emissive=any(l<=x<=rr and t<=y<=bb for l,t,rr,bb in heat)
        c=(r,g,b) if emissive else warm.get((r,g,b),(r,g,b))
        pixels.append((*c,a))
    im.putdata(pixels)
    return im

def save(phase, index, im, duration, pivot, **extra):
    name = f'{phase}_{index:02d}'
    im = finish(im)
    im.save(OUT/(name+'.png'))
    records.append(dict(id=name, phase=phase, index=index, file='assets/sprites/demon_v3/'+name+'.png',
        size=list(SIZE), rect=[0,0,*SIZE], pivot=pivot, duration_ms=duration,
        character='furnace_mason_01', **extra))
    return im

def perch():
    base = material_pass(source('perch.png',(110,124)),[(.27,.29,.43,.35),(.36,.42,.65,.62)])
    # Keep both feet fixed; only the upper torso breathes by one native pixel.
    for i,dy in enumerate([0,-1,-2,-1]):
        im = blank()
        im.alpha_composite(base.crop((0,88,110,124)),(25,98))
        im.alpha_composite(base.crop((0,0,110,91)).resize((110,91-dy),N),(25,10+dy))
        save('perch',i,im,160,[103,134],wall_contact=[103,134],gaze='toward camera and screen left')

def masonry(draw, x, y, w, h, tone):
    draw.rectangle((x,y,x+w-1,y+h-1),fill=COLORS[1]+(255,))
    draw.rectangle((x+1,y+1,x+w-2,y+h-2),fill=COLORS[tone]+(255,))
    draw.line((x+1,y+1,x+w-3,y+1),fill=COLORS[min(tone+1,8)]+(255,))
    draw.line((x+2,y+h-3,x+w-2,y+h-3),fill=COLORS[3]+(255,))
    if w>10:
        draw.line((x+4,y+3,x+8,y+3),fill=COLORS[min(tone+1,8)]+(255,))
        draw.rectangle((x+w-7,y+h-5,x+w-4,y+h-4),fill=COLORS[3]+(255,))
        draw.point((x+1,y+h-2),fill=COLORS[0]+(255,))

def emerge():
    base=Image.open(OUT/'perch_00.png').convert('RGBA')
    for i,cut in enumerate([76,107,141]):
        im=blank()
        d=ImageDraw.Draw(im)
        # Small broken plug of tunnel masonry behind the same demon.
        d.polygon([(73,52),(121,54),(143,74),(147,128),(132,145),(67,140),(60,112)],fill=COLORS[0]+(255,))
        for row in range(5):
            for col in range(3):
                x=66+col*25+(row%2)*6
                y=65+row*16
                if i<2 or (col==2 and row in (1,3)):
                    masonry(d,x,y,24,14,4+(row+col)%3)
        im.alpha_composite(base)
        d=ImageDraw.Draw(im)
        # The foreground courses hide the lower body, then break away.
        for row,y in enumerate(range(cut,142,15)):
            for col in range(3):
                x=60+col*26+(row%2)*5
                masonry(d,x,y,25,14,4+(row+col)%3)
        for j,(x,y) in enumerate([(44,79),(135,91),(50,124),(129,141)]):
            masonry(d,x+(-i if j%2==0 else i),min(150,y+i*3),7,5,6)
        save('emerge',i,im,120,[103,134],wall_contact=[103,134],occlusion_front_y=cut)

def actions():
    # Measured isolated alpha component bounds in the generated sheet.
    boxes=[(51,39,499,500),(507,35,1022,481),(1008,44,1524,429),
           (11,522,577,946),(609,504,1037,973),(1065,522,1525,974)]
    widths=[108,120,136,152,140,140]
    heat=[[(.30,.40,.46,.45),(.42,.48,.64,.66)],
          [(.37,.34,.49,.40),(.44,.44,.63,.65)],
          [(.32,.47,.49,.54),(.40,.59,.58,.80)],
          [(.35,.44,.51,.51),(.43,.59,.58,.77)],
          [(.31,.32,.48,.38),(.38,.43,.61,.62)],
          [(.51,.31,.67,.38),(.38,.42,.56,.65)]]
    for i,(box,w) in enumerate(zip(boxes,widths)):
        h=round((box[3]-box[1])*w/(box[2]-box[0]))
        sprite=material_pass(source('action.png',(w,h),box),heat[i])
        im=blank()
        xy=((160-w)//2,80-h//2)
        im.alpha_composite(sprite,xy)
        phase='jump' if i<4 else 'strike'
        save(phase,i if i<4 else i-4,im,120 if i<4 else 90,[80,80],
             source_rect=list(box),source_top_left=list(xy),body_center=[80,80],
             visible_width=w,root_motion='External trajectory; approach growth is baked into the four jump frames.')

def ash():
    base=Image.open(OUT/'jump_02.png').convert('RGBA')
    rng=random.Random(3703)
    fragments=[]
    for y in range(16,150,8):
        for x in range(8,152,8):
            patch=base.crop((x,y,x+8,y+8))
            if patch.getchannel('A').getbbox():
                fragments.append((x,y,patch,rng.random(),rng.uniform(-1,1),rng.uniform(-1,1)))
    for i,(survival,scale,spread) in enumerate([(1,1,1),(.72,.9,7),(.36,.6,16),(.13,.35,27)]):
        im=blank()
        for x,y,patch,rank,dx,dy in fragments:
            if rank>survival: continue
            patch=patch.copy()
            cooling=[]
            for r,g,b,a in patch.getdata():
                if i==0: c=(r,g,b)
                elif r>g*1.8 and r>100: c=COLORS[14 if i==1 else 8 if i==2 else 6]
                else: c=COLORS[4 if r>g*1.2 else 19] if i<3 else COLORS[20]
                cooling.append((*c,a))
            patch.putdata(cooling)
            size=max(2,round(8*scale))
            patch=patch.resize((size,size),N)
            px=max(2,min(156-size,round(x+(x-80)*spread/65+dx*spread)))
            py=max(2,min(156-size,round(y+(y-80)*spread/85+dy*spread+i*4)))
            im.alpha_composite(patch,(px,py))
        save('ash',i,im,[90,100,120,160][i],[80,80],body_center=[80,80],
             source_frame='jump_02',opaque_survival_target=survival)

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
    if (OUT/'jump_03.png').exists():
        ref=Image.open(ROOT/'art_src/keyframes_v1/01_furnace_390x844.png').convert('RGBA')
        attack=Image.open(OUT/'jump_03.png').resize((320,320),N)
        ref.alpha_composite(attack,(35,300))
        ref.convert('RGB').save(PRE/'jump_390x844.png')
        # Animated art composite: emergence > breathing > leap > strikes > ash.
        timeline=[]
        durations=[]
        order=([r for r in records if r['phase']=='emerge']+
               [r for r in records if r['phase']=='perch']*2+
               [r for r in records if r['phase'] in ('jump','strike','ash')])
        for r in order:
            bg=Image.open(ROOT/'art_src/keyframes_v1/01_furnace_390x844.png').convert('RGBA')
            sprite=Image.open(ROOT/r['file'])
            if r['phase'] in ('perch','emerge'):
                pos=(225,102)
            else:
                sprite=sprite.resize((320,320),N)
                t=r['index']/3 if r['phase']=='jump' else 1
                pos=(round(120-85*t),round(140+160*t))
            bg.alpha_composite(sprite,pos)
            timeline.append(bg.convert('RGB'))
            durations.append(r['duration_ms'])
        timeline[0].save(PRE/'sequence_390x844.gif',save_all=True,append_images=timeline[1:],
                         duration=durations,loop=0,optimize=False)

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
        if (HERE/'drafts/action.png').exists():
            emerge()
            actions()
            ash()
        manifest=dict(version=3,character='furnace_mason_01',palette_source='docs/STYLE.md',
            filter='nearest',alpha='0 or 255',canvas=list(SIZE),
            left_wall='Mirror X; transform every anchor x to 159-x.',
            durations='Art playback suggestions only; gameplay timing belongs to task 36.',
            phases={'emerge':{'count':3,'loop':False,'next':'perch'},
                    'perch':{'count':4,'loop':True,'next':'jump'},
                    'jump':{'count':4,'loop':False,'next':'strike'},
                    'strike':{'count':2,'loop':False,'next':'despawn'},
                    'ash':{'count':4,'loop':False,'next':'despawn','trigger':'killed during emergence, perch or jump'}},
            frames=records)
        (HERE/'demon_manifest_v3.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        previews()
    validate()
