# Таблица лидеров: функция на Cloudflare

Одна функция Cloudflare Worker с базой D1. Токен бота лежит только в секретах Cloudflare, в репозитории
его нет. Функция проверяет подпись Telegram, сама переигрывает забег теми же правилами, что и игра, и
хранит лучший результат игрока за сезон. Сезон — это `COLLAPSE_RULES_VERSION` из `js/Constants.js`.

| Запрос | Что делает |
|---|---|
| `POST /score` | `{ rules, seed, meters, log }`: проверяет и записывает, отвечает `{ season, meters, best, place }` |
| `GET /top` | топ-100 сезона и место игрока: `{ season, rows, me }` |
| `POST /invoice` | `{ item, lang }`: ссылка на счёт в звёздах за поезд, отвечает `{ link }` |
| `GET /inventory` | купленные поезда игрока: `{ items }` |
| `POST /bot` | сообщения Telegram для бота: `/start`, `/terms`, `/paysupport`, подтверждение и запись оплаты, возврат |
| `POST /crazygames/score` | `{ rules, seed, meters, log }` игрока CrazyGames: проверяет и передаёт метры в таблицу CrazyGames, отвечает `{ meters }` |

Запросы таблицы — с заголовком `Authorization: tma <initData>` и только с сайта `https://dobriydc.github.io`.
Запрос CrazyGames — с заголовком `Authorization: cg <токен аккаунта CrazyGames>` и только с их домена
(`https://….crazygames.com`).

## Деплой

Нужны Node и аккаунт Cloudflare. Команды — в терминале из папки `server\leaderboard`. Первая команда
`npx wrangler` скачает wrangler. Токен вводишь только ты, в свой терминал; никому его не передавай.

1. Вход в Cloudflare, откроется браузер:

   ```
   npx wrangler login
   ```

   Адрес функции не открывает продажи: их включает `COLLAPSE_SHOP_OPEN` (`docs/monetization.md`).

2. База. Команда напечатает `database_id`:

   ```
   npx wrangler d1 create collapse-leaderboard
   ```

   Скопируй `wrangler.toml` в `wrangler.local.toml` и впиши `database_id` туда: этот файл не едет в
   репозиторий. Дальше все команды с ним: `npx wrangler <команда> -c wrangler.local.toml`.

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

## Приветствие бота

Функция отвечает на `/start` картинкой, текстом и кнопкой «Играть». Тексты и настройка в BotFather: `docs/bot-welcome.md`. Токен вводишь только ты, в свой терминал.

1. Придумай длинный случайный секрет и сохрани его в Cloudflare. Команда спросит значение и не покажет его на экране:

   ```
   npx wrangler secret put BOT_WEBHOOK_SECRET
   ```

2. Скажи Telegram, куда слать сообщения. Подставь адрес функции, тот же секрет и токен бота:

   ```
   curl.exe -F "url=https://АДРЕС/bot" -F "secret_token=СЕКРЕТ" -F "allowed_updates=[\"message\",\"pre_checkout_query\"]" https://api.telegram.org/botТОКЕН/setWebhook
   ```

   В ответе должно быть `"ok":true`. Строка попадёт в историю терминала: после настройки очисти её.

3. Проверка: удали чат с ботом, открой его заново, нажми запуск.

Запрос к `/bot` без верного секрета получает `403`. Без `BOT_WEBHOOK_SECRET` в Cloudflare `/bot` отвечает `404`, таблица при этом работает.

## Магазин

Правила и порядок запуска: `docs/monetization.md`. Если база создана раньше магазина, добавь таблицу покупок той же командой, что и при первом деплое: она не трогает существующие данные.

```
npx wrangler d1 execute collapse-leaderboard --remote --file=schema.sql
```

Webhook должен получать `pre_checkout_query`: без него Telegram отменит оплату через 10 секунд.

Возврат: найди `charge_id` покупки и верни звёзды. Telegram сообщит о возврате боту, и поезд исчезнет у игрока сам.

```
npx wrangler d1 execute collapse-leaderboard --remote --command "SELECT * FROM purchases WHERE user_id = ID"
curl.exe -F "user_id=ID" -F "telegram_payment_charge_id=CHARGE_ID" https://api.telegram.org/botТОКЕН/refundStarPayment
```

Поезда для теста без оплаты: строка в `purchases` с `charge_id = 'gift'` и нулём звёзд. Игра видит её как покупку при следующем открытии магазина. Номер игрока в Telegram (ID) можно найти по его донату: `SELECT user_id, stars, datetime(at, 'unixepoch') FROM donations`.

