// The icons over the bottom plate (card 21): CollapseRun.ahead says what comes, Game.frameEntry says
// where the frame starts, Game.iconSlots puts it on the screen. The truth of the probes is their own
// scan of the track; time is the run's own fixed step, with real boosts and real lane changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const page = () => loadScripts(['js/Constants.js', 'js/UILayout.js', 'js/CollapseRules.js', 'js/CollapseScene.js', 'js/Game.js']);
const SIZES = [[390, 844], [360, 640]];

// The camera of Constants.js and the plates of UILayout.js, as Game._frameNow reads them from the page.
function camera(p, w, h) {
  const height = id => p.get('UI_LAYOUT').find(d => d.id === id).h / p.get('UI_REF_HEIGHT');
  return {
    y: p.get('COLLAPSE_CAM_Y'), z: p.get('COLLAPSE_CAM_Z'),
    pitch: Math.atan2(p.get('COLLAPSE_CAM_Y'), p.get('COLLAPSE_CAM_Z') - p.get('COLLAPSE_CAM_LOOK_Z')),
    fov: p.get('COLLAPSE_CAM_FOV_DEG') * Math.PI / 180, aspect: w / h,
    top: 1 - 2 * height('frameTop'), bottom: -1 + 2 * height('frameBottom'),
  };
}

// Every object of the track: where it stands, what of it the frame catches, the slot it belongs to.
function objects(run, from, to) {
  const t = run.track, out = [];
  for (let i = Math.max(1, from); i < to; i++) {
    const s = t.seg(i), b = t.seg(i - 1);
    for (const l of [0, 1, 2]) {
      if (s.gap[l] && !b.gap[l]) out.push({ key: `gap:${l}:${i}`, kind: 'gap', body: 'gap', lane: l, pos: i });
      if (s.lava[l] && !b.lava[l]) out.push({ key: `lava:${l}:${i}`, kind: 'lava', body: 'lava', lane: l, pos: i + 0.5 });
      if (s.pickup[l]) out.push({ key: `${s.pickup[l]}:${l}:${i}`, kind: s.pickup[l], body: 'pickup', lane: l, pos: i + 0.5 });
    }
    for (const d of s.demon || []) out.push({ key: `demon:${d.side}:${i}`, kind: 'demon', body: '', lane: -1, pos: i });
  }
  return out.sort((a, c) => a.pos - c.pos);
}
const keyOf = it => `${it.kind}:${it.lane < 0 ? it.side : it.lane}:${it.at}`;

// One run: a driver who cannot die takes a random fork from every next one. Returns per object the
// time its icon lit and the time it entered the frame, and the icons with nothing behind them.
function drive(p, seed, cam, opts) {
  const Game = p.get('Game'), S = p.get('CollapseScene'), R = p.get('CollapseRules'), Run = p.get('CollapseRun');
  const run = new Run(seed), dice = R.rng(seed ^ 0xabc);
  run.invuln = run.ammo = 1e9;
  if (opts.limit) { run.pos = run._seg = 900; run.boost = 1e9; }
  const list = objects(run, Math.floor(run.pos) - 1, Math.floor(run.pos) + 1500);
  const lead = run.c.iconLead, follow = p.get('COLLAPSE_CAM_FOLLOW');
  const reach = Game.frameTable(cam, null, follow), tables = new Map();
  const lit = new Map(), entered = new Map(), wrong = [];
  const byKey = new Map(list.map(o => [o.key, o]));
  let lo = 0, third = 0;
  for (let f = 0; f < 60 * opts.sec; f++) {
    const next = run.nextFork();
    if (next && !next.armed && dice() < 0.5) run.shoot(next.at, next.to[Math.floor(dice() * next.to.length)]);
    const camX = Math.round(S.laneX(run.laneX()) * follow / 8) * 8;
    if (!tables.has(camX)) tables.set(camX, Game.frameTable(cam, camX));
    const enter = tables.get(camX);
    const items = run.ahead(lead, enter, reach), slots = Game.iconSlots(items);
    if (items.length > slots.size) third++;
    for (const it of slots.values()) {
      const o = byKey.get(keyOf(it));
      const inFrame = o && o.pos - run.pos <= (o.body ? enter[o.body][o.lane] : 0);
      if (!o || inFrame) wrong.push(keyOf(it) + ' @' + run.pos.toFixed(2));
      else if (!lit.has(o.key)) lit.set(o.key, { t: run.time, first: f === 0 });
    }
    while (list[lo] && list[lo].pos < run.pos - 1) lo++;
    for (let i = lo; i < list.length && list[i].pos < run.pos + 20; i++) {
      const o = list[i];
      if (!entered.has(o.key) && o.pos - run.pos <= (o.body ? enter[o.body][o.lane] : 0)) entered.set(o.key, f ? run.time : -1);
    }
    run.update(1 / 60);
  }
  return { byKey, lit, entered, wrong, third, lead, pos: run.pos };
}

