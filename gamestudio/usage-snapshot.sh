#!/usr/bin/env bash
# Снимок расхода лимитов в журнал .studio/usage.jsonl (§9 правило 18 STUDIO.md).
# Одна строка JSON на итерацию Producer'а. Журнал не версионируется.
#
#   gamestudio/usage-snapshot.sh            # записать снимок и показать дельту
#   gamestudio/usage-snapshot.sh --report   # только показать, ничего не писать
#   NO_WAIT=1 gamestudio/usage-snapshot.sh  # не ждать свежих цифр (быстрый взгляд)
#
# Дельта считается к предыдущей строке журнала: сколько процентов каждого окна
# сгорело, за сколько минут, и кто в это время работал. По этому и планируется
# размер следующей волны.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEDGER="$ROOT/.studio/usage.jsonl"
mkdir -p "$ROOT/.studio"

MODE="${1:-append}"

# Принудительного обновления лимитов в CLI нет: orca account list отдаёт свой кеш,
# и опрос приходит нерегулярно — замерено от 200 до 780 секунд. Поэтому свежесть
# не выпрашивается, а дожидается, и только когда это может что-то изменить:
# ждём лишь при работающих воркерах. Если не работает никто, расходовать нечего,
# и устаревшие цифры безвредны — ждать их бессмысленно.
FRESH_LIMIT_SEC="${FRESH_LIMIT_SEC:-120}"
WAIT_CAP_SEC="${WAIT_CAP_SEC:-90}"

# Возраст берётся по САМОМУ СТАРОМУ окну, а не по самому свежему: ждём, пока свежи
# все провайдеры. min здесь отвечал бы на другой вопрос — «обновился ли хоть кто-то», —
# и цикл выходил бы, пока у провайдера, который прямо сейчас жжёт квоту, цифра старая.
# Если ожидание упрётся в потолок, ничего не скрывается: возраст печатается по каждому
# провайдеру отдельно, и несвежие помечаются порогом 210 с.
# Вывод гарантированно непустой — иначе `[ "" -gt N ]` роняет test внутри while.
age_of() {
  orca account list --json 2>/dev/null | python3 -c '
import json,sys,time
try: d=json.load(sys.stdin)
except Exception: print(99999); raise SystemExit
rl=d.get("result",d).get("rateLimits",{}) or {}
ages=[(time.time()-v["updatedAt"]/1000) for v in rl.values()
      if isinstance(v,dict) and v.get("updatedAt")]
print(int(max(ages)) if ages else 99999)
' || printf '%s' 99999
}

BUSY="$(orca orchestration task-list --brief 2>/dev/null | grep -c '\[dispatched\]' || true)"
if [ "${NO_WAIT:-}" != "1" ] && [ "${BUSY:-0}" -gt 0 ]; then
  waited=0
  age="$(age_of)"
  if [ "${age:-99999}" -gt "$FRESH_LIMIT_SEC" ] 2>/dev/null; then
    echo "данные лимитов старше ${FRESH_LIMIT_SEC}с (возраст ${age}с) — жду опроса Orca, он примерно раз в 200с"
    while [ "${age:-99999}" -gt "$FRESH_LIMIT_SEC" ] 2>/dev/null && [ "$waited" -lt "$WAIT_CAP_SEC" ]; do
      sleep 15; waited=$((waited + 15)); age="$(age_of)"
    done
    if [ "${age:-99999}" -gt "$FRESH_LIMIT_SEC" ] 2>/dev/null; then
      echo "  за ${waited}с опрос так и не пришёл — снимаю на возрасте ${age}с, дельте не верь"
    else
      echo "  дождался через ${waited}с, возраст ${age}с"
    fi
  fi
fi

LIMITS="$(orca account list --json 2>/dev/null || echo '{}')"
WORKERS="$(orca orchestration task-list --brief 2>/dev/null | grep -c '\[dispatched\]' || true)"
RUNNING="$(orca orchestration task-list --brief 2>/dev/null | sed -n 's/^\(task_[a-f0-9]*\) \[dispatched\] \(.*\) -> .*/\1|\2/p' | paste -sd';' - || true)"
DONE="$(orca orchestration task-list --brief 2>/dev/null | grep -c '\[completed\]' || true)"

