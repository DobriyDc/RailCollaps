# Демон на кабине и разрыв пути — v1

Актуальная переделка виса — раздел **v2** в конце файла; исходные сведения v1 ниже сохранены для истории.

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

## v2 — вис с обеими ступнями на борту (2026-11-02)

**Демон висит на кабине: обе ступни прижаты к левому борту, под ногами нет опоры на землю.** Верхняя масса первой переделки сохранена: голова, рога, грудь и толстые руки. Корпус отклонён вправо от трёх точек опоры. В `hang_00/01` остаётся небольшое движение фактуры/дыхания, `hang_02` поднимает свободную руку, `hang_03` бьёт когтями влево, в кабину. Положение ног и хвата не меняется.

Изменены только четыре игровых PNG. `icon_gap.png` не менялся. Это продолжение существующего пакета; по ограничению задачи новые отдельные JSON и генератор в коммит не добавлены — метаданные и точные запросы v2 находятся в этом разделе. **Существующий `prepare.py` воспроизводит только v1 и откатит эти четыре кадра, если его запустить.** Старые `*_v1.json` и `validation.json` относятся к первой переделке.

### Изготовление и просмотр

Встроенный **image_gen**, два запроса с `transparent_background=true`: сначала ноги в упоре, затем свободная рука в ударе. Pillow использован для нарезки сгенерированных частей, привязки их к принятому корпусу, nearest-масштаба, палитры STYLE, бинарной альфы и сборки листа. Ноги сведены в общий неподвижный слой; хват закреплён около игрового pivot **(43,56)**.

`compare_demon_v2.png` — 1920×1170, фон **#14121a**, все спрайты **×2 nearest**. Первый ряд — четыре кадра первой переделки, второй — новые; справа в обоих рядах неизменённые `perch_00` и `strike_00`. Внизу три подписанных увеличения ×2: исходный `scene_v1.png`, монтаж нового правого демона на этот снимок, настоящий снимок игры с **одним** новым демоном. В монтаже участок [242,157,386,322) взят из нового игрового снимка при той же позиции кабины; исходный `scene_v1.png` сохранён без изменения.

Новый игровой снимок получен штатным `tools/qa-shots.mjs` через headless Edge: 390×844, ошибок страницы **0**, код **0**. Для проверки состояния в памяти задан один демон справа с `on:true, strike:0.6`, позиция поезда 3.9, обвал далеко позади; файлы правил и сцены не изменялись. Снимок и монтаж просмотрены глазами: обе ступни касаются борта над правой фарой, колени подняты, массивный корпус вынесен наружу, под ногами остаётся воздух.

### Числа и метаданные v2

Все bbox ниже полуоткрытые: правый и нижний край исключены. Холсты **160×160 RGBA**, альфа у каждого **{0,255}**, все непрозрачные цвета — из STYLE.

| Файл | Ширина v1 → v2 | bbox v2 | Непрозрачных пикселей |
|---|---:|---|---:|
| hang_00.png | 117 → 117 | [35,21,152,140] | 6884 |
| hang_01.png | 117 → 117 | [35,21,152,140] | 6880 |
| hang_02.png | 121 → 121 | [35,20,156,140] | 6880 |
| hang_03.png | 103 → 105 | [35,21,140,140] | 6900 |

- Минимальная ширина **105 px**, запас к требованию 100 — **5 px**.
- Верхняя ступня в контрольной области x<60: **[40,98,60,118)**; нижняя: **[40,119,60,140)**. Контакт слева — **x=40**, нижний непрозрачный пиксель ступней — **y=139**, на **6 px выше y=145**.
- Общая область ног **[35,98,122,142)** совпадает побайтно во всех четырёх кадрах: **0 различающихся пикселей**.
- Область верхнего хвата **[34,49,75,74)** совпадает побайтно: **0 различающихся пикселей**; pivot остаётся **(43,56)**.
- Idle A/B различаются в **1124 RGBA-пикселях**, преимущественно фактурой и световыми плоскостями; непрозрачная площадь отличается лишь на **4 px**. Это не дубликаты.
- В строках y≥145 нет ни одного непрозрачного пикселя у любого кадра.

Проверка выполнена Pillow по финальным игровым файлам: размер, bbox, минимальная ширина, набор альфы, пустота под ступнями, побайтовое совпадение областей ног и хвата. Дополнительно сверены палитра и отсутствие изменений значка.

### Точные запросы v2

Первый запрос; вход — `assets/sprites/demon_v3/hang_00.png` первой переделки:

```text
Use case: precise-object-edit. Edit the supplied original game's masonry demon sprite, keep EXACTLY its upper-body identity, scale, massive shoulder width, thick arms, brick horns, angular orange Y-shaped lava sternum fissure, short brick head and charcoal steel claws. Primary request: he must be HANGING on a train side to his LEFT, both feet pressed against that invisible vertical train, never standing or running. Output ONE full-body sprite on a genuinely transparent square canvas. Reference represents a 160x160 logical pixel canvas. Keep the upper body in its reference position, horns around x90..118,y21..50, left gripping hand around x40,y56, shoulders x65..130, heavy torso x80..120,y65..102. Right free arm hangs heavy near x140,y95. CRITICAL replace BOTH dangling legs below the hips with thick bent braced legs: pelvis around x103,y99; two bent knees sticking OUT RIGHT around x112,y111 and x119,y124, two shins run diagonally back LEFT from those knees toward the train. BOTH FEET face LEFT and press their SOLES against the same invisible VERTICAL train side at x40..49. Upper foot spans x39..59,y101..117; lower foot spans x39..59,y123..139. Distinct two legs with a clear narrow transparent gap between them, coarse dark outlines. Thus feet sit far LEFT of the hips, not beneath the torso: a suspended rock climber leaning far back RIGHT from the wall. Preserve all upper-body mass; do not shrink or thin him. No vertical legs, no legs reaching down under the body, no standing toes on ground. Brick feet with charcoal claws have near-vertical soles facing left. Match native coarse pixel art, three flat masonry planes in rust brown and soot, stepped hard highlights, crisp chunky clusters and dark plum outlines. No smooth gradients or blur. Train, wall, ground, shadow, labels, text, guide lines, extra limbs all absent. Transparent lower area below y140. Enlarge nearest-neighbor if needed but keep exact square coordinate proportions.
```

Второй запрос; вход — промежуточный `hang_00` с уже привязанными ногами:

```text
Use case: precise-object-edit. This is frame 03 of a four-frame game animation. Change ONLY the FREE right arm (the arm on image right), from hanging down to striking the invisible train to the LEFT. Preserve the demon's head, horns, massive chest, shoulders, left gripping arm at x40,y56 and BOTH braced feet at x40,y108 and x40,y131 EXACTLY unchanged and in same location. Keep square transparent 160x160 logical pixel canvas proportions, use sharp enlarged pixel clusters. The free arm starts at shoulder x123,y64, elbow bends at x130,y83, thick forearm reaches horizontally LEFT across the lower chest toward wrist x75,y85, huge three charcoal claws hit at x40..60,y86..96. Arm passes in FRONT of the chest. Claws point left, not down. Both feet remain fully visible under this arm and pressed to the invisible train at image left. No train, ground, shadows, background, motion streaks, labels or extra limbs. Original rust-brown masonry demon, same pixel art, orange eyes, lava crack, large heavy proportions. Do not change the rest of the pose. Genuine transparent background.
```

Финальные ворота: `node tools/check.mjs --tests` — **код 0, стена 6,423 с, 241/241 тест** (Node `C:\Program Files\nodejs\node.exe`).
