"""Rebuild HUD v3 art from saved image_gen drafts; Python 3.12 + Pillow only."""
from pathlib import Path
import hashlib, json, math, re, sys
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'assets/ui/hud_v3'
PRE = HERE / 'previews'
HEX = re.search(r'```\s*([0-9a-f\s]+)```', (ROOT/'docs/STYLE.md').read_text(encoding='utf-8')).group(1).split()
COLORS = [tuple(bytes.fromhex(h)) for h in HEX]
N = Image.Resampling.NEAREST
records = []

def rgba(hexcode):
    return tuple(bytes.fromhex(hexcode)) + (255,)

def finish(im):
    im = im.convert('RGBA')
    cache = {}
    pixels = []
    for r,g,b,a in im.getdata():
        if a < 128:
            pixels.append(COLORS[0]+(0,))
            continue
        key = (r,g,b)
        if key not in cache:
            cache[key] = min(COLORS, key=lambda c: sum((x-y)**2 for x,y in zip(c,key)))
        pixels.append(cache[key] + (255,))
    im.putdata(pixels)
    return im

def save(name, im, purpose, **extra):
    im = finish(im)
    im.save(OUT/(name+'.png'))
    records.append(dict(id=name, file='assets/ui/hud_v3/'+name+'.png', size=list(im.size),
                        frames=[dict(rect=[0,0,*im.size], duration_ms=None)],
                        pivot=extra.pop('pivot',[im.width/2, im.height/2]), purpose=purpose, **extra))
    return im

def nine(im, size, margins):
    l,t,r,b = margins
    xs,ys = [0,l,im.width-r,im.width],[0,t,im.height-b,im.height]
    xd,yd = [0,l,size[0]-r,size[0]],[0,t,size[1]-b,size[1]]
    result = Image.new('RGBA',size)
    for row in range(3):
        for col in range(3):
            patch = im.crop((xs[col],ys[row],xs[col+1],ys[row+1]))
            result.paste(patch.resize((xd[col+1]-xd[col],yd[row+1]-yd[row]),N),(xd[col],yd[row]))
    return result

def hardware():
    src = Image.open(HERE/'drafts/hardware.png')
    top = finish(src.crop((48,68,1490,265)).resize((195,30),N))
    bottom = finish(src.crop((48,296,1490,510)).resize((195,30),N))
    # Keep the stretch field quiet and both seam pixels identical. Bolts stay on endcaps.
    for im in (top,bottom):
        d=ImageDraw.Draw(im)
        d.rectangle((14,9,180,20),fill=rgba('17121b'))
        for y in range(30):
            if y < 9 or y > 20:
                c=im.getpixel((95,y))
                d.line((14,y,180,y),fill=c)
    save('bar_top',top,'Top distance and record bar',nine_slice=[14,9,14,9],css_size_390=[390,60],content_insets=[14,9,14,9])
    save('bar_bottom',nine(bottom,(195,72),[14,9,14,9]),'Bottom instrument panel, fixed 144 CSS px at 390x844',nine_slice=[14,9,14,9],css_size_390=[390,144],content_insets=[8,7,8,7])
    save('gauge_face',src.crop((40,522,505,973)).resize((58,58),N),'Unnumbered pressure gauge; separate rotating needle')
    save('portrait_frame',src.crop((540,522,998,973)).resize((58,58),N),'Brass portrait bezel; transparent circular aperture',aperture=[10,11,38,38])
    save('gauge_needle',src.crop((1060,570,1170,937)).resize((10,36),N),'Separate upward needle; place hub at gauge [29,30]',pivot=[5,30],angle_degrees=[-130,130])
    save('counter_socket',src.crop((1212,727,1502,890)).resize((46,24),N),'Recessed counter surround',nine_slice=[9,8,9,8])
    # Original monospaced cut-metal numeral skeletons, no font dependency.
    glyphs=['01110/11011/11011/11011/11011/11011/01110',
            '00110/01110/00110/00110/00110/00110/01111',
            '01110/11011/00011/00110/01100/11000/11111',
            '11110/00011/00011/01110/00011/00011/11110',
            '00011/00111/01111/11011/11111/00011/00011',
            '11111/11000/11000/11110/00011/11011/01110',
            '00110/01100/11000/11110/11011/11011/01110',
            '11111/00011/00110/00110/01100/01100/01100',
            '01110/11011/11011/01110/11011/11011/01110',
            '01110/11011/11011/01111/00011/00110/01100']
    for digit,pattern in enumerate(glyphs):
        im=Image.new('RGBA',(12,18))
        d=ImageDraw.Draw(im)
        for y,row in enumerate(pattern.split('/')):
            for x,v in enumerate(row):
                if v=='1':
                    d.rectangle((1+x*2,2+y*2,3+x*2,4+y*2),fill=rgba('0b0a10'))
        for y,row in enumerate(pattern.split('/')):
            for x,v in enumerate(row):
                if v=='1':
                    d.rectangle((x*2+1,y*2+1,x*2+2,y*2+2),fill=rgba('e8d0a8'))
                    d.point((x*2+1,y*2+2),fill=rgba('cc9c74'))
        save('digit_'+str(digit),im,'Original numeral '+str(digit),baseline=15,advance=12)

