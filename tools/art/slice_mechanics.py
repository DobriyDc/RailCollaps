"""Нарезка листов art_src/mechanics_v1 в игровые спрайты assets/sprites/.

Прямоугольники и опорные точки берутся из mechanics_manifest_v1.json (их измерил воркер,
нарисовавший листы). Альфа ниже 24 обнуляется, кадр обрезается по содержимому с полем 4 px.
Кадры одной анимации кладутся на общий холст с общей опорной точкой — иначе при смене кадра
спрайт дёргается. Запуск из корня collapse: python tools/art/slice_mechanics.py
"""
import json
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "art_src" / "mechanics_v1"
OUT = ROOT / "assets" / "sprites"
ALPHA_FLOOR = 24
PAD = 4

# id кадра в манифесте -> (папка, имя файла, группа анимации или None)
TARGETS = {
    "track_accelerator": ("pickups", "boost", None),
    "track_decelerator": ("pickups", "slow", None),
    "track_shield": ("pickups", "shield", None),
    "track_ammunition": ("pickups", "ammo", None),
    "track_fall_rescue": ("pickups", "rescue", None),
    "hud_accelerator": ("hud", "boost", None),
    "hud_decelerator": ("hud", "slow", None),
    "hud_shield": ("hud", "shield", None),
    "hud_ammunition": ("hud", "ammo", None),
    "hud_fall_rescue": ("hud", "rescue", None),
    "run_1": ("train", "loco_run_0", "loco_run"),
    "run_2": ("train", "loco_run_1", "loco_run"),
    "run_3": ("train", "loco_run_2", "loco_run"),
    "run_4": ("train", "loco_run_3", "loco_run"),
    "cab_shot_screen_left": ("train", "loco_shot_left", "loco_run"),
    "cab_shot_screen_right": ("train", "loco_shot_right", "loco_run"),
    "switch_waiting": ("switch", "waiting", "switch"),
    "switch_bullet_impact": ("switch", "hit", "switch"),
    "switch_set_screen_left": ("switch", "set_left", "switch"),
    "switch_set_screen_right": ("switch", "set_right", "switch"),
    "jump_crouch": ("demon", "jump_0", "demon"),
    "jump_launch": ("demon", "jump_1", "demon"),
    "jump_airborne": ("demon", "jump_2", "demon"),
    "jump_lunge": ("demon", "jump_3", "demon"),
    "bullet_hit": ("demon", "hit", "demon"),
    "ash_breakup": ("demon", "ash", "demon"),
    "flow_1": ("fx", "lava_flow_0", "lava_flow"),
    "flow_2": ("fx", "lava_flow_1", "lava_flow"),
    "flow_3": ("fx", "lava_flow_2", "lava_flow"),
    "flow_4": ("fx", "lava_flow_3", "lava_flow"),
    "warning_drops_1": ("fx", "lava_drops_0", "lava_drops"),
    "warning_drops_2": ("fx", "lava_drops_1", "lava_drops"),
    "track_splash_1": ("fx", "lava_splash_0", "lava_splash"),
    "track_splash_2": ("fx", "lava_splash_1", "lava_splash"),
    "shield_1": ("fx", "shield_0", "shield"),
    "shield_2": ("fx", "shield_1", "shield"),
    "shield_3": ("fx", "shield_2", "shield"),
    "shield_absorbs_hit": ("fx", "shield_hit", "shield"),
}


def trimmed(sheet: Image.Image, frame: dict):
    x, y, w, h = frame["rect_px"]
    im = sheet.crop((x, y, x + w, y + h))
    a = im.getchannel("A").point(lambda v: 0 if v < ALPHA_FLOOR else v)
    im.putalpha(a)
    box = a.getbbox()
    px, py = frame.get("pivot_px", [w // 2, h])
    return im, box, (px, py)


def main():
    manifest = json.loads((SRC / "mechanics_manifest_v1.json").read_text(encoding="utf-8"))
    frames = {}
    for sheet_rec in manifest["sheets"]:
        sheet = Image.open(SRC / sheet_rec["file"]).convert("RGBA")
        for fr in sheet_rec["frames"]:
            frames[fr["id"]] = (sheet, fr, sheet_rec["file"])

    # Общий холст для групп: максимум расстояний от опорной точки до краёв содержимого.
    groups = {}
    for fid, (folder, name, group) in TARGETS.items():
        if fid not in frames:
            raise SystemExit("нет кадра в манифесте: " + fid)
        sheet, fr, _ = frames[fid]
        im, box, (px, py) = trimmed(sheet, fr)
        if group:
            g = groups.setdefault(group, [0, 0, 0, 0])
            g[0] = max(g[0], px - box[0]); g[1] = max(g[1], box[2] - px)
            g[2] = max(g[2], py - box[1]); g[3] = max(g[3], box[3] - py)

    out_manifest = []
    for fid, (folder, name, group) in TARGETS.items():
        sheet, fr, src_file = frames[fid]
        im, box, (px, py) = trimmed(sheet, fr)
        if group:
            left, right, up, down = groups[group]
            cw, ch = left + right + 2 * PAD, up + down + 2 * PAD
            canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            canvas.alpha_composite(im, (PAD + left - px, PAD + up - py))
            pivot = [PAD + left, PAD + up]
        else:
            part = im.crop(box)
            canvas = Image.new("RGBA", (part.width + 2 * PAD, part.height + 2 * PAD), (0, 0, 0, 0))
            canvas.alpha_composite(part, (PAD, PAD))
            pivot = [PAD + px - box[0], PAD + py - box[1]]
        dest = OUT / folder / (name + ".png")
        dest.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(dest, optimize=True)
        out_manifest.append({
            "file": dest.relative_to(ROOT).as_posix(), "source": "art_src/mechanics_v1/" + src_file,
            "source_id": fid, "size": list(canvas.size), "pivot": pivot, "group": group,
        })
    (OUT / "mechanics_manifest.json").write_text(
        json.dumps(out_manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(len(out_manifest), "спрайтов ->", OUT)


if __name__ == "__main__":
    main()
