"""Author pixel-exact turnouts from the project's original track material (Pillow)."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'assets/textures/switches'
PREV = HERE / 'previews'
W, H = 384, 640
TRACK_PATH = ROOT / 'assets/textures/tunnel/track.png'
TRACK = Image.open(TRACK_PATH).convert('RGBA')
PROFILE = [TRACK.getpixel((x, 0)) for x in range(29, 36)]
STEEL, RUST, DARK = (133, 125, 110, 255), (105, 67, 40, 255), (26, 21, 18, 255)


def tiled(tile, size):
    im = Image.new('RGBA', size)
    for y in range(0, size[1], 128):
        for x in range(0, size[0], 128):
            im.paste(tile, (x, y))
    return im


def shift(y):
    t = max(0, min(1, (544 - y) / 448))
    return 128 * (3 * t * t - 2 * t * t * t)


def branch_x(x, s, y):
    t = max(0, min(1, (544 - y) / 448))
    slope = 768 / 448 * t * (1 - t)
    # Preserve approximately 64px gauge NORMAL to the curve, rather than squeeze
    # it to 59px on the steepest part of the crossover.
    gauge_correction = (x - 192) * ((1 + slope * slope) ** 0.5 - 1)
    return x + s * shift(y) + gauge_correction


def rail(im, points, thin=False):
    """Use exactly the seven-column stock rail profile; no antialiasing."""
    d = ImageDraw.Draw(im)
    profile = [DARK, RUST, STEEL] if thin else PROFILE
    half = len(profile) // 2
    for off, color in enumerate(profile):
        d.line([(round(x) + off - half, y) for x, y in points], fill=color, width=1)


def sleeper_bed(signs):
    im = Image.new('RGBA', (W, H))
    lanes = sorted({1} | {1 + s for s in signs})
    for lane in lanes:
        for y in range(0, H, 128):
            im.paste(TRACK, (lane * 128, y))
    # Bed under the crossover: rail-free ballast, sampled from our original material.
    gravel = TRACK.crop((40, 0, 88, 128))
    for y in range(96, 545):
        span = shift(y)
        lo = round(160 + min([0] + [s * span for s in signs])) - 20
        hi = round(224 + max([0] + [s * span for s in signs])) + 20
        for x in range(lo, hi + 1):
            im.putpixel((x, y), gravel.getpixel(((x - 40) % 48, y % 128)))
    # Long switch timbers stay horizontal, with the exact original tie cadence.
    for y in range(111, 545, 32):
        span = shift(y)
        lo = round(160 + min([0] + [s * span for s in signs])) - 20
        hi = round(224 + max([0] + [s * span for s in signs])) + 20
        for yy in range(y - 5, y + 6):
            for x in range(lo, hi + 1):
                color = TRACK.getpixel((40 + (x % 48), yy % 128))
                im.putpixel((x, yy), color)
        d = ImageDraw.Draw(im)
        for x in range(lo + 6, hi - 3, 24):
            d.point((x, y), fill=DARK)
    # Original straight stock rails, kept on every participating through track.
    for lane in lanes:
        for center in (lane * 128 + 32, lane * 128 + 96):
            rail(im, [(center, y) for y in range(H)])
    return im, lanes


def static_turnout(signs):
    im, lanes = sleeper_bed(signs)
    for s in signs:
        for x in (160, 224):
            rail(im, [(branch_x(x, s, y), y) for y in range(96, 481)])
        # Two diamond crossings per crossover: dark flangeway cuts, steel frog nose,
        # and parallel check rails protecting the opposite wheel flange.
        for x, branch_rail, guard_x in ((224 if s == 1 else 160,
                                        160 if s == 1 else 224, 171 if s == 1 else 213),
                                       (288 if s == 1 else 96,
                                        224 if s == 1 else 160, 341 if s == 1 else 43)):
            ys = min(range(200, 440), key=lambda y: abs(branch_x(branch_rail, s, y) - x))
            d = ImageDraw.Draw(im)
            d.polygon([(x - 4, ys - 15), (x + 4, ys),
                       (x + 4, ys + 15), (x - 4, ys)], fill=DARK)
            rail(im, [(x, y) for y in range(ys - 18, ys + 19)])
            d.line([(x - 5 * s, ys + 12), (x, ys),
                    (x + 5 * s, ys - 12)], fill=STEEL, width=2)
            rail(im, [(guard_x, y) for y in range(ys - 26, ys + 27)], True)
        # Fixed trailing points where the branch joins the receiving straight track.
        for x in (160, 224):
            rail(im, [(branch_x(x, s, y), y) for y in range(96, 161)])
    # Only outer ballast shoulders are cut away; the port rows remain original.
    for y in range(16, H - 16):
        for x in range(min(lanes) * 128, min(lanes) * 128 + 3):
            im.putpixel((x, y), (0, 0, 0, 0))
        for x in range((max(lanes) + 1) * 128 - 3, (max(lanes) + 1) * 128):
            im.putpixel((x, y), (0, 0, 0, 0))
    return im, lanes


def points(signs, state):
    im = Image.new('RGBA', (W, H))
    for s in signs:
        selected = state == ('right' if s == 1 else 'left')
        for x in (160, 224):
            # Closed tip meets stock rail, open tip has a visible 5px flangeway.
            pts = []
            for y in range(480, 545):
                t = (y - 480) / 64
                offset = (0 if selected else 8) * t * t
                pts.append((branch_x(x, s, y) + s * offset, y))
            rail(im, pts, True)
        d = ImageDraw.Draw(im)
        # Throw bar and two small pins, always below the wheel running surfaces.
        y = 519 if s == 1 else 535
        left, right = (171, 211) if selected else (178, 218)
        d.rectangle((left, y, right, y + 3), fill=DARK)
        d.line((left, y + 1, right, y + 1), fill=RUST, width=1)
        for x in (left, right):
            d.rectangle((x, y, x + 2, y + 2), fill=STEEL)
    return im


def save_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    PREV.mkdir(parents=True, exist_ok=True)
    entries, validations = [], []
    overview = Image.new('RGB', (W * 3, H + 288), (21, 18, 16))
    point_sheet = Image.new('RGB', (768, 240 * 3), (21, 18, 16))
    for i, (name, signs) in enumerate((('right', [1]), ('left', [-1]), ('both', [-1, 1]))):
        base, lanes = static_turnout(signs)
        base_name = f'switch_{name}_base.png'
        base.save(OUT / base_name)
        states = ['straight'] + (['left'] if -1 in signs else []) + (['right'] if 1 in signs else [])
        overlays = {}
        state_previews = {}
        for state in states:
            overlay = points(signs, state)
            filename = f'switch_{name}_points_{state}.png'
            overlay.save(OUT / filename)
            overlays[state] = f'assets/textures/switches/{filename}'
            composed = Image.alpha_composite(base, overlay)
            # Compare all seven rail-profile columns at every participating port,
            # not just their bright center; overlays must never touch the ports.
            count = 0
            for lane in lanes:
                for y in list(range(16)) + list(range(H - 16, H)):
                    for x in range(lane * 128, (lane + 1) * 128):
                        expected = TRACK.getpixel((x % 128, y % 128))
                        assert composed.getpixel((x, y)) == expected, (name, state, x, y)
                        count += 1
            assert overlay.getchannel('A').getextrema() == (0, 255)
            assert set(overlay.getchannel('A').tobytes()) == {0, 255}
            validations.append(dict(variant=name, state=state, port_texels_checked=count,
                                    max_rail_displacement_px=0, mismatched_port_texels=0))
            background = tiled(TRACK, (W, H + 256))
            background.alpha_composite(composed, (0, 128))
            state_previews[state] = background.convert('RGB')
        state = 'right' if name == 'right' else 'left'
        overview.paste(state_previews[state], (i * W, 32))
        ImageDraw.Draw(overview).text((i * W + 12, 10), f'{name} / {state} / 1:1', fill=(210, 185, 148))
        # State comparison uses the same crop and nearest enlargement for every state.
        detail = Image.new('RGB', (256 * len(states), 240), (21, 18, 16))
        for j, st in enumerate(states):
            full = Image.alpha_composite(base, points(signs, st))
            crop = full.crop((132, 464, 260, 576)).resize((256, 224), Image.Resampling.NEAREST)
            detail.paste(crop.convert('RGB'), (j * 256, 16))
            ImageDraw.Draw(detail).text((j * 256 + 6, 2), f'{name} / {st}', fill=(210, 185, 148))
        point_sheet.paste(detail, (0, i * 240))
        entries.append(dict(variant=name, base=f'assets/textures/switches/{base_name}',
                            overlays=overlays, canvas_px=[W, H], frames=1,
                            pivot_normalized=[0.5, 1], pivot_px=[192, 640],
                            source_lane=1, branch_lanes=[1 + s for s in signs],
                            ports=[dict(lane=lane, entry_y=639, exit_y=0,
                                        rail_centers_x=[lane * 128 + 32, lane * 128 + 96],
                                        rail_profile_columns_x=[list(range(lane * 128 + c - 3,
                                                                          lane * 128 + c + 4))
                                                                for c in (32, 96)])
                                   for lane in lanes],
                            purpose='Прямые пути с плавным переводом из средней полосы на соседнюю; вход снизу',
                            preview='previews/all_turnouts_tiled_1x.png',
                            preview_rect_px=[i * W, 32, (i + 1) * W, H + 288]))
    overview.save(PREV / 'all_turnouts_tiled_1x.png')
    point_sheet.save(PREV / 'points_states_2x.png')
    save_json(HERE / 'switches_manifest_v1.json', dict(
        version=1, track_reference='assets/textures/tunnel/track.png',
        track_sha256=hashlib.sha256(TRACK_PATH.read_bytes()).hexdigest(),
        track_tile_px=[128, 128], source_rail_centers_x=[32, 96],
        direction='bottom to top; x right; y down; coordinates zero-based',
        sampling='nearest, clamp, no smoothing, binary alpha',
        composition='base + exactly ONE matching points overlay; same canvas and pivot',
        topology='Three parallel through lanes; crossover(s) depart from middle lane. Side-lane ports are through-track context, not extra player choices.',
        curve=dict(type='cubic smoothstep S', displacement_px=128,
                   start_y=544, end_y=96, tangent_at_ports='vertical',
                   max_angle_degrees=23.20),
        port_guard_rows=16, textures=entries, validation=validations))
    print(f'Built 3 bases + 7 point overlays; {sum(v["port_texels_checked"] for v in validations)} port texels exact; displacement 0px.')


if __name__ == '__main__':
    build()