function probe(p, opts) {
  let objectsSeen = 0, atStart = 0, shortest = Infinity, wrong = 0, third = 0;
  const kinds = new Set(), late = [];
  for (const [w, h] of SIZES) {
    const cam = camera(p, w, h);
    for (let seed = 1; seed <= 20; seed++) {
      const r = drive(p, seed, cam, opts);
      wrong += r.wrong.length;
      third += r.third;
      for (const [key, t] of r.entered) {
        if (t < 0) continue;      // in the frame from the first frame of the run
        const icon = r.lit.get(key);
        if (icon && icon.first) { atStart++; continue; }
        objectsSeen++;
        kinds.add(r.byKey.get(key).kind);
        const gain = icon ? t - icon.t : -1;
        shortest = Math.min(shortest, gain);
        if (gain < r.lead - 1 / 60 - 1e-9) late.push(`${w}x${h} зерно ${seed} ${key}: ${gain.toFixed(3)} с`);
      }
    }
  }
  return { objectsSeen, atStart, shortest, wrong, third, kinds, late };
}

test('20 зёрен, обычный забег с ускорителями и сменами полос: иконка не позже COLLAPSE_ICON_LEAD_SEC до входа в кадр, ложных 0', () => {
  const r = probe(page(), { sec: 240 });
  assert.deepEqual(r.late.slice(0, 5), [], `опоздали ${r.late.length} из ${r.objectsSeen}, кратчайшее упреждение ${r.shortest}`);
  assert.equal(r.wrong, 0, 'ложные иконки');
  assert.equal(r.third, 0, 'предмет остался без слота');
  assert.deepEqual([...r.kinds].sort(), ['ammo', 'boost', 'demon', 'gap', 'lava', 'rescue', 'shield', 'slow']);
  assert.ok(r.objectsSeen > 3000, `предметов ${r.objectsSeen}`);
});

test('20 зёрен на пределе (полная скорость под ускорителем): то же упреждение', () => {
  const p = page(), r = probe(p, { sec: 60, limit: true });
  const c = p.get('CollapseRules').cfg();
  assert.equal(new (p.get('CollapseRun'))(1).c.speedMax * c.boostMult, 6.75, 'предельная скорость проверки');
  assert.deepEqual(r.late.slice(0, 5), [], `опоздали ${r.late.length} из ${r.objectsSeen}, кратчайшее упреждение ${r.shortest}`);
  assert.equal(r.wrong, 0, 'ложные иконки');
  assert.equal(r.third, 0, 'предмет остался без слота');
  assert.ok(r.objectsSeen > 1000, `предметов ${r.objectsSeen}`);
});

test('вход в кадр: пол по камере из карточки 20 — 7,67 сегмента; боковая полоса на узком экране входит ближе, лава раньше своего основания', () => {
  const Game = page().get('Game');
  const cam = { x: 0, y: 650, z: 3000, pitch: Math.atan2(650, 3000 - 920), fov: 40 * Math.PI / 180, aspect: 9 / 19.5, top: 1, bottom: -1 };
  assert.ok(Math.abs(Game.frameEntry(cam, 0, 0, 0) - 7.67) <= 0.13, 'пол по центру');
  const side = Game.frameEntry(cam, 300, 0, 0);
  assert.ok(side > 4 && side < 6, `центр боковой полосы ${side}`);
  assert.ok(Game.frameEntry(cam, 0, 85, 880) > 9, 'поток лавы виден у самого объектива');
  assert.ok(Game.frameEntry({ ...cam, bottom: -0.7 }, 0, 0, 0) < 7.5, 'плашка закрывает низ кадра');
  assert.ok(Game.frameEntry({ ...cam, x: 300 }, 300, 0, 0) > side, 'камера у полосы видит её дальше');
});

test('слоты: ближайшая в большом, следующая в малом, демон у своей стены, иначе пусто', () => {
  const Game = page().get('Game');
  const it = (kind, lane, side, dist) => ({ kind, lane, side, at: 9, dist });
  const s = Game.iconSlots([it('gap', 0, 0, 8), it('demon', -1, 1, 9), it('ammo', 0, 0, 10), it('lava', 2, 0, 11), it('demon', -1, -1, 12)]);
  assert.deepEqual([...s].map(([id, v]) => id + '=' + v.kind).sort(),
    ['iconLane0=gap', 'iconLane0Next=ammo', 'iconLane2=lava', 'iconWallLeft=demon', 'iconWallRight=demon']);
  for (const id of s.keys()) assert.ok(Game.ICON_IDS.includes(id), id);
  const ids = page().get('UI_LAYOUT').map(d => d.id);
  for (const id of Game.ICON_IDS) assert.ok(ids.includes(id), `нет записи ${id} в UILayout.js`);
});
