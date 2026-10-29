"""Игровые копии спрайтов под экран 360x640: assets/sprites/** -> assets/px/**.

Игра рендерит тоннель в 360x640 и увеличивает кадр без сглаживания, поэтому спрайт крупнее
своего экранного размера только весит и рябит при уменьшении. Копия уменьшается один раз
(LANCZOS) до потолка по высоте для своей папки; исходники в assets/sprites остаются
источником и в сборку не попадают (код ссылается только на assets/px).
Запуск из корня collapse: python tools/art/fit_sprites.py
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "sprites"
OUT = ROOT / "assets" / "px"

# Потолок высоты (px) по папке; уточнения по префиксу имени файла.
MAX_H = {"train": 200, "demon": 170, "pickups": 96, "switch": 120, "hud": 48, "fx": 96, "ui": 72}
BY_PREFIX = {
    "fx/lava_flow": 260, "fx/shield": 210, "fx/smoke": 120, "fx/lava_splash": 80,
    "fx/lava_drops": 90, "fx/lava_burst": 160, "ui/sign": 96, "ui/panel": 48,
}


def ceiling(rel: str) -> int:
    for prefix, h in BY_PREFIX.items():
        if rel.startswith(prefix):
            return h
    return MAX_H.get(rel.split("/")[0], 96)


def main():
    count, before, after = 0, 0, 0
    for src in sorted(SRC.rglob("*.png")):
        rel = src.relative_to(SRC).as_posix()
        im = Image.open(src).convert("RGBA")
        h = ceiling(rel)
        if im.height > h:
            w = max(1, round(im.width * h / im.height))
            im = im.resize((w, h), Image.LANCZOS)
        dest = OUT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, optimize=True)
        count += 1
        before += src.stat().st_size
        after += dest.stat().st_size
    print(f"{count} спрайтов: {before / 1e6:.1f} МБ -> {after / 1e6:.2f} МБ в {OUT}")


if __name__ == "__main__":
    main()
