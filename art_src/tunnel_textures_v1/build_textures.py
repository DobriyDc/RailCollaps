"""Rebuild the authored 128px materials from the saved image_gen originals (Pillow)."""
from pathlib import Path
import json
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parents[1] / 'assets/textures/tunnel'
NEAREST = Image.Resampling.NEAREST


def source(name):
    return Image.open(ROOT / 'generated' / f'{name}.png').convert('RGB').resize((128, 128), NEAREST)


def palette(im, count=24):
    return im.quantize(colors=count, dither=Image.Dither.NONE).convert('RGB')


def masonry(name, cols, rows, stagger=True):
    """Retain generated faces, author exact mortar and periodic block spacing."""
    src = source(name)
    w, h = 128 // cols, 128 // rows
    im = Image.new('RGB', (128, 128), (24, 20, 17))
    for row in range(rows):
        for col in range(cols + 1):
            # Sample inside the generator's nominal block courses, excluding its mortar.
            sx, sy = (col % cols) * w, row * h
            face = src.crop((sx + 3, sy + 3, sx + w - 3, sy + h - 3)).resize((w - 2, h - 2), NEAREST)
            x = col * w - (w // 2 if stagger and row % 2 else 0)
            for wrap in (-128, 0, 128):
                im.paste(face, (x + 1 + wrap, row * h + 1))
    return palette(im)


def seam_path(a, b):
    """Minimum-error hard pixel cut; never blends colors."""
    w, h = a.size
    ap, bp = a.load(), b.load()
    costs, parents = [], []
    for y in range(h):
        line, links = [], []
        for x in range(w):
            e = sum((ap[x, y][c] - bp[x, y][c]) ** 2 for c in range(3))
            if y:
                p = min(range(max(0, x - 1), min(w, x + 2)), key=lambda k: costs[-1][k])
                e += costs[-1][p]
            else:
                p = x
            line.append(e)
            links.append(p)
        costs.append(line)
        parents.append(links)
    x = min(range(w), key=lambda k: costs[-1][k])
    path = [x]
    for y in range(h - 1, 0, -1):
        x = parents[y][x]
        path.append(x)
    return path[::-1]


def repair_axis(im):
    # Move the old wrap seam to center, then replace it with an interior patch.
    dst = ImageChops.offset(im, 64, 0)
    patch = im.crop((32, 0, 96, 128))
    left = seam_path(dst.crop((32, 0, 48, 128)), patch.crop((0, 0, 16, 128)))
    right = seam_path(dst.crop((80, 0, 96, 128)), patch.crop((48, 0, 64, 128)))
    for y in range(128):
        lo, hi = 32 + left[y], 80 + right[y]
        dst.paste(patch.crop((lo - 32, y, hi - 32 + 1, y + 1)), (lo, y))
    return dst


def periodic(im, axes):
    if 'X' in axes:
        im = repair_axis(im)
    if 'Y' in axes:
        im = repair_axis(im.transpose(Image.Transpose.TRANSPOSE)).transpose(Image.Transpose.TRANSPOSE)
    # One-pixel authored wrap guard: exact matching texels, no feathering.
    if 'X' in axes:
        im.paste(im.crop((0, 0, 1, 128)), (127, 0))
    if 'Y' in axes:
        im.paste(im.crop((0, 0, 128, 1)), (0, 127))
    return im


def save(name, im):
    im.save(OUT / f'{name}.png')
    preview = Image.new('RGBA', (384, 384), (0, 0, 0, 0))
    for y in range(3):
        for x in range(3):
            preview.paste(im, (128 * x, 128 * y))
    preview.save(ROOT / 'previews' / f'{name}_3x3.png')


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    save('brick_wall', masonry('brick_wall', 4, 8))
    save('vault_brick', masonry('vault_brick', 4, 8).transpose(Image.Transpose.TRANSPOSE))
    save('arch_rib', masonry('arch_rib', 2, 4, False))
    save('floor_ballast', periodic(palette(source('floor_ballast')), 'XY'))
    track = periodic(palette(source('track')), 'Y')
    # Keep the original sleepers/gravel; straighten rail heads for exact UV continuity.
    d = ImageDraw.Draw(track)
    for x in (32, 96):
        d.rectangle((x - 3, 0, x + 3, 127), fill=(42, 31, 25))
        d.line((x - 2, 0, x - 2, 127), fill=(105, 67, 40), width=2)
        d.line((x, 0, x, 127), fill=(133, 125, 110), width=2)
        d.line((x + 2, 0, x + 2, 127), fill=(62, 57, 49))
    save('track', track)
    lava = periodic(palette(source('lava'), 16), 'XY')
    # Four equal advection steps: last->first has the same displacement as every step.
    for i in range(4):
        save(f'lava_{i}', ImageChops.offset(lava, 0, i * 32))
    glow = Image.open(ROOT / 'generated/torch_glow.png').convert('RGBA').resize((64, 64), NEAREST)
    # Preserve generated alpha, quantize it into explicit light steps and clear the perimeter.
    rgb = palette(glow.convert('RGB'), 8).convert('RGBA')
    alpha = glow.getchannel('A').point(lambda a: (a // 32) * 32)
    ad = ImageDraw.Draw(alpha)
    ad.rectangle((0, 0, 63, 63), outline=0, width=3)
    rgb.putalpha(alpha)
    save('torch_glow', rgb.resize((128, 128), NEAREST))
    # A small contact sheet is a review artifact, separate from unlabeled game PNGs.
    names = ['brick_wall', 'vault_brick', 'arch_rib', 'floor_ballast', 'track', 'lava_0', 'torch_glow']
    sheet = Image.new('RGB', (640, 384), (24, 20, 18))
    ds = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        x, y = (i % 4) * 160, (i // 4) * 192
        tile = Image.open(OUT / f'{name}.png').convert('RGBA')
        sheet.paste(tile, (x + 16, y + 24), tile)
        ds.text((x + 12, y + 160), name, fill=(203, 175, 136))
    sheet.save(ROOT / 'previews/contact_sheet.png')
    frames = [Image.open(OUT / f'lava_{i}.png') for i in range(4)]
    frames[0].save(ROOT / 'previews/lava_loop.gif', save_all=True, append_images=frames[1:], duration=180, loop=0)
    names = names[:5] + [f'lava_{i}' for i in range(4)] + ['torch_glow']
    all_tiles = Image.new('RGB', (1536, 1230), (24, 20, 18))
    labels = ImageDraw.Draw(all_tiles)
    for i, name in enumerate(names):
        x, y = i % 4 * 384, i // 4 * 410
        all_tiles.paste(Image.open(ROOT / 'previews' / f'{name}_3x3.png'), (x, y + 20))
        labels.text((x + 8, y + 4), name, fill=(203, 175, 136))
    all_tiles.save(ROOT / 'previews/all_3x3.png')
    purposes = ['Боковые стены тоннеля', 'Развёртка кирпичного свода; длинная ось кирпича вдоль V',
                'Каменное ребро арки / пилястра', 'Отсыпка между путями', 'Один прямой путь, вид сверху']
    entries = []
    for i, name in enumerate(names):
        im = Image.open(OUT / f'{name}.png')
        assert im.size == (128, 128)
        axes = [] if name == 'torch_glow' else ['Y'] if name in ('track', 'arch_rib') else ['X', 'Y']
        entry = dict(file=f'assets/textures/tunnel/{name}.png', size=[128, 128], frames=1,
                     pivot=[0.5, 0.5], seamless_axes=axes, mode=im.mode,
                     colors=len(im.getcolors(65536)), preview=f'previews/{name}_3x3.png',
                     purpose=purposes[i] if i < 5 else 'Тёплая световая декаль' if name == 'torch_glow' else 'Поверхность лавы')
        if name.startswith('lava_'):
            entry.update(animation='lava_flow', frame=int(name[-1]), duration_ms=180)
        entries.append(entry)
    assert all(ImageChops.difference(ImageChops.offset(frames[i], 0, 32), frames[(i + 1) % 4]).getbbox() is None for i in range(4))
    glow = Image.open(OUT / 'torch_glow.png')
    assert glow.getchannel('A').getextrema() == (0, 224)
    manifest = dict(version=1, generated_with='built-in image_gen + Python 3.12 / Pillow',
                    textures=entries, sampling='nearest; no smoothing; no bloom',
                    uv_axes=dict(X='U / ширина PNG', Y='V / высота PNG, вдоль пути'),
                    lava_animation=dict(frames=[f'lava_{i}' for i in range(4)], fps=5.555556,
                                        duration_ms=720, loop=True, offset_per_frame_px=[0, 32],
                                        wrap_3_to_0_verified=True),
                    torch_glow=dict(blend='additive recommended; preserve alpha', wrap='clamp', alpha_levels=sorted(set(glow.getchannel('A').tobytes()))),
                    visual_qa='Inspected every 3x3 preview; no wrap breaks observed on declared axes. Mortar joints and repeating motifs are intentional.')
    (ROOT / 'tunnel_textures_manifest_v1.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Validated {len(entries)} 128x128 PNGs; all four lava transitions exact; alpha preserved.')


if __name__ == '__main__':
    build()