LIMITS="$LIMITS" WORKERS="$WORKERS" RUNNING="$RUNNING" DONE="$DONE" \
LEDGER="$LEDGER" MODE="$MODE" python3 - <<'PY'
import json, os, time, datetime

ledger = os.environ["LEDGER"]
mode = os.environ["MODE"]

try:
    limits = json.loads(os.environ["LIMITS"]).get("result", {}).get("rateLimits", {})
except Exception:
    limits = {}

buckets = {}
freshness = {}
for provider, value in limits.items():
    if not isinstance(value, dict) or value.get("status") == "unavailable":
        continue
    if value.get("updatedAt"):
        freshness[provider] = value["updatedAt"]
    for window, data in value.items():
        if isinstance(data, dict) and "usedPercent" in data:
            buckets[f"{provider}.{window}"] = {
                "used": data["usedPercent"],
                "windowMinutes": data.get("windowMinutes"),
                "resetsAt": data.get("resetsAt"),
                "updatedAt": value.get("updatedAt"),
            }

now = time.time()
entry = {
    "ts": int(now * 1000),
    "at": datetime.datetime.fromtimestamp(now).isoformat(timespec="seconds"),
    "buckets": buckets,
    "freshness": freshness,
    "workersRunning": int(os.environ["WORKERS"] or 0),
    "running": [x for x in os.environ["RUNNING"].split(";") if x],
    "tasksCompletedTotal": int(os.environ["DONE"] or 0),
}

prev = None
if os.path.exists(ledger):
    with open(ledger) as fh:
        lines = [l for l in fh if l.strip()]
    if lines:
        prev = json.loads(lines[-1])

print(f"снимок {entry['at']}  воркеров в работе: {entry['workersRunning']}")
for provider, upd in sorted(freshness.items()):
    age = now - upd / 1000
    mark = "  ← ДАННЫЕ УСТАРЕЛИ, дельте не верь" if age > 210 else ""
    print(f"  данные {provider}: возраст {age:.0f} сек{mark}")
for name, b in sorted(buckets.items()):
    line = f"  {name:26} {round(b['used']):>3}%"
    if b["resetsAt"]:
        reset = datetime.datetime.fromtimestamp(b["resetsAt"] / 1000)
        left = reset - datetime.datetime.fromtimestamp(now)
        if left.total_seconds() < 0:
            # Момент сброса уже прошёл, а процент в кеше остался прежним: значит
            # это данные до сброса. Показать «через -1 day, 23:55» — обмануть себя.
            line += f"  сброс {reset:%d %b %H:%M} УЖЕ ПРОШЁЛ — цифра из кеша до сброса"
        else:
            line += f"  сброс {reset:%d %b %H:%M} (через {str(left).split('.')[0]})"
    print(line)