def load(name):
    return Image.open(OUT/(name+'.png')).convert('RGBA')

def portraits():
    src=Image.open(HERE/'drafts/portraits.png')
    states=['calm','tense','joy','hit','fire','fall']
    faces=[]
    for i,state in enumerate(states):
        x,y=(i%3)*500,(i//3)*480
        face=finish(src.crop((87+x,36+y,447+x,446+y)).resize((48,48),N))
        if faces:
            # The cap and lower scarf are literally shared pixels, preserving identity.
            face.paste(faces[0].crop((0,0,48,17)),(0,0))
            face.paste(faces[0].crop((0,44,48,48)),(0,44))
        faces.append(face.copy())
        canvas=Image.new('RGBA',(48,48),rgba('241a24'))
        canvas.alpha_composite(face)
        mask=Image.new('L',(48,48))
        ImageDraw.Draw(mask).ellipse((0,0,47,47),fill=255)
        canvas.putalpha(mask)
        save('portrait_'+state,canvas,'Engineer reaction: '+state,identity='engineer_01',face_anchor=[24,26],frame_offset=[5,6])
    sheet=Image.new('RGB',(696,292),'#17121b')
    d=ImageDraw.Draw(sheet)
    for i,state in enumerate(states):
        face=load('portrait_'+state)
        tile=Image.new('RGBA',(58,58))
        tile.alpha_composite(face,(5,6))
        tile.alpha_composite(load('portrait_frame'))
        sheet.paste(tile.resize((116,116),N),(i*116,24),tile.resize((116,116),N))
        sheet.paste(face.resize((96,96),N),(i*116+10,170),face.resize((96,96),N))
        d.text((i*116+10,6),state,fill='#e8d0a8')
    sheet.save(PRE/'portraits_six_states.png')

def icons_menu():
    src=Image.open(HERE/'drafts/icons.png')
    names=['ammo','shield','rescue','record','distance','gap','lava','demon','boost','slow','pause','settings']
    boxes=[(80,68,349,339),(438,48,709,343),(779,48,1105,344),(1155,80,1492,340),
           (32,410,381,674),(400,431,765,677),(822,377,1087,665),(1153,360,1494,688),
           (69,719,317,989),(400,711,759,985),(844,723,1043,964),(1180,700,1466,987)]
    for name,box in zip(names,boxes):
        icon=src.crop(box)
        scale=22/max(icon.size)
        icon=finish(icon.resize((round(icon.width*scale),round(icon.height*scale)),N))
        tile=Image.new('RGBA',(24,24))
        tile.alpha_composite(icon,((24-icon.width)//2,(24-icon.height)//2))
        if name=='rescue':
            # Trace the draft hook and coil at native resolution; keep a 2-3 px silhouette.
            tile=Image.new('RGBA',(24,24))
            d=ImageDraw.Draw(tile)
            d.ellipse((12,11,22,21),fill=rgba('0b0a10'),outline=rgba('0b0a10'),width=3)
            d.ellipse((13,12,21,20),outline=rgba('b07a58'),width=2)
            hook=[(14,5),(12,2),(9,2),(7,4),(7,7),(8,9),(5,13),(4,16),(6,19),(9,18),(10,15)]
            d.line(hook,fill=rgba('0b0a10'),width=5)
            d.line(hook,fill=rgba('9aa8ac'),width=3)
            d.line([(13,4),(11,3),(9,3),(8,5),(8,7)],fill=rgba('d0d8d4'),width=1)
            d.line([(7,10),(10,10),(12,12),(15,13)],fill=rgba('b07a58'),width=3)
            d.line([(7,10),(10,10),(12,12)],fill=rgba('e8d0a8'),width=1)
        if name=='gap':
            # Hand-clarify the break: two severed rails and a wide jagged dark opening.
            tile=Image.new('RGBA',(24,24))
            d=ImageDraw.Draw(tile)
            d.polygon([(1,6),(8,6),(10,10),(7,13),(10,16),(8,21),(1,21)],fill=rgba('5c3a35'))
            d.polygon([(16,6),(22,6),(22,21),(15,21),(13,17),(16,14),(13,10)],fill=rgba('5c3a35'))
            for x in [3,6,17,20]:
                d.line((x,5,x,21),fill=rgba('b07a58'),width=2)
            for y in [8,17]:
                d.line((0,y+2,9,y+2),fill=rgba('0b0a10'),width=4)
                d.line((14,y+2,23,y+2),fill=rgba('0b0a10'),width=4)
                d.line((0,y,8,y),fill=rgba('9aa8ac'),width=2)
                d.line((15,y,23,y),fill=rgba('9aa8ac'),width=2)
                d.point((9,y+1),fill=rgba('d0d8d4'))
                d.point((14,y-1),fill=rgba('d0d8d4'))
        if name=='demon':
            # Hand-retouched paired eyes and wide mouth keep the hostile face readable at 24 px.
            d=ImageDraw.Draw(tile)
            d.rectangle((6,12,9,13),fill=rgba('f8902a'))
            d.rectangle((14,12,17,13),fill=rgba('f8902a'))
            d.line((9,18,14,18),fill=rgba('e8d0a8'))
        save('icon_'+name,tile,'HUD symbol: '+name,css_size=[48,48],minimum_verified_css=[48,48])
    for name in ['boost','slow','shield','ammo','rescue']:
        tile=Image.new('RGBA',(24,24))
        d=ImageDraw.Draw(tile)
        d.polygon([(6,0),(17,0),(23,6),(23,17),(17,23),(6,23),(0,17),(0,6)],fill=rgba('0b0a10'))
        d.polygon([(6,1),(17,1),(22,6),(22,17),(17,22),(6,22),(1,17),(1,6)],fill=rgba('465058'))
        d.polygon([(6,3),(17,3),(20,6),(20,17),(17,20),(6,20),(3,17),(3,6)],fill=rgba('17121b'))
        tile.alpha_composite(load('icon_'+name).resize((18,18),N),(3,3))
        save('pickup_'+name,tile,'Incoming pickup: '+name,css_size=[48,48],minimum_verified_css=[48,48],symbol='icon_'+name)
    source=load('bar_bottom')
    for state in ['normal','pressed','disabled']:
        for kind,size in [('panel',(160,220)),('button',(138,28))]:
            im=nine(source,size,[14,9,14,9])
            d=ImageDraw.Draw(im)
            if state=='pressed':
                # Inset face, reversed bevel and brass lower rim indicate physical depression.
                d.rectangle((12,8,size[0]-13,size[1]-9),fill=rgba('0b0a10'))
                d.line((12,7,size[0]-13,7),fill=rgba('0b0a10'),width=2)
                d.line((12,size[1]-8,size[0]-13,size[1]-8),fill=rgba('b07a58'))
            if state=='disabled':
                cool=[COLORS[0],COLORS[1],COLORS[19],COLORS[20],COLORS[21]]
                im.putdata([min(cool,key=lambda c:abs(sum(c)/3-sum(p[:3])/3))+(p[3],) if p[3] else p for p in im.getdata()])
            save('menu_'+kind+'_'+state,im,'Menu '+kind+': '+state,nine_slice=[14,9,14,9],content_insets=[14,9,14,9],css_size=[size[0]*2,size[1]*2],text_layer='DOM, localized, not baked',state=state)
    # All symbols are shown at exactly their requested 48x48 CSS footprint.
    sheet=Image.new('RGB',(816,530),'#17121b')
    d=ImageDraw.Draw(sheet)
    all_names=['icon_'+n for n in names]+['pickup_'+n for n in ['boost','slow','shield','ammo','rescue']]
    for i,name in enumerate(all_names):
        x,y=(i%9)*90+16,(i//9)*100+24
        im=load(name).resize((48,48),N)
        sheet.paste(im,(x,y),im)
        d.text((x-10,y+54),name.replace('icon_',''),fill='#e8d0a8')
    for i,state in enumerate(['normal','pressed','disabled']):
        x=i*270+8
        panel=nine(load('menu_panel_'+state),(125,108),[14,9,14,9]).resize((250,216),N)
        sheet.paste(panel,(x,246),panel)
        button=nine(load('menu_button_'+state),(109,28),[14,9,14,9]).resize((218,56),N)
        sheet.paste(button,(x+16,278),button)
        sheet.paste(button,(x+16,350),button)
        d.text((x+8,226),state,fill='#e8d0a8')
    for i in range(10):
        digit=load('digit_'+str(i)).resize((24,36),N)
        sheet.paste(digit,(20+i*30,482),digit)
    d.text((356,490),'Digits: 12 x 18 / fixed advance 12',fill='#e8d0a8')
    sheet.save(PRE/'icons_48_and_menu.png')

def compose():
    board=Image.new('RGBA',(195,72))
    board.alpha_composite(load('bar_bottom'))
    board.alpha_composite(load('gauge_face'),(7,7))
    board.alpha_composite(load('gauge_needle'),(31,7))
    if (OUT/'portrait_calm.png').exists():
        board.alpha_composite(load('portrait_calm'),(74,13))
    board.alpha_composite(load('portrait_frame'),(69,7))
    board.alpha_composite(load('counter_socket'),(139,10))
    board.alpha_composite(load('counter_socket'),(139,39))
    for n,xy in [(8,(30,47)),(0,(169,13)),(1,(169,42))]:
        board.alpha_composite(load('digit_'+str(n)),xy)
    top=load('bar_top')
    for i,n in enumerate('5985'):
        top.alpha_composite(load('digit_'+n),(26+i*12,6))
    for i,n in enumerate('6000'):
        top.alpha_composite(load('digit_'+n),(113+i*12,6))
    if (OUT/'icon_ammo.png').exists():
        for name,xy in [('distance',(6,6)),('record',(92,6)),('pause',(169,6))]:
            top.alpha_composite(load('icon_'+name).resize((18,18),N),xy)
        for name,xy in [('shield',(144,14)),('rescue',(144,43))]:
            board.alpha_composite(load('icon_'+name).resize((16,16),N),xy)
        board.alpha_composite(load('icon_ammo').resize((12,12),N),(13,42))
    # This is an art composition, not a live game screenshot.
    ref=Image.open(ROOT/'art_src/keyframes_v1/01_furnace_390x844.png').convert('RGBA')
    ref.alpha_composite(top.resize((390,60),N),(0,0))
    # Extend scene to panel boundary; no old HUD is allowed behind the new panel.
    scene=ref.crop((0,60,390,652)).resize((390,640),N)
    ref.paste(scene,(0,60))
    ref.alpha_composite(board.resize((390,144),N),(0,700))
    ref.convert('RGB').save(PRE/'hud_390x844.png')
    live=Image.open(ROOT/'docs/qa/default/play-390x844.png').convert('RGBA')
    live_top=nine(load('bar_top'),(195,39),[14,9,14,9])
    live_top.alpha_composite(top.crop((6,6,189,24)),(6,10))
    # Copy the two left symbols as well; the underlying camera-x2 scene is unchanged.
    if (OUT/'icon_distance.png').exists():
        live_top.alpha_composite(load('icon_distance').resize((18,18),N),(6,10))
    live.alpha_composite(live_top.resize((390,78),N),(0,0))
    live.alpha_composite(board.resize((390,144),N),(0,700))
    live.convert('RGB').save(PRE/'hud_camera2_390x844.png')
    return board,top

def validate():
    result=[]
    for path in sorted(OUT.glob('*.png')):
        im=Image.open(path).convert('RGBA')
        outside=sorted({rgb[:3] for rgb in im.getdata() if rgb[:3] not in COLORS})
        alpha=sorted(set(im.getchannel('A').getdata()))
        result.append(dict(file=path.relative_to(ROOT).as_posix(),size=list(im.size),outside_palette_colors=len(outside),alpha_values=alpha,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        assert not outside and all(a in (0,255) for a in alpha),path
    (HERE/'validation.json').write_text(json.dumps(dict(files=len(result),outside_palette_colors=0,bottom_panel_css_height=144,viewport=[390,844],files_checked=result),indent=2)+'\n',encoding='utf-8',newline='\n')
    print(f'{len(result)} PNG; outside palette 0; binary alpha; bottom panel 144 CSS px')

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    PRE.mkdir(parents=True,exist_ok=True)
    if '--check-only' not in sys.argv:
        hardware()
        if (HERE/'drafts/portraits.png').exists():
            portraits()
        if (HERE/'drafts/icons.png').exists():
            icons_menu()
        compose()
        manifest=dict(version=3,kind='integration art description; not a runtime registry',palette_source='docs/STYLE.md',filter='nearest',alpha='binary',css_art_scale_390=2,
                      bottom_panel=dict(css_rect=[0,700,390,144],max_css_height=150,headroom_css=6,
                                        placements_art_px=dict(gauge_face=[7,7],gauge_needle=[31,7],portrait=[74,13],portrait_frame=[69,7],shield_socket=[139,10],rescue_socket=[139,39])),
                      camera2_preview=dict(file='previews/hud_camera2_390x844.png',scene_source='docs/qa/default/play-390x844.png',scene_preserved_rect=[0,78,390,622],top_css_rect=[0,0,390,78],live_integration=False),assets=records)
        (HERE/'hud_manifest_v3.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    validate()

if __name__=='__main__':
    main()
