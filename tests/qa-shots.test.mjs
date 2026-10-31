// tools/qa-shots.mjs: phone-size screenshots over the DevTools protocol — the pure parts and the
// zero-dependency rule (only node: modules and Node's built-in WebSocket).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './browser-scripts.mjs';
import { parseSizes } from '../tools/qa-shots.mjs';

test('qa-shots: размеры WxH разбираются, кривой размер — ошибка', () => {
  assert.deepEqual(parseSizes('360x640, 390x844').map(s => ({ ...s })), [{ width: 360, height: 640 }, { width: 390, height: 844 }]);
  assert.throws(() => parseSizes('360*640'));
});

test('qa-shots: без зависимостей — импорты только node:, размер задаёт эмуляция, а не окно', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'qa-shots.mjs'), 'utf8');
  const imports = [...src.matchAll(/^import .* from '([^']+)';/gm)].map(m => m[1]);
  assert.ok(imports.length > 0 && imports.every(m => m.startsWith('node:')), imports.join(', '));
  assert.match(src, /Emulation\.setDeviceMetricsOverride/);
  assert.doesNotMatch(src, /--window-size/);
});

test('qa-shots: --help печатает справку и выходит, браузер не запускается', () => {
  const r = spawnSync(process.execPath, ['tools/qa-shots.mjs', '--help', '--browser=' + path.join(ROOT, 'нет-такого-браузера')], { cwd: ROOT, encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--timeout=/);
});
