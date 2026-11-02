// Card 45: the demon stands where the player looks in both orientations, ?land keeps its HUD and the
// Telegram lock follows the turn of the phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, stub } from './browser-scripts.mjs';

const page = (search = '') => loadScripts(['js/Constants.js', 'js/UILayout.js', 'js/UILand.js', 'js/UI.js', 'js/CollapseRules.js', 'js/CollapseScene.js', 'js/Telegram.js'],
  { location: { search }, URLSearchParams, BABYLON: stub() });

// What stands at x, height y, z in the frame: clip coordinates of the pinhole.
function frame(p, land, w, h, inset, plateShare) {
  const S = p.get('CollapseScene'), K = name => p.get('COLLAPSE_' + (land ? 'LAND_' : '') + name);
  const y = K('CAM_Y'), z = K('CAM_Z'), fov = K('CAM_FOV_DEG') * Math.PI / 180, t = Math.tan(fov / 2), ref = p.get('UI_REF_HEIGHT');
  const part = id => p.get('UI_LAYOUT').find(d => d.id === id).h / ref;
  const top = land ? 1 : 1 - 2 * (part('frameTop') + inset / h), bottom = land ? -1 : -1 + 2 * part('frameBottom');
  const pitch = S.fitPitch(y, z, fov, S.LOCO_TOP, top - 2 * p.get('COLLAPSE_CAM_TOP_GAP')), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const wide = land ? 1 - plateShare : 1, aspect = w / h;
  return { y, z, fov, t, top, bottom, wide, aspect, follow: K('CAM_FOLLOW'),
    clip(px, py, pz, camX) {
      const d = z - pz, drop = y - py, depth = d * cp + drop * sp;
      return { x: (px - camX) / (depth * t * aspect), y: (d * sp - drop * cp) / (depth * t) };
    } };
}

function standing(p, land, w, h, inset, lane, side, plateShare) {
  const S = p.get('CollapseScene'), D = S.demonLook(land), f = frame(p, land, w, h, inset, plateShare), camX = S.laneX(lane) * f.follow;
  const host = { view: { camera: { position: { z: f.z }, fov: f.fov } }, engine: { getAspectRatio: () => f.aspect }, frameWide: f.wide, camX };
  const size = D.px * D.art, x = S.prototype._inFrameX.call(host, side * (S.WALL_X - D.wallGap - (D.contact[0] - D.px / 2) * D.art), D.z, D.frameShare);
  const foot = D.footY + (D.contact[1] - D.px) * D.art;
  const near = x + side * size * 0.34, far = x - side * size * 0.34;        // the body: the art's opaque box, 0.16..0.84 across, 0.06..0.84 down
  return { f, feet: f.clip(x, foot + size * 0.16, D.z, camX), head: f.clip(x, foot + size * 0.94, D.z, camX), near: f.clip(near, foot, D.z, camX).x, far: f.clip(far, foot, D.z, camX).x, nose: f.clip(0, 0, 0, 0).y };
}

const SCREENS = [[false, 320, 568], [false, 360, 640], [false, 360, 800], [false, 390, 844], [false, 412, 915], [false, 430, 932], [true, 844, 390], [true, 915, 412]];

test('демон стоит перед носом поезда и целиком в кадре: две ориентации, все экраны, полосы, стены, отступы', () => {
  const p = page();
  for (const [land, w, h] of SCREENS) {
    const plate = land ? 2 * p.get('UI_LAND_PLATE') * h / p.get('UI_REF_HEIGHT_LAND') / w : 0;
    for (const inset of land ? [0] : [0, 48, 92]) {
      for (const lane of [0, 1, 2]) {
        for (const side of [-1, 1]) {
          const r = standing(p, land, w, h, inset, lane, side, plate), name = `${w}x${h}, отступ ${inset}, полоса ${lane}, стена ${side}`;
          assert.ok(r.feet.y < r.nose, `${name}: ноги не ниже носа поезда`);
          assert.ok(r.feet.y >= r.f.bottom, `${name}: ноги под нижней плашкой`);
          assert.ok(r.head.y <= r.f.top, `${name}: голова над кадром`);
          for (const x of [r.near, r.far]) assert.ok(Math.abs(x) <= r.f.wide, `${name}: корпус за краем кадра, ${x.toFixed(3)}`);
        }
      }
    }
  }
});

