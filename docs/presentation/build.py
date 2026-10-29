"""Собирает rail-link-collapse.html: превью арта ChatGPT из assets_src встраиваются как data URI.

Запуск: python docs/presentation/build.py (из корня collapse)
"""
import base64
import io
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT.parent.parent / "art_src"
COAL = (24, 20, 25)

# ключ в шаблоне -> (файл, ширина превью, подложка для прозрачных листов)
IMAGES = {
    "KEYFRAME": ("storyboard_tunnel_style_keyframe_v1.png", 520, False),
    "STORY6": ("storyboard_tunnel_motion_6frames_v1.png", 760, False),
    "CONCEPT1": ("concept_01_tunnel_progression_v2.png", 1100, False),
    "CONCEPT2": ("concept_02_left_gap_restored_v2.png", 820, False),
    "SHEET1": ("hell_tunnel_01_train_v1.png", 420, True),
    "SHEET2": ("hell_tunnel_02_tracks_v1.png", 420, True),
    "SHEET3": ("hell_tunnel_03_tunnel_v1.png", 420, True),
    "SHEET4": ("hell_tunnel_04_fx_v1.png", 420, True),
    "SHEET5": ("hell_tunnel_05_ui_v1.png", 420, True),
}


def jpeg_uri(name: str, width: int, on_coal: bool) -> str:
    im = Image.open(SRC / name).convert("RGBA")
    if on_coal:
        bg = Image.new("RGBA", im.size, COAL + (255,))
        bg.alpha_composite(im)
        im = bg
    im = im.convert("RGB")
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


html = (ROOT / "template.html").read_text(encoding="utf-8")
for key, (name, width, on_coal) in IMAGES.items():
    html = html.replace(f"__{key}__", jpeg_uri(name, width, on_coal))
out = ROOT / "rail-link-collapse.html"
out.write_text(html, encoding="utf-8")
print(out, round(out.stat().st_size / 1024), "KB")