if prev:
    minutes = (entry["ts"] - prev["ts"]) / 60000
    print(f"\nдельта к предыдущему снимку ({minutes:.0f} мин, воркеров тогда: {prev.get('workersRunning')}):")
    for name, b in sorted(buckets.items()):
        old = prev.get("buckets", {}).get(name)
        if not old:
            # Окно появилось впервые: провайдер добавлен, или его первый замер пришёл
            # только сейчас. Молча пропустить нельзя — новый провайдер обычно и есть
            # тот, на который переехала волна, и его расход важнее всех остальных.
            print(f"  {name:26} новое окно в журнале — сравнить не с чем, следующий снимок даст дельту")
            continue
        # Сброс окна между снимками делает дельту бессмысленной. Признак сброса —
        # процент упал, либо resetsAt отъехал вперёд заметно. Порог обязателен:
        # resetsAt дрейфует на миллисекунды между чтениями, и точное сравнение
        # ловило бы ложный сброс на каждом снимке.
        moved = (b.get("resetsAt") or 0) - (old.get("resetsAt") or 0) > 60_000
        if b["used"] < old["used"] or moved:
            print(f"  {name:26} окно сбросилось, дельта не считается (было {round(old['used'])}%, стало {round(b['used'])}%)")
            continue
        # Провайдер отдаёт кешированные цифры: если updatedAt не сдвинулся, это тот же
        # самый замер, а не «ничего не сгорело». Молча показать 0 п.п. здесь опаснее,
        # чем не показать ничего: нулевая дельта читается как «можно грузить сильнее».
        if b.get("updatedAt") and b["updatedAt"] == old.get("updatedAt"):
            print(f"  {name:26} те же данные, что в прошлом снимке — дельта неизвестна")
            continue
        d = round(b["used"]) - round(old["used"])
        # Скорость горения считается по интервалу ДАННЫХ ПРОВАЙДЕРА, а не по интервалу
        # снимков. 9 августа 2026 это дало ошибку в четыре раза: Orca не опрашивала
        # провайдеров 75 минут, потом отдала накопленное сразу, а скрипт поделил
        # 15 п.п. на 15 минут снимка и объявил 61.8%/час вместо настоящих 12%/час.
        # Завышенная скорость опаснее заниженной наоборот: по ней волну урезают там,
        # где запас есть, то есть окно лимита сгорает неиспользованным при сбросе.
        span = None
        if b.get("updatedAt") and old.get("updatedAt"):
            span = (b["updatedAt"] - old["updatedAt"]) / 60000
        source = "по данным провайдера"
        if not span or span <= 0:
            span, source = minutes, "по интервалу снимков — updatedAt недоступен"
        rate = f", {d / (span / 60):.1f}%/час за {span:.0f} мин ({source})" if span >= 5 and d else ""
        print(f"  {name:26} {d:+d} п.п.{rate}")
    closed = entry["tasksCompletedTotal"] - prev.get("tasksCompletedTotal", 0)
    print(f"  закрыто задач за интервал: {closed}")
else:
    print("\nпервый снимок — дельту сравнивать не с чем")

# ─── Бюджет: вилка, а не потолок ───────────────────────────────────────────
#
# Правило и его смысл — gamestudio/BUDGET.md. Здесь только арифметика.
#
# ГЛАВНОЕ ЧИСЛО — НЕ ПОТОЛОК, А РОВНЫЙ РАСХОД: остаток окна, делённый на время
# до сброса. Оно одно решает обе задачи. Сжечь недельное окно за сутки — потерять
# дни, в которые студия не работает; НЕ сжечь его к сбросу — потерять окно
# целиком, потому что несгоревшее не переносится. Поэтому вердикт двусторонний:
# «горим» и «недобираем» — обе ошибки, и вторая тише первой, а стоит столько же.
#
# ВСЕ ОКНА, А НЕ ТОЛЬКО НЕДЕЛЬНОЕ. Пятичасовое — не бюджет, а дроссель: оно
# пополняется само, и его неиспользованная ёмкость пропадает каждые пять часов.
# Значит связывает то окно, у которого ровный расход НИЖЕ: недельное задаёт
# сколько можно за неделю, сессионное — сколько можно прямо сейчас.
#
# ЧУЖОЙ РАСХОД. Подписка одна на человека и студию: владелец может работать с
# теми же моделями параллельно. Считать его расход своим — урезать волну за
# чужую работу; не считать вовсе — проспать исчерпание окна. Оценивается по
# интервалам, в которых у студии НЕ БЫЛО НИ ОДНОГО воркера: сгоревшее тогда не
# наше по построению. Медиана, а не среднее: один всплеск не задирает оценку.
# Предел объявлен: нет таких интервалов — печатается «неизвестна», а не ноль.
def load_ledger(path):
    if not os.path.exists(path):
        return []
    with open(path) as fh:
        return [json.loads(l) for l in fh if l.strip()]


