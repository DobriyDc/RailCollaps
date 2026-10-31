# Состав сети агентов — Rail Link: Collapse

Проектная привязка ролей из `gamestudio/agents.md`. Проверено 2026-10-29.

| роль | кто | модель | что держит |
|---|---|---|---|
| Producer / Coordinator | **Claude** (Claude Desktop, Orca CLI) | — | решения, спеки, ревью дифа, мерж в `main` |
| Developer | **Claude** | — | правила забега `js/Collapse*.js`, сцена, ворота, архитектура |
| Художник и арт-директор | **GPT** через `codex` | `gpt-6-astra`, effort `high` | весь растр (`image_gen`), текстуры, спрайты, концепты; решение владельца 2026-10-31: рисует только Astra, более слабые модели к рисованию не допускать |
| UI Developer | **GPT** через `codex` | `gpt-6.1-sol`, effort `medium` | интерфейс кодом, нарезка готового растра |
| Writer / Researcher | **GPT** через `codex` | `gpt-6.1-sol`, effort `medium` | тексты, локализация, исследования |
| QA / Tester | **GPT** через `codex` | `gpt-6.1-sol`, effort `low` | механика проверки: ворота, прогоны по сидам, кадры, консоль; отчёты о дефектах. Kimi (`--agent kimi`) — когда будет платный план Kimi Code |

Вердикт, чтение дифа на риск, мерж и пуш остаются у Продюсера: отчёт QA — данные, одно-два числа
из него Продюсер перепроверяет сам.

Коду от UI-провайдера в правилах забега не доверять: карточка в `js/Collapse*.js` или
`js/Constants.js` уходит Claude.

## Подключение

- Orca CLI: `C:\Users\dobri\AppData\Local\Programs\orca\resources\bin\orca.exe`.
  Репозиторий `id:591f9382-ff17-4cbd-9733-100a17c18a9b` (`D:/Railgramm/collapse`), ствол `main`.
- Ящик координатора — терминал Orca «Claude · координатор» в корне collapse;
  команды `orchestration` из внешнего шелла — с `--from <его handle>`.
- Codex CLI — переходник `C:\Users\dobri\.local\bin\codex.exe` на свежий `codex.exe` из приложения Codex;
  вход ChatGPT Plus. Claude Code CLI установлен (вход Pro): воркеры `--agent claude`.
- Kimi Code CLI `@moonshot-ai/kimi-code` 2.4.0 из npm (`C:\Users\dobri\AppData\Roaming\npm\kimi`);
  вход — аккаунт Kimi владельца (`/login` в TUI, входит сам владелец); в Orca — `--agent kimi`.
  2026-10-30: вход есть, но бесплатный план получает 403 «subscription does not have access to
  Kimi Code» на всех моделях — воркером не запускать до платного плана.
  Kimi Desktop агентом Orca не бывает; его ключ в `D:\KimiData` не трогать.
- Node.js 26.13.0 LTS (`C:\Program Files\nodejs`), Python 3.12 с Pillow.
- Telegram: бот **@railcollapsebot** — бот для разработки и тестов (заведён Продюсером 2026-10-29). Боевой бот заведём перед релизом отдельно.
  Mini App к нему ещё не подключён: нужен HTTPS-адрес игры (шаг 6). Токен бота только у Продюсера,
  агентам не передаётся и в репозиторий не кладётся; первый токен засветился в чате 2026-10-29 —
  заменить через `/revoke` в @BotFather.

## Выкладка для бота

- GitHub: `origin` = https://github.com/DobriyDc/RailCollaps (публичный), ветка `main`, GitHub Pages
  с корня: https://dobriydc.github.io/RailCollaps/ — этот адрес открывает бот @railcollapsebot.
- Первый залив 2026-10-29 был ручным через веб (коммиты a92d06a, 3d87214, история не связана с
  нашей); по содержимому совпадает с `4cb3975`, отличаются только концы строк и `.gitattributes`
  из шаблона GitHub. Связать без перезаписи: `git merge -s ours --allow-unrelated-histories
  origin/main`, затем обычный `git push -u origin main` — без `--force`.
- Выкладывать `main` после каждой принятой пачки. Pages отдаёт с `Cache-Control: max-age=600`:
  новая версия в Telegram видна через 1–10 минут.

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
