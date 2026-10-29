# Состав сети агентов — Rail Link: Collapse

Проектная привязка ролей из `gamestudio/agents.md`. Проверено 2026-10-29.

| роль | кто | модель | что держит |
|---|---|---|---|
| Producer / Coordinator | **Claude** (Claude Desktop, Orca CLI) | — | решения, спеки, ревью дифа, мерж в `main` |
| Developer | **Claude** | — | правила забега `js/Collapse*.js`, сцена, ворота, архитектура |
| Арт / UI | **GPT** через `codex` | `gpt-6.1-sol`, effort `medium` | растр (`image_gen`), нарезка, текстуры, интерфейс |
| Арт-директор | **GPT** через `codex` | `gpt-6-astra`, effort `high` | ключевые концепты; дорого, только по задаче |
| Writer / Researcher | **GPT** через `codex` | `gpt-6.1-sol`, effort `medium` | тексты, локализация, исследования |
| QA / Tester | **GPT** через `codex` | `gpt-6.1-sol`, effort `low` | прогон игры в браузере, отчёты о дефектах |

Коду от UI-провайдера в правилах забега не доверять: карточка в `js/Collapse*.js` или
`js/Constants.js` уходит Claude.

## Подключение

- Orca CLI: `C:\Users\dobri\AppData\Local\Programs\orca\resources\bin\orca.exe`.
  Репозиторий `id:591f9382-ff17-4cbd-9733-100a17c18a9b` (`D:/Railgramm/collapse`), ствол `main`.
- Ящик координатора — терминал Orca «Claude · координатор» в корне collapse;
  команды `orchestration` из внешнего шелла — с `--from <его handle>`.
- Codex CLI — переходник `C:\Users\dobri\.local\bin\codex.exe` на свежий `codex.exe` из приложения Codex;
  вход ChatGPT Plus. Claude Code CLI не установлен: Claude-воркеров нет.
- Node.js 26.13.0 LTS (`C:\Program Files\nodejs`), Python 3.12 с Pillow.
- Telegram: бот **@railcollapsebot** (заведён Продюсером 2026-10-29; dev или боевой — не решено).
  Mini App к нему ещё не подключён: нужен HTTPS-адрес игры (шаг 6). Токен бота только у Продюсера,
  агентам не передаётся и в репозиторий не кладётся; первый токен засветился в чате 2026-10-29 —
  заменить через `/revoke` в @BotFather.

## Запуск воркера

```
ORCA=/c/Users/dobri/AppData/Local/Programs/orca/resources/bin/orca.exe
$ORCA orchestration worker-start --from <ящик> --run <run> --spec "$(cat спека.md)" \
  --task-title "<...>" --worktree new-top-level --repo id:591f9382-ff17-4cbd-9733-100a17c18a9b \
  --base-branch main --name <ветка> --setup skip --agent codex --model gpt-6.1-sol --effort medium --json
```

После запуска проверить `worker-read`: если в хвосте `[Pasted Content … chars]` — спека не отправлена,
`terminal send --terminal <handle> --enter --text ""`. Так было 1 раз из 3 в волне 1.

## Журнал

| когда | что |
|---|---|
| 2026-10-29 19:30 | круг 0 в Godot-прототипе: связь Orca ↔ Codex проверена |
| 2026-10-29 20:25 | переезд на ArcEngine; волна 1 (Run `run_b673804af332`): текстуры, нарезка, механики. Окно Codex: сессия 86 %, неделя 13 % |
