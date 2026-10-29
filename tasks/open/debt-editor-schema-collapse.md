зона: engine (`_utils/editor/schema.js`)
майка: S

# Числа забега в редакторе

Константы `COLLAPSE_*` из `js/Constants.js` не имеют строк в `_utils/editor/schema.js` — Продюсер не
может подкрутить скорость, обвал, патроны и окна прямо в редакторе (вкладка Global Settings), а
плейтест-балансу это нужно. Найдено воркером 01–03.

## DoD
- Группа «Rail Link: Collapse» в схеме: каждая `COLLAPSE_*` с min/max/step и подписями en/ru по
  правилам скилла `claude/skills/editor/SKILL.md`.

## Критерии приёмки
- Наблюдаемо: `editor.bat` → Global Settings → группа Collapse, правка числа сохраняется в
  `Constants.js` и видна в игре после F5.

## Критерии тестирования
- `node tools/check.mjs --tests` — код 0.
