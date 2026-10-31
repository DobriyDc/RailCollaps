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
            pixels.append((0,0,0,0))
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
                        pivot=[im.width/2, im.height/2], purpose=purpose, **extra))
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
    needle=save('gauge_needle',src.crop((1060,570,1170,937)).resize((10,36),N),'Separate upward needle; place hub at gauge [29,30]',rotation_pivot=[5,30],angle_degrees=[-130,130])
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

def compose():
    board=Image.new('RGBA',(195,72))
    board.alpha_composite(load('bar_bottom'))
    board.alpha_composite(load('gauge_face'),(7,7))
    board.alpha_composite(load('gauge_needle'),(31,7))
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
    # This is an art composition, not a live game screenshot.
    ref=Image.open(ROOT/'art_src/keyframes_v1/01_furnace_390x844.png').convert('RGBA')
    ref.alpha_composite(top.resize((390,60),N),(0,0))
    # Extend scene to panel boundary; no old HUD is allowed behind the new panel.
    scene=ref.crop((0,60,390,652)).resize((390,640),N)
    ref.paste(scene,(0,60))
    ref.alpha_composite(board.resize((390,144),N),(0,700))
    ref.convert('RGB').save(PRE/'hud_390x844.png')
    return board,top

def validate():
    result=[]
    for path in sorted(OUT.glob('*.png')):
        im=Image.open(path).convert('RGBA')
        outside=sorted({rgb[:3] for rgb in im.getdata() if rgb[3] and rgb[:3] not in COLORS})
        alpha=sorted(set(im.getchannel('A').getdata()))
        result.append(dict(file=path.relative_to(ROOT).as_posix(),size=list(im.size),outside_palette_colors=len(outside),alpha_values=alpha,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        assert not outside and all(a in (0,255) for a in alpha),path
    (HERE/'validation.json').write_text(json.dumps(dict(files=len(result),outside_palette_colors=0,bottom_panel_css_height=144,viewport=[390,844],files_checked=result),indent=2)+'\n',encoding='utf-8')
    print(f'{len(result)} PNG; outside palette 0; binary alpha; bottom panel 144 CSS px')

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    PRE.mkdir(parents=True,exist_ok=True)
    if '--check-only' not in sys.argv:
        hardware()
        compose()
        manifest=dict(version=3,kind='integration art description; not a runtime registry',palette_source='docs/STYLE.md',filter='nearest',alpha='binary',css_art_scale_390=2,
                      bottom_panel=dict(css_rect=[0,700,390,144],max_css_height=150,headroom_css=6),assets=records)
        (HERE/'hud_manifest_v3.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    validate()

if __name__=='__main__':
    main()
