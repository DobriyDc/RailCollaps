// The game's pixel font: the Cyrillic file is what tools/make-font.mjs makes of its source, and every
// letter the game writes is drawn by one of the two files UI.js joins under "Alagard".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { make, OUT, SOURCE, parseGlyphs, fontCodes } from '../tools/make-font.mjs';
import { loadScripts } from './browser-scripts.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
// Signs the font has no business drawing: they come from the system font.
const SYSTEM = new Set(['▶', '⭐', '\n']);

test('шрифт: файл кириллицы совпадает с исходником (node tools/make-font.mjs)', () => {
  assert.ok(fs.readFileSync(OUT).equals(make()), 'assets/fonts/alagard_cyrillic.ttf отстал от art_src/fonts_v1');
});

test('шрифт: все буквы текстов игры есть в Alagard или в его кириллице', () => {
  const codes = new Set([...fontCodes(fs.readFileSync(path.join(ROOT, 'assets/fonts/alagard.ttf'))), ...fontCodes(fs.readFileSync(OUT))]);
  const ctx = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/UILayout.js'], {});
  const words = ctx.get('Lang').words, layout = ctx.get('UI_LAYOUT');
  const texts = [...Object.values(words).flatMap(w => Object.values(w)), ...layout.map(r => r.text || '')];
  assert.ok(texts.length > 200, 'тексты игры не прочитаны');
  const missing = new Set();
  for (const t of texts) for (const ch of String(t).replace(/\{\w+\}/g, '')) if (!SYSTEM.has(ch) && !codes.has(ch.codePointAt(0))) missing.add(ch);
  assert.deepEqual([...missing], [], 'нет в шрифте');
});

test('шрифт: unicode-range кириллицы в UI.js покрывает каждый знак файла', () => {
  const ctx = loadScripts(['js/Constants.js', 'js/UI.js'], {});
  const face = ctx.get('UI').FONT_FACES.find(f => f.src.endsWith('alagard_cyrillic.ttf'));
  const inRange = c => face.range.split(',').some(part => {
    const [a, b] = part.trim().slice(2).split('-').map(h => parseInt(h, 16));
    return c >= a && c <= (b || a);
  });
  const off = parseGlyphs(fs.readFileSync(SOURCE, 'utf8')).filter(g => !inRange(g.code)).map(g => String.fromCodePoint(g.code));
  assert.deepEqual(off, [], 'знаки вне unicode-range');
});
