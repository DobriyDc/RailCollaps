"""Composite one generated overlay onto the unchanged run frame; mirror only the overlay."""
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TRAIN = ROOT / 'assets/px/train'
PALETTE = {tuple(bytes.fromhex(h)) for h in re.findall(
    r'\b[0-9a-f]{6}\b', (ROOT / 'docs/STYLE.md').read_text(encoding='utf-8'))}


def save_json(name, obj):
    (HERE / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def main():
    base_path = TRAIN / 'loco_run_0.png'
    base = Image.open(base_path).convert('RGBA')
    source = Image.open(HERE / 'generated_overlay.png').convert('RGBA')
    source.putalpha(source.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
    source = source.crop(source.getbbox()).resize((51, 24), Image.Resampling.NEAREST)
    pixels = []
    for r, g, b, a in source.get_flattened_data():
        if not a:
            pixels.append((0, 0, 0, 0))
        else:
            color = min(sorted(PALETTE), key=lambda p: (p[0]-r)**2 + (p[1]-g)**2 + (p[2]-b)**2)
            pixels.append((*color, 255))
    source.putdata(pixels)
    overlay = Image.new('RGBA', base.size)
    overlay.paste(source, (3, 54))
    originals = list(base.get_flattened_data())
    results, frames, assets = {}, [base], []
    for direction, layer in [('left', overlay), ('right', ImageOps.mirror(overlay))]:
        im = base.copy()
        im.paste(layer, (0, 0), layer.getchannel('A'))
        name = f'loco_shot_{direction}.png'
        path = TRAIN / name
        im.save(path)
        layer.save(HERE / f'overlay_{direction}.png')
        mask = layer.getchannel('A')
        mask.save(HERE / f'mask_{direction}.png')
        data, layer_data = list(im.get_flattened_data()), list(layer.get_flattened_data())
        changed = [i for i, (a, b) in enumerate(zip(originals, data)) if a != b]
        outside = sum(not layer_data[i][3] for i in changed)
        off = {p[:3] for p in data if p[3]} - PALETTE
        layer_off = {p[:3] for p in layer_data if p[3]} - PALETTE
        assert im.size == (139, 200) and outside == 0 and not layer_off
        assert set(layer.getchannel('A').get_flattened_data()) == {0, 255}
        assert all(54 <= i // 139 < 78 for i in changed)
        # Geometry anchors of the baseline remain byte-for-byte unchanged.
        assert im.crop((0, 41, 139, 54)).tobytes() == base.crop((0, 41, 139, 54)).tobytes()
        assert im.crop((0, 78, 139, 200)).tobytes() == base.crop((0, 78, 139, 200)).tobytes()
        result = dict(size=list(im.size), changed_pixels=len(changed), changed_outside_overlay=outside,
                      changed_bbox=mask.getbbox(), off_palette_colors=len(off), overlay_off_palette_colors=len(layer_off),
                      inherited_soft_alpha_pixels=sum(0 < p[3] < 255 for p in data),
                      first_row_25_percent_alpha128=next(y for y in range(200) if sum(data[y*139+x][3] >= 128 for x in range(139)) >= 139/4),
                      opaque_bottom_threshold_128=max(i // 139 for i, p in enumerate(data) if p[3] >= 128),
                      sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        results[name] = result
        frames.append(im)
        assets.append(dict(file=path.relative_to(ROOT).as_posix(), size=[139, 200], frames=1,
                           pivot=[69.5, 198], purpose=f'{direction} shot; exact run_0 with driver overlay'))
    save_json('validation.json', dict(base_sha256=hashlib.sha256(base_path.read_bytes()).hexdigest(), frames=results))
    save_json('train_shot_manifest_v2.json', dict(assets=assets, exception='Base RGBA preserved exactly by user choice; palette and binary alpha apply only to overlay.'))
    board = Image.new('RGB', (3 * 159, 224), '#17121b')
    draw = ImageDraw.Draw(board)
    for i, (label, im) in enumerate(zip(['RUN 0', 'SHOT LEFT', 'SHOT RIGHT'], frames)):
        draw.text((i * 159 + 10, 4), label, fill='#d0d8d4')
        board.paste(im, (i * 159 + 10, 20), im)
    board.resize((board.width * 3, board.height * 3), Image.Resampling.NEAREST).save(HERE / 'compare.png')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
