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

def build_sprites():
    """Slice generated sheets at native output resolution, quantize and verify."""
    root = HERE.parents[1]
    dest = root / 'assets/sprites/station'
    hud = root / 'assets/ui/hud_v3'
    dest.mkdir(parents=True, exist_ok=True)
    source = HERE / 'drafts/sprites'
    records = []

    def region(name, box):
        im = Image.open(source / (name + '.png')).convert('RGBA')
        return im.crop(tuple(round(v * (im.width if i % 2 == 0 else im.height))
                             for i, v in enumerate(box)))

    def quantize(im):
        out = Image.new('RGBA', im.size, (*COLORS[0], 0))
        out.putdata([(*nearest(p[:3]), 255) if p[3] >= 128 else (*COLORS[0], 0)
                     for p in im.get_flattened_data()])
        return out

    def fit(im, size, height=None, width=None):
        alpha = im.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
        box = alpha.getbbox()
        assert box, 'Empty source crop'
        im = im.crop(box)
        scale = min((width or size[0]-2)/im.width, (height or size[1])/im.height)
        target = (max(1, round(im.width*scale)), max(1, round(im.height*scale)))
        if size == (32,64):
            target = (min(29, round(im.width*52/im.height)),52)
        im = im.resize(target,
                       Image.Resampling.BOX)
        out = Image.new('RGBA', size, (*COLORS[0], 0))
        out.paste(im, ((size[0]-im.width)//2, size[1]-im.height))
        out = quantize(out)
        if size == (32,64):
            box = out.getchannel('A').getbbox()
            body = out.crop(box)
            out = Image.new('RGBA',size,(*COLORS[0],0))
            out.paste(body,((32-body.width)//2,64-body.height))
        return out

    def save(name, im, purpose, tile=None):
        target = (hud if name.startswith('icon_') else dest) / (name+'.png')
        im.save(target)
        w,h = im.size
        records.append(dict(file=target.relative_to(root).as_posix(), size=[w,h],
            frames=1, pivot=([0,0] if tile else [w//2,h]), purpose=purpose, tile_axes=tile or [],
            sha256=hashlib.sha256(target.read_bytes()).hexdigest()))

    for variant in ('A', 'B'):
        im = Image.open(source / f'wall{variant}.png').convert('RGBA')
        im = quantize(im.resize((384,192), Image.Resampling.BOX))
        # Wall base is solid across its width; never a train-shaped cutout.
        d = ImageDraw.Draw(im)
        d.rectangle((0,188,383,191), fill=(*COLORS[3],255))
        save('wall_'+variant, im, 'Flat rear wall; jagged transparent roof; rail-level base')

    identities = ['cap, blue work jacket', 'headscarf, brown coat, suitcase',
                  'brown cap, jacket, bundle', 'burgundy shawl, grey skirt',
                  'grey cap, dark coat, cane', 'pale scarf, blue coat, lantern',
                  'hood, brown apron, bag', 'headscarf, green coat, suitcase']
    row_edges = (0,202,407,621,842,1074,1302,1539,1774)
    col_edges = (100,330,540,780)
    for row in range(8):
        for col, pose in enumerate(('stand','walk_0','walk_1')):
            im = region('passengers', (col_edges[col]/887,row_edges[row]/1774,
                                       col_edges[col+1]/887,row_edges[row+1]/1774))
            save(f'passenger_{row+1}_{pose}', fit(im,(32,64),height=52,width=29),
                 identities[row]+'; '+('front standing' if col==0 else 'right-facing walking'))

    for variant, x in (('A',0),('B',.5)):
        # The generator placed the coping at y=.65, rather than the requested .5.
        for kind, box, size, axes in (
            ('top',(x,0,x+.5,.64),(128,128),['x','y']),
            ('edge',(x,.65,x+.5,1),(128,32),['x'])):
            im = region('tiles',box).convert('RGB').resize(size,Image.Resampling.BOX)
            im = quantize(im.convert('RGBA'))
            # Periodic edge conditioning: wrap a 6px overlap before palette mapping.
            # Identical endpoint texels and matching adjacent strips avoid edge jumps.
            px = im.load()
            for axis in axes:
                n, other = (size[0],size[1]) if axis=='x' else (size[1],size[0])
                for j in range(other):
                    for k in range(4):
                        a,b = ((k,j),(n-1-k,j)) if axis=='x' else ((j,k),(j,n-1-k))
                        ca,cb = px[a],px[b]
                        c = (*nearest(tuple(round((ca[t]+cb[t])/2) for t in range(3))),255)
                        px[a]=px[b]=c
            save(f'platform_{kind}_{variant}',im,'Platform '+kind+' material '+variant,axes)

    arch = fit(region('props',(0,0,1,.50)),(384,224),width=384,height=224)
    # Narrow the lower supports toward the outer edge to keep the rail aperture clear.
    original = arch.copy()
    for y in range(97,224):
        factor=1-.16*min(1,(y-96)/64)
        for x in range(100):
            arch.putpixel((x,y),original.getpixel((min(99,round(x/factor)),y)))
            arch.putpixel((383-x,y),original.getpixel((383-min(99,round(x/factor)),y)))
    save('arch_A',arch,'Rib arch, plain keystone, transparent train opening')
    crops = [
        ('brazier_A_0',(.02,.50,.18,.758),(40,56)),
        ('brazier_A_1',(.23,.50,.37,.758),(40,56)),
        ('cage_A',(.43,.51,.56,.758),(32,48)),
        ('column_B_0',(.64,.50,.74,.758),(32,128)),
        ('column_B_1',(.84,.50,.94,.758),(32,128)),
        ('plate_post',(.02,.758,.18,1),(40,120)),
        ('icon_repair',(.23,.78,.39,1),(24,24)),
        ('icon_token',(.43,.78,.57,1),(24,24)),
        ('icon_seat',(.59,.78,.79,1),(24,24))]
    props = {name:fit(region('props',box),size) for name,box,size in crops}
    # Animation changes only the flame, keeping the solid pedestal/column registered.
    for prefix, split in [('brazier_A',26),('column_B',30)]:
        props[prefix+'_1'].paste(props[prefix+'_0'].crop((0,split,props[prefix+'_0'].width,
            props[prefix+'_0'].height)),(0,split))
    # Sign's reserved game-number field is exactly 36x28 at the top, flat dark iron.
    post = Image.new('RGBA',(40,120),(*COLORS[0],0))
    stem = region('props',(.075,.845,.132,.99))
    stem = stem.crop(stem.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox())
    stem = quantize(stem.resize((12,93),Image.Resampling.BOX))
    post.paste(stem,(14,27))
    props['plate_post']=post
    d = ImageDraw.Draw(post)
    d.rectangle((2,0,37,27),fill=(*COLORS[20],255))
    d.rectangle((4,2,35,25),fill=(*COLORS[1],255))
    for x,y in ((3,1),(36,1),(3,26),(36,26)):
        d.point((x,y),fill=(*COLORS[21],255))
    for name,im in props.items():
        save(name,im,'Blank 36x28 sign plate; engine draws number' if name=='plate_post'
             else 'Station prop or HUD pictogram: '+name)

    expected = {'wall_A':(384,192),'wall_B':(384,192),'arch_A':(384,224),
        'cage_A':(32,48),'plate_post':(40,120)}
    for v in ('A','B'):
        expected['platform_top_'+v]=(128,128)
        expected['platform_edge_'+v]=(128,32)
    for n in range(1,9):
        for pose in ('stand','walk_0','walk_1'):
            expected[f'passenger_{n}_{pose}']=(32,64)
    for n in range(2):
        expected[f'brazier_A_{n}']=(40,56)
        expected[f'column_B_{n}']=(32,128)
    for name in ('repair','token','seat'):
        expected['icon_'+name]=(24,24)
    assert len(records)==len(expected)==40
    for rec in records:
        im=Image.open(root/rec['file'])
        w,h=im.size
        assert im.mode=='RGBA' and im.size==expected[Path(rec['file']).stem],rec
        pixels=list(im.get_flattened_data())
        assert all(p[3] in (0,255) and p[:3] in COLORS for p in pixels),rec
        factors=[]
        for k in range(2,min(w,h)+1):
            if w%k or h%k:
                continue
            if all(pixels[y*w+x]==pixels[(y//k*k)*w+x//k*k]
                   for y in range(h) for x in range(w)):
                factors.append(k)
        assert not factors,rec
        axes=rec['tile_axes']
        if axes:
            assert all(p[3]==255 for p in pixels)
        if 'x' in axes:
            assert im.crop((0,0,1,h)).tobytes()==im.crop((w-1,0,w,h)).tobytes()
        if 'y' in axes:
            assert im.crop((0,0,w,1)).tobytes()==im.crop((0,h-1,w,h)).tobytes()
        if 'passenger_' in rec['file']:
            box=im.getchannel('A').getbbox()
            assert 48<=box[3]-box[1]<=56 and box[3]==64,rec
        rec['checks']={'off_palette_pixels':0,'soft_alpha_pixels':0,
                       'integer_upscale_factors':factors,'seams_match':axes}
    # Opening stays at least 300px wide through the lower 64px of the arch.
    for y in range(160,224):
        assert all(arch.getpixel((x,y))[3]==0 for x in range(42,342))
    for prefix in ('brazier_A','column_B'):
        assert props[prefix+'_0'].tobytes()!=props[prefix+'_1'].tobytes()

    # Preview remains diagnostic only: labels are not part of game textures.
    preview=Image.new('RGB',(2400,7000),'#14121a')
    d=ImageDraw.Draw(preview)
    x=y=12
    row_height=0
    for rec in records:
        im=Image.open(root/rec['file'])
        large=im.resize((im.width*3,im.height*3),Image.Resampling.NEAREST)
        label=Path(rec['file']).name
        cell_width=max(large.width,round(d.textlength(label)))
        if x+cell_width>2390:
            x=12; y+=row_height+34; row_height=0
        preview.paste(large,(x,y+18),large)
        d.text((x,y),label,fill='white')
        x+=cell_width+22; row_height=max(row_height,large.height+18)
    y+=row_height+42
    for i,rec in enumerate(r for r in records if r['tile_axes']):
        im=Image.open(root/rec['file'])
        repeated=Image.new('RGBA',(im.width*3,im.height*3))
        for ty in range(3):
            for tx in range(3):
                repeated.paste(im,(tx*im.width,ty*im.height))
        repeated=repeated.resize((repeated.width*3,repeated.height*3),Image.Resampling.NEAREST)
        xx=12+(i%2)*1190
        if i and i%2==0:
            y+=1185
        d.text((xx,y),Path(rec['file']).name+' / 3x3 repeat / x3 nearest',fill='white')
        preview.paste(repeated,(xx,y+20))
    preview.crop((0,0,2400,y+1180)).save(HERE/'sprites_preview.png')
    manifest=dict(schema_version=1,generation_calls=8,generation_calls_this_dispatch=5,
        previous_keyframe_calls=3,palette_source='docs/STYLE.md',assets=records,
        processing='BOX reduction directly to native size; nearest palette; binary alpha; periodic edge strips',
        preview='sprites_preview.png; x3 nearest; tiles also 3x3 repeat',
        checks='40 exact sizes; 32-color palette including hidden RGB; binary alpha; no integer enlargement; tile edge equality; passenger height; arch opening')
    (HERE/'station_sprites_manifest_v1.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print('Station sprites: 40 files validated; 0 off-palette, 0 soft alpha, 0 integer upscales; seams match.')


if __name__ == '__main__':
    import sys
    if '--keyframes' in sys.argv:
        build()
    else:
        build_sprites()
