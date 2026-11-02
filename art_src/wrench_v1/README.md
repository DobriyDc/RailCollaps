# Гаечный ключ — спасение, v1

Три прежних ассета заменены оригинальным стальным ключом с открытым зевом, по диагонали снизу слева вверх направо. Правила предмета не менялись.

Рисовал встроенный image_gen: объёмный исходник `source_track.png`, первый пиксельный вариант `source_ui.png`, утолщённый финальный `source_ui_final.png`. Размеры, палитра, альфа и сравнение подготовлены Python 3.12 / Pillow. Первый UI-вариант отвергнут: рукоять слишком тонкая в настоящем размере.

UI-исходник обрезан по альфе >127: (273,259,1104,1046), дополнен до квадрата 831×831, уменьшен nearest до 16×16 и помещён в (5,3) холста 24×24. Палитра стали: #0b0a10, #2a3038, #465058, #6c7880, #9aa8ac, #d0d8d4, #e8d0a8; порог альфы 128. Оба значка содержат один и тот же растр ключа. Внутренность рамки очищена до #17121b, сама рамка сохранена пиксель в пиксель. Объёмный исходник обрезан по альфе, уменьшен Lanczos до 56×56 и помещён в (1,20) холста 58×96; мягкая альфа сохранена по прямой задаче.

`compare.png`: старое / новое / щит на #14121a, UI ×6, предметы ×3, nearest; снизу настоящий размер. `actual_size.png` — отдельный просмотр 1:1 рядом со щитом без подписей. Зев и рукоять читаются как ключ. Предмет на путях ниже прежнего круга по высоте: диагональ 45° вписана в ширину 58 px без искажения пропорций.

## Проверки

| Файл | Размер | Байт | Видимых RGB-цветов | Альфа | Полупрозрачных пикселей |
|---|---|---:|---:|---|---:|
| `assets/ui/hud_v3/icon_rescue.png` | 24×24 | 334 | 7 | 0, 255 | 0 |
| `assets/ui/hud_v3/pickup_rescue.png` | 24×24 | 449 | 8 | 0, 255 | 0 |
| `assets/px/pickups/rescue.png` | 58×96 | 4244 | 874 | 134 значения, от 0 до 255 | 953 |

Размеры совпадают с предыдущими. Рамка: изменено 0 пикселей. UI: один и тот же силуэт и цвета. `node tools/check.mjs --tests` — код 0, стена 7,37 с, 241/241 тест. Читаемость проверена по растрам 1:1, не по снимку запущенной игры. Манифест: `wrench_manifest_v1.json`.

## Точные запросы image_gen

### Предмет на путях

```text
Use case: precise-object-edit. Create an original game pickup sprite replacing the lifebuoy and anchor entirely with ONE heavy forged steel open-ended wrench. Input image 1 is the rescue pickup to replace; input image 2 is the shield pickup as material/style reference. Transparent background, isolated object only, no backdrop or shadow plane. Wrench handle points bottom left, open jaw points top right: exactly 45 degrees diagonal. A broad unmistakable open U-shaped angular jaw with TWO equally substantial jaws and a wide deep transparent opening, long thick straight handle with rounded solid closed butt; no ring at the butt. Steel silver front face, dark iron beveled thickness, restrained warm brass inset on handle and warm edge highlights. Match chunky volumetric painted game-icon rendering, high contrast heavy silhouette, slightly worn metal, full color and softly antialiased edge like the original pickup. Object is nearly frontal with visible bevel depth; no foreshortening. No lifebuoy, no anchor, no hook, no chain, no ropes, no extra objects, no text, no logo, no watermark, no glow. Compose centered in a square transparent canvas with small margins; readable at 58 pixels wide.
```

### Первый UI-вариант

```text
Use case: precise-object-edit. Replace the hook symbol in input image 1 with an original pixel art heavy steel OPEN-END WRENCH icon. Input image 2 (shield) is the exact low resolution chunky pixel art style and palette reference. One wrench only, centered, no frame. True transparent background. Design as an EXACT 24 by 24 pixel icon, enlarged using nearest neighbor only if needed: each pixel block identical size on a 24x24 grid, no antialiasing, no gradients, no noise or tiny details. The wrench extends diagonally from bottom-left solid rounded handle butt to top-right open jaw at exactly 45 degrees. Occupy about 18x18 pixels within the 24x24 canvas, keep blank margins. The wide angular U-shaped wrench head has TWO sturdy equal jaws with a broad 3-pixel-wide deep open notch toward top right. Long straight thick handle. Outer contour near black #0b0a10, dark steel #2a3038, medium steel #465058 and #6c7880, light steel #9aa8ac and #d0d8d4, a restrained warm highlight #e8d0a8 on the handle. Hard flat shading, dark outline, minimal interior details. No hole or ring at handle butt. No hook, no anchor, no rope, no lifebuoy, no text, no logo, no border, no glow. Silhouette immediately readable at 24 pixels beside the shield.
```

### Утолщение UI-варианта

```text
Use case: precise-object-edit. Redraw this wrench as a MUCH CHUNKIER low-resolution HUD icon. Current handle is too thin to read at 24 pixels. Transparent background. Pixel art, flat hard-edged limited palette. Design a short HEAVY open-end steel wrench pointing diagonally from lower left to upper right at 45 degrees. Broad head with TWO big equally thick jaws and a wide deep open U notch toward upper right. Handle should be HALF the total object length and nearly HALF the head width, a thick solid rounded rectangular shaft with solid closed butt. No hole. When the WHOLE silhouette is resized to 18x18 pixels, the handle MUST remain 4 pixels wide, each jaw 3 pixels thick, open notch at least 3 pixels wide. The head comprises the upper half of the silhouette, handle the lower half. Center inside transparent canvas with small clear margins. Thick dark charcoal outline #0b0a10, stepped flat steel shades #2a3038 #465058 #6c7880 #9aa8ac #d0d8d4, small warm #e8d0a8 highlight. Large simple color areas, readable robust shape, no fine detail, no texture, no soft edges, no gradients, no glow, no ring, no anchor, no hook, no text, no border. Keep the open-ended wrench unmistakable and make its handle four times thicker than the reference.
```
