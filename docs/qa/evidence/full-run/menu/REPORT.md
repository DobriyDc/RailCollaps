# Menu full-run QA — 2026-11-01

Все 8 сценариев меню прошли: 32/32 путей матрицы, 0 failures; новых дефектов и карточек `bug-*.md` нет.

## Coverage and result

- Scenarios: **8** — main, modes, settings and shop, each with Telegram top inset 0 and 48 CSS px. This is the scenario count; individual geometric assertions are not counted as scenarios.
- Matrix paths: **32** — every scenario at 320×568, 360×640, 390×844 and 430×932.
- Passed: **32/32**; failures: **0**; console / exception / eval errors in final JSON: **0**.
- Each path traverses the real buttons `main → settings → back → shop → back → modes → back` before opening its target screen. The requested screen is the only open menu screen at capture time.
- Visible menu children were checked against the full viewport and the selected safe top; no element crosses a boundary or has horizontal text clipping. Every visible button is at least 44 CSS px; the matrix minimum is **44.800 px** at 320×568.
- Settings paths use the real minus and language buttons, then start a fresh same-origin iframe. All **8** reload checks retained the selected language and both channel volumes exactly.

## Evidence

- `matrix-safe0.png` and `matrix-safe48.png` are 4×4 contact sheets: rows are main / modes / settings / shop and columns are the four viewport sizes. They intentionally replace the 32 successful standalone raster frames.
- The adjacent 32 JSON files retain the exact ordered and actual viewport, safe-inset evaluation result, browser, errors, and pass/fail status for every matrix path.
- `menu-eval.js` is the evaluator passed to every run using `--eval-file`; it performs menu navigation, safe-area geometry and tap-size checks, plus the settings/language reload verification. It is evidence only and does not change game code.

## Commands

Eight final invocations of the project tool, each with `--eval-file=docs/qa/evidence/full-run/menu/menu-eval.js`, one for each screen/inset scenario:

```text
node tools/qa-shots.mjs --sizes=320x568,360x640,390x844,430x932 --out=docs/qa/evidence/full-run/menu --name=<screen>-safe<0|48> --query='qaScreen=<screen>&qaSafeTop=<0|48>' --timeout=120000
```

Each invocation exited 0. The coordinator's final shared gate on the completed artifacts: `node tools/check.mjs --tests` — exit 0, 186/186, 8.83 s.

No production code was changed. The only retained QA artifacts are this report, the evaluator, 32 result JSON files and two contact sheets.
