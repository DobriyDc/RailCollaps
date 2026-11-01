# Здоровье — hp_v1

Оригинальный арт для Rail Link: Collapse. Только новые файлы, без изменений кода игры.
Встроенный image_gen: одна генерация на группу; черновики в `drafts/`.
`prepare.py` — сборка Pillow, nearest, палитра `docs/STYLE.md`, альфа строго 0/255.

## Индикаторы

`python art_src/hp_v1/prepare.py icons` — два PNG 24×24 в `assets/ui/hud_v3/`.
Погасший индикатор использует тот же альфа-контур; фары полного выделены двумя светлыми ядрами.
Манифест: `icons_manifest_v1.json`.