def rate_between(a, b, name):
    """п.п./час по данным провайдера; None, если считать нельзя."""
    ob, nb = a.get("buckets", {}).get(name), b.get("buckets", {}).get(name)
    if not ob or not nb:
        return None
    if nb["used"] < ob["used"] or (nb.get("resetsAt") or 0) - (ob.get("resetsAt") or 0) > 60_000:
        return None  # окно сбросилось
    if nb.get("updatedAt") and nb["updatedAt"] == ob.get("updatedAt"):
        return None  # те же данные
    span = None
    if nb.get("updatedAt") and ob.get("updatedAt"):
        span = (nb["updatedAt"] - ob["updatedAt"]) / 3_600_000
    if not span or span <= 0:
        span = (b["ts"] - a["ts"]) / 3_600_000
    d = round(nb["used"]) - round(ob["used"])
    # КВАНТОВАНИЕ. Провайдер отдаёт ЦЕЛЫЕ проценты, поэтому «+1 п.п.» означает
    # «где-то от 0.5 до 1.5», и на коротком интервале это даёт скорость с
    # ошибкой в разы: +1 п.п. за 15 минут — это и 2, и 6 п.п./час. Вердикт по
    # такому числу кричал бы «ГОРИМ» на ровном месте. Поэтому скорость считается
    # только тогда, когда шум мал по сравнению с сигналом: либо накопилось
    # 3+ п.п., либо прошёл час. Иначе — None, и снимок честно скажет, что
    # скорость неизвестна.
    if span < 1.0 and abs(d) < 3:
        return None
    if span < 5 / 60:
        return None
    return d / span


# УДАЛЯЮЩАЯСЯ БАЗА, И БЕЗ НЕЁ ПОРОГ КВАНТОВАНИЯ ГЛУШИТ ВЕРДИКТ НАСОВСЕМ.
# Порог выше требует «3+ п.п. либо час». Снимок делается каждые 9–15 минут, и
# соседняя пара почти никогда столько не набирает: скорость выходила None круг
# за кругом, и строка бюджета честно печатала «неизвестна» — то есть вердикта
# не было НИ РАЗУ. Это та же ошибка, что и «критерий, который нельзя провалить»
# (STUDIO.md §10.4), только зеркальная: замер, который не может стать известным.
# Поэтому база не соседняя, а отодвигается назад до первой пары, проходящей
# порог. Берётся САМАЯ БЛИЗКАЯ подходящая: длинная база усредняет по прошлым
# волнам и запаздывает с реакцией на сегодняшнюю. Пересечь сброс окна нельзя —
# там rate_between даёт None по построению, и скорость остаётся неизвестной.
def receding_rate(history, name):
    for a in reversed(history[:-1]):
        r = rate_between(a, history[-1], name)
        if r is not None:
            return r, (history[-1]["ts"] - a["ts"]) / 3_600_000
    return None, None


# Чужая скорость — по ПРОГОНАМ подряд идущих снимков без воркеров, а не по
# соседним парам: соседняя пара упирается в тот же порог квантования.
def idle_runs(history):
    run, out = [], []
    for r in history:
        if (r.get("workersRunning") or 0) == 0:
            run.append(r)
        else:
            if len(run) >= 2:
                out.append((run[0], run[-1]))
            run = []
    if len(run) >= 2:
        out.append((run[0], run[-1]))
    return out


history = load_ledger(ledger) + [entry]
budget_path = os.path.join(os.path.dirname(ledger), "budget.json")
cap_pp = None
# НЕРАСХОДУЕМЫЕ ОКНА. Процент окна и доступность модели — разные вещи: окно
# может показывать 90 п.п. свободных, а модель за ним быть выключена (кредиты
# провайдера, отдельный кошелёк). Такому окну вердикт «недобираем, волну можно
# расширить» — прямая ложь: расширять там нечего. Список живёт в состоянии
# проекта, а не в этом файле: какие окна нерасходуемы, зависит от подписки.
unusable = set()
if os.path.exists(budget_path):
    try:
        cfg = json.load(open(budget_path))
        v = cfg.get("capPpPerDay")
        cap_pp = float(v) if v is not None else None
        unusable = set(cfg.get("unusableWindows") or [])
    except Exception:
        pass