test('?land: таблица плашек ложится на записи раскладки, сами записи целы', () => {
  const p = page('?land'), UI = p.get('UI'), layout = p.get('UI_LAYOUT'), over = p.get('UI_LAND'), ids = new Set(layout.map(d => d.id));
  assert.equal(p.get('IS_LAND'), true);
  assert.equal(page().get('IS_LAND'), false);
  for (const id of Object.keys(over)) assert.ok(ids.has(id), id);
  for (const [id, f] of Object.entries(over)) if (f.parent) assert.ok(ids.has(f.parent), id + ' -> ' + f.parent);
  const before = JSON.stringify(layout), land = UI.overlay(layout, over);
  assert.equal(JSON.stringify(layout), before);
  assert.equal(land.find(d => d.id === 'frameTop').stretch, 'v');
  // The HUD's columns fill the plates: on the low screen a plate is narrower than a column.
  assert.equal(land.find(d => d.id === 'dist').parent, 'hudTopCol');
  assert.equal(land.find(d => d.id === 'hudTopCol').parent, 'frameTop');
  // Every panel that shows in a menu fits the low screen.
  const H = p.get('UI_REF_HEIGHT_LAND');
  for (const id of ['mainScreen', 'modeScreen', 'settingsScreen', 'shopScreen', 'overBox', 'boardBox']) assert.ok(land.find(d => d.id === id).h <= H, id);
  // Both layouts keep the settings inside their panel, the portrait one on a low screen under Telegram's inset.
  for (const [rows, name] of [[layout, 'вертикаль'], [land, 'горизонталь']]) {
    const panel = rows.find(d => d.id === 'settingsScreen');
    for (const d of rows.filter(r => r.parent === 'settingsScreen')) {
      const size = d.kind === 'text' ? { w: 0, h: 24 } : d, box = UI.resolve(d, size.w, size.h, panel.w, panel.h);
      assert.ok(box.left >= 0 && box.left + size.w <= panel.w && box.top >= 0 && box.top + size.h <= panel.h, `${name}: ${d.id}`);
    }
  }
  assert.ok(layout.find(d => d.id === 'settingsScreen').h <= (568 - 92) / 568 * p.get('UI_REF_HEIGHT'), 'настройки на низком экране');
  const plate = p.get('UI_LAND_PLATE');
  const plates = ['frameTop', 'frameBottom', 'hudTopCol', 'hudBottomCol'];
  for (const d of land) if (plates.includes(d.parent) && !d.stretch) if (d.w) assert.ok(d.w <= plate, d.id);
});

// A client of the given version: the calls it got, in order.
function client(p, version) {
  const calls = [], TG = p.get('TG'), rec = name => () => calls.push(name);
  TG.app = { initData: 'x', platform: 'android', isVersionAtLeast: v => Number(v) <= version,
    ready() {}, expand() {}, disableVerticalSwipes() {}, requestFullscreen: rec('fullscreen'), lockOrientation: rec('lock'), unlockOrientation: rec('unlock'),
    setHeaderColor() {}, setBackgroundColor() {}, onEvent() {} };
  return { TG, calls };
}

test('выбор в настройках включает широкий экран без адреса, другой выбор его не включает', () => {
  const load = value => loadScripts(['js/Constants.js'], { location: { search: '' }, URLSearchParams,
    localStorage: { getItem: k => (k === 'collapse.orientation' ? value : null), setItem() {}, removeItem() {} } }).get('IS_LAND');
  assert.equal(load('land'), true);
  assert.equal(load('portrait'), false);
  assert.equal(load(null), false);
});

test('Telegram: вертикаль запирается при запуске, ?land только после поворота; старый клиент молчит', () => {
  const tall = client(page(), 8);
  tall.TG.boot(null);
  assert.deepEqual([...tall.calls], ['fullscreen', 'lock']);
  const wide = client(page('?land'), 8);
  wide.TG.boot(null);
  assert.deepEqual([...wide.calls], ['fullscreen']);
  wide.TG.holdOrientation(false);
  wide.TG.holdOrientation(true);
  assert.deepEqual([...wide.calls], ['fullscreen', 'unlock', 'lock']);
  const old = client(page('?land'), 7.7);
  old.TG.boot(null);
  old.TG.holdOrientation(true);
  assert.deepEqual([...old.calls], []);
});

test('тёмная подложка демона не пишет глубину: в плоскости спрайта она резала его полосами (bug-demon-readability)', () => {
  const p = page(), S = p.get('CollapseScene'), made = [];
  const mesh = () => { const m = { material: {}, position: {}, renderingGroupId: 0, setVerticesData() {}, getVerticesData: () => [], setEnabled() {} }; made.push(m); return m; };
  const host = { demon: S.DEMON, sprite: mesh };
  S.prototype._buildDemons.call(host);
  assert.equal(made.length, 4);
  const shades = made.filter(m => m.renderingGroupId === 1);
  assert.equal(shades.length, 2);
  for (const m of shades) assert.equal(m.material.disableDepthWrite, true);
});
