"""Rebuild the three concept PNGs from lossless drafts; Python + Pillow only."""
import argparse
import hashlib
import json
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
STYLE = HERE.parents[1] / 'docs' / 'STYLE.md'
PALETTE = re.findall(r'\b[0-9a-f]{6}\b', STYLE.read_text(encoding='utf-8').split('```')[1])
COLORS = [tuple(bytes.fromhex(color)) for color in PALETTE]
assert len(COLORS) == 32
NAMES = ['01_furnace', '02_foundry', '03_vault']
GRID = (166, 360)
OUTPUT = (390, 844)
BAYER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))


@lru_cache(maxsize=131072)
def nearest(rgb):
    return min(COLORS, key=lambda c: sum((a - b) ** 2 for a, b in zip(c, rgb)))


def build():
    for name in NAMES:
        draft = Image.open(HERE / 'drafts' / f'{name}.webp').convert('RGB')
        # Area reduction merges subpixel generator marks before palette snapping.
        # Display enlargement below is strictly nearest, with no antialiased edges.
        small = draft.resize(GRID, Image.Resampling.BOX)
        pixels = []
        for index, rgb in enumerate(small.getdata()):
            x, y = index % GRID[0], index // GRID[0]
            # Weak ordered threshold: preserves quiet planes, avoids error diffusion.
            bias = (BAYER[y % 4][x % 4] - 7.5) * 0.5
            adjusted = tuple(max(0, min(255, round(c + bias))) for c in rgb)
            pixels.append(nearest(adjusted))
        small.putdata(pixels)
        small.resize(OUTPUT, Image.Resampling.NEAREST).save(HERE / f'{name}_390x844.png')


def validate():
    files = []
    for name in NAMES:
        path = HERE / f'{name}_390x844.png'
        img = Image.open(path)
        counts = Counter(img.convert('RGB').getdata())
        outside = {rgb: count for rgb, count in counts.items() if rgb not in COLORS}
        assert img.size == OUTPUT and img.mode == 'RGB'
        assert not outside, f'{path.name}: off-palette colors'
        # Nearest display mapping must round-trip exactly, including 2/3 px cells.
        rebuilt = img.resize(GRID, Image.Resampling.NEAREST).resize(OUTPUT, Image.Resampling.NEAREST)
        assert rebuilt.tobytes() == img.tobytes(), f'{path.name}: pixel grid drift'
        files.append({'file': path.name, 'width': img.width, 'height': img.height,
                      'frames': 1, 'pivot': [0, 0], 'pivot_units': 'pixels; top-left screen',
                      'purpose': 'Art-direction keyframe only; not a runtime asset',
                      'source': f'drafts/{name}.webp', 'colors_used': len(counts),
                      'off_palette_colors': len(outside), 'off_palette_pixels': sum(outside.values()),
                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    result = {'schema_version': 1, 'palette_source': '../../docs/STYLE.md',
              'palette': PALETTE, 'logical_size': list(GRID), 'display_size': list(OUTPUT),
              'sampling': 'BOX reduction to logical grid; nearest display enlargement',
              'ordered_dither': '4x4 Bayer; RGB offset -3.75..3.75',
              'generator': 'built-in image_gen', 'generator_model': 'not exposed by tool',
              'generation_calls': 3, 'recommended': '02_foundry_390x844.png', 'files': files}
    (HERE / 'keyframes_manifest_v1.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(files, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    if not args.check_only:
        build()
    validate()