```
npx --yes wrangler@4.156.0 d1 execute collapse-leaderboard --remote -c wrangler.local.toml --command "INSERT OR IGNORE INTO purchases (user_id, item, charge_id, stars, at) VALUES (ID, 'hell', 'gift', 0, CAST(strftime('%s','now') AS INTEGER)), (ID, 'rune', 'gift', 0, CAST(strftime('%s','now') AS INTEGER)), (ID, 'bio', 'gift', 0, CAST(strftime('%s','now') AS INTEGER))"
npx --yes wrangler@4.156.0 d1 execute collapse-leaderboard --remote -c wrangler.local.toml --command "DELETE FROM purchases WHERE charge_id = 'gift' AND user_id = ID"
```

Первая команда выдаёт три поезда, вторая забирает их. Подарок не уходит в Telegram, поэтому вернуть по нему нечего.

## Таблица CrazyGames

На CrazyGames таблицу ведёт сам портал: недельные сезоны (с понедельника 09:00 UTC), кубки, витрины на
сайте. Свою таблицу игра там не показывает. Игрок, вошедший в аккаунт CrazyGames, после рейса шлёт
функции запись рейса и токен аккаунта; функция проверяет токен ключами CrazyGames, переигрывает рейс и
передаёт метры в их таблицу ключом API. Игра шлёт только лучший рейс игрока за неделю. Гости в таблицу
не попадают: она знает только аккаунты.

Таблицы CrazyGames — только для игр, которые они пригласили. Пока приглашения нет, всё выключено
(`LEADERBOARD_CRAZYGAMES = 0`).

1. Попроси CrazyGames включить таблицу для игры. Когда в кабинете разработчика появится вкладка
   Leaderboard, заполни её:
   - Leaderboard Guide: `Outrun the collapse: most meters wins`;
   - Metric Type: `POINTS`; Incremental Scoring: нет; Score Sorting: `DESC` (больше — лучше);
   - Min Allowed Score: `1`, Max Allowed Score: `100000`;
   - API Key: нажми «сгенерировать» и скопируй. Encryption Key не нужен: очки шлёт функция, не игра.
2. Ключ API в секреты функции, команда спросит значение и не покажет его:

   ```
   npx wrangler secret put CRAZYGAMES_API_KEY
   ```

3. Выложи функцию: `npx wrangler deploy`.
4. В `js/Constants.js` поставь `const LEADERBOARD_CRAZYGAMES = 1;`, затем `node tools/check.mjs --tests`,
   `node tools/build.mjs` и загрузи новый архив на CrazyGames.
5. Приёмка: войди в аккаунт CrazyGames в превью их кабинета, пройди рейс и открой их таблицу.
   В логах функции (`npx wrangler tail`) — `POST /crazygames/score` с ответом `200`.

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
| 400 | `bad_item` | такого поезда нет в продаже |
| 409 | `owned` | поезд уже куплен |
| 413 | `too_large` | тело больше `LEADERBOARD_MAX_BODY` |
| 422 | `bad_replay`, `meters_mismatch` | журнал не сходится с правилами, метры не сходятся с реплеем |
| 429 | `rate_limited` | больше `LEADERBOARD_RATE_MAX` запросов за окно |
| 502 | `no_invoice` | Telegram не выдал счёт |
| 401 | `no_auth`, `bad_auth`, `expired` | (CrazyGames) нет токена, подпись не их ключом, токен старше часа |
| 403 | `bad_origin` | (CrazyGames) запрос не с домена `crazygames.com` |
| 500 | `not_configured` | (CrazyGames) нет секрета `CRAZYGAMES_API_KEY` |
| 502 | `crazygames_<причина>` | (CrazyGames) их таблица не приняла: `no-active-season`, `user-not-found`, `privacy-disabled`… |
| 503 | `no_keys` | (CrazyGames) не удалось получить их ключи подписи |

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
  `rate` — id и счётчик запросов за текущее окно (у игроков CrazyGames — отрицательное число из хэша их id,
  сам id не хранится); в таблице `purchases` — id, поезд, номер платежа, сумма и дата.
- `server/` не едет в архив игры (`BUILD_EXCLUDE` в `tools/asset-scan.mjs`).
- Пробы — `tests/leaderboard.test.mjs`: настоящая сборка функции поверх настоящего SQLite в памяти.
