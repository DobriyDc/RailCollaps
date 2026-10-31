// The tuner page (_utils/tuner): the game it wraps, what it writes, and that Pages serves it at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadScripts, ROOT } from './browser-scripts.mjs';
import { formatUI } from '../_utils/editor/save.mjs';

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const page = () => loadScripts(['js/Constants.js', 'js/UILayout.js', '_utils/editor/schema.js', '_utils/tuner/tuner-core.js']);
const plain = v => JSON.parse(JSON.stringify(v));

test('настройщик оборачивает настоящий index.html: константы изменяемы, окно сегментов на самую дальнюю камеру', () => {
  const p = page(), core = p.get('TunerCore');
  const html = core.page(read('index.html'), read('js/Constants.js'), 'https://x/y/');
  assert.ok(html.includes('<base href="https://x/y/">'));
  assert.ok(!html.includes(core.CONSTANTS_TAG));
  assert.match(html, /^var COLLAPSE_CAM_Z = /m);
  assert.doesNotMatch(html, /^const COLLAPSE_/m);
  assert.ok(html.includes('<script src="js/main.js"></script>'), 'остальные скрипты те же');
  assert.throws(() => core.page('<head></head>', '', ''), 'разметка игры изменилась');
  const z = p.get('KIT_SCHEMA').flatMap(g => g.fields).find(f => f.name === 'COLLAPSE_CAM_Z');
  assert.ok(core.BOOT_Z >= z.max, `окно на ${core.BOOT_Z}, ползунок до ${z.max}`);
});

test('крупность 1 — ровно числа кода; крупность 2 — камера вдвое ближе', () => {
  const core = page().get('TunerCore'), code = { COLLAPSE_CAM_Y: 450, COLLAPSE_CAM_Z: 1467 };
  assert.deepEqual(plain(core.master(1, code)), code);
  assert.deepEqual(plain(core.master(2, code)), { COLLAPSE_CAM_Y: 225, COLLAPSE_CAM_Z: 734 });
});

test('запись UILayout.js: значения кода не меняют ни строки, высота нижней плашки тянет полосу иконок', () => {
  const p = page(), core = p.get('TunerCore'), layout = plain(p.get('UI_LAYOUT'));
  const lines = els => formatUI(els).src.split('\n');
  const same = lines(layout), ui = plain(core.uiValues(layout));
  assert.deepEqual(lines(plain(core.layoutWith(layout, ui))), same);
  const moved = lines(plain(core.layoutWith(layout, { ...ui, bottom: 120 })));
  const diff = moved.filter((l, i) => l !== same[i]).map(l => /id: '(\w+)'/.exec(l)[1]);
  assert.deepEqual(diff, ['frameBottom', 'iconStrip']);
  assert.match(moved.find(l => l.includes("id: 'iconStrip'")), /y: 120,/);
});

test('иконки: значения кода совпадают с записями всех восьми слотов', () => {
  const p = page(), core = p.get('TunerCore'), layout = plain(p.get('UI_LAYOUT'));
  for (const [id, field, value] of core.uiEdits(core.uiValues(layout))) {
    assert.equal(layout.find(d => d.id === id)[field], value, `${id}.${field}`);
  }
});

test('вход в кадр: деление пополам находит край на сетке отчёта, цель вне кадра у поезда — 0', () => {
  const core = page().get('TunerCore');
  assert.equal(core.entry(s => s <= 3.12, 5.2), 3.09375);
  assert.equal(core.entry(s => s <= 2.87, 5.2, 64), 2.859375);
  assert.equal(core.entry(() => false, 5.2), 0);
});

test('Pages: .nojekyll на месте, иначе Jekyll не отдаёт ничего из _utils', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '.nojekyll')));
});
