зона: tools (`tools/qa-shots.mjs`, `docs/qa/`)
майка: S

# Кадры QA на телефонных размерах без браузера координатора

Headless Edge на Windows не сужает окно меньше 496 px: при `--window-size=360,640` страница видит
`innerWidth=496, innerHeight=547`, кадр режет раскладку справа (дымовая проверка 2026-10-30,
`docs/qa/evidence/kimi-smoke/REPORT.md`). QA без панели браузера Claude не может честно снять
360×640 и 390×844.

Нужно: `tools/qa-shots.mjs` — без зависимостей (Node 26: встроенный `WebSocket` к
`--remote-debugging-port` headless Edge, `Emulation.setDeviceMetricsOverride`), снимает игру
на заданных размерах и пишет PNG + `innerWidth/innerHeight` и ошибки консоли в JSON рядом.

## DoD
- Скрипт и строка о нём в `claude/skills/build/SKILL.md` (английский).

## Критерии приёмки
- 360×640 и 390×844: в JSON `innerWidth/innerHeight` равны заказанным; на кадрах HUD целиком,
  поезд и панель старта по центру.

## Критерии тестирования
- `node tools/check.mjs --tests` — код 0.
