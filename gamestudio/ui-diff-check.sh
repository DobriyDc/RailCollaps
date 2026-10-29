#!/usr/bin/env bash
#
# ЧТО ИЗ СДАЧИ UI-РОЛИ ОБЯЗАНО БЫТЬ ПРОЧИТАНО ГЛАЗАМИ ПЕРЕД МЕРЖЕМ.
#
# Зачем. Провайдеру интерфейса доверен вид и раскладка, а не правила игры
# (указание владельца: доверять ему можно только интерфейс). Зелёные ворота этого не
# проверяют: 11 августа 2026 UI-воркер тронул владельца сохранений, ветка села
# на зелёной череде, и Producer прочитал диф уже ПОСЛЕ мержа.
#
# Прибор печатает файлы С ЛОГИКОЙ ВНЕ ЗОНЫ UI. Каждый из них читается дифом до
# мержа. Пусто — достаточно ворот и кадров.
#
# Использование:
#   gamestudio/ui-diff-check.sh <ветка> [база]
#
# Зоны берутся из `.studio/zones.conf`, если он есть; иначе выводятся из движка
# проекта. Файл конфигурации — две строки shell-массивов:
#
#   LOGIC_GLOBS=('*.ts' '*.tsx')
#   UI_GLOBS=('src/ui/*' 'src/i18n/*' '*.css')
#
set -u

BRANCH="${1:?укажи ветку}"
BASE="${2:-main}"
ROOT="$(git rev-parse --show-toplevel)"
CONF="$ROOT/.studio/zones.conf"

if [ -f "$CONF" ]; then
  # shellcheck disable=SC1090
  . "$CONF"
  ENGINE="из .studio/zones.conf"
elif [ -f "$ROOT/project.godot" ]; then
  ENGINE="Godot"
  LOGIC_GLOBS=('*.gd' '*.cs')
  UI_GLOBS=('*/ui/*' '*/gui/*' '*.tscn' '*.tres' '*.theme' '*/i18n/*' '*/locale*/*')
elif ls "$ROOT"/ProjectSettings/ProjectVersion.txt >/dev/null 2>&1 || ls "$ROOT"/*.sln >/dev/null 2>&1; then
  ENGINE="Unity"
  LOGIC_GLOBS=('*.cs')
  UI_GLOBS=('Assets/UI/*' 'Assets/Scripts/UI/*' '*.uxml' '*.uss' '*.prefab' 'Assets/Localization/*')
elif [ -f "$ROOT/package.json" ]; then
  ENGINE="web / TypeScript"
  LOGIC_GLOBS=('*.ts' '*.tsx' '*.js')
  UI_GLOBS=('src/ui/*' 'src/i18n/*' '*.css' '*.html')
else
  echo "движок не распознан: заведи .studio/zones.conf с LOGIC_GLOBS и UI_GLOBS" >&2
  exit 2
fi

# Пробы и фикстуры логикой не считаются: они не едут игроку.
TEST_RE='(\.test\.|\.spec\.|_test\.|Tests?/|__tests__/|\.fixture\.)'

changed=$(git diff --name-only "$BASE...$BRANCH")

in_ui() {
  local f="$1" g
  for g in "${UI_GLOBS[@]}"; do
    # shellcheck disable=SC2053
    case "$f" in $g) return 0 ;; esac
  done
  return 1
}
is_logic() {
  local f="$1" g
  for g in "${LOGIC_GLOBS[@]}"; do
    # shellcheck disable=SC2053
    case "$f" in $g) return 0 ;; esac
  done
  return 1
}

echo "движок: $ENGINE · ветка $BRANCH против $BASE"
echo
echo "=== ЛОГИКА ВНЕ ЗОНЫ ИНТЕРФЕЙСА — ЧИТАТЬ ДИФ ПЕРЕД МЕРЖЕМ ==="
found=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  echo "$f" | grep -Eq "$TEST_RE" && continue
  is_logic "$f" || continue
  in_ui "$f" && continue
  echo "    $f"
  found=1
done <<< "$changed"
[ "$found" = 0 ] && echo "    (пусто — достаточно ворот и кадров)"

echo
echo "=== своя зона ==="
echo "$changed" | while IFS= read -r f; do
  [ -z "$f" ] && continue
  in_ui "$f" && echo "    $f"
done | head -20

exit 0
