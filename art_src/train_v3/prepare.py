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
    body=json.dumps(value, ensure_ascii=False, indent=2)
    body=re.sub(r'\[\s*(-?[\d.eE+]+(?:,\s*-?[\d.eE+]+)*)\s*\]',
                lambda m:'['+re.sub(r'\s+',' ',m[1])+']',body)
    (SRC/name).write_text(body+'\n', encoding='utf-8',newline='\n')

def material(im, flatten=False, red=False):
    """Separate rust pigment and iron; suppress generated broad lighting gradients."""
    im = im.convert('RGB')
    local = im.filter(ImageFilter.BoxBlur(5))
    out = Image.new('RGBA', im.size)
    for y in range(im.height):
        for x in range(im.width):
            r,g,b = im.getpixel((x,y)); avg = sum(local.getpixel((x,y)))/3
            lum = (r+g+b)/3
            if red and r > g*2 and r>b*1.7:
                idx=5 if r<65 else 12 if r<125 else 13
            elif r > g*1.32 and r > b*1.15 and r > 40:
                idx = 6 if r<83 else 7 if r<135 else 8
            elif lum < 25 or (flatten and lum < avg-15): idx=1
            elif flatten: idx = 20 if lum>avg+21 else 19
            else: idx=19 if lum>45 else 2
            out.putpixel((x,y), (*PAL[idx],255))
    return out

def save(name, im, purpose, **extra):
    im.save(OUT/f'{name}.png')
    entry=dict(file=f'assets/textures/train/{name}.png',size_px=list(im.size),frames=1,pivot=[.5,.5],purpose=purpose)
    entry.update(extra); ENTRIES.append(entry)
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

