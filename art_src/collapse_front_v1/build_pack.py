"""Reproduce the package from original image_gen sources; Pillow only, no deps.

Source crops, nearest resampling, cyclic lava remapping, and toroidal quilting.
Run from any cwd: python art_src/collapse_front_v1/build_pack.py
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageStat
import json
import math

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SPR = ROOT / 'assets/sprites/collapse'
TEX = ROOT / 'assets/textures/collapse'
for directory in (SPR, TEX):
    directory.mkdir(parents=True, exist_ok=True)
NEAREST = Image.Resampling.NEAREST
entries = []


def save_asset(im, name, purpose, pivot=(0.5, 0.5), **extra):
    path = (TEX if name.startswith('magma_') else SPR) / name
    im.save(path)
    entries.append(dict(file=path.relative_to(ROOT).as_posix(), size=list(im.size),
                        pivot_normalized=list(pivot), purpose=purpose, **extra))


def hard_alpha(im):
    im = im.convert('RGBA')
    im.putalpha(im.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
    # Transparent RGB is zero to prevent fringes in downstream atlas tools.
    clean = Image.new('RGBA', im.size)
    clean.paste(im, (0, 0), im.getchannel('A'))
    return clean


def fit_sprite(source, box, size):
    crop = hard_alpha(source.crop(box))
    crop = crop.crop(crop.getchannel('A').getbbox())
    ratio = min((size[0]-8)/crop.width, (size[1]-8)/crop.height)
    crop = crop.resize((round(crop.width*ratio), round(crop.height*ratio)), NEAREST)
    out = Image.new('RGBA', size)
    out.alpha_composite(crop, ((size[0]-crop.width)//2, (size[1]-crop.height)//2))
    return out


# Individually measured source rectangles: no equal-grid assumptions.
debris_source = Image.open(HERE / 'source_debris_v1.png')
debris_boxes = [(8, 100, 320, 449), (325, 100, 638, 449),
                (641, 100, 957, 449), (964, 100, 1254, 449),
                (8, 462, 320, 805), (325, 462, 638, 805),
                (641, 462, 957, 805), (960, 462, 1254, 805),
                (8, 834, 330, 1170), (333, 834, 664, 1170),
                (666, 834, 973, 1170)]
blocks = []
for i, box in enumerate(debris_boxes):
    rail = i >= 8
    sprite = fit_sprite(debris_source, box, (80, 80) if rail else (64, 64))
    name = f'rail_debris_{i-8:02d}.png' if rail else f'brick_debris_{i:02d}.png'
    save_asset(sprite, name, 'falling broken rail with sleepers' if rail else 'falling brick block',
               source_rect=list(box), frames=1)
    if not rail:
        blocks.append(sprite)

cracks_source = Image.open(HERE / 'source_cracks_v1.png')
crack_boxes = [(0, 0, 650, 635), (650, 0, 1305, 635),
               (0, 635, 710, 1206), (710, 635, 1305, 1206)]
for i, box in enumerate(crack_boxes):
    crack = fit_sprite(cracks_source, box, (128, 160) if i < 2 else (192, 112))
    save_asset(crack, f'crack_{"wall" if i < 2 else "vault"}_{i%2:02d}.png',
               'emissive crack decal ahead of collapse', source_rect=list(box), frames=1)


def minimum_cut(cost):
    """Connected top-to-bottom minimum-error quilt seam, no feathering."""
    height, width = len(cost), len(cost[0])
    scores = list(cost[0])
    parents = []
    for y in range(1, height):
        row, back = [], []
        for x in range(width):
            prev = min(range(max(0, x-1), min(width, x+2)), key=lambda k: scores[k])
            row.append(scores[prev] + cost[y][x])
            back.append(prev)
        scores = row
        parents.append(back)
    x = min(range(width), key=lambda k: scores[k])
    seam = [x]
    for back in reversed(parents):
        x = back[x]
        seam.append(x)
    return seam[::-1]


def quilt_x(im, period, overlap):
    pix = im.load()
    cost = [[sum((pix[x, y][c]-pix[x+period, y][c])**2 for c in range(3))
             for x in range(overlap)] for y in range(im.height)]
    seam = minimum_cut(cost)
    out = im.crop((0, 0, period, im.height))
    dst = out.load()
    for y, cut in enumerate(seam):
        for x in range(cut+1):
            dst[x, y] = pix[x+period, y]
    return out


# Source is quilted across 32px overlaps on both axes. No mirrored quadrants.
period = 127
raw = Image.open(HERE / 'source_magma_v1.png').convert('RGB').resize((159, 159), NEAREST)
tile = quilt_x(raw, period, 32)
tile = quilt_x(tile.transpose(Image.Transpose.TRANSPOSE), period, 32).transpose(Image.Transpose.TRANSPOSE)
tile.save(HERE / 'magma_quilt_base_v1.png')
magma_frames = []
for frame in range(4):
    out = Image.new('RGB', (128, 128))
    phase = frame*math.tau/4
    src, dst = tile.load(), out.load()
    for y in range(128):
        for x in range(128):
            xx, yy = x % period, y % period
            sx = (xx + round(2*math.sin(math.tau*yy/period + phase))) % period
            sy = (yy + round(2*math.sin(math.tau*xx/period - phase))) % period
            r, g, b = src[sx, sy]
            heat = round(8*math.sin(phase + math.tau*(xx+yy)/period))
            dst[x, y] = (r, max(0, min(255, g+heat)), b)
    magma_frames.append(out)
    save_asset(out, f'magma_{frame:02d}.png', 'bright molten floor surface',
               seamless_axes=['X', 'Y'], frames=1, sequence='magma', frame=frame,
               duration_ms=120, edge_policy='duplicated edge row/column, period 127px')

front_source = hard_alpha(Image.open(HERE / 'source_front_v1.png'))
base = fit_sprite(front_source, (0, 0, front_source.width, front_source.height), (256, 256))
base_alpha = base.getchannel('A')
front_frames = []
molten_count = 0
for frame in range(6):
    out = base.copy()
    src, dst = base.load(), out.load()
    for y in range(256):
        for x in range(256):
            r, g, b, a = src[x, y]
            if a and r > 180 and r >= g and g > 48 and b < 185:
                # Only the molten material moves; masonry geometry stays locked.
                # 18px waterfall and 12px floor bands advance by exactly one
                # step even at frame 5 -> 0 (modulo their respective periods).
                sx = x if y < 175 else x//12*12 + (x+frame*2) % 12
                sy = y//18*18 + (y+frame*3) % 18 if y < 175 else y
                rr, gg, bb, aa = src[sx, sy]
                if aa and rr > 180 and gg > 48 and bb < 185:
                    dst[x, y] = (rr, gg, bb, a)
                heat = round(14*math.sin(math.tau*frame/6 + y/9 + x/17))
                rr, gg, bb, aa = dst[x, y]
                dst[x, y] = (rr, max(0, min(255, gg+heat)), bb, aa)
                if frame == 0:
                    molten_count += 1
    # Two staggered streams of falling masonry; respawn hidden against vault.
    for index, (x, offset, extent) in enumerate([(88, 0, 27), (145, 3, 32), (117, 2, 17)]):
        tick = (frame+offset) % 6
        block = blocks[index*2].resize((extent, extent), NEAREST)
        block = block.rotate(tick*12-18, resample=NEAREST, expand=True)
        y = 50 + tick*21
        out.alpha_composite(block, (x - block.width//2, y))
    out.putalpha(base_alpha)
    front_frames.append(out)
    save_asset(out, f'front_{frame:02d}.png', 'rear collapse cross-section billboard',
               pivot=(0.5, 1.0), sequence='front', frame=frame, frames=1, duration_ms=100)

atlas = Image.new('RGBA', (1536, 256))
for i, frame in enumerate(front_frames):
    atlas.alpha_composite(frame, (i*256, 0))
save_asset(atlas, 'front_strip_v1.png', 'six-frame front atlas, left to right',
           pivot=(0.5, 1), frames=6, frame_size=[256, 256], duration_ms=100)


def on_checker(im, cell=8):
    bg = Image.new('RGBA', im.size, (37, 34, 32, 255))
    draw = ImageDraw.Draw(bg)
    for y in range(0, im.height, cell):
        for x in range(0, im.width, cell):
            if (x//cell+y//cell)%2:
                draw.rectangle((x, y, x+cell-1, y+cell-1), fill=(49, 45, 41, 255))
    bg.alpha_composite(im)
    return bg.convert('RGB')


on_checker(atlas).save(HERE / 'preview_front_cycle_v1.png')
on_checker(front_frames[0]).resize((768, 768), NEAREST).save(HERE / 'preview_front_alpha_v1.png')
front_frames[0].save(HERE / 'preview_front_loop_v1.png', save_all=True,
                     append_images=front_frames[1:], duration=100, loop=0, disposal=2, blend=0)

# Three distance inserts in the exact keyframe, fixed camera and foreground train.
keyframe = Image.open(ROOT / 'art_src/storyboard_tunnel_style_keyframe_v1.png').convert('RGBA').resize((360, 640), NEAREST)
train_mask = Image.new('L', keyframe.size)
d = ImageDraw.Draw(train_mask)
d.polygon([(163, 282), (202, 282), (216, 316), (226, 323), (239, 355),
           (247, 404), (252, 442), (262, 496), (255, 527), (226, 539),
           (128, 539), (99, 522), (98, 485), (112, 444), (115, 399),
           (120, 365), (132, 330), (151, 317), (151, 286)], fill=255)
train_layer = keyframe.copy()
train_layer.putalpha(train_mask)
previews = []
for i, (name, width, bottom) in enumerate([('far', 112, 274), ('mid', 196, 315), ('near', 296, 368)]):
    scene = keyframe.copy()
    front = front_frames[i*2].resize((width, width), NEAREST)
    scene.alpha_composite(front, (180-width//2, bottom-width))
    scene.alpha_composite(train_layer)
    scene = scene.convert('RGB')
    scene.save(HERE / f'preview_distance_{name}_v1.png')
    previews.append(scene)
distance_strip = Image.new('RGB', (1080, 640))
for i, scene in enumerate(previews):
    distance_strip.paste(scene, (360*i, 0))
distance_strip.save(HERE / 'preview_distances_v1.png')
distance_animation = []
for frame in front_frames:
    strip = Image.new('RGB', (1080, 640))
    for i, (width, bottom) in enumerate([(112, 274), (196, 315), (296, 368)]):
        scene = keyframe.copy()
        scene.alpha_composite(frame.resize((width, width), NEAREST), (180-width//2, bottom-width))
        scene.alpha_composite(train_layer)
        strip.paste(scene.convert('RGB'), (i*360, 0))
    distance_animation.append(strip)
distance_animation[0].save(HERE / 'preview_distances_loop_v1.png', save_all=True,
                            append_images=distance_animation[1:], duration=100, loop=0)

magma_grid = []
for i, frame in enumerate(magma_frames):
    grid = Image.new('RGB', (384, 384))
    for y in range(3):
        for x in range(3):
            grid.paste(frame, (x*128, y*128))
    grid.save(HERE / f'preview_magma_3x3_{i:02d}_v1.png')
    magma_grid.append(grid)
magma_grid[0].save(HERE / 'preview_magma_loop_v1.png', save_all=True,
                   append_images=magma_grid[1:], duration=120, loop=0)

contact = Image.new('RGBA', (768, 400))
for i in range(8):
    contact.alpha_composite(blocks[i].resize((96, 96), NEAREST), ((i%8)*96, 4))
for i in range(3):
    im = Image.open(SPR / f'rail_debris_{i:02d}.png').resize((120, 120), NEAREST)
    contact.alpha_composite(im, (i*160+16, 108))
for i in range(4):
    im = Image.open(SPR / f'crack_{"wall" if i<2 else "vault"}_{i%2:02d}.png')
    contact.alpha_composite(im, (i*192, 236))
on_checker(contact).save(HERE / 'preview_debris_cracks_v1.png')

manifest = dict(version=1, generator='built-in image_gen + Pillow build_pack.py',
                filtering='nearest; no mipmaps for sprites', color_space='sRGB',
                alpha='straight, binary 0/255', assets=entries,
                sequences=dict(front=dict(count=6, fps=10, loop=True, pivot=[128, 256]),
                               magma=dict(count=4, fps=8.333333, loop=True, seamless_axes=['X', 'Y'])),
                preview=dict(distances=['far', 'mid', 'near'], canvas=[360, 640],
                             front_widths=[112, 196, 296], front_bottoms=[274, 315, 368],
                             foreground='original keyframe train restored by polygon mask'),
                sources=[dict(file=p.name, size=list(Image.open(p).size))
                         for p in sorted(HERE.glob('source_*_v1.png'))],
                integration='Art pack only; scene integration is a separate task.')
(HERE / 'collapse_front_manifest_v1.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf8', newline='\n')

def luminance(im):
    means = ImageStat.Stat(im.convert('RGB')).mean
    return round(sum(a*b for a,b in zip(means, (0.2126, 0.7152, 0.0722))), 2)

checks = dict(asset_count=len(entries), front_frames=6, magma_frames=4,
              magma_luminance=[luminance(im) for im in magma_frames],
              old_lava_luminance=[luminance(Image.open(ROOT / f'assets/textures/tunnel/lava_{i}.png')) for i in range(4)],
              front_molten_pixels_animated=molten_count, seams=[])
for i, im in enumerate(magma_frames):
    p = im.load()
    dx = sum(p[0,y] != p[127,y] for y in range(128))
    dy = sum(p[x,0] != p[x,127] for x in range(128))
    assert dx == dy == 0
    checks['seams'].append(dict(frame=i, mismatched_edge_pixels_x=dx, mismatched_edge_pixels_y=dy))
for im in front_frames:
    assert im.size == (256, 256)
    assert ImageChops.difference(im.getchannel('A'), base_alpha).getbbox() is None
    assert im.getpixel((0, 0))[3] == im.getpixel((255, 0))[3] == 0
checks['front_alpha_identical_all_frames'] = True
def sequence_differences(frames):
    return [round(sum(ImageStat.Stat(ImageChops.difference(
        im.convert('RGB'), frames[(i+1) % len(frames)].convert('RGB'))).mean)/3, 2)
        for i, im in enumerate(frames)]
checks['front_rgb_delta_including_wrap'] = sequence_differences(front_frames)
checks['magma_rgb_delta_including_wrap'] = sequence_differences(magma_frames)
(HERE / 'validation_v1.json').write_text(json.dumps(checks, indent=2)+'\n', encoding='utf8', newline='\n')
print(json.dumps(checks, indent=2))
