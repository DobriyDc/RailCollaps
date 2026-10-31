// The gate of the world's art (tools/art/check-art.mjs) and the old world's way out of the scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { checkAll, checkImage, decodePng, readPalette, upscaled } from '../tools/art/check-art.mjs';
import { readManifest, render, OUT } from '../tools/art/make-train-mesh.mjs';
import { collectRefs } from '../tools/asset-scan.mjs';
import { ROOT } from './browser-scripts.mjs';

const track = () => decodePng(fs.readFileSync(path.join(ROOT, 'assets/textures/world/track.png')));

test('весь арт манифестов мира и поезда на палитре и на сетке', () => {
  const { checked, found } = checkAll();
  assert.equal(checked, 23 + 31);
  assert.deepEqual(found, []);
});

test('ассет вне палитры, с мягкой альфой, не того размера или увеличенный не проходит', () => {
  const palette = readPalette(), img = track();
  assert.deepEqual(checkImage(img, palette, [128, 128]), []);
  assert.match(checkImage(img, palette, [64, 64])[0], /размер/);
  const off = { ...img, rgba: Buffer.from(img.rgba) };
  off.rgba[0] ^= 3;
  assert.match(checkImage(off, palette, [128, 128]).join(), /вне палитры 1 px/);
  const soft = { ...img, rgba: Buffer.from(img.rgba) };
  soft.rgba[3] = 128;
  assert.match(checkImage(soft, palette, [128, 128]).join(), /полупрозрачных 1 px/);
  const big = { w: 256, h: 256, rgba: Buffer.alloc(256 * 256 * 4) };
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const from = ((y >> 1) * 128 + (x >> 1)) * 4;
      img.rgba.copy(big.rgba, (y * 256 + x) * 4, from, from + 4);
    }
  }
  assert.equal(upscaled(big), 2);
  assert.match(checkImage(big, palette, null).join(), /вне сетки/);
});

test('декодер читает строки со сжатием: нефильтрованный PNG равен исходным байтам', () => {
  const img = track(), raw = Buffer.alloc((128 * 4 + 1) * 128);
  for (let y = 0; y < 128; y++) img.rgba.copy(raw, y * (128 * 4 + 1) + 1, y * 128 * 4, (y + 1) * 128 * 4);
  const chunk = (tag, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    return Buffer.concat([len, Buffer.from(tag, 'latin1'), body, Buffer.alloc(4)]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(128, 0); head.writeUInt32BE(128, 4); head[8] = 8; head[9] = 6;
  const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  assert.ok(decodePng(file).rgba.equals(img.rgba));
});

test('js/CollapseTrainMesh.js собран из манифеста: все грани, файл не правлен руками', () => {
  const man = readManifest(), text = render(man);
  assert.equal(fs.readFileSync(OUT, 'utf8'), text);
  const triangles = [...text.matchAll(/"idx":\[(.*?)\]/g)].reduce((n, m) => n + m[1].split(',').length / 3, 0);
  assert.equal(triangles, man.faces.reduce((n, f) => n + f.triangles.length, 0));
});

test('старый тоннель, плоский фронт и спрайт паровоза ушли из сцены и сборки', async () => {
  const { refs } = await collectRefs(ROOT);
  const old = refs.filter(r => /^assets\/textures\/(tunnel|collapse)\/|\/front_\d|^assets\/px\/train\/|sprites\/collapse\/(brick|rail)_debris_/.test(r));
  assert.deepEqual(old, []);
  const world = refs.filter(r => /^assets\/(textures\/(world|train)|sprites\/world)\//.test(r));
  assert.equal(world.length, 23 + 31, 'весь арт мира и поезда в сборке');
});
