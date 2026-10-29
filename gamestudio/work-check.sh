#!/usr/bin/env bash
# Расширения продакшн-кода берутся из `.studio/project.conf` (PROD_EXT), иначе
# работают умолчания ниже — прибор переносится между движками вместе с папкой.
# Сколько строк воркер добавил и КУДА — по классам файлов.
#
# ЗАЧЕМ. На большом проекте типовой отказ выглядит так: воркер живой, heartbeat
# идёт, коммиты есть, отчёт бодрый — а правки продакшн-кода нет вовсе. Он пишет
# и гоняет тесты, ходит по коду, «разбирается». Со стороны Producer'а это
# неотличимо от работы: и «шесть коммитов», и «дерево чистое» верны.
# Отличает одно — числа по классам файлов.
#
# СЧИТАЕТСЯ И ЗАКОММИЧЕННОЕ, И РАБОЧЕЕ ДЕРЕВО. Иначе воркер без коммитов
# выглядит как воркер без работы, а это разные диагнозы: первому напоминают
# коммитить, второго спрашивают, чем он занят.
#
# Использование:
#   gamestudio/work-check.sh <путь-к-worktree> [ещё пути…]
#   gamestudio/work-check.sh            # все дочерние worktree рядом с этим
set -uo pipefail

classify() {
  python3 -c '
import subprocess, sys, os

# Расширения продакшн-кода: из профиля проекта, иначе умолчание для web/TS.
PROD_EXT = tuple(
    e.strip() for e in os.environ.get(
        "PROD_EXT", ".ts,.tsx,.js,.css,.html,.json,.cs,.gd,.tscn,.uxml,.uss"
    ).split(",") if e.strip()
)
path, base = sys.argv[1], sys.argv[2]

def numstat(*args):
    out = subprocess.run(["git", "-C", path, *args], capture_output=True, text=True).stdout
    return [l.split("\t") for l in out.splitlines() if l.count("\t") >= 2]

rows = numstat("diff", "--numstat", f"{base}..HEAD") + numstat("diff", "--numstat", "HEAD")
untracked = subprocess.run(["git", "-C", path, "ls-files", "--others", "--exclude-standard"],
                           capture_output=True, text=True).stdout.split()

# ДВОИЧНОЕ НЕ СЧИТАЕТСЯ ПОСТРОЧНО. `git diff --numstat` для бинарника печатает
# «-», и это уже обрабатывается ниже; а незакоммиченный файл читается здесь
# руками, и без этой отсечки четыре PNG-кадра приёмки превратились в «доки 144»
# с вердиктом «продакшн не тронут» на задаче, которая кадры и обязана давать.
# Прибор, считающий скриншот текстом, врёт в ту же сторону, что и молчание.
BINARY = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
          ".mp3", ".wav", ".ogg", ".zip", ".woff", ".woff2", ".ttf")
for f in untracked:
    if f.lower().endswith(BINARY):
        continue
    full = os.path.join(path, f)
    try:
        with open(full, "rb") as fh:
            rows.append([str(sum(1 for _ in fh)), "0", f])
    except OSError:
        pass

cls = {"прод": 0, "тесты": 0, "доки": 0, "прочее": 0}
for added, _removed, f in rows:
    n = 0 if added == "-" else int(added)
    if f.startswith("docs/") or f.endswith(".md"):
        cls["доки"] += n
    elif ".test." in f or ".fixture." in f:
        cls["тесты"] += n
    elif f.startswith("artifacts/"):
        # СГЕНЕРИРОВАННОЕ — НЕ ПРОДАКШН. Перегенерированный отчёт замера
        # (artifacts/m3-08-headless-games.json) — это 4000 строк, которые
        # никто не писал: правка на десять строк выглядела бы как крупная
        # работа. Прибор, который льстит, бесполезен так же, как молчащий.
        cls["прочее"] += n
    elif f.endswith(PROD_EXT):
        cls["прод"] += n
    else:
        cls["прочее"] += n

