"""Rebuild original image_gen stone crops, UV strips, decals and review previews.

Pillow only. Run: python art_src/tunnel_vault_v1/build_pack.py
All sampling is nearest; no pixels from the style reference enter game assets.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
import json
import math

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'assets/textures/tunnel'
NEAR = Image.Resampling.NEAREST
entries = []
stone = Image.open(HERE / 'source_stone_v1.png').convert('RGB')
# Measured face crops, excluding the generated course gutters.
boxes = [(25, 78, 280, 365), (360, 82, 895, 360),
         (980, 90, 1220, 360), (30, 475, 280, 750),
         (365, 478, 895, 750), (975, 480, 1220, 752)]
faces = [stone.crop(box).resize((64, 64), NEAR) for box in boxes]


def save(im, name, purpose, pivot=(0.5, 0.5), **kwargs):
    im.save(OUT / name)
    entries.append(dict(file=f'assets/textures/tunnel/{name}', size=list(im.size),
                        mode=im.mode, frames=1, pivot_normalized=list(pivot),
                        pivot_pixels=[round(im.width * pivot[0]), round(im.height * pivot[1])],
                        purpose=purpose, **kwargs))


def masonry(width, height, courses, rib=False):
    """Reconstruct fitted wedge courses from original generated stone faces."""
    im = Image.new('RGB', (width, height), (12, 10, 9))
    pix = im.load()
    rowh = height / courses
    n = 17
    for y in range(height):
        row = int(y / rowh)
        v = (y % rowh) / rowh
        if v < 0.035 or v > 0.965:
            continue
        for x in range(2, width - 2):
            # Each joint splays away from the crown toward the outer face.
            # The centre stone is larger at V=0 (extrados), narrower at V=1.
            u = x / (width - 1)
            warped = 0.5 + (u - 0.5) * (0.985 + 0.03 * v)
            shift = (row % 2) * 0.38 if not rib else 0
            coord = warped * n + shift
            if rib:
                # Crown stone occupies 8% of arc versus 5.75% for a neighbour.
                coord = (warped / 0.46 * 8 if warped < 0.46 else
                         9 + (warped - 0.54) / 0.46 * 8 if warped > 0.54 else
                         8 + (warped - 0.46) / 0.08)
            block = int(coord)
            q = coord % 1
            if q < 0.045 or q > 0.96:
                continue
            face = faces[(block * 5 + row * 3) % len(faces)]
            rgb = face.getpixel((min(63, int(q * 64)), min(63, int(v * 64))))
            crown = block == 8
            factor = (1.45 if rib else 0.80) * (1.16 if crown else 1)
            if v < 0.09:
                factor *= 1.25  # worn outer bevel, hard step
            if v > 0.87:
                factor *= 0.68
            # Subtle warm bounce near both spring points, never a painted flame.
            bounce = max(0, abs(u - 0.5) * 2 - 0.55)
            rgb = [min(255, int(c * factor)) for c in rgb]
            rgb[0] = min(255, rgb[0] + int(22 * bounce))
            rgb[1] = min(255, rgb[1] + int(5 * bounce))
            pix[x, y] = tuple(rgb)
    im = im.quantize(colors=40, dither=Image.Dither.NONE).convert('RGB')
    # Seam is in mortar. Opposite sample edges are identical, without blur.
    im.paste(im.crop((0, 0, width, 1)), (0, height - 1))
    im.paste(im.crop((0, 0, 1, height)), (width - 1, 0))
    return im


vault = masonry(512, 128, 4)
rib = masonry(1024, 64, 1, rib=True)
save(vault, 'vault_brick_v2.png', 'Full semicircular vault, 4 staggered wedge courses',
     seamless_axes=['U', 'V'], repeat_axes=['V'],
     uv={'U': 'left spring 0 -> crown 0.5 -> right spring 1',
         'V': 'tunnel longitudinal axis, 4 courses per 128 px period'},
     texel_density='512 px per complete arch; use physical arc length, not angle per face')
save(rib, 'arch_rib_v2.png', 'Single complete arch rib strip, 17 voussoirs and crown keystone',
     seamless_axes=['U', 'V'], repeat_axes=[],
     uv={'U': 'arc length from left spring to right spring, exactly once',
         'V': 'rib depth, 0 front outer bevel -> 1 back inner bevel'},
     keystone_uv=[0.5, 0.5],
     anchors=[{'name': 'left_spring', 'uv': [0, 0.5]},
              {'name': 'left_haunch', 'uv': [0.25, 0.5]},
              {'name': 'crown_keystone', 'uv': [0.5, 0.5]},
              {'name': 'right_haunch', 'uv': [0.75, 0.5]},
              {'name': 'right_spring', 'uv': [1, 0.5]}])

source = Image.open(HERE / 'source_decals_v1.png').convert('RGBA')
decal_boxes = [(80, 8, 580, 680), (675, 8, 1380, 675), (1530, 8, 2035, 680)]
sizes = [(128, 192), (160, 160), (128, 192)]
names = ['vault_hangers_v2.png', 'vault_soot_v2.png', 'vault_magma_crack_v2.png']
decals = []
for i, (box, size, name) in enumerate(zip(decal_boxes, sizes, names)):
    crop = source.crop(box)
    crop = crop.crop(crop.getchannel('A').getbbox())
    crop.thumbnail((size[0] - 8, size[1] - 8), NEAR)
    im = Image.new('RGBA', size)
    im.alpha_composite(crop, ((size[0] - crop.width) // 2, 4))
    # Step the alpha from the generated transparency; preserve no checkerboard.
    alpha = im.getchannel('A').point(lambda a: min(255, round(a / 51) * 51))
    rgb = im.convert('RGB').quantize(colors=24, dither=Image.Dither.NONE).convert('RGB')
    im = rgb.convert('RGBA')
    im.putalpha(alpha)
    p = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if a == 0:
                p[x, y] = (0, 0, 0, 0)
            elif i == 0 and r > 110 and r > g * 1.4:
                # The generator inserted a small warm lamp in the anchor.
                # Recolour its bright core as rust; this decal is a hanger.
                p[x, y] = (min(87, r // 2), min(48, g // 2), min(28, b), a)
    decals.append(im)
    save(im, name, ['Ceiling iron chains, anchor and sagging cable',
                    'Soot stain above torches, no wall backing',
                    'Magma-filled branching crack, no wall backing'][i],
         pivot=(0.5, 0.04) if i == 0 else (0.5, 0.5),
         repeat_axes=[], seamless_axes=[], alpha='straight stepped 0,51,102,153,204,255',
         blend='alpha blend; crack orange pixels may feed emissive mask')

# One compact review sheet, exact unscaled 3x3 texture repeats.
sheet = Image.new('RGB', (1536, 576), (17, 14, 12))
for j in range(3):
    for i in range(3):
        sheet.paste(vault, (i * 512, j * 128))
small_rib = rib.resize((512, 64), NEAR)
for j in range(3):
    for i in range(3):
        sheet.paste(small_rib, (i * 512, 384 + j * 64))
sheet.save(HERE / 'preview_tiles_3x3_v1.png')

# Actual new textures sampled onto a simple perspective vault over the reference.
# Reference remains only in this review image; no reference pixels in game assets.
ref = Image.open(ROOT / 'art_src/storyboard_tunnel_style_keyframe_v1.png').convert('RGB')
preview = ref.resize((360, 640), NEAR).convert('RGBA')
pp = preview.load()
rings = [(310, 21), (203, 15), (130, 10), (82, 7), (51, 5), (32, 3)]
for y in range(234):
    for x in range(360):
        dx, dy = x - 180, (234 - y) / 0.75
        radius = math.hypot(dx, dy)
        if radius < 28:
            continue
        u = math.atan2(dy, -dx) / math.pi
        tex = vault
        tx = min(511, int(u * 511))
        ty = int(16000 / radius) % 128
        factor = 0.50 + min(0.50, radius / 440)
        for rr, thick in rings:
            if rr - thick <= radius <= rr:
                tex = rib
                tx = min(1023, int(u * 1023))
                ty = min(63, int((rr - radius) / thick * 63))
                factor = 0.65 + min(0.35, radius / 500)
                break
            if rr - thick - 3 <= radius < rr - thick:
                factor *= 0.53
        rgb = tex.getpixel((tx, ty))
        pp[x, y] = tuple(int(c * factor) for c in rgb) + (255,)
for im, size, xy in [(decals[1], (35, 44), (19, 108)),
                     (decals[1], (26, 32), (296, 165)),
                     (decals[0], (57, 108), (52, 50)),
                     (decals[0], (37, 69), (267, 119)),
                     (decals[2], (37, 69), (219, 35))]:
    preview.alpha_composite(im.resize(size, NEAR), xy)
preview.convert('RGB').save(HERE / 'preview_tunnel_360x640_v1.png')

# Transparency review on a brown backing, at the delivered native sizes.
contact = Image.new('RGB', (448, 224), (67, 49, 38))
for im, xy in zip(decals, [(8, 16), (144, 16), (312, 16)]):
    contact.paste(im, xy, im)
contact.save(HERE / 'preview_decals_v1.png')

validation = {'textures': {}, 'decals': {}, 'preview_size': [360, 640]}
for name, im in [('vault_brick_v2.png', vault), ('arch_rib_v2.png', rib)]:
    xerr = sum(a != b for a, b in zip(im.crop((0, 0, 1, im.height)).getdata(),
                                    im.crop((im.width - 1, 0, im.width, im.height)).getdata()))
    yerr = sum(a != b for a, b in zip(im.crop((0, 0, im.width, 1)).getdata(),
                                    im.crop((0, im.height - 1, im.width, im.height)).getdata()))
    validation['textures'][name] = dict(size=list(im.size), edge_mismatch_pixels={'U': xerr, 'V': yerr})
    assert xerr == yerr == 0
for name, im in zip(names, decals):
    alpha = im.getchannel('A')
    assert alpha.getextrema() == (0, 255)
    assert not alpha.crop((0, 0, im.width, 3)).getbbox()
    validation['decals'][name] = dict(size=list(im.size), alpha_levels=sorted(set(alpha.getdata())),
                                     opaque_bbox=alpha.getbbox())
(HERE / 'validation_v1.json').write_text(json.dumps(validation, indent=2) + '\n', encoding='utf-8')
profile = [[-math.cos(math.pi * k / 32), 0.75 * math.sin(math.pi * k / 32), 0]
           for k in range(33)]
distances = [0]
for a, b in zip(profile, profile[1:]):
    distances.append(distances[-1] + math.dist(a, b))
manifest = dict(version=2, generator='built-in image_gen + deterministic Pillow crop/remap',
                sampling='nearest, no mipmaps for decals; clamp U on full arch, repeat V on vault',
                integration='Card 13; do not retain legacy rib uScale=6. Full arch U=0..1 once.',
                extrude_shape=dict(profile_units='radius=1, spring_y=0; scale and translate in scene',
                    path_normalized=[[0, 0, -0.5], [0, 0, 0.5]],
                    points=[dict(position=[round(v, 6) for v in p],
                                 uv_u=round(d / distances[-1], 6))
                            for p, d in zip(profile, distances)],
                    note='Use cumulative physical profile length for U; V follows path. Split crown at U=.5 only, preserve shared UV.'),
                assets=entries)
(HERE / 'tunnel_vault_manifest_v1.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps(validation, indent=2))
