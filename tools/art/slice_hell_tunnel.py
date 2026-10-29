"""Slice the reviewed Hell Tunnel v1 sheets. Run from any working directory.

Requires only Python 3.12 and Pillow. No resampling or source-sheet writes.
"""

from array import array
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PADDING = 4
ALPHA_MIN = 24
SHEETS = {
    "train": ("01_train", 3, ["loco_front", "loco_turn_left", "loco_turn_right",
                              "loco_damaged", "loco_fall_left", "loco_fall_right"]),
    "fx": ("04_fx", 4, [*(f"torch_{i}" for i in range(4)),
                         *(f"smoke_{i}" for i in range(4)),
                         *(f"lava_{i}" for i in range(4)),
                         "lava_burst", "rocks", "flash", "splash"]),
    "ui": ("05_ui", 4, ["pause", "play", "star_full", "star_empty", "hand_idle",
                         "hand_tap", "hazard", "stop", "sign_left", "sign_right",
                         "sign_up", "sign_cross", "panel_wide", "panel_small",
                         "timer", "boost"]),
}
# Reviewed source landmarks: center of the lower cowcatcher, including tilted
# views. These are art anchors, not component bounding-box centers or wheel tips.
TRAIN_PIVOTS = [(204, 582), (535, 580), (1138, 580),
                (204, 1203), (595, 1081), (1058, 1080)]
TORCH_PIVOTS = [(160, 328), (472, 327), (790, 330), (1105, 330)]


def components(alpha):
    """Return exact 4-connected alpha islands, with their pixels and bounds."""
    w, h = alpha.size
    pending = bytearray(alpha.tobytes())
    found = []
    for start in range(w * h):
        if not pending[start]:
            continue
        pending[start] = 0
        stack = [start]
        pixels = array("I")
        left, top, right, bottom = w, h, 0, 0
        while stack:
            pos = stack.pop()
            y, x = divmod(pos, w)
            pixels.append(pos)
            left, top = min(left, x), min(top, y)
            right, bottom = max(right, x + 1), max(bottom, y + 1)
            neighbors = [pos - w, pos + w]
            if x:
                neighbors.append(pos - 1)
            if x + 1 < w:
                neighbors.append(pos + 1)
            for nxt in neighbors:
                if 0 <= nxt < w * h and pending[nxt]:
                    pending[nxt] = 0
                    stack.append(nxt)
        found.append({"pixels": pixels, "bbox": (left, top, right, bottom)})
    return sorted(found, key=lambda c: -len(c["pixels"]))


def box_distance(a, b):
    """Squared gap between islands; satellites belong to the nearest core."""
    dx = max(a[0] - b[2], b[0] - a[2], 0)
    dy = max(a[1] - b[3], b[1] - a[3], 0)
    return dx * dx + dy * dy


