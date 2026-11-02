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

Запросы таблицы — с заголовком `Authorization: tma <initData>` и только с сайта `https://dobriydc.github.io`.

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
  `rate` — id и счётчик запросов за текущее окно; в таблице `purchases` — id, поезд, номер платежа,
  сумма и дата.
- `server/` не едет в архив игры (`BUILD_EXCLUDE` в `tools/asset-scan.mjs`).
- Пробы — `tests/leaderboard.test.mjs`: настоящая сборка функции поверх настоящего SQLite в памяти.
