// The collapse in the world (js/CollapseRuin.js, card 46): the smooth front of the rules becomes blows,
// and what has fallen stands in the world wherever the train has gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const page = () => loadScripts(['js/Constants.js', 'js/CollapseRules.js', 'js/CollapseRuin.js', 'js/CollapseScene.js']);
const DT = 1 / 60;

// One front history, one train: the train is `gap` segments ahead of the front.
function ride(p, gap, sec, keep = () => {}) {
  const Ruin = p.get('CollapseRuin');
  const r = new Ruin();
  let front = 25, t = 0;
  r.begin(front);
  for (let k = 0; k < sec / DT; k++) {
    front += 1.8 * DT;
    t += DT;
    r.update(front, front + gap, t);
    keep(r, front, t);
  }
  return { r, front, t };
}

// The world place of every layer stand as the scene writes it into its instance buffers.
function layersInWorld(p, r, time, pos) {
  const S = p.get('CollapseScene');
  const scene = Object.create(S.prototype);
  scene.ruin = r;
  scene.time = time;
  scene.bgLayers = r.stands.map((_, k) => ({ back: k * 1000, buf: new Float32Array(16 * p.get('CollapseRuin').STANDS),
    mesh: { thinInstanceBufferUpdated() {}, setEnabled() {}, material: { emissiveTexture: {} } } }));
  scene._syncLayers(pos);
  return scene.bgLayers.map(l => r.stands[scene.bgLayers.indexOf(l)].map((_, n) => l.buf[n * 16 + 14] + pos * S.SEG + l.back));
}

test('фронт правил плавный, вид идёт ударами с паузами', () => {
  const p = page(), at = [];
  let last = null;
  const { r } = ride(p, 6, 60, (x, front, t) => {
    assert.ok(x.edge >= front, 'край не показывает больше места, чем есть');
    if (last !== null && x.edge !== last) at.push({ t, step: x.edge - last });
    last = x.edge;
  });
  const pauses = at.slice(1).map((b, k) => b.t - at[k].t);
  assert.ok(at.length < 60 * 1.8 * 0.75, `ударов ${at.length}`);
  assert.ok(Math.max(...pauses) > 1, `самая длинная пауза ${Math.max(...pauses)}`);
  assert.ok(Math.min(...pauses) < 0.7, `самая короткая пауза ${Math.min(...pauses)}`);
  assert.ok(at.some(b => b.step >= 2), 'удар берёт несколько секций');
  assert.ok(r.struck.size > 0);
});

test('рухнувшие куски и слои стоят в мире: позиция поезда на них не влияет', () => {
  const p = page();
  // A moment right after a blow: the pieces of the last one are still in the air.
  let sec = 20;
  while (!ride(p, 6, sec).r.chunks.some(c => c.edge)) sec += 0.25;
  const a = ride(p, 6, sec), b = ride(p, 9, sec);
  assert.equal(a.r.edge, b.r.edge);
  assert.deepEqual([...a.r.struck], [...b.r.struck]);
  assert.deepEqual(a.r.stands, b.r.stands);
  const edge = x => x.r.chunks.filter(c => c.edge).map(c => x.r.chunkAt(c, x.t));
  assert.ok(edge(a).length > 0);
  assert.deepEqual(edge(a), edge(b));
  assert.deepEqual(layersInWorld(p, a.r, a.t, a.front + 6), layersInWorld(p, b.r, b.t, b.front + 9));
});

test('слой не едет: поезд ушёл на 8 сегментов, мировое место слоя то же', () => {
  const p = page(), { r, front, t } = ride(p, 6, 20);
  assert.deepEqual(layersInWorld(p, r, t, front + 6), layersInWorld(p, r, t, front + 14));
});