def other_textures(side):
    src=Image.open(SRC/'drafts/components.png').convert('RGB')
    def panel(name,box,size,purpose,red=False):
        im=material(src.crop(box).resize(size,Image.Resampling.BOX),True,red)
        ImageDraw.Draw(im).rectangle((0,0,size[0]-1,size[1]-1),outline=PAL[2])
        return save(name,im,purpose,source_crop=list(box),source='drafts/components.png')
    top=side.crop((0,2,160,34)); d=ImageDraw.Draw(top)
    d.rectangle((0,0,159,31),outline=PAL[2]); save('boiler_top',top,'Верх и низ восьмигранного котла, U нос→кабина')
    panel('cab_side',(79,109,442,449),(48,100),'Бок кабины, машинист у рычага; U нос→тендер')
    panel('cab_front',(560,105,945,489),(88,100),'Лицевая стенка кабины, два окна и закрытая топка')
    panel('cab_back',(560,105,945,489),(88,100),'Задняя стенка кабины с окнами и топкой')
    roof=material(src.crop((68,70,470,96)).resize((96,56),Image.Resampling.BOX),True,True)
    d=ImageDraw.Draw(roof); d.rectangle((0,0,95,55),outline=PAL[2],width=2)
    for y in [16,38]:d.line((2,y,93,y),fill=PAL[5])
    save('cab_roof',roof,'Плоская крыша кабины, X поперёк, Z от носа к тендеру')
    panel('tender_side',(1024,129,1492,447),(80,52),'Бок угольного тендера',True)
    panel('tender_end',(1024,129,1492,447),(80,52),'Торец тендера',True)
    panel('tender_top',(1045,602,1483,895),(80,80),'Вид сверху: крупный уголь в металлическом ободе')
    chimney=material(Image.open(SRC/'drafts/boiler.png').crop((234,157,383,312)).resize((24,52),Image.Resampling.BOX),True)
    d=ImageDraw.Draw(chimney); d.rectangle((0,0,23,51),outline=PAL[2]); d.rectangle((1,3,22,6),fill=PAL[7]); d.rectangle((1,46,22,49),fill=PAL[6])
    save('chimney_side',chimney,'Высокая труба, материал без освещения')
    cap=Image.new('RGBA',(24,24),PAL[2]); d=ImageDraw.Draw(cap); d.rectangle((2,2,21,21),fill=PAL[7]); d.rectangle((4,4,19,19),fill=PAL[0]); save('chimney_top',cap,'Чёрное жерло трубы без запечённого дыма')
    dome=side.crop((107,12,131,32)); save('dome_side',dome,'Обшивка сухопарника')
    save('dome_top',side.crop((104,4,128,28)),'Крышка сухопарника')
    save('chassis',side.crop((0,67,160,79)),'Рама, торцы и нижние закрывающие поверхности')
    pilot=panel('pilot_front',(492,607,978,910),(92,30),'Красная решётка путеочистителя, ортографический фасад',True)
    wheel_src=src.crop((32,531,454,948))
    wheel=material(wheel_src.resize((40,40),Image.Resampling.BOX),True,True)
    alpha=Image.new('L',wheel_src.size)
    alpha.putdata([0 if min(p)>115 and max(p)-min(p)<32 else 255 for p in wheel_src.get_flattened_data()])
    wheel.putalpha(alpha.resize((40,40),Image.Resampling.NEAREST))
    d=ImageDraw.Draw(wheel)
    # Asymmetric counterweight makes all four 90-degree phases distinct.
    d.pieslice((7,7,32,32),-40,40,fill=PAL[5]); d.ellipse((17,17,22,22),fill=PAL[7])
    for i in range(4):
        im=wheel.rotate(-90*i,resample=Image.Resampling.NEAREST)
        save(f'wheel_{i}',im,'Ведущее колесо; общий цикл с дышлами',animation='running',frame=i,duration_ms=100,pivot=[.5,.5])
        rod=Image.new('RGBA',(160,44),(*PAL[0],0)); d=ImageDraw.Draw(rod)
        a=i*math.pi/2; dx=round(7*math.cos(a)); dy=round(7*math.sin(a))
        points=[(z+dx,22+dy) for z in [32,84,136]]
        d.line([(6,22),points[0]],fill=PAL[2],width=6); d.line([(6,22),points[0]],fill=PAL[7],width=2)
        d.line(points,fill=PAL[1],width=7); d.line(points,fill=PAL[7],width=5); d.line(points,fill=PAL[21],width=2)
        for x,y in points:d.rectangle((x-2,y-2,x+2,y+2),fill=PAL[2]); d.point((x,y),fill=PAL[8])
        save(f'rods_{i}',rod,'Сцепные дышла и шатун, U нос→кабина',animation='running',frame=i,duration_ms=100,pivot=[.5,.5],crank_px=[dx,dy])
    save('tender_wheel',wheel.resize((24,24),Image.Resampling.NEAREST),'Малое колесо тендера, 24 px')
    lamp=Image.new('RGBA',(80,80),(*PAL[0],0)); d=ImageDraw.Draw(lamp)
    d.ellipse((33,33,46,46),fill=PAL[16]); d.ellipse((35,35,44,44),fill=PAL[17]); d.rectangle((37,36,41,42),fill=PAL[18])
    save('headlamp_emissive',lamp,'Только стекло фары, UV точно совпадает с boiler_face',blend='alpha_test',emissive=True)
    fire=Image.new('RGBA',(88,100),(*PAL[0],0)); d=ImageDraw.Draw(fire)
    d.rectangle((33,73,54,90),fill=PAL[12])
    for x,h in [(35,9),(40,15),(45,11),(50,17)]:
        d.rectangle((x,90-h,x+2,89),fill=PAL[15]); d.rectangle((x,85,x+1,89),fill=PAL[17])
    for y in [77,82,87]:d.line((33,y,54,y),fill=PAL[1],width=1)
    save('firebox_emissive',fire,'Открытая топка на cab_back, локальный источник',blend='alpha_test',emissive=True)
    for name in ['boiler_face','boiler_side','cab_side']:
        im=Image.open(OUT/f'{name}.png').convert('RGBA'); d=ImageDraw.Draw(im); w,h=im.size
        crack=[(w//3,4),(w//3+4,h//4),(w//3-3,h//2),(w//3+8,h*3//4),(w//3+2,h-5)]
        d.line(crack,fill=PAL[0],width=3); d.line([(x+2,y) for x,y in crack],fill=PAL[6],width=1)
        d.polygon([(w*2//3,h//2),(w*2//3+8,h//2-6),(w*2//3+15,h//2+4),(w*2//3+3,h//2+11)],fill=PAL[0])
        save(name+'_broken',im,'Повреждённая замена с тем же UV и силуэтом',replaces=name+'.png')
    soot=Image.new('RGBA',(80,80),(*PAL[0],0)); d=ImageDraw.Draw(soot)
    for x,y,r in [(40,43,17),(32,30,10),(48,24,12),(40,13,7),(28,54,9),(53,53,8)]:
        d.polygon([(x-r,y-3),(x-r+4,y-r),(x+4,y-r),(x+r,y-4),(x+r-3,y+r),(x-5,y+r)],fill=PAL[1])
    d.polygon([(29,37),(36,29),(48,32),(52,48),(43,57),(31,50)],fill=PAL[0])
    save('soot',soot,'Декаль копоти поверх обшивки, отдельный след без свечения',blend='alpha_test')

def geometry():
    """Exact closed solids, plus explicitly separate alpha-tested mechanism planes."""
    faces=[]
    def face(part,name,tex,verts,uv=None,normal=None,solid=True,**extra):
        if uv is None: uv=[[0,0],[1,0],[1,1],[0,1]]
        a,b,c=verts[:3]; ab=[b[i]-a[i] for i in range(3)]; ac=[c[i]-a[i] for i in range(3)]
        n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]
        if normal is not None and sum(n[i]*normal[i] for i in range(3))<0:
            verts=list(reversed(verts)); uv=list(reversed(uv)); n=[-v for v in n]
        mag=math.sqrt(sum(v*v for v in n)); n=[round(v/mag,8) for v in n]
        span=[max(v[i] for v in verts)-min(v[i] for v in verts) for i in range(3)]
        f=dict(part=part,id=name,texture=tex+'.png',vertices_px=verts,vertices_units=[[v/80 for v in p] for p in verts],
               uv_top_left=uv,triangles=[[0,i,i+1] for i in range(1,len(verts)-1)],normal=n,solid=solid,
               extent_xyz_px=span,extent_xyz_units=[v/80 for v in span])
        if len(verts)==4:
            f['edge_lengths_px']=[round(math.dist(verts[i],verts[(i+1)%4]),6) for i in range(4)]
            f['edge_lengths_units']=[round(v/80,8) for v in f['edge_lengths_px']]
        tw,th=Image.open(OUT/(tex+'.png')).size
        f['texture_size_px']=[tw,th]
        f['texture_rect_px']=[round(min(p[0] for p in uv)*tw,6),round(min(p[1] for p in uv)*th,6),
                              round(max(p[0] for p in uv)*tw,6),round(max(p[1] for p in uv)*th,6)]
        f.update(extra); faces.append(f)
    def box(part,x0,x1,y0,y1,z0,z1,front,side,top,back=None,bottom='chassis'):
        face(part,part+'_front',front,[[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0]],normal=[0,0,-1])
        face(part,part+'_back',back or front,[[x1,y1,z1],[x0,y1,z1],[x0,y0,z1],[x1,y0,z1]],normal=[0,0,1])
        face(part,part+'_right',side,[[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[x1,y0,z0]],normal=[1,0,0])
        face(part,part+'_left',side,[[x0,y1,z0],[x0,y1,z1],[x0,y0,z1],[x0,y0,z0]],normal=[-1,0,0])
        face(part,part+'_top',top,[[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],normal=[0,1,0])
        face(part,part+'_bottom',bottom,[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],normal=[0,-1,0])
    section=[[-16,104],[16,104],[40,80],[40,48],[16,24],[-16,24],[-40,48],[-40,80]]
    for z,n in [(0,-1),(160,1)]:
        face('boiler','boiler_front' if z==0 else 'boiler_back','boiler_face',[[x,y,z] for x,y in section],
             [[(x+40)/80,(104-y)/80] for x,y in section],normal=[0,0,n])
    for i,(x,y) in enumerate(section):
        xx,yy=section[(i+1)%8]
        verts=[[x,y,0],[x,y,160],[xx,yy,160],[xx,yy,0]]
        if i in [0,4]: tex='boiler_top'; uv=[[0,0],[1,0],[1,1],[0,1]]
        else: tex='boiler_side'; uv=[[0,(104-y)/80],[1,(104-y)/80],[1,(104-yy)/80],[0,(104-yy)/80]]
        face('boiler',f'boiler_strip_{i}',tex,verts,uv,normal=[(x+xx)/2,(y+yy)/2-64,0])
    box('cab',-44,44,24,124,152,200,'cab_front','cab_side','cab_roof','cab_back')
    box('roof',-48,48,124,130,148,204,'chassis','chassis','cab_roof')
    box('chimney',-12,12,103,155,16,40,'chimney_side','chimney_side','chimney_top')
    box('dome',-12,12,100,120,88,112,'dome_side','dome_side','dome_top')
    box('chassis',-42,42,22,32,0,204,'chassis','chassis','chassis')
    box('tender',-40,40,24,76,212,292,'tender_end','tender_side','tender_top')
    box('tender_chassis',-42,42,18,24,212,292,'chassis','chassis','chassis')
    box('coupler',-5,5,22,30,200,216,'chassis','chassis','chassis')
    # Sloped cowcatcher is a genuine wedge, not a textured rectangular box.
    face('pilot','pilot_front','pilot_front',[[-46,32,0],[46,32,0],[46,2,-16],[-46,2,-16]],normal=[0,1,-1])
    face('pilot','pilot_back','chassis',[[-46,32,0],[46,32,0],[46,2,0],[-46,2,0]],normal=[0,0,1])
    face('pilot','pilot_bottom','chassis',[[-46,2,-16],[46,2,-16],[46,2,0],[-46,2,0]],normal=[0,-1,0])
    for x,n in [(-46,-1),(46,1)]:
        face('pilot',f'pilot_end_{n}','chassis',[[x,32,0],[x,2,-16],[x,2,0]],[[0,0],[1,1],[0,1]],normal=[n,0,0])
    for x in [-44,44]:
        for z in [32,84,136]:
            face('running',f'wheel_{x}_{z}','wheel_0',[[x,40,z-20],[x,40,z+20],[x,0,z+20],[x,0,z-20]],solid=False,
                 animation='running',texture_sequence=[f'wheel_{i}.png' for i in range(4)],phase_offset=0 if x>0 else 1)
        xr=x+(-1 if x<0 else 1)
        face('running',f'rods_{x}','rods_0',[[xr,42,0],[xr,42,160],[xr,-2,160],[xr,-2,0]],solid=False,
             animation='running',texture_sequence=[f'rods_{i}.png' for i in range(4)],phase_offset=0 if x>0 else 1)
        for z in [232,272]:
            face('tender_wheels',f'tender_wheel_{x}_{z}','tender_wheel',[[x,24,z-12],[x,24,z+12],[x,0,z+12],[x,0,z-12]],solid=False)
    face('emission','headlamp','headlamp_emissive',[[-40,104,-.125],[40,104,-.125],[40,24,-.125],[-40,24,-.125]],solid=False,emissive=True)
    face('emission','firebox','firebox_emissive',[[44,124,200.125],[-44,124,200.125],[-44,24,200.125],[44,24,200.125]],solid=False,emissive=True)
    # Optional soot decal shares the right-hand side's planar vertical strip.
    face('damage_decal','soot_right','soot',[[40.125,80,32],[40.125,80,112],[40.125,48,112],[40.125,48,32]],solid=False,states=['broken'])
    return faces

def render(faces,yaw,frame=0,broken=False,size=(320,320)):
    """Orthographic art QA of manifest triangles, nearest sampling, z-buffer, no light."""
    w,h=size; im=Image.new('RGB',size,PAL[0]); px=im.load(); depth=[float('inf')]*(w*h)
    a=math.radians(yaw); p=math.radians(16); scale=.99
    def project(v):
        x,y,z=v; z-=138; y-=70
        xx=x*math.cos(a)+z*math.sin(a); zz=z*math.cos(a)-x*math.sin(a)
        return (w/2+xx*scale,h/2-(y*math.cos(p)+zz*math.sin(p))*scale,zz*math.cos(p)-y*math.sin(p))
    textures={f.name:Image.open(f).convert('RGBA') for f in OUT.glob('*.png')}
    for f in faces:
        if f.get('states') and not broken:continue
        name=f['texture']
        if 'texture_sequence' in f:name=f['texture_sequence'][(frame+f['phase_offset'])%4]
        if broken:
            if name in ['boiler_face.png','boiler_side.png','cab_side.png']:name=name[:-4]+'_broken.png'
            if f.get('emissive'):continue
        tex=textures[name]; pts=[project(v) for v in f['vertices_px']]; uv=f['uv_top_left']
        for tri in f['triangles']:
            i,j,k=tri; A,B,C=[pts[t] for t in tri]
            den=(B[1]-C[1])*(A[0]-C[0])+(C[0]-B[0])*(A[1]-C[1])
            if abs(den)<1e-8:continue
            for yy in range(max(0,math.floor(min(A[1],B[1],C[1]))),min(h,math.ceil(max(A[1],B[1],C[1])))):
                for xx in range(max(0,math.floor(min(A[0],B[0],C[0]))),min(w,math.ceil(max(A[0],B[0],C[0])))):
                    X,Y=xx+.5,yy+.5
                    u=((B[1]-C[1])*(X-C[0])+(C[0]-B[0])*(Y-C[1]))/den
                    v=((C[1]-A[1])*(X-C[0])+(A[0]-C[0])*(Y-C[1]))/den; q=1-u-v
                    if min(u,v,q)<-1e-7:continue
                    z=u*A[2]+v*B[2]+q*C[2]
                    if z>=depth[yy*w+xx]:continue
                    tu=u*uv[i][0]+v*uv[j][0]+q*uv[k][0]; tv=u*uv[i][1]+v*uv[j][1]+q*uv[k][1]
                    col=tex.getpixel((min(tex.width-1,max(0,int(tu*tex.width))),min(tex.height-1,max(0,int(tv*tex.height)))))
                    if col[3]<128:continue
                    px[xx,yy]=col[:3]; depth[yy*w+xx]=z
    return im

def final_pack():
    face,side=main_textures(); other_textures(side); faces=geometry()
    manifest=dict(version=3,reference='art_src/keyframes_v1/01_furnace_390x844.png',
        coordinate_system=dict(handedness='right',x='right looking from behind the engine',y='up',z='nose to tender',origin='boiler nose plane, rail height, centerline',
                               unit='front boiler width = 1 = 80 source pixels',front_direction=[0,0,-1],train_pivot_units=[0,0,1.275]),
        render=dict(filter='nearest',wrap='clamp',mipmaps=False,alpha_test=.5,texture_v='0 at top of image; convert explicitly to engine UV convention',
                    indices='CCW outward; cross(b-a,c-a) agrees with normal; Babylon CounterClockWiseSideOrientation',
                    lighting='all diffuse maps unlit; only named emissive layers emit; no baked ambient occlusion',decals_offset_px=.125),
        assets=ENTRIES,faces=faces,
        assembly=dict(boiler='Closed octagonal prism, 80×80×160 px; eight strips and two caps. Never substitute a box.',
                      intersections='Cab overlaps boiler by 8 px; chimney embeds 1 px, dome 4 px, chassis intersects lower boiler. All solids individually closed.',
                      moving='Parent every face to the same train root; yaw that root around train_pivot_units.',
                      atlas='Each PNG standalone; uv_top_left coordinates refer to that full file, not a hidden atlas.',
                      scale='At maximum expected presentation use about one art texel per logical render pixel; preview scale 0.99.',
                      wheel_alignment='Wheel centers y=20; z=32,84,136. Rod centers in image are (32,22),(84,22),(136,22). Right side +90 degree phase per frame, left offset one frame.'),
        animation=dict(running=dict(frames=4,durations_ms=[100,100,100,100],loop=True,phases_degrees=[0,90,180,270],
                                    crank_radius_px=7,wheel_radius_px=20,distance_per_cycle_units=2*math.pi*20/80,
                                    time_note='100 ms is preview cadence; gameplay phase = floor(distance / wheel circumference * 4) modulo 4. Both wheel and rods use same phase.')),
        states=dict(normal='Base textures plus both emitters',broken=dict(replace={n+'.png':n+'_broken.png' for n in ['boiler_face','boiler_side','cab_side']},
                    emission=False,animation='freeze at last phase',enable_parts=['damage_decal'])))
    write_json('train_manifest_v3.json',manifest)
    validate()
    # Closed-edge incidence counts detect cracks independently of the raster preview.
    parts={}
    for f in faces:
        if not f['solid']:continue
        edges=parts.setdefault(f['part'],{})
        vv=f['vertices_px']
        for i in range(len(vv)):
            key=tuple(sorted([tuple(vv[i]),tuple(vv[(i+1)%len(vv)])]));edges[key]=edges.get(key,0)+1
    report={name:dict(unique_edges=len(edges),open_or_nonmanifold_edges=sum(n!=2 for n in edges.values())) for name,edges in parts.items()}
    assert all(p['open_or_nonmanifold_edges']==0 for p in report.values())
    write_json('geometry_validation.json',dict(parts=report,solid_parts=len(parts),open_edges_total=0,view_yaw_degrees=[-32,0,32],preview='previews/reference_three_views.png'))
    board=Image.new('RGB',(1350,844),PAL[0]); board.paste(Image.open(ROOT/'art_src/keyframes_v1/01_furnace_390x844.png'),(0,0)); d=ImageDraw.Draw(board)
    for index,yaw in enumerate([-32,0,32]):
        view=render(faces,yaw); view.save(SRC/'previews'/f'view_{index}.png'); board.paste(view,(390+index*320,35))
        d.text((410+index*320,20),f'YAW {yaw:+d} / UNLIT',fill=PAL[10])
    damaged=render(faces,32,broken=True); board.paste(damaged,(1030,390)); d.text((1050,390),'BROKEN / EMITTERS OFF',fill=PAL[10])
    for name,x,y in [('boiler_face',410,420),('boiler_side',520,420),('cab_side',700,420),('cab_front',770,420),('tender_side',880,420),('boiler_top',520,530),('pilot_front',410,540)]:
        im=Image.open(OUT/f'{name}.png').convert('RGBA');board.paste(im,(x,y),im);d.text((x,y+im.height+8),name,fill=PAL[9])
    for i in range(4):
        strip=Image.new('RGBA',(160,44),(*PAL[0],0))
        for z in [32,84,136]:strip.alpha_composite(Image.open(OUT/f'wheel_{i}.png'),(z-20,2))
        strip.alpha_composite(Image.open(OUT/f'rods_{i}.png'))
        board.paste(strip,(410+i*220,740),strip);d.text((410+i*220,800),f'PHASE {i} / {i*90} DEG',fill=PAL[10])
    board.save(SRC/'previews/reference_three_views.png')
    sheet=Image.new('RGB',(960,640),PAL[0]); sd=ImageDraw.Draw(sheet)
    for idx,entry in enumerate(ENTRIES):
        tile=Image.open(ROOT/entry['file']).convert('RGBA'); x=(idx%6)*160; y=(idx//6)*106
        tile.thumbnail((154,82),Image.Resampling.NEAREST)
        sheet.paste(tile,(x+(160-tile.width)//2,y),tile)
        sd.text((x+3,y+86),Path(entry['file']).stem,fill=PAL[10])
    sheet.save(SRC/'previews/all_textures.png')
    frames=[render(faces,32,i) for i in range(4)]
    frames[0].save(SRC/'previews/running.gif',save_all=True,append_images=frames[1:],duration=100,loop=0,optimize=False)

def validate():
    rows=[]
    for e in ENTRIES:
        path=ROOT/e['file']; im=Image.open(path).convert('RGBA'); colors=set(im.get_flattened_data())
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
    if '--first-pass' in sys.argv:first_pass()
    elif '--check-only' in sys.argv:
        ENTRIES.extend(json.loads((SRC/'train_manifest_v3.json').read_text(encoding='utf-8'))['assets']); validate()
    else:final_pack()
