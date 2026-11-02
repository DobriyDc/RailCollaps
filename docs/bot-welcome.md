# Приветствие бота

Человек видит бота в два шага.

1. **До кнопки запуска.** Telegram сам показывает карточку: картинку и описание из BotFather. Сервер для этого не нужен.
2. **После нажатия.** Бот отвечает на `/start` картинкой, текстом и кнопкой «Играть». Для этого нужна функция на Cloudflare: код готов и проверен тестами, но пока не развёрнут.

Обе картинки вырезаны из утверждённого ключевого кадра `art_src/keyframes_v1/01_furnace_390x844.png`: это не новый рисунок. На нём паровоз из эталона, он отличается от игрового спрайта.

## Шаг 1. Карточка в BotFather

Настраивает владелец в чате с `@BotFather`, команда `/mybots`, нужный бот, **Edit Bot**. Токен для этого не нужен.

**Description picture:** `server/leaderboard/description.png`, 640×360.

**Description:**

```text
Тоннель рушится за спиной, впереди лава, провалы и демоны. Стреляй по рычагам, меняй путь и уходи от обвала как можно дальше.

Один тап — одно решение. Рейс длится около минуты.

Поезд уже под парами. Жми кнопку внизу.
```

**About:**

```text
Аркада про паровоз в рушащемся тоннеле. Рейс на минуту, рекорд в метрах.
```

**Privacy Policy:** `https://dobriydc.github.io/RailCollaps/privacy.html`. Перед включением рекламы и покупок страницу надо обновить.

В BotFather хранятся тексты для всех языков по умолчанию, там стоит английский вариант:

```text
The tunnel is falling behind you. Ahead lie lava, gaps and demons. Shoot the levers, switch tracks and outrun the collapse as far as you can.

One tap, one decision. A trip takes about a minute.

The engine is under steam. Press the button below.
```

```text
An arcade about a steam engine in a falling tunnel. A one-minute trip, a record in meters.
```

Русскую карточку, имя и кнопку меню ставит одна команда. Она спросит токен, не покажет его и нигде не сохранит:

```bash
node D:/Railgramm/collapse/tools/bot-setup.mjs
```

У кнопки меню нет языковых версий: текст один на всех. Поэтому команда ставит значок `▶`. После деплоя функция сама подписывает кнопку при запуске бота: `▶ Играть` на русском Telegram и `▶ Play` на остальных.

## Шаг 2. Ответ на `/start`

Текст и кнопка лежат в `server/leaderboard/src/index.js`, картинка — `server/leaderboard/welcome.png`. Язык берётся из Telegram: русский для `ru`, английский для остальных.

```text
Машинист, на пост.

Тоннель рушится за спиной, впереди лава, провалы и демоны. Тормозить нельзя.

• Стреляй по рычагам и переводи стрелки
• Сбивай демонов, пока они не разнесли кабину
• Уходи от обвала как можно дальше

Рейс длится около минуты. Сколько метров продержишься?
```

```text
Engineer, to your post.

The tunnel is falling behind you. Ahead lie lava, gaps and demons. There is no stopping.

• Shoot the levers to switch tracks
• Gun down demons before they wreck the cab
• Outrun the collapse as far as you can

A trip takes about a minute. How many meters can you last?
```

Что нужно для запуска: развёрнутая функция (карточка 23) и шаги из раздела «Приветствие бота» в `server/leaderboard/README.md`. Картинка должна лежать на Pages, поэтому изменения сначала попадают в `main`.

Бот для проверки — `@railcollapsebot`. Боевой бот настраивается так же перед релизом.