def extract(source, count, columns):
    rgba = Image.open(source).convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda v: v if v >= ALPHA_MIN else 0)
    rgba.putalpha(alpha)
    islands = components(alpha)
    cores = islands[:count]
    # Fail on unexpected source changes instead of quietly selecting tiny noise
    # as an object. The reviewed sheets have one dominant island per sprite.
    if len(cores) != count or len(cores[-1]["pixels"]) < 10000:
        raise ValueError(f"Unexpected silhouette layout: {source}")
    by_y = sorted(cores, key=lambda c: c["bbox"][1] + c["bbox"][3])
    ordered = []
    for row in range(0, count, columns):
        ordered.extend(sorted(by_y[row:row + columns], key=lambda c: c["bbox"][0]))
    rows = [ordered[i:i + columns] for i in range(0, count, columns)]
    # Infer the empty gutters from actual silhouettes, not sheet/grid sizes.
    # This keeps a burst's high sparks out of the lava directly above it.
    gutters = [(max(c["bbox"][3] for c in previous)
                + min(c["bbox"][1] for c in following)) / 2
               for previous, following in zip(rows, rows[1:])]
    groups = [[core] for core in ordered]
    for satellite in islands[count:]:
        center_y = (satellite["bbox"][1] + satellite["bbox"][3]) / 2
        row = sum(center_y > gutter for gutter in gutters)
        candidates = range(row * columns, min((row + 1) * columns, count))
        owner = min(candidates, key=lambda i: box_distance(
            satellite["bbox"], ordered[i]["bbox"]))
        groups[owner].append(satellite)
    result = []
    covered = 0
    for group in groups:
        mask_bytes = bytearray(rgba.width * rgba.height)
        for island in group:
            covered += len(island["pixels"])
            for pos in island["pixels"]:
                mask_bytes[pos] = 255
        mask = Image.frombytes("L", rgba.size, bytes(mask_bytes))
        bbox = mask.getbbox()
        # Mask by ownership before cropping: no neighboring island can leak in,
        # even if its bounding rectangle overlaps this sprite's rectangle.
        isolated = Image.new("RGBA", rgba.size)
        isolated.paste(rgba, (0, 0), mask)
        result.append((isolated.crop(bbox), bbox))
    assert covered == sum(v != 0 for v in alpha.tobytes())
    return result


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    entries, previews, sources = [], [], {}
    for category, (sheet, columns, names) in SHEETS.items():
        relative = f"art_src/hell_tunnel_{sheet}_v1.png"
        source = ROOT / relative
        sources[relative] = hashlib.sha256(source.read_bytes()).hexdigest()
        sliced = extract(source, len(names), columns)
        items = []
        for index, (name, (content, bbox)) in enumerate(zip(names, sliced)):
            animation = category == "fx" and index < 12
            group = name.rsplit("_", 1)[0] if animation else category
            if category == "train":
                sx, sy = TRAIN_PIVOTS[index]
                anchor = (sx - bbox[0], sy - bbox[1])
            elif animation and group == "torch":
                sx, sy = TORCH_PIVOTS[index]
                anchor = (sx - bbox[0], sy - bbox[1])
            elif category == "fx":
                anchor = (content.width // 2, content.height)
            else:
                anchor = (content.width // 2, content.height // 2)
            items.append(dict(name=name, image=content, bbox=bbox, anchor=anchor,
                              group=group, animation=animation, index=index))
        for item in items:
            peers = [p for p in items if p["group"] == item["group"]] if item["animation"] else [item]
            left = max(p["anchor"][0] for p in peers) + PADDING
            top = max(p["anchor"][1] for p in peers) + PADDING
            right = max(p["image"].width - p["anchor"][0] for p in peers) + PADDING
            bottom = max(p["image"].height - p["anchor"][1] for p in peers) + PADDING
            canvas = Image.new("RGBA", (left + right, top + bottom))
            offset = (left - item["anchor"][0], top - item["anchor"][1])
            canvas.paste(item["image"], offset)
            box = canvas.getchannel("A").getbbox()
            assert box[0] >= 4 and box[1] >= 4
            assert canvas.width - box[2] >= 4 and canvas.height - box[3] >= 4
            path = f"assets/sprites/{category}/{item['name']}.png"
            target = ROOT / path
            target.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(target)
            x0, y0, x1, y1 = item["bbox"]
            entries.append(dict(file=path, source=relative,
                                source_rect=[x0, y0, x1 - x0, y1 - y0],
                                size=list(canvas.size), pivot=[left, top],
                                content_offset=list(offset), group=item["group"],
                                frame_order=item["index"] % 4 if item["animation"] else item["index"],
                                sheet_order=item["index"], animation=item["animation"],
                                purpose=item["name"]))
            previews.append((item["name"], canvas))
    manifest = dict(schema_version=1, pack="hell_tunnel_slices_v1", alpha_min=ALPHA_MIN,
                    padding=PADDING, recommended_filter="nearest", source_sha256=sources,
                    coordinates="Pixels, origin top-left; source_rect=[x,y,width,height]; pivot is in output canvas",
                    animation_notes="State variants; timing and seamless looping require integration review",
                    sprites=entries)
    save_json(ROOT / "assets/sprites/manifest.json", manifest)
    preview = Image.new("RGB", (1200, 8 * 230), (24, 26, 32))
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default(size=15)
    for index, (name, sprite) in enumerate(previews):
        x, y = (index % 5) * 240, (index // 5) * 230
        thumb = sprite.copy()
        thumb.thumbnail((228, 198), Image.Resampling.NEAREST)
        preview.paste(thumb, (x + (240 - thumb.width) // 2, y + 4), thumb)
        draw.text((x + 8, y + 207), f"{index + 1:02d} {name}", fill=(225, 225, 225), font=font)
    output = ROOT / "art_src/slices_v1"
    output.mkdir(parents=True, exist_ok=True)
    preview.save(output / "contact_sheet.png")
    save_json(output / "slices_manifest_v1.json", {
        "pack": manifest["pack"], "runtime_manifest": "assets/sprites/manifest.json",
        "sprite_counts": {key: len(value[2]) for key, value in SHEETS.items()},
        "contact_sheet": "art_src/slices_v1/contact_sheet.png",
        "generator": "tools/art/slice_hell_tunnel.py"})
    print(f"Sliced {len(entries)} sprites (train 6, fx 16, ui 16)")


if __name__ == "__main__":
    main()
