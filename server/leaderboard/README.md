# Таблица лидеров: функция на Cloudflare

Одна функция Cloudflare Worker с базой D1. Токен бота лежит только в секретах Cloudflare, в репозитории
его нет. Функция проверяет подпись Telegram, сама переигрывает забег теми же правилами, что и игра, и
хранит лучший результат игрока за сезон. Сезон — это `COLLAPSE_RULES_VERSION` из `js/Constants.js`.

| Запрос | Что делает |
|---|---|
| `POST /score` | `{ rules, seed, meters, log }`: проверяет и записывает, отвечает `{ season, meters, best, place }` |
| `GET /top` | топ-100 сезона и место игрока: `{ season, rows, me }` |

Оба запроса — с заголовком `Authorization: tma <initData>` и только с сайта `https://dobriydc.github.io`.

## Деплой

Нужны Node и аккаунт Cloudflare. Команды — в терминале из папки `server\leaderboard`. Первая команда
`npx wrangler` скачает wrangler. Токен вводишь только ты, в свой терминал; никому его не передавай.

1. Вход в Cloudflare, откроется браузер:

   ```
   npx wrangler login
   ```

2. База. Команда напечатает `database_id`:

   ```
   npx wrangler d1 create collapse-leaderboard
   ```

   Вставь его в `wrangler.toml` вместо `REPLACE_WITH_D1_DATABASE_ID`. Этот id не секрет, но
   привязан к твоему аккаунту: не коммить его, если не хочешь.

3. Таблицы в базе:

   ```
   npx wrangler d1 execute collapse-leaderboard --remote --file=schema.sql
   ```

4. Сборка и выкладка. Команда напечатает адрес вида `https://collapse-leaderboard.<имя>.workers.dev`:

   ```
   node ..\..\tools\build-worker.mjs
   npx wrangler deploy
   ```

5. Токен бота. Команда спросит значение и не покажет его на экране:

   ```
   npx wrangler secret put BOT_TOKEN
   ```

6. Проверка, подставь свой адрес:

   ```
   curl.exe -i https://АДРЕС/top
   curl.exe -i -H "Origin: https://dobriydc.github.io" https://АДРЕС/top
   ```

   Первая должна дать `403` и `bad_origin`, вторая — `401` и `no_auth`. Ответ `500` и
   `not_configured` значит, что не задан секрет или не подключена база.

7. Адрес в игру. В `js/Constants.js` впиши адрес без косой черты на конце:

   ```js
   const LEADERBOARD_URL = 'https://collapse-leaderboard.<имя>.workers.dev';
   ```

   Затем `node tools/check.mjs --tests`, `node tools/build.mjs` и обычная публикация игры.

8. Приёмка: два аккаунта Telegram проходят по забегу и видят друг друга в таблице. Кнопка
   «Таблица лидеров» появляется в диалогах игры только внутри Telegram: в браузере подписи нет.

## Когда меняются правила

Правила и числа забега встроены в функцию при сборке, новая версия игры без нового деплоя получит отказы.

1. Подними `COLLAPSE_RULES_VERSION`, тест `tests/leaderboard.test.mjs` подскажет новый отпечаток.
2. Сначала выложи функцию (`npx wrangler deploy`), потом игру.

Новая версия — новый сезон: таблица начинается пустой, старые записи остаются в базе. Пока у игрока
открыта старая версия игры, её результаты отклоняются (`rules_version`), игра при этом работает.

То же про числа `LEADERBOARD_*` на стороне функции: они применяются после нового деплоя.

## Ответы с отказом

| Код | `error` | Причина |
|---|---|---|
| 400 | `bad_request` | тело не похоже на результат забега |
| 401 | `no_auth`, `bad_auth`, `expired` | нет подписи, чужая подпись, `initData` старше `LEADERBOARD_AUTH_MAX_SEC` |
| 403 | `bad_origin` | запрос не с `https://dobriydc.github.io` |
| 409 | `rules_version` | другая версия правил |
| 413 | `too_large` | тело больше `LEADERBOARD_MAX_BODY` |
| 422 | `bad_replay`, `meters_mismatch` | журнал не сходится с правилами, метры не сходятся с реплеем |
| 429 | `rate_limited` | больше `LEADERBOARD_RATE_MAX` запросов за окно |

## Если упирается в лимит

На бесплатном тарифе Workers дают 10 мс процессора на запрос, разовые превышения терпимы, постоянные
заканчиваются ошибкой 1102. Самый длинный забег из 200 забегов бота (9,9 км, 289 с) на настольном
процессоре занимает 15–16 мс в холодном запуске и 4–5 мс в прогретом. На Cloudflare это не мерилось.

Смотри живые логи: `npx wrangler tail`. Если там `exceededCpu` на обычных забегах, нужен платный тариф
Workers: там предел 30 с. Результат, на котором функция упала, просто не попадает в таблицу, игрок
этого не видит и игра не страдает.

## Как это устроено

- `src/index.js` — функция. Правил в ней нет: `tools/build-worker.mjs` собирает `dist/worker.js` из
  чисел `js/Constants.js`, всего `js/CollapseRules.js` и этого файла. `dist/` не в репозитории,
  wrangler сам пересобирает её перед каждым деплоем.
- `schema.sql` — таблицы. В базе только id Telegram, имя для показа, метры, сезон и дата; в таблице
  `rate` — id и счётчик запросов за текущее окно.
- `server/` не едет в архив игры (`BUILD_EXCLUDE` в `tools/asset-scan.mjs`).
- Пробы — `tests/leaderboard.test.mjs`: настоящая сборка функции поверх настоящего SQLite в памяти.
