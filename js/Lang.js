// Lang.js — all player-facing copy, with Store as the language owner.
/** @satisfies {Record<string, any>} */
const Lang = {
    code: Store.get('collapse.language') === 'en' ? 'en' : 'ru',
    listeners: new Set(),
    words: {
    "title": {
        "ru": "Rail Link: Collapse",
        "en": "Rail Link: Collapse"
    },
    "start": {
        "ru": "Старт",
        "en": "Start"
    },
    "settings": {
        "ru": "Настройки",
        "en": "Settings"
    },
    "shop": {
        "ru": "Магазин",
        "en": "Shop"
    },
    "exit": {
        "ru": "Выход",
        "en": "Exit"
    },
    "modes": {
        "ru": "Выбор режима",
        "en": "Choose a mode"
    },
    "tutorial": {
        "ru": "Обучение · скоро",
        "en": "Tutorial · soon"
    },
    "endless": {
        "ru": "Бесконечный режим",
        "en": "Endless mode"
    },
    "back": {
        "ru": "Назад",
        "en": "Back"
    },
    "music": {
        "ru": "Музыка",
        "en": "Music"
    },
    "sfx": {
        "ru": "Эффекты",
        "en": "Effects"
    },
    "language": {
        "ru": "Язык",
        "en": "Language"
    },
    "ru": {
        "ru": "Русский",
        "en": "Russian"
    },
    "en": {
        "ru": "Английский",
        "en": "English"
    },
    "soon": {
        "ru": "Скоро",
        "en": "Coming soon"
    },
    "shopText": {
        "ru": "Магазин ещё строится.\nЗагляни позже.",
        "en": "The shop is under construction.\nCome back later."
    },
    "menu": {
        "ru": "Главное меню",
        "en": "Main menu"
    },
    "pause": {
        "ru": "Пауза",
        "en": "Paused"
    },
    "pauseText": {
        "ru": "Забег стоит.\nОбвал тоже.",
        "en": "The train is paused.\nSo is the collapse."
    },
    "resume": {
        "ru": "Дальше",
        "en": "Resume"
    },
    "restart": {
        "ru": "Заново",
        "en": "Restart"
    },
    "recordTitle": {
        "ru": "Новый рекорд!",
        "en": "New record!"
    },
    "overTitle": {
        "ru": "Обвал",
        "en": "Collapse"
    },
    "result": {
        "ru": "Пройдено {meters} м.\nРекорд {best} м.",
        "en": "Distance {meters} m.\nBest {best} m."
    },
    "continue": {
        "ru": "Продолжить за рекламу",
        "en": "Continue with an ad"
    },
    "reason.gap": {
        "ru": "Поезд ушёл в провал.",
        "en": "The train fell into a gap."
    },
    "reason.lava": {
        "ru": "Поток лавы накрыл паровоз.",
        "en": "Lava engulfed the train."
    },
    "reason.demon": {
        "ru": "Демон добрался до кабины.",
        "en": "A demon reached the cab."
    },
    "reason.caught": {
        "ru": "Обвал догнал поезд.",
        "en": "The collapse caught the train."
    },
    "meters": {
        "ru": "{value} м",
        "en": "{value} m"
    },
    "best": {
        "ru": "Рекорд {value} м",
        "en": "Best {value} m"
    },
    "ammo": {
        "ru": "Патроны {value}",
        "en": "Ammo {value}"
    },
    "rescue": {
        "ru": "Спасение {value}",
        "en": "Rescue {value}"
    },
    "shield": {
        "ru": "Щит {value}",
        "en": "Shield {value}"
    },
    "boost": {
        "ru": "Ускоритель {value} с",
        "en": "Speed boost {value} s"
    },
    "slow": {
        "ru": "Замедлитель {value} с",
        "en": "Slowdown {value} s"
    },
    "noAmmo": {
        "ru": "Патроны кончились — ищи ящик с патронами",
        "en": "Out of ammo — look for an ammo crate"
    },
    "hint": {
        "ru": "Тап по табличке — выстрел по стрелке",
        "en": "Tap a sign to shoot the switch"
    },
    "board": {
        "ru": "Таблица лидеров",
        "en": "Leaderboard"
    },
    "season": {
        "ru": "Сезон {value}",
        "en": "Season {value}"
    },
    "loading": {
        "ru": "Загрузка…",
        "en": "Loading…"
    },
    "boardError": {
        "ru": "Таблица недоступна.\nПроверь связь.",
        "en": "Leaderboard unavailable.\nCheck your connection."
    },
    "boardEmpty": {
        "ru": "Пока никого.\nПервый забег — твой.",
        "en": "No runs yet.\nBe the first."
    },
    "boardMe": {
        "ru": "Твоё место {place}, {meters} м",
        "en": "Your rank {place}, {meters} m"
    },
    "boardAbsent": {
        "ru": "Тебя ещё нет в таблице",
        "en": "You are not ranked yet"
    },
    "close": {
        "ru": "Закрыть",
        "en": "Close"
    },
    "player": {
        "ru": "Имя игрока",
        "en": "Player name"
    },
    "bootError": {
        "ru": "3D недоступен: нет libs/babylon.js или WebGL",
        "en": "3D unavailable: libs/babylon.js or WebGL missing"
    },
    "minus": {
        "ru": "−",
        "en": "−"
    },
    "plus": {
        "ru": "+",
        "en": "+"
    },
    "pauseIcon": {
        "ru": "II",
        "en": "II"
    },
    "resumeIcon": {
        "ru": "▶",
        "en": "▶"
    },
    "prev": {
        "ru": "‹",
        "en": "‹"
    },
    "next": {
        "ru": "›",
        "en": "›"
    },
    "page": {
        "ru": "{value} / {total}",
        "en": "{value} / {total}"
    },
    "percent": {
        "ru": "{value}%",
        "en": "{value}%"
    }
},
    bindings: {
    "menuTitle": "title",
    "menuStart": "start",
    "menuSettings": "settings",
    "menuShop": "shop",
    "menuExit": "exit",
    "modeTitle": "modes",
    "modeTutorial": "tutorial",
    "modeEndless": "endless",
    "modeBack": "back",
    "settingsTitle": "settings",
    "musicLabel": "music",
    "sfxLabel": "sfx",
    "languageLabel": "language",
    "languageRU": "ru",
    "languageEN": "en",
    "settingsBack": "back",
    "shopTitle": "shop",
    "shopSoon": "soon",
    "shopText": "shopText",
    "shopBack": "back",
    "overMenu": "menu",
    "boardBtn": "board",
    "boardTitle": "board",
    "boardClose": "close",
    "boardRowName": "player",
    "pauseBtn": "pauseIcon",
    "boardPrev": "prev",
    "boardNext": "next",
    "musicMinus": "minus",
    "sfxMinus": "minus",
    "musicPlus": "plus",
    "sfxPlus": "plus"
},
    t(key, values = {}) {
        const text = this.words[key]?.[this.code];
        if (text == null) throw new Error('Missing translation: ' + key);
        return text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
    },
    set(code) {
        if (code !== 'ru' && code !== 'en') return;
        this.code = code;
        Store.set('collapse.language', code);
        this.apply();
        for (const fn of this.listeners) fn();
    },
    apply() {
        if (typeof document !== 'undefined') document.documentElement.lang = this.code;
        if (typeof UI === 'undefined') return;
        for (const [id, key] of Object.entries(this.bindings)) {
            const el = UI.get(id);
            if (el) el.setText(this.t(key));
        }
    },
};
