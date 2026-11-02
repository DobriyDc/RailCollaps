# Демон на кабине и разрыв пути — v1

Перерисованы только четыре `assets/sprites/demon_v3/hang_00..03.png` и `assets/ui/hud_v3/icon_gap.png`. Код и остальные игровые ассеты не менялись.

## Чем рисовал

Встроенный **image_gen**, два запроса с локальными референсами и `transparent_background=true`. Генерация дала новый широкий корпус, тяжёлые плечи и руки, прежнюю кирпичную голову с двумя рогами и Y-образную лавовую трещину. Четыре позы сохранены: дыхание A/B, замах, удар.

Исходники: `generated_demon.png`, `generated_icon.png`; поданные референсы: `reference_demon.png`, `reference_icons.png`. Старые заменённые изображения сохранены с префиксом `old_` для воспроизводимого сравнения.

Python 3.12 + Pillow использован для нарезки, приведения к игровой сетке ближайшим соседом, палитре STYLE и бинарной альфе, а также сборки листов. В замахе отдельно перепривязана вырезка поднятого предплечья: верхняя точка теперь у кончика рога, плечо и корпус сохранены. Из левого поля кадра удара исключён фрагмент соседней ячейки. Стопы во всех кадрах заканчиваются на y=144 включительно; левый хват около (40,56). Метаданные pivot в новом манифесте — визуальные опорные точки для проверки, код интеграции не менялся.

Восстановление: `python art_src/demon_hang_gap_v1/prepare.py`. Скрипт заменяет только пять указанных игровых PNG и обновляет сравнительные листы и validation.json.

## Проверка

Листы просмотрены: `compare_demon.png` — старый и новый ряд плюс неизменённые perch/strike, ×2 nearest на #14121a; `compare_icon.png` — старый/новый gap и три соседних значка, ×6 nearest и отдельно ×1. Новый демон сохраняет тяжёлые плечи и толщину конечностей относительно perch, корпус между фазами не перескакивает. Значок в 24×24 показывает две линии рельсов, четыре шпалы и поперечную чёрную пустоту с рваным оранжевым краем; подпись для различения не нужна.

Все четыре холста демона остались 160×160, значок — 24×24. Числа ниже — размеры ненулевой альфы, не размер холста.

| Файл | Рисунок до | Рисунок после | bbox после, правый/нижний край исключён |
|---|---:|---:|---|
| hang_00 | 66×124 | 117×124 | [35,21,152,145] |
| hang_01 | 66×124 | 117×124 | [35,21,152,145] |
| hang_02 | 77×125 | 121×125 | [35,20,156,145] |
| hang_03 | 71×123 | 103×125 | [35,20,138,145] |
| icon_gap | 24×17 | 22×22 | [1,1,23,23] |

У всех пяти файлов альфа только **0 и 255**. Цвета приведены к 32-цветной палитре STYLE. Два idle-кадра различаются, не являются дубликатами.

`node tools/check.mjs --tests` — **код 0, стена 10,046 с, 241/241 тест**, вызван через `C:\Program Files\nodejs\node.exe`. Проверка размеров, bbox и альфы — `validation.json`. Проверены именно файлы и арт-листы; живой кадр игры этим отчётом не заявляется.

## Точные запросы

Те же строки сохранены машинно в `hang_gap_prompts_v1.json`.

### Демон

```text
Use case: precise-object-edit. Create a production four-frame sprite sheet correcting the four hang frames of the original furnace masonry demon in the reference. Reference image top-left perch and top-middle strike are the identity/material/proportion targets; other four thin hang images are POSE references only, do not preserve their thin anatomy.
Output exactly four full-body isolated demons in a clean 2 by 2 grid of equal square cells, with genuine transparent background, no labels or grid. Frame order: top-left hanging breathing idle A; top-right same hanging breathing idle B; bottom-left hanging wind-up; bottom-right hanging strike. Each cell represents a 160x160 game canvas. Native coarse pixel art, enlarged if necessary but keep large sharp pixel clusters. Each character occupies about x=35..148 and y=22..146 in its cell. Feet end at y=145 consistently. Left gripping claw around x=40,y=56 must remain fixed in every frame, gripping an INVISIBLE cabin on the left. No cabin, train, wall, floor, background, cast shadow, letters, labels, weapon or extra object.
CRITICAL redesign: broad heavy shoulders, wide barrel chest, thick masonry biceps and huge thick forearms, chunky bent legs, heavy wide rectangular head, two swept-back tapered brick horns, three curved charcoal claws per hand. Body turned toward viewer, massively built like the perch and strike references, NOT sideways thin, NOT stretched image. Occupied body width at least 110 of 160 pixels. Soot brown and rust brick plates, coal-black joints, orange eyes and one angular orange Y-shaped sternum fissure. Short heavy jaw with black recessed mouth. The horns, head size, shoulder mass, arm thickness and drawing style must match reference identity. Dark plum-black contour, three flat color planes per material, crisp stepped pixel edges, no blur, smooth shading or bloom.
All four frames share the same torso/head/feet location and dimensions, head centered around x=90,y=56; shoulders from x=55..129. Left arm holds firmly outward to the left. Idle A right arm bent downward on image right with huge hooked claws; idle B is almost identical with 1 pixel chest breathing. Wind-up raises ONLY the free right arm on image right preparing to hit the cabin; strike bends the free right arm across the lower chest toward image left. Do not move entire body between frames. No overhead extra arm, no duplicated limbs. Original game character, faithful to supplied game's own sprite references.
```

### Значок

```text
Use case: precise-object-edit. Redraw only the first broken-rail warning icon from the reference strip; the other three icons are style and palette references. Output one isolated icon on transparent background, no sheet, no text or labels. Designed on an EXACT 24 by 24 logical pixel grid and enlarged with nearest-neighbor pixel blocks. No antialias, blur or tiny detailing. Show a single railway track running vertically UP the icon: TWO parallel pale steel rails with dark outlines and broad brown horizontal sleepers beneath them. Clear rail segments ABOVE AND BELOW a jagged horizontal black chasm at the middle. The upper and lower rails align on the same two vertical lines, slightly narrowing upward in perspective, with broken snapped-off jagged ends pointing into the chasm. Upper track occupies rows 2..9, lower track rows 15..22. At least two clearly visible sleepers across both rails in EACH half. The central chasm spans rows 10..14, is solid near-black with an irregular jagged contour and a thin rusty red/orange broken earth edge. This is a railway cut by a gap, instantly readable at 24x24. Use large simple chunky pixels matching the supplied lava, demon and rubble HUD icons: dark plum-black contour #0b0a10, rusty brown sleepers #7a4a3a and #b07a58, steel rails #6c7880 and #d0d8d4, small warm orange #f0601a broken edges. Opaque black chasm, transparent surrounding margin. No lava river, bridge supports, train, warning triangle, border panel or background. Do not rotate the rails horizontally; the railway runs from bottom to top, cut across its width.
```

