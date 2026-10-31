"""Reproduce the approved world pack from retained image_gen drafts; Pillow only."""
from pathlib import Path
from PIL import Image, ImageChops
import json, re, sys, hashlib

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art_src/world_v3'
TEX = ROOT / 'assets/textures/world'
SPR = ROOT / 'assets/sprites/world'
PAL = [tuple(bytes.fromhex(x)) for x in re.search(r'```\s*([\s\S]*?)```', (ROOT/'docs/STYLE.md').read_text(encoding='utf-8'))[1].split()]
NAMES = ['brick_wall','vault_brick','arch_rib','floor_ballast','track'] + [f'lava_{i}' for i in range(4)]
ENTRIES = []

def quant(im, indices=None):
    pal = PAL if indices is None else [PAL[i] for i in indices]
    rgba=im.convert('RGBA'); out=Image.new('RGBA', im.size); cache={}
    for p in set(rgba.getdata()):
        rgb=min(pal,key=lambda c:sum((c[i]-p[i])**2 for i in range(3)))
        cache[p]=(*rgb,255 if p[3]>=128 else 0) if p[3]>=128 else (*PAL[0],0)
    out.putdata([cache[p] for p in rgba.getdata()])
    return out if im.mode=='RGBA' else out.convert('RGB')

def draft(name,size=(128,128)):
    return Image.open(SRC/'drafts'/f'{name}.png').convert('RGBA').resize(size,Image.Resampling.BOX)

def periodic(im,axes):
    # Merge only the eight-pixel wrap margin; all final colours are snapped afterwards.
    im=im.convert('RGB'); w,h=im.size
    for axis in axes:
        n=w if axis=='X' else h; m=h if axis=='X' else w
        for k in range(8):
            t=(8-k)/16
            for j in range(m):
                a=(k,j) if axis=='X' else (j,k)
                b=(n-1-k,j) if axis=='X' else (j,n-1-k)
                ca,cb=im.getpixel(a),im.getpixel(b)
                im.putpixel(a,tuple(round(ca[i]*(1-t)+cb[i]*t) for i in range(3)))
                im.putpixel(b,tuple(round(cb[i]*(1-t)+ca[i]*t) for i in range(3)))
    return im

def save(im,name,folder,purpose,axes=(),**extra):
    im.save(folder/f'{name}.png')
    entry=dict(file=(folder/f'{name}.png').relative_to(ROOT).as_posix(),size=list(im.size),frames=1,pivot=[.5,.5],purpose=purpose,seamless_axes=list(axes),mode=im.mode)
    entry.update(extra); ENTRIES.append(entry)
    if axes:
        p=Image.new('RGB',(384,384))
        for y in range(3):
            for x in range(3):p.paste(im,(x*128,y*128))
        p.save(SRC/'previews'/f'{name}_3x3.png')
        entry['preview']=f'previews/{name}_3x3.png'

def tiles():
    # Rebuild staggered bond from quiet source brick faces, no generated borders.
    wall=draft('wall').convert('RGB'); im=Image.new('RGB',(128,128),PAL[2])
    for row in range(8):
        for col in range(-1,5):
            face=wall.crop((3+(col%4)*32,3+(row%5)*24,29+(col%4)*32,21+(row%5)*24)).resize((30,14),Image.Resampling.NEAREST)
            x=col*32+(16 if row%2 else 0)
            im.paste(face,(x+1,row*16+1))
    save(quant(periodic(im,'XY'),[2,3,4,6]),'brick_wall',TEX,'Горизонтальная кладка стены', 'XY')
    vault=draft('vault').convert('RGB'); im=Image.new('RGB',(128,128),PAL[2])
    for col in range(8):
        for row in range(-1,5):
            face=vault.crop((2+(col%8)*16,3+(row%3)*32,14+(col%8)*16,29+(row%3)*32)).resize((14,30),Image.Resampling.NEAREST)
            im.paste(face,(col*16+1,row*32+(16 if col%2 else 0)+1))
    save(quant(periodic(im,'XY'),[2,3,4,6]),'vault_brick',TEX,'Кладка свода, длинная ось кирпича вдоль V','XY')
    save(quant(periodic(draft('rib'),'Y'),[2,4,6,7]),'arch_rib',TEX,'Прямое ребро арки; изгиб задаёт меш','Y')
    ballast=quant(periodic(draft('ballast'),'XY'),[2,19,20,6])
    save(ballast,'floor_ballast',TEX,'Холодный балласт между путями','XY')
    track=draft('track').convert('RGB'); im=ballast.copy()
    # Four broad sleepers, two non-tapering rails, consistent gauge along V.
    sleeper=track.crop((12,15,116,27)).resize((110,12),Image.Resampling.NEAREST)
    for y in [10,42,74,106]: im.paste(sleeper,(9,y))
    for x,sx in [(27,24),(91,91)]:
        rail=track.crop((sx,0,sx+10,128)); im.paste(rail,(x,0))
    save(quant(periodic(im,'Y'),[2,3,4,6,7,19,20,21]),'track',TEX,'Одна полоса: две прямые рельсы, четыре шпалы; вид сверху','Y',rail_centers_u_px=[32,96],sleeper_pitch_v_px=32)
    lava=quant(periodic(draft('lava'),'XY'),[5,13,15,17])
    # Exact four-phase loop; each frame remains periodic after toroidal shift.
    for i in range(4):
        frame=ImageChops.offset(lava,0,i*32)
        save(frame,f'lava_{i}',TEX,'Магма; только сам источник излучает','XY',animation='lava_flow',frame=i,duration_ms=180)

