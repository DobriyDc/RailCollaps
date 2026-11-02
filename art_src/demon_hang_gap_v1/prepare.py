"""Slice the approved generated artwork and build native-size review sheets."""
from pathlib import Path
import json, re
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
N = Image.Resampling.NEAREST
COLORS = [tuple(bytes.fromhex(h)) for h in re.search(r'```\s*([0-9a-f\s]+)```', (ROOT/'docs/STYLE.md').read_text(encoding='utf-8')).group(1).split()]

def finish(im):
    cache = {}
    result = []
    for r,g,b,a in im.convert('RGBA').getdata():
        c = r,g,b
        if a < 128:
            result.append((*COLORS[0],0))
        else:
            if c not in cache:
                cache[c] = min(COLORS,key=lambda q:sum((u-v)**2 for u,v in zip(q,c)))
            result.append((*cache[c],255))
    im.putdata(result)
    return im

sheet = Image.open(HERE/'generated_demon.png').convert('RGBA')
# Equal transforms and shared source baselines preserve head, gripping hand and feet.
# Wind-up reaches over the horn; its crop includes the complete claw across grid center.
boxes = [(0,0,682,608),(646,0,1293,608),(0,612,682,1217),(646,612,1293,1217)]
records = []
for i,box in enumerate(boxes):
    crop = sheet.crop(box)
    if i == 2:
        # Re-register the isolated overhead forearm crop; keep shoulder/body fixed.
        arm = crop.crop((480,0,682,190)).resize((202,145),N)
        fixed = Image.new('RGBA',crop.size)
        fixed.alpha_composite(crop.crop((0,0,480,crop.height)))
        fixed.alpha_composite(crop.crop((480,190,682,crop.height)),(480,190))
        fixed.alpha_composite(arm,(480,45))
        crop = fixed
    if i == 3:
        # Left 40 pixels belong to the neighbouring wind-up arm, not this figure.
        fixed = Image.new('RGBA',crop.size)
        fixed.alpha_composite(crop.crop((40,0,crop.width,crop.height)),(40,0))
        crop = fixed
    # Remove the adjacent figure at the right edge of left-hand cells.
    # It starts at x=701 in both source rows, outside these crops.
    crop = crop.resize((round(crop.width*.20),round(crop.height*124/519)),N)
    im = Image.new('RGBA',(160,160),(*COLORS[0],0))
    im.alpha_composite(crop,(24,9 if i<2 else 8))
    im = finish(im)
    name = f'hang_{i:02d}.png'
    im.save(ROOT/'assets/sprites/demon_v3'/name)
    records.append((name,im))

icon = Image.open(HERE/'generated_icon.png').convert('RGBA')
icon = finish(icon.crop((328,92,927,1173)).resize((22,22),N))
im = Image.new('RGBA',(24,24),(*COLORS[0],0))
im.alpha_composite(icon,(1,1))
im.save(ROOT/'assets/ui/hud_v3/icon_gap.png')
records.append(('icon_gap.png',im))

board = Image.new('RGBA',(1920,696),'#14121a')
d = ImageDraw.Draw(board)
for row in range(2):
    names = [f'hang_{i:02d}' for i in range(4)]+['perch_00','strike_00']
    for col,name in enumerate(names):
        path = HERE/('old_'+name+'.png') if row==0 and col<4 else ROOT/'assets/sprites/demon_v3'/(name+'.png')
        sprite = Image.open(path).convert('RGBA')
        board.alpha_composite(sprite.resize((320,320),N),(col*320,row*348))
        d.text((col*320+10,row*348+326),('OLD ' if row==0 else 'NEW ')+name,fill='#e8d0a8')
board.convert('RGB').save(HERE/'compare_demon.png')

board = Image.new('RGBA',(800,234),'#14121a'); d = ImageDraw.Draw(board)
paths = [HERE/'old_icon_gap.png',ROOT/'assets/ui/hud_v3/icon_gap.png']+[ROOT/'assets/ui/hud_v3'/('icon_'+n+'.png') for n in ['lava','demon','rubble']]
for i,path in enumerate(paths):
    icon = Image.open(path).convert('RGBA')
    board.alpha_composite(icon.resize((144,144),N),(i*160+8,0))
    d.text((i*160+8,151),['OLD gap','NEW gap','lava','demon','rubble'][i],fill='#e8d0a8')
    board.alpha_composite(icon,(i*160+68,190))
board.convert('RGB').save(HERE/'compare_icon.png')

validation = []
for name,im in records:
    bbox = im.getchannel('A').getbbox()
    old = Image.open(HERE/('old_'+name)).convert('RGBA')
    ob = old.getchannel('A').getbbox()
    alpha = sorted(set(im.getchannel('A').getdata()))
    assert im.size == old.size and alpha == [0,255]
    assert name=='icon_gap.png' or bbox[2]-bbox[0]>=100
    validation.append(dict(file=name,size=list(im.size),old_bbox=list(ob),bbox=list(bbox),visible_width=bbox[2]-bbox[0],visible_height=bbox[3]-bbox[1],alpha=alpha))
(HERE/'validation.json').write_text(json.dumps(validation,indent=2)+'\n',encoding='utf-8')
print(json.dumps(validation,indent=2))
