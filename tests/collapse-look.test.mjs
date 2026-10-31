// The look of js/CollapseLook.js. The light and the frame itself are checked in the browser
// (docs/qa/default/REPORT.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const look = () => loadScripts(['js/Constants.js', 'js/CollapseLook.js']).get('CollapseLook');

test('сигнал не гаснет: таблички и подбираемое светятся сами, в темноте видно только освещаемое', () => {
  const L = look();
  for (const key of ['sign-12-1-0', 'cross-sign', 'pickup-ammo', 'pickup-shield', 'shield']) assert.equal(L.kindOf(key), L.GLOW, key);
  for (const key of ['wall-lo', 'vault-L', 'rib-R', 'ballast', 'track', 'sw:assets/x.png']) assert.equal(L.kindOf(key), L.SOLID, key);
  for (const key of ['loco', 'demon-1', 'demon1', 'brick:a', 'rail-bit:b']) assert.equal(L.kindOf(key), L.SPRITE, key);
  for (const key of ['lava', 'lava-channel', 'flow', 'torch', 'collapse-front', 'crack-wall:a']) assert.equal(L.kindOf(key), L.FIRE, key);
});

test('палитра: 32 цвета, таблица не выводит ничего кроме них и сохраняет цвет палитры', () => {
  const L = look(), { data, w, h } = L.lut();
  assert.equal(L.PALETTE.length, 32);
  assert.equal(new Set(L.PALETTE).size, 32);
  assert.equal(data.length, w * h * 4);
  const set = new Set(L.PALETTE);
  for (let i = 0; i < data.length; i += 4) {
    assert.ok(set.has(data[i] << 16 | data[i + 1] << 8 | data[i + 2]), `пиксель ${i / 4}`);
  }
  const n = L.LUT_SIDE, [tx] = L.LUT_TILES;
  for (const c of L.PALETTE) {
    const q = [c >> 16 & 255, c >> 8 & 255, c & 255].map(v => Math.round(v * (n - 1) / 255));
    const at = ((Math.floor(q[2] / tx) * n + q[1]) * w + (q[2] % tx) * n + q[0]) * 4;
    const out = data[at] << 16 | data[at + 1] << 8 | data[at + 2];
    const d = [16, 8, 0].map(s => Math.abs((out >> s & 255) - (c >> s & 255)));
    assert.ok(Math.max(...d) <= 40, `${c.toString(16)} -> ${out.toString(16)}`);
  }
});