def backgrounds():
    specs=[('bg_01_void','Дальняя пустота с магмой',48,[0,1,5,12,13,15,17]),
           ('bg_02_arches','Рушащаяся круглая арка',36,[0,2,3,4,6,7,19,20]),
           ('bg_03_column','Колонна и падающая кладка',24,[0,2,3,4,6,7,19,20]),
           ('bg_04_rubble','Кромка балласта, шпал и рельсов',12,[0,2,3,4,6,7,19,20,21])]
    layers=[]
    for order,(name,purpose,depth,palette) in enumerate(specs):
        im=quant(draft(name,(384,256)),palette)
        if order==0:
            # Raise magma through the nearest rubble's open silhouette.
            canvas=Image.new('RGBA',(384,256),(*PAL[0],0))
            canvas.paste(im,(0,-24)); im=canvas
        save(im,name,SPR,purpose,layer_order=order,depth_relative=depth,depth_units='same arbitrary world unit; tune to scene',pivot=[.5,1.0],world_anchor='shared collapse-front floor center',wrap='clamp',alpha_mode='test >= 0.5',recommended_render_width_px=384)
        layers.append(im)
    composite=Image.new('RGBA',(384,256),(*PAL[0],255))
    for im in layers:composite=Image.alpha_composite(composite,im)
    composite.convert('RGB').save(SRC/'previews/background_composite.png')
    board=Image.new('RGB',(1182,844),PAL[0])
    board.paste(Image.open(ROOT/'art_src/keyframes_v1/01_furnace_390x844.png'),(0,0))
    board.paste(composite.resize((768,512),Image.Resampling.NEAREST),(414,0))
    for i,im in enumerate(layers):
        thumb=im.resize((192,128),Image.Resampling.NEAREST)
        board.paste(thumb,(414+i*192,560),thumb)
    # Same-material swatches under the composited and exploded layer views.
    for i,name in enumerate(['brick_wall','vault_brick','arch_rib','floor_ballast','track','lava_0']):
        board.paste(Image.open(TEX/f'{name}.png'),(414+i*128,708))
    board.save(SRC/'previews/reference_and_layers.png')