print("\nбюджет: ровный расход = остаток / время до сброса; вилка ±25 %")
even_rates = {}
for name, b in sorted(buckets.items()):
    if not b.get("resetsAt"):
        continue
    hours_left = (b["resetsAt"] / 1000 - now) / 3600
    if hours_left <= 0:
        print(f"  {name:26} окно уже сброшено — цифра из кеша, вердикта нет")
        continue
    remaining = 100 - round(b["used"])
    even = remaining / hours_left
    if name in unusable:
        print(f"  {name:26} остаток {remaining:>3} п.п. — окно НЕ РАСХОДУЕТСЯ "
              f"(модель за ним выключена), вердикта нет и волну им не расширить")
        continue
    even_rates[name] = even

    idle = sorted(
        r
        for a, b2 in idle_runs(history)
        for r in [rate_between(a, b2, name)]
        if r is not None
    )
    foreign = idle[len(idle) // 2] if idle else None
    total, base_h = receding_rate(history, name)

    head = (f"  {name:26} остаток {remaining:>3} п.п. за {hours_left:>5.1f} ч → "
            f"ровно {even:.2f} п.п./час ({even * 24:.0f} п.п./сутки)")
    if total is None:
        print(head + "; своя скорость неизвестна (сброс, кеш или журнал короче порога)")
        continue

    # ДАННЫЕ ПРОВАЙДЕРА МОГУТ БЫТЬ МЁРТВЫ, И ТОГДА ВЕРДИКТА НЕТ ВОВСЕ.
    # 11 августа 2026 `updatedAt` всех сегментов застыл на 00:17 и не сдвинулся
    # пять часов, пока студия жгла окно восемью воркерами. `receding_rate`
    # честно отодвигал базу до последней пары с РАЗНЫМ `updatedAt` — то есть до
    # ночи, — и печатал «ГОРИМ ×3.4», а я это повторял владельцу восемь кругов
    # подряд как свежий вердикт. Число было верным для 00:17 и никаким для 05:25.
    #
    # Это тот же класс, что «страж, который не может покраснеть», только
    # зеркальный: показание, которое не может обновиться, но выглядит живым.
    # Поэтому свежесть проверяется отдельно от базы: база говорит, ПО ЧЕМУ
    # считали, свежесть — АКТУАЛЬНО ли то, на чём считали.
    # `entry`, а не переменная включения выше: в Python 3 она наружу не выходит,
    # и защита падала `NameError` ровно на том сегменте, который решает волну.
    fresh_h = None
    nb_now = entry.get("buckets", {}).get(name) or {}
    if nb_now.get("updatedAt"):
        fresh_h = (entry["ts"] - nb_now["updatedAt"]) / 3_600_000
    if fresh_h is not None and fresh_h > 1.0:
        print(head + f"; данные провайдера СТАРШЕ СНИМКА на {fresh_h:.1f} ч "
                     f"(последнее обновление у провайдера, не у нас) — ВЕРДИКТА НЕТ")
        print(f"  {'':26} ← остаток и скорость относятся к тому моменту, а не к сейчас;"
              f" волну мерить по ядрам (health-check.sh), а не по этому числу")
        continue
    own = total if foreign is None else max(0.0, total - foreign)
    src = (f"база {base_h:.1f} ч; "
           + ("верхняя оценка, чужая доля неизвестна" if foreign is None
              else f"чужое {foreign:.2f} по {len(idle)} прогонам без воркеров"))
    if own > even * 1.25:
        verdict = f"ГОРИМ ×{own / even:.1f} — сокращать волну"
    elif own < even * 0.75:
        verdict = f"НЕДОБИРАЕМ ×{even / own:.1f} — окно пропадёт при сбросе, волну можно расширить" if own > 0 else "НЕДОБИРАЕМ — расхода нет вовсе, окно пропадёт при сбросе"
    else:
        verdict = "в вилке"
    print(head + f"; своё {own:.2f} ({src}) — {verdict}")
    if (entry.get("workersRunning") or 0) == 0 and total > even * 1.25:
        print(f"  {'':26} ← воркеров ноль, а окно горит: расход чужой целиком, "
              f"на волну студии не влияет, но срок сокращает")
    elif own > even * 1.25:
        # ПРЕДЕЛ ЭТОГО ПРИЗНАКА НАЗВАН, А НЕ СКРЫТ. Воркеры считаются ОБЩИМ
        # числом, без разбивки по провайдерам: задача не говорит, на каком
        # агенте она идёт. Значит окно провайдера, у которого своих воркеров
        # нет, может гореть при ненулевом общем счётчике — и признак выше
        # смолчит. Пока разбивки нет, вывод делает человек: если по этому
        # провайдеру работ не запускалось, горит чужое, а не студия.
        print(f"  {'':26} ← счётчик воркеров ОБЩИЙ, не по провайдерам: "
              f"если по этому провайдеру своих работ нет, расход чужой")

# ВОЛНУ ОГРАНИЧИВАЕТ НЕ ТОЛЬКО ОКНО, НО И МАШИНА. 10 августа 2026 при трёх
# воркерах load average дошёл до 112 при 91 node-процессе, и прогон сьюта одной
# задачи растянулся с минут до получаса. Дороже простоя тут второе: числа,
# снятые под такой нагрузкой, измеряют очередь планировщика, а не код, — и
# попадают в отчёты как свойство правки («1305 с на загруженной машине»).
# Поэтому нагрузка печатается рядом с остатком лимита: волна считается по
# обоим, и по более тесному из двух.
try:
    load1 = os.getloadavg()[0]
    cores = os.cpu_count() or 1
    ratio = load1 / cores
    if ratio >= 4:
        verdict = " — МАШИНА ПЕРЕГРУЖЕНА: волну не расширять, замеры времени недостоверны"
    elif ratio >= 2:
        verdict = " — машина занята: новый воркер замедлит соседей и свои же замеры"
    else:
        verdict = " — машина свободна"
    print(f"\nмашина: load average {load1:.0f} на {cores} ядрах "
          f"(x{ratio:.1f}){verdict}")
except (OSError, AttributeError):
    pass

if even_rates:
    binding = min(even_rates, key=even_rates.get)
    limit = even_rates[binding]
    note = ""
    if cap_pp is not None and cap_pp / 24 < limit:
        limit, note = cap_pp / 24, f" (потолок владельца {cap_pp:.0f} п.п./сутки ниже ровного расхода)"
    print(f"  связывает: {binding} — {limit:.2f} п.п./час, "
          f"то есть {limit * 24:.0f} п.п./сутки{note}")

# ── НАКЛОН ПО ВСЕМУ ТЕКУЩЕМУ ОКНУ, а не по отодвигающейся базе ────────────────
# Вердикты выше берут «своё» с базы 0.3…1.4 ч. При гранулярности провайдера в 1 п.п.
# один шаг квантования на таком плече даёт разброс в РАЗЫ: 11 августа 2026 прибор
# печатал codex ×16.1, тогда как остаток за тот же интервал сдвинулся ровно на
# единицу, то есть скорость лежала между 0 и 6 п.п./час. Хуже: у codex окно
# сбросилось, и короткая база сравнивала числа через границу сброса.
#
# Надёжное плечо — ВСЁ текущее окно: последний монотонно неубывающий отрезок
# `used` в журнале. Он кончается на сбросе сам, без знания `resetsAt`.
print("\nнаклон по ВСЕМУ текущему окну (монотонный хвост журнала) — им и мерить волну:")
for name in sorted({n for r in history for n in (r.get("buckets") or {})}):
    pts = [(r["ts"], (r.get("buckets") or {}).get(name, {}).get("used")) for r in history]
    pts = [(t, u) for t, u in pts if u is not None]
    if len(pts) < 2:
        continue
    i = len(pts) - 1
    while i > 0 and pts[i - 1][1] <= pts[i][1]:
        i -= 1
    seg = pts[i:]
    if len(seg) < 2:
        print(f"  {name:26} окно только что сброшено — плеча нет, вердикта нет")
        continue
    hours = (seg[-1][0] - seg[0][0]) / 3_600_000
    if hours <= 0:
        continue
    rate = (seg[-1][1] - seg[0][1]) / hours
    rem = 100 - seg[-1][1]
    tail = f"; остаток {rem} п.п. → хватит на {rem / rate:.1f} ч" if rate > 0 else "; расхода нет"
    print(f"  {name:26} {seg[0][1]}% → {seg[-1][1]}% за {hours:.1f} ч по {len(seg)} снимкам "
          f"= {rate:.2f} п.п./час{tail}")

if mode != "--report":
    with open(ledger, "a") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"\nзаписано в {ledger}")
PY
