// Game start without a browser: the scripts of index.html in their order, the scene constructor on the
// Babylon stub, every art address and preload list on disk. An error here dropped the start of the game
// while the logic tests stayed green.
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, stub, ROOT } from './browser-scripts.mjs';

const pageScripts = () => [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]).filter(f => f !== 'js/main.js');

// The Babylon stub, but textures are real records: what the scene asked for, and an error to report.
function start(extra = {}) {
  const textures = [], failed = [], image = [];
  const Texture = class {
    constructor(url) { this.url = url; textures.push(this); }
    clone() { return new Texture(this.url); }
    releaseInternalTexture() { this.released = true; }
    updateURL(url, buffer) {
      // Babylon's cache: a copy still holding the failed internal texture hands it back.
      this.broken = textures.some(t => t.url === this.url && !t.released);
      this.url = url; this.buffer = buffer;
    }
  };
  Texture.OnTextureLoadErrorObservable = { add: fn => failed.push(fn) };
  Object.assign(Texture, { NEAREST_NEAREST_MIPLINEAR: 1, NEAREST_SAMPLINGMODE: 2, CLAMP_ADDRESSMODE: 3 });
  const Tools = { UseFallbackTexture: true };
  const base = stub();
  const BABYLON = new Proxy(base, { get: (t, key) => (key === 'Texture' ? Texture : key === 'Tools' ? Tools : base[key]) });
  const globals = {
    BABYLON, location: { search: '' }, URLSearchParams, addEventListener() {},
    Image: class { constructor() { image.push(this); } },
    document: { createElement: () => ({ getContext: () => ({ fillRect() {} }), toDataURL: () => 'data:image/png;base64,flat' }) },
    ...extra,
  };
  const p = loadScripts(pageScripts(), globals);
  Object.assign(p.get('World3D'), { createView: stub(), resize: stub() });   // no engine without a canvas
  const scene = new (p.get('CollapseScene'))({ clientHeight: 844 });
  return { p, scene, textures, failed, image, Tools };
}

test('запуск: скрипты index.html идут по порядку, конструктор CollapseScene проходит', () => {
  const { textures } = start();
  assert.ok(textures.length > 50, `текстур запрошено ${textures.length}`);
  for (const t of textures) {
    assert.equal(typeof t.url, 'string', 'текстура без адреса');
    assert.ok(fs.existsSync(path.join(ROOT, t.url)), t.url);
  }
});

test('каждый адрес CollapseArt и каждый список предзагрузки определён, файл на месте', () => {
  const { p } = start();
  const urls = [];
  const walk = (v, at) => {
    assert.notEqual(v, undefined, at);
    if (typeof v === 'string') { if (/\.png$/.test(v)) urls.push([at, v]); } else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at + '.' + k);
    else assert.equal(typeof v, 'number', at);
  };
  walk(p.get('CollapseArt'), 'CollapseArt');
  const { mipped, plain } = p.get('CollapseScene').preloadUrls();
  const Game = p.get('Game'), lists = { mipped, plain, ICONS: Object.values(Game.ICONS), PORTRAITS: Object.values(Game.PORTRAITS), DIGITS: p.get('UI').DIGITS };
  for (const [name, list] of Object.entries(lists)) {
    assert.ok(list.length > 0, name);
    list.forEach((u, i) => { assert.equal(typeof u, 'string', `${name}[${i}]`); urls.push([name, u]); });
  }
  assert.ok(urls.length > 150, `адресов ${urls.length}`);
  for (const [at, u] of urls) if (u) assert.ok(fs.existsSync(path.join(ROOT, u)), `${at}: ${u}`);
});
