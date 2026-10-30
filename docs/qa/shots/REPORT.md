# Кадры на телефонных размерах: `tools/qa-shots.mjs` (2026-10-30)

Команда: `node tools/qa-shots.mjs --name=start` (свой dev-сервер на свободном порту, headless Edge,
`Emulation.setDeviceMetricsOverride`, ожидание 3000 мс). Код выхода 0.

| кадр | заказано | innerWidth × innerHeight | DPR | ошибок консоли |
|---|---|---|---|---|
| [start-360x640.png](start-360x640.png) | 360×640 | **360 × 640** | 1 | 0 |
| [start-390x844.png](start-390x844.png) | 390×844 | **390 × 844** | 1 | 0 |

Было (дымовая проверка, `--window-size=360,640`): innerWidth 496, innerHeight 547, раскладка резалась
справа. На обоих кадрах HUD целиком (дистанция, рекорд, патроны, спасение, щит, пауза), поезд и
панель старта по центру.