# ВЕРДИКТ — НЕ ПРИГОВОР, А ПОВОД СПРОСИТЬ. Порог намеренно грубый: разбирать
# случай должен человек, прибор лишь показывает, куда смотреть.
verdict = ""
if sum(cls.values()) == 0:
    verdict = "  ← НИ ОДНОЙ СТРОКИ: спросить, чем занят"
elif cls["прод"] == 0 and cls["тесты"] + cls["доки"] > 40:
    verdict = "  ← ПРОДАКШН-КОД НЕ ТРОНУТ, а тестов и доков много: это тот самый отказ"
elif cls["прод"] > 0 and cls["тесты"] > 8 * cls["прод"]:
    verdict = "  ← тестов в разы больше кода: проверить, что задача не свелась к обвязке"
print("  " + ", ".join(f"{k} {v}" for k, v in cls.items()) + verdict)
' "$1" "$2"
}

# `mapfile` есть не во всякой оболочке (в macOS bash 3.2 его нет), поэтому
# список путей собирается построчно — это работает везде.
if [ "$#" -gt 0 ]; then
  roots=$(printf '%s\n' "$@")
else
  roots=$(orca worktree list 2>/dev/null | grep -oE '/[^ ]*/workspaces/[^ ]+' | sort -u)
fi

# БАЗА — БЛИЖАЙШАЯ ВЕТКА-ПРЕДОК, А НЕ `main`. Работа заводится guard-first:
# Producer кладёт страж красным на отдельную ветку и запускает воркера с неё.
# Если считать от `main`, коммит-страж попадает в диф воркера, и КАЖДЫЙ свежий
# воркер в первую же минуту выглядит ровно тем отказом, который скрипт ищет:
# «продакшн 0, тесты 128». Прибор, который в норме кричит на исправном, никто
# не будет слушать в тот раз, когда он крикнет по делу.
#
# База находится сама и без знания имён: у каждой локальной ветки берётся точка
# расхождения с HEAD, и выигрывает та, от которой до HEAD меньше коммитов.
#
# Именно расхождение, а не «предок»: `main` перестаёт быть предком рабочей ветки
# в тот момент, когда в него слили чужую задачу, — а базой быть не перестаёт.
# Требование предковости молча уводило бы базу на старую ветку-страж соседней
# задачи и приписывало воркеру чужие три тысячи строк.
nearest_base() {
  local wt="$1" self="$2" best="" best_n=""
  local b mb n
  # `main` идёт первым, чтобы при равном расхождении в подписи стояло оно:
  # ветка-страж и main расходятся с рабочей веткой в одной точке, и называть
  # базой страж, когда он ничего не добавил, — сбивать с толку без нужды.
  for b in main $(git -C "$wt" for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null); do
    [ "$b" = "$self" ] && continue
    mb=$(git -C "$wt" merge-base "$b" HEAD 2>/dev/null) || continue
    n=$(git -C "$wt" rev-list --count "$mb"..HEAD 2>/dev/null) || continue
    if [ -z "$best_n" ] || [ "$n" -lt "$best_n" ]; then best="$b"; best_n="$n"; fi
  done
  [ -n "$best" ] && echo "$best"
}

echo "$roots" | while IFS= read -r wt; do
  [ -n "$wt" ] || continue
  [ -d "$wt" ] || continue
  branch=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null) || continue
  baseref=$(nearest_base "$wt" "$branch")
  [ -n "$baseref" ] || baseref=main
  base=$(git -C "$wt" merge-base HEAD "$baseref" 2>/dev/null) || base=main
  commits=$(git -C "$wt" rev-list --count "$base"..HEAD 2>/dev/null)
  dirty=$(git -C "$wt" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  echo "$(basename "$wt")  ветка $branch (от $baseref)  коммитов $commits, правленых файлов $dirty"
  classify "$wt" "$base"
done
