"""Prepare the generated turn, validate both runtime PNGs, and rebuild the QA board."""
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TRAIN = ROOT / 'assets/px/train'
PALETTE = [tuple(bytes.fromhex(h)) for h in re.findall(
    r'\b[0-9a-f]{6}\b', (ROOT / 'docs/STYLE.md').read_text(encoding='utf-8'))]


def write_json(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def measure(im):
    pixels = im.load()
    rows = [sum(pixels[x, y][3] == 255 for x in range(im.width)) for y in range(im.height)]
    colors = {p[:3] for p in im.get_flattened_data() if p[3]}
    return dict(width=im.width, height=im.height,
                body_top=next(y for y, count in enumerate(rows) if count),
                first_row_25_percent=next(y for y, count in enumerate(rows) if count >= im.width / 4),
                bottom=max(y for y, count in enumerate(rows) if count),
                off_palette_colors=len(colors - set(PALETTE)),
                alpha_values=sorted(set(im.getchannel('A').get_flattened_data())))


def main():
    source = Image.open(HERE / 'generated_left.png').convert('RGBA')
    source.putalpha(source.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
    # Preserve aspect ratio and 157-pixel body height; no vertical shear or tilt.
    source = source.crop(source.getbbox())
    body = source.resize((round(source.width * 157 / source.height), 157), Image.Resampling.NEAREST)
    mapped = []
    cache = {}
    for r, g, b, a in body.get_flattened_data():
        if not a:
            mapped.append((0, 0, 0, 0))
            continue
        rgb = (r, g, b)
        if rgb not in cache:
            cache[rgb] = min(PALETTE, key=lambda p: sum((p[i] - rgb[i]) ** 2 for i in range(3)))
        mapped.append((*cache[rgb], 255))
    body.putdata(mapped)
    left = Image.new('RGBA', (139, 200))
    left.paste(body, ((139 - body.width) // 2, 41))
    frames = [left, ImageOps.mirror(left)]
    validation = {}
    manifest = []
    for direction, im in zip(('left', 'right'), frames):
        name = f'loco_turn_{direction}.png'
        path = TRAIN / name
        im.save(path)
        result = measure(im)
        assert result['height'] == 200 and result['width'] <= 139
        assert result['body_top'] >= 41 and result['first_row_25_percent'] >= 38
        assert 196 <= result['bottom'] <= 198
        assert result['off_palette_colors'] == 0 and result['alpha_values'] == [0, 255]
        result['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        validation[name] = result
        manifest.append(dict(file=path.relative_to(ROOT).as_posix(), size=[139, 200], frames=1,
                             pivot=[69.5, 198], purpose=f'slight {direction} turn, no smoke'))
    write_json('validation.json', validation)
    write_json('train_turn_manifest_v2.json', dict(pixel_filter='nearest', row_indexing='zero-based', assets=manifest))
    # All four canvases share the exact y origin: baseline is native row 197.
    board = Image.new('RGB', (4 * 159, 230), '#17121b')
    draw = ImageDraw.Draw(board)
    draw.line((0, 219, board.width - 1, 219), fill='#6c7880')
    draw.line((0, 63, board.width - 1, 63), fill='#33232b')
    refs = [Image.open(TRAIN / 'loco_run_0.png').convert('RGBA'), *frames,
            Image.open(HERE / 'old_left.png').convert('RGBA')]
    for i, (label, im) in enumerate(zip(('RUN 0', 'NEW LEFT', 'NEW RIGHT', 'OLD LEFT'), refs)):
        x = i * 159 + (159 - im.width) // 2
        board.paste(im, (x, 22), im)
        draw.text((i * 159 + 10, 5), label, fill='#d0d8d4')
    out = ROOT / 'docs/qa/turn-frames/compare.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    board.resize((board.width * 3, board.height * 3), Image.Resampling.NEAREST).save(out)
    print(json.dumps(validation, indent=2))


if __name__ == '__main__':
    main()
