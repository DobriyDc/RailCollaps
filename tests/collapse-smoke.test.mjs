// Game start without a browser: the scripts of index.html in their order, the scene constructor on the
// Babylon stub, every art address and preload list on disk. An error here dropped the start of the game
// while the logic tests stayed green. What fails to load in play: the texture fallback, the digits.
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

test('текстура не загрузилась: шахматка выключена, один повтор, потом ровный цвет у всех копий адреса', () => {
  const { p, scene, textures, failed, image, Tools } = start();
  assert.equal(Tools.UseFallbackTexture, false, 'шахматка Babylon');
  const url = p.get('CollapseArt').tex.track, tex = scene.texture(url), copy = tex.clone(), other = scene.texture(p.get('CollapseArt').tex.wall);
  scene.scene = { textures };
  failed[0](tex);
  failed[0](copy);
  const tries = image.filter(i => i.src === url);
  assert.equal(tries.length, 1, 'повтор один на адрес');
  tries[0].onerror();
  assert.match(tex.url, /^data:/);
  assert.match(copy.url, /^data:/);
  assert.equal(other.url, p.get('CollapseArt').tex.wall, 'чужой адрес не тронут');
  failed[0](tex);
  assert.equal(image.length, 1, 'ровный цвет не повторяется');
});

test('повтор удался: текстура берёт файл второй попытки', () => {
  const { p, scene, textures, failed, image } = start();
  const url = p.get('CollapseArt').tex.wall, tex = scene.texture(url), copy = tex.clone();
  scene.scene = { textures };
  failed[0](tex);
  image[0].onload();
  for (const t of [tex, copy]) {
    assert.equal(t.url, url);
    assert.equal(t.buffer, image[0]);
    assert.ok(!t.broken, 'копия взяла из кэша неудачную текстуру');
  }
});

test('ровный цвет: из палитры у пола, стен, лавы, поезда, демона, стрелок; эффекты и края провала ничего не закрывают', () => {
  const { p } = start();
  const A = p.get('CollapseArt'), S = p.get('CollapseScene'), palette = new Set(p.get('CollapseLook').PALETTE);
  for (const u of [...Object.values(A.tex), ...A.lava, ...A.loco, A.demon.perch[0], A.sign.cross, A.sw.waiting, A.pickup.ammo, A.bg[0].url]) {
    assert.ok(palette.has(S.flatColor(u)), `${u}: ${S.flatColor(u)}`);
  }
  for (const u of [A.gap.front, A.fx.smoke[0], A.crackWall[0], A.shield[0], A.torch[0], A.demon.ash[0], A.switches.both.left]) assert.equal(S.flatColor(u), null, u);
});

test('цифра рамки: файл не загрузился — один повтор, потом цифра текстом, больше за файлом не ходим', () => {
  const { p } = start();
  const UI = p.get('UI'), node = tag => ({ tag, style: {}, textContent: '', replaceWith(n) { this.replaced = n; } });
  const old = p.ctx.document;
  p.ctx.document = { createElement: node };
  const img = UI.digitNode('7', 32);
  assert.equal(img.tag, 'img');
  img.onerror();
  assert.equal(img.replaced, undefined, 'первый отказ — повтор');
  img.onerror();
  assert.equal(img.replaced.textContent, '7');
  assert.equal(UI.digitNode('7', 32).tag, 'span');
  assert.equal(UI.digitNode('8', 32).tag, 'img');
  p.ctx.document = old;
});