test('новый обвал начинается в темноте: старт не играется, завал светит только вблизи', () => {
  const p = page(), S = p.get('CollapseScene'), Ruin = p.get('CollapseRuin'), r = new Ruin(), c = p.get('CollapseRules').cfg();
  assert.ok(c.eventGap < S.BEHIND, 'обвал стартует внутри окна сегментов');
  r.begin(-1e9);
  assert.equal(r.fallen(100, 5), -1, 'до обвала туннель цел');
  r.update(100 - c.eventGap, 100, 5);
  assert.equal(r.blows, 0, 'скачок к новому месту не удар');
  assert.equal(r.struck.size, 0);
  assert.ok(r.fallen(100 - c.eventGap - 1, 5) > 0, 'позади него пусто');
  const level = gap => {
    const mesh = { thinInstanceBufferUpdated() {}, setEnabled(on) { this.on = on; }, material: { emissiveTexture: {} } };
    const scene = Object.create(S.prototype);
    Object.assign(scene, { ruin: r, time: 5, bgLayers: [{ back: 0, buf: new Float32Array(16 * Ruin.STANDS), mesh }] });
    scene._syncLayers(r.edge + gap);
    return mesh.on ? mesh.material.emissiveTexture.level : 0;
  };
  assert.equal(level(c.frontMaxGap), 1);
  assert.ok(level(12) > 0 && level(12) < 1);
  assert.equal(level(S.BEHIND), 0);
});

test('кусок рядом с поездом выбран у поезда, но дальше поезд его не тянет', () => {
  const p = page(), Ruin = p.get('CollapseRuin'), r = new Ruin();
  r.begin(20);
  r.update(30, 33, 1);
  const near = r.chunks.filter(c => !c.edge);
  assert.ok(near.length > 0);
  const place = () => near.map(c => r.chunkAt(c, 1.5));
  const was = place();
  r.update(30, 45, 1);
  assert.deepEqual(place(), was);
});

test('чем ближе удар, тем больше кусков у поезда и сильнее вздрагивает камера', () => {
  const p = page(), Ruin = p.get('CollapseRuin');
  const blow = gap => {
    const r = new Ruin();
    r.begin(20);
    r.update(30, 30 + gap, 1);
    return { jolt: r.jolt(1), near: r.chunks.filter(c => !c.edge).length };
  };
  assert.ok(blow(2).jolt > blow(6).jolt * 3);
  assert.ok(blow(2).near > blow(6).near);
});

test('щит отодвинул фронт: рухнувшее не встаёт, новых ударов нет, пока фронт не вернётся', () => {
  const p = page(), Ruin = p.get('CollapseRuin'), r = new Ruin();
  r.begin(20);
  r.update(30, 36, 1);
  const edge = r.edge, blows = r.blows, fell = r.fallen(edge - 1, 2);
  r.update(24, 37, 2);
  assert.equal(r.edge, edge);
  assert.equal(r.blows, blows);
  assert.equal(r.fallen(edge - 1, 2), fell);
});

test('обвал вплотную: край не заходит под поезд', () => {
  const p = page(), Ruin = p.get('CollapseRuin'), r = new Ruin();
  r.begin(20);
  for (let k = 0; k < 600; k++) {
    const front = 20 + k * 0.03, pos = front + 1.7;
    r.update(front, pos, k / 60);
    assert.ok(r.edge <= Math.ceil(pos - Ruin.TAIL), `край ${r.edge} при поезде ${pos}`);
  }
});

test('арка опускается только под обвалом: без него стоит, над поездом поднята, рухнувшая не зависит от поезда', () => {
  const p = page(), Ruin = p.get('CollapseRuin'), r = new Ruin();
  r.begin(-1e9);
  r.update(-1e9, 36, 1);
  assert.equal(r.sag(34, 36), 0, 'без обвала арка стоит');
  r.begin(20);
  r.update(30, 36, 1);
  assert.equal(r.sag(40, 36), 0);
  assert.equal(r.sag(34, 36), 0, 'до неё обвал не дошёл');
  assert.ok(r.sag(r.edge + 1, 36) > 0, 'трещины опускают её');
  assert.equal(r.sag(r.edge - 1, r.edge - 1), r.c.sag);
});