def collapse_parts():
    material=[2,3,4,6,7,19,20,21]
    track=Image.open(TEX/'track.png').convert('RGBA')
    edges=[]
    for name,solid in [('gap_front','bottom'),('gap_back','top')]:
        raw=draft(name)
        if solid=='top':
            # Align generated 51px rail gauge to the established 64px gauge.
            raw=raw.resize((160,128),Image.Resampling.NEAREST).crop((16,0,144,128))
        im=quant(raw,material)
        # Attach with exact existing tile pixels; irregular material boundary stays inside intact floor.
        for x in range(128):
            threshold=32+(x//7%5-2) if solid=='top' else 96+(x//7%5-2)
            for y in range(128):
                if (solid=='top' and y<threshold) or (solid=='bottom' and y>threshold):
                    im.putpixel((x,y),track.getpixel((x,y)))
        save(im,name,SPR,'Передний край провала' if solid=='bottom' else 'Задний край провала',pivot=[.5,1.0 if solid=='bottom' else 0.0],surface='horizontal floor plane, overhead UV; no billboard',solid_edge=solid,attachment_exact_band_px=28,rail_centers_u_px=[32,96],wrap='clamp')
        edges.append(im)
    # Isolated components from the same column draft: no repainting or invented geometry.
    column=quant(draft('bg_03_column',(384,256)),material)
    boxes=[(100,82,135,114),(76,128,102,157),(144,117,176,157),(119,168,143,192),(154,184,185,220),(156,65,174,83)]
    chunks=[]
    for i,box in enumerate(boxes):
        cut=column.crop(box); im=Image.new('RGBA',(64,64),(*PAL[0],0)); im.paste(cut,((64-cut.width)//2,(64-cut.height)//2))
        save(im,f'chunk_brick_{i+1:02d}',SPR,'Отдельный падающий кирпичный блок',source='drafts/bg_03_column.png',source_crop_logical=list(box),wrap='clamp')
        chunks.append(im)
    # Large detached keystone wedge, mask only its original connected component.
    arches=quant(draft('bg_02_arches',(384,256)),material)
    cut=arches.crop((292,12,365,90)); mask=cut.getchannel('A'); candidates={(x,y) for y in range(cut.height) for x in range(cut.width) if mask.getpixel((x,y))}
    groups=[]
    while candidates:
        p=candidates.pop(); todo=[p]; group=[p]
        while todo:
            x,y=todo.pop()
            for p in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if p in candidates:candidates.remove(p);todo.append(p);group.append(p)
        groups.append(group)
    keep=set(max(groups,key=len))
    for y in range(cut.height):
        for x in range(cut.width):
            if (x,y) not in keep:cut.putpixel((x,y),(*PAL[0],0))
    im=Image.new('RGBA',(96,96),(*PAL[0],0)); im.paste(cut,(11,9))
    save(im,'chunk_vault_01',SPR,'Отделившийся клин кирпичного свода с каменным ребром',source='drafts/bg_02_arches.png',source_crop_logical=[292,12,365,90],wrap='clamp');chunks.append(im)
    im=quant(draft('chunk_rail',(96,96)),material)
    save(im,'chunk_rail_sleepers',SPR,'Обломок рельса с двумя сломанными шпалами',wrap='clamp');chunks.append(im)
    board=Image.new('RGB',(768,448),PAL[0])
    for i,im in enumerate(edges):
        board.paste(im.resize((256,256),Image.Resampling.NEAREST),(i*384,0),im.resize((256,256),Image.Resampling.NEAREST))
        # Adjacent intact texture shows how the attachment row joins its material.
        patch=track.resize((128,128),Image.Resampling.NEAREST)
        board.paste(patch,(i*384+256,0))
    for i,im in enumerate(chunks):
        small=Image.new('RGBA',(96,96),(*PAL[0],0));small.paste(im,((96-im.width)//2,(96-im.height)//2))
        board.paste(small,(i*96,288),small)
    board.save(SRC/'previews/edges_and_chunks.png')

def finish():
    sheet=Image.new('RGB',(1152,1152))
    for i,name in enumerate(NAMES):sheet.paste(Image.open(SRC/'previews'/f'{name}_3x3.png'),((i%3)*384,(i//3)*384))
    sheet.save(SRC/'previews/all_tiles_3x3.png')
    Image.open(TEX/'track.png').resize((512,512),Image.Resampling.NEAREST).save(SRC/'previews/track_detail.png')
    m=dict(version=3,reference='art_src/keyframes_v1/01_furnace_390x844.png',sampling='nearest; binary alpha; no bloom; no baked scene lighting',pixel_grid='1 authored pixel = 1 logical render pixel at largest intended screen size',uv_axes={'X':'U / width','Y':'V / height / along track'},assets=ENTRIES)
    (SRC/'world_manifest_v3.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    check()

def check():
    m=json.loads((SRC/'world_manifest_v3.json').read_text(encoding='utf-8')); rows=[]
    for e in m['assets']:
        p=ROOT/e['file']; im=Image.open(p); rgba=im.convert('RGBA'); colors=set(rgba.getdata())
        outside={c[:3] for c in colors if c[:3] not in PAL}
        assert not outside,(p,outside)
        assert set(rgba.getchannel('A').getdata()) <= {0,255},p
        assert list(im.size)==e['size'],p
        attachment_mismatches=None
        if 'solid_edge' in e:
            track=Image.open(TEX/'track.png').convert('RGBA')
            ys=range(28) if e['solid_edge']=='top' else range(100,128)
            attachment_mismatches=sum(rgba.getpixel((x,y))!=track.getpixel((x,y)) for y in ys for x in range(128))
            assert attachment_mismatches==0,(p,attachment_mismatches)
        seam={}
        for axis in e['seamless_axes']:
            # Only unshifted magma has equal first/last samples; shifted frames retain the same periodic field.
            if e.get('animation') and e['frame']>0:continue
            a=im.crop((0,0,1,im.height)) if axis=='X' else im.crop((0,0,im.width,1))
            b=im.crop((im.width-1,0,im.width,im.height)) if axis=='X' else im.crop((0,im.height-1,im.width,im.height))
            seam[axis]=sum(x!=y for x,y in zip(a.getdata(),b.getdata()))
            assert seam[axis]==0,(p,seam)
        rows.append(dict(file=e['file'],size=list(im.size),colours=len({c[:3] for c in colors if c[3]}),outside_palette_colours=len(outside),outside_palette_pixels=sum(c[:3] not in PAL for c in rgba.getdata()),alpha_levels=sorted(set(rgba.getchannel('A').getdata())),edge_mismatches=seam,attachment_mismatches=attachment_mismatches,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
    frames=[Image.open(TEX/f'lava_{i}.png') for i in range(4)]
    assert all(ImageChops.difference(ImageChops.offset(frames[i],0,32),frames[(i+1)%4]).getbbox() is None for i in range(4))
    (SRC/'validation.json').write_text(json.dumps(dict(game_png_count=len(rows),outside_palette_colours=0,files=rows,lava_loop_exact=True),ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(f'{len(rows)} game PNGs; outside palette: 0; binary alpha; lava loop exact')

if __name__=='__main__':
    if '--check-only' in sys.argv:check()
    else:
        tiles()
        if (SRC/'drafts/bg_04_rubble.png').exists():backgrounds()
        if (SRC/'drafts/chunk_rail.png').exists():collapse_parts()
        finish()
