зона: logic + ui (`js/CollapseStationRules.js`, `js/CollapseStations.js`, `js/Game.js`, `js/Constants.js`, `js/Lang.js`, `js/UILayout.js`, `js/UILand.js`, `tools/build-worker.mjs`, `server/leaderboard/src/index.js`, `tests/`)
майка: L

Сделано 2026-11-02: станции подключены, рейс всегда со станциями, правила v7, цены подобраны ботом. Отчёт: `docs/qa/stations/REPORT.md`. Не достигнуто: +30 % рейса с лавкой только у сильного игрока. Осталось: деплой функции v7, рисунки (карточка 49), проверка на телефоне.

# Станции как основной режим: пассажиры, жетоны, ремонт (владелец, 2026-11-01)

Полный план и замеры: `docs/release-plan.md`, этапы 1 и 2. Решения владельца там же, заново не обсуждать.

Начато: `js/CollapseStationRules.js` написан и уже содержит правила (первая станция, места, оплата,
хрупкость, ремонт, реплей), но к игре не подключён. Старые правила ещё лежат в `js/CollapseStations.js`.

Нужно:
- из `js/CollapseStations.js` убрать `cfg`, `on`, `CollapseStationTrack`, `CollapseStationRun`, монету `CollapseArt.pickup.money`; оттенки перенести в `CollapseStationView`; `dress` работает всегда, `hud` показывает `stationNext` с числом пассажиров, лавку, итог перегона и разовую подсказку `stationTip` (флаг `collapse.stationTip` в Store ставить при отъезде);
- `index.html`: `js/CollapseStationRules.js` сразу за `js/CollapseRules.js`;
- `tools/build-worker.mjs` берёт оба файла правил, `server/leaderboard/src/index.js` вызывает `CollapseStationRun.replay`;
- `js/Game.js`: `newRun` всегда `CollapseStationRun`, убрать `stationsOn` и запрет рекорда и таблицы; `case 'money'` заменить на `case 'paid'` со звуком `S.coin`;
- `js/Constants.js`: версия правил 7, новые `COLLAPSE_STATION_FIRST`, `SEATS`, `FARE`, `FARE_STEP`, `PRICE_REPAIR`, цены 15/30/45, убрать `MONEY_*`, `LEADERBOARD_MAX_STEPS` 72000 после замера времени реплея; строки в `_utils/editor/schema.js`;
- `js/Lang.js`: `station.repair`, `station.full.repair`, `stationPaid`, `stationTip`, в `stationNext` добавить `{riders}`;
- `js/UILayout.js`, `js/UILand.js`: кнопка `stationRepair` первой, строка `stationPaid`, панель четырёх товаров вмещается на 320×568 с отступом Telegram и в широкой раскладке; `stationMoney*` убрать: рекорд остаётся на верхней панели;
- тесты: переписать `tests/collapse-stations.test.mjs`, отпечаток версии 7 в `tests/leaderboard.test.mjs` с числами станций, `live()` на `CollapseStationRun`, список файлов в `tests/sound-game.test.mjs`.

Рисовать запрещено: все рисунки делает только Астра (карточка 49). Значок ремонта пока `icon_hp_full.png`.
Запрещено: внешние пакеты, деплой, токены, `wrangler`.

## Критерии приёмки
- Первая станция на 1300 м (`COLLAPSE_STATION_FIRST` 130), забег всегда со станциями, рекорд и журнал работают; реплей совпадает до метра, подделанная покупка отклонена.
- Бот на 200 зёрнах, навыки 0,7, 0,85, 0,95: с лавкой забег длиннее минимум на 30 %, на станции хватает на 1–2 товара, ремонт покупают чаще всего. Цены подобраны по этому замеру и записаны в отчёт.

## Критерии тестирования
- `node tools/check.mjs --tests` и `node tools/build.mjs` — код 0.
