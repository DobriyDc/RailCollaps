// Rail Link: Collapse tunnel signals (js/CollapseScene.js): what the scene shows is asked from the run,
// never decided by the scene. Only the pure statics — the 3D part is checked in the browser.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const page = () => loadScripts(['js/Constants.js', 'js/CollapseRules.js', 'js/CollapseScene.js']);

test('перед каждой опасностью на полосе стоит развилка-выход, и оставаться на полосе небезопасно', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun'), CollapseScene = p.get('CollapseScene');
  for (const seed of [1, 2, 3, 99, 2026]) {
    const run = new CollapseRun(seed), t = run.track;
    let hazards = 0;
    for (let i = 1; i < 1500; i++) {
      for (const lane of [0, 1, 2]) {
        const s = t.seg(i), before = t.seg(i - 1);
        const starts = (s.gap[lane] && !before.gap[lane]) || (s.lava[lane] && !before.lava[lane]);
        if (!starts) continue;
        hazards++;
        // The exit fork stands SWITCH_LEAD segments before the hazard; the cross is in the same row.
        const b = i - p.get('CollapseRules').SWITCH_LEAD;
        assert.ok(t.seg(b).forks.some(f => f.from === lane), `зерно ${seed}: нет развилки-выхода за ${i - b} сегм. до ${i}`);
        assert.ok(!run.forkSafe(b, lane), `зерно ${seed}: полоса ${lane} на границе ${b} считается безопасной перед опасностью ${i}`);
      }
    }
    assert.ok(hazards > 50, `зерно ${seed}: опасностей ${hazards}`);
  }
});

test('стрелочные переводы: на границе только «из средней» или только «в среднюю»; вид перевода по развилкам', () => {
  const p = page();
  const CollapseTrack = p.get('CollapseTrack'), S = p.get('CollapseScene');
  const groups = forks => JSON.parse(JSON.stringify(S.switchGroups(forks)));
  assert.deepEqual(groups([{ from: 1, to: 2 }]), [{ variant: 'right', flip: false }]);
  assert.deepEqual(groups([{ from: 1, to: 0 }, { from: 1, to: 2 }]), [{ variant: 'both', flip: false }]);
  assert.deepEqual(groups([{ from: 0, to: 1 }]), [{ variant: 'left', flip: true }]);
  assert.deepEqual(groups([{ from: 0, to: 1 }, { from: 2, to: 1 }]), [{ variant: 'both', flip: true }]);
  let boundaries = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const t = new CollapseTrack(seed);
    for (let i = 0; i < 3000; i++) {
      const forks = t.seg(i).forks;
      if (!forks.length) continue;
      boundaries++;
      assert.ok(forks.every(f => f.from === 1 || f.to === 1), `зерно ${seed}, граница ${i}: развилка мимо средней полосы`);
      assert.equal(S.switchGroups(forks).length, 1, `зерно ${seed}, граница ${i}: два перевода внахлёст ${JSON.stringify(forks)}`);
    }
  }
  assert.ok(boundaries > 1000);
});

test('остряки: прямо, пока стрелка не взведена; после выстрела — в сторону выбранной полосы', () => {
  const S = loadScripts(['js/Constants.js', 'js/CollapseRules.js', 'js/CollapseScene.js']).get('CollapseScene');
  const out = { variant: 'both', flip: false }, into = { variant: 'both', flip: true };
  assert.equal(S.pointsState(out, null), 'straight');
  assert.equal(S.pointsState(out, { at: 5, from: 1, to: 0 }), 'left');
  assert.equal(S.pointsState(out, { at: 5, from: 1, to: 2 }), 'right');
  assert.equal(S.pointsState(into, null), 'straight');
  assert.equal(S.pointsState(into, { at: 5, from: 2, to: 1 }), 'right');
  assert.equal(S.pointsState(into, { at: 5, from: 0, to: 1 }), 'left');
});

test('нажатие: по демону засчитывается всё тело и след прыжка, демон важнее рычага под пальцем, мимо — мимо', () => {
  const Game = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/CollapseRules.js', 'js/Game.js'], { UI: {}, Sound3D: {}, TG: {}, Store: undefined }).get('Game');
  const demon = { x: 290, y: 240, kind: 'demon', side: 1, box: { l: 250, r: 335, t: 160, b: 320 } };
  const lever = { x: 268, y: 330, kind: 'fork', at: 9, to: 2 };
  const reach = 62, tap = (x, y, list = [demon, lever]) => Game.tapTarget(list, x, y, reach);
  assert.equal(tap(290, 240), demon, 'центр');
  assert.equal(tap(290, 165), demon, 'голова: дальше круга, но на теле');
  assert.equal(tap(290, 315), demon, 'ноги ближе к рычагу, но это демон');
  assert.equal(tap(340, 170), demon, 'край пальцем');
  assert.equal(tap(268, 345), lever, 'ниже тела — рычаг');
  assert.equal(tap(40, 700), null, 'мимо');
  assert.equal(tap(280, 290, [lever]), lever, 'рычаг в своём радиусе');
  const pair = [demon, { ...demon, x: 90, side: -1, box: { l: 50, r: 130, t: 160, b: 320 } }];
  assert.equal(tap(100, 200, pair).side, -1);
  const flying = { ...demon, box: page().get('CollapseScene').boxUnion({ l: 200, r: 400, t: 130, b: 330 }, { l: 190, r: 410, t: 300, b: 520 }) };
  assert.equal(tap(300, 500, [flying]), flying, 'палец опоздал за прыжком');
});

test('демон запрыгивает, почти не уменьшаясь: на кабине на экране 85 % размера со стены, в горизонтали 60 %', () => {
  const p = page(), S = p.get('CollapseScene');
  const screen = (D, cam, z, scale) => D.art * scale * cam / (cam - z);
  for (const [land, cam, share] of [[false, p.get('COLLAPSE_CAM_Z'), 0.85], [true, p.get('COLLAPSE_LAND_CAM_Z'), 0.6]]) {
    const D = S.demonLook(land), wall = screen(D, cam, D.z, 1), cab = screen(D, cam, S.CAB_SIDE[2], S.hangScale(D, cam));
    assert.ok(Math.abs(cab / wall - share) < 1e-9, `${land}: ${cab / wall}`);
  }
});

test('поезд на стрелке стоит на рельсах: нос ровно на кривой, куда бы ни смотрел кадр', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { ROOT } = await import('./browser-scripts.mjs');
  const { decodePng } = await import('../tools/art/check-art.mjs');
  const tip = name => {
    const { w, h, rgba } = decodePng(fs.readFileSync(path.join(ROOT, 'assets/px/train', name + '.png')));
    for (let y = h - 1; y >= 0; y--) {
      const xs = [];
      for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 128) xs.push(x);
      if (xs.length) return (xs[0] + xs[xs.length - 1]) / 2;
    }
    return NaN;
  };
  const S = page().get('CollapseScene'), run = tip('loco_run_0');
  for (const side of ['left', 'right']) assert.equal(tip('loco_turn_' + side) - run, S.LOCO_NOSE[side], side);
  const px = S.LOCO.w / S.LOCO_PX;
  for (const x of [-300, -137, 0, 42, 300]) {
    assert.equal(S.trainAt(x, ''), x, 'кадр бега стоит на кривой');
    for (const side of ['left', 'right']) assert.ok(Math.abs(S.trainAt(x, side) + S.LOCO_NOSE[side] * px - x) < 1e-9, side);
  }
});

test('поезда магазина: полный набор — свои кадры на диске, передний слой того же холста, демон держит свою точку', async () => {
  const path = await import('node:path');
  const { ROOT } = await import('./browser-scripts.mjs');
  const { decodePng } = await import('../tools/art/check-art.mjs');
  const p = page(), S = p.get('CollapseScene'), A = p.get('CollapseArt');
  const size = url => { const { w, h } = decodePng(fs.readFileSync(path.join(ROOT, url))); return w + 'x' + h; };
  const px = S.LOCO.w / S.LOCO_PX;
  const base = S.trainLook(A.trains.base).cab, corner = [S.CAB_SIDE[0], 0, S.CAB_SIDE[1], S.CAB_SIDE[2]];
  for (const turn of ['', 'left', 'right']) assert.deepEqual([...base[turn]], corner, 'начальный паровоз держат за угол крыши');
  for (const [id, T] of Object.entries(A.trains)) {
    const frames = [...T.loco, ...Object.values(T.locoShot), ...Object.values(T.locoTurn), ...Object.values(T.locoFall), T.locoDamaged];
    for (const url of frames) assert.ok(fs.existsSync(path.join(ROOT, url)), url);
    if (T.full) assert.equal(new Set(frames).size, 11, id + ': одиннадцать разных кадров');
    const look = S.trainLook(T);
    if (T.over) assert.equal(look.over.size, 8, id + ': слой у хода, выстрела и поворота');
    for (const [frame, over] of look.over) assert.equal(size(over), size(frame), over);
    if (T.grip) {
      // [x of the right side, shift of both sides, y, z]: the right hand lands on the drawn detail in every frame.
      for (const [turn, g] of [['', T.grip], ['left', T.gripTurn.left], ['right', T.gripTurn.right]]) {
        const c = look.cab[turn];
        assert.ok(Math.abs(c[0] + c[1] - (g[0] - S.LOCO_PX / 2) * px) < 1e-9 && Math.abs(S.LOCO.h - c[2] - g[1] * px) < 1e-9, id + ' ' + turn);
        assert.ok(c[0] > 0 && c[2] > 0 && c[2] < S.LOCO.h, id + ': хват на правой стороне кабины');
      }
      for (const side of ['left', 'right']) assert.ok(Math.abs(T.nose[side]) < 20, id + ': нос поворота у края кривой');
    }
  }
  for (const id of ['hell', 'rune', 'bio']) assert.ok(A.trains[id].full, id + ' нарисован целиком');
});

test('поезд едет по нарисованному ответвлению: кривая растра = кривая laneX, перевод не заходит на опасный сегмент', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { ROOT } = await import('./browser-scripts.mjs');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'art_src/switches_v1/switches_manifest_v1.json'), 'utf8'));
  const p = page();
  const S = p.get('CollapseScene'), R = p.get('CollapseRules'), run = new (p.get('CollapseRun'))(1);
  assert.match(man.curve.type, /smoothstep/);
  assert.deepEqual([...S.SW_ROWS], [man.curve.end_y, man.curve.start_y]);
  assert.equal(man.curve.displacement_px, man.track_tile_px[0], 'смещение кривой — одна полоса');
  assert.equal(S.SW_PX, man.textures[0].canvas_px[1]);
  // The train crosses with laneX; the drawn curve at the same z is the manifest's smoothstep.
  run.prevLane = 1; run.lane = 0; run.switchAt = 10;
  for (const flip of [false, true]) {
    for (let k = 0; k <= 10; k++) {
      const z = k / 10 * R.SWITCH_LEN * S.SEG;
      run.pos = 10 + z / S.SEG;
      const row = S.switchRow(z, flip);
      const u = (man.curve.start_y - row) / (man.curve.start_y - man.curve.end_y);   // 0..1 along the drawn curve
      const s = u * u * (3 - 2 * u);              // the drawn curve's share of the way to the side lane
      const drawn = flip ? 1 - s : s;              // flipped: run backwards, from the side lane in
      const train = Math.abs(run.laneX() - run.prevLane);
      assert.ok(Math.abs(drawn - train) < 1e-9, `flip ${flip}, z ${z}: кривая ${drawn}, поезд ${train}`);
    }
  }
  assert.ok(S.SW_LEN <= R.SWITCH_LEAD * S.SEG, 'плита перевода кончается до опасности, ради которой стоит');
  // Full size: the drawn curve has the scale of the track texture along the track (128 px per LANE_W).
  const pxPerUnit = (S.SW_ROWS[1] - S.SW_ROWS[0]) / (R.SWITCH_LEN * S.SEG), trackPxPerUnit = man.track_tile_px[0] / S.LANE_W;
  assert.ok(Math.abs(pxPerUnit / trackPxPerUnit - 1) < 0.01, `перевод сжат вдоль пути в ${(trackPxPerUnit / pxPerUnit).toFixed(2)} раза`);
  // The plate's far end stays inside the texture (the straight rails past the curve, cut at the hazard).
  for (const flip of [false, true]) {
    const row = S.switchRow(S.SW_LEN, flip);
    assert.ok(row >= 0 && row <= S.SW_PX, `flip ${flip}: строка ${row} вне растра`);
  }
});

test('поезд целиком между плашками и рейками: шесть экранов, три полосы, безопасная зона 0, 48 и 92 px', () => {
  const p = loadScripts(['js/Constants.js', 'js/UILayout.js', 'js/CollapseRules.js', 'js/CollapseScene.js']);
  const S = p.get('CollapseScene'), share = id => p.get('UI_LAYOUT').find(d => d.id === id), ref = p.get('UI_REF_HEIGHT');
  const y = p.get('COLLAPSE_CAM_Y'), z = p.get('COLLAPSE_CAM_Z'), fov = p.get('COLLAPSE_CAM_FOV_DEG') * Math.PI / 180, t = Math.tan(fov / 2);
  const HW = S.LOCO.w / 2;
  for (const [w, h] of [[320, 568], [360, 640], [360, 800], [390, 844], [412, 915], [430, 932]]) {
    for (const inset of [0, 48, 92]) {
      const top = 1 - 2 * (share('frameTop').h * h / ref + inset) / h, bottom = -1 + 2 * share('frameBottom').h / ref;
      const pitch = S.fitPitch(y, z, fov, S.LOCO_TOP, top - 2 * p.get('COLLAPSE_CAM_TOP_GAP'));
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const v = at => (z * sp - (y - at) * cp) / ((z * cp + (y - at) * sp) * t);
      assert.ok(v(S.LOCO_TOP) <= top, `${w}x${h}, отступ ${inset}: труба под плашкой`);
      assert.ok(v(0) >= bottom, `${w}x${h}, отступ ${inset}: колёса под плашкой`);
      const side = 1 - 2 * share('frameLeft').w * h / ref / w, half = (z * cp + y * sp) * t * w / h;
      for (const l of [0, 1, 2]) {
        const x = S.laneX(l), cam = x * p.get('COLLAPSE_CAM_FOLLOW');
        assert.ok((Math.abs(x - cam) + HW) / half <= side, `${w}x${h}, полоса ${l}: паровоз за краем кадра`);
      }
    }
  }
});

test('изгиб на стрелке: ноль на прямой, единица в середине кривой, знак — в сторону новой полосы, без рывка', () => {
  const p = page(), S = p.get('CollapseScene'), R = p.get('CollapseRules'), run = new (p.get('CollapseRun'))(1);
  run.pos = 40;
  assert.equal(S.bendOf(run), 0);
  run.prevLane = 1; run.lane = 2; run.switchAt = 40;
  const at = t => { run.pos = 40 + t * R.SWITCH_LEN; return S.bendOf(run); };
  assert.ok(Math.abs(at(0.5) - 1) < 1e-3, 'вершина по касательной кривой');
  assert.ok(Math.abs(at(0.001)) < 0.02 && Math.abs(at(0.999)) < 0.05, 'концы кривой без рывка');
  run.lane = 0;
  assert.ok(at(0.5) < 0, 'влево — изгиб влево');
  let last = at(0);
  for (let t = 0.02; t < 1; t += 0.02) { const y = at(t); assert.ok(Math.abs(y - last) < 0.1, 'рывок на ' + t); last = y; }
});

test('края провала: первый сегмент дыры — front, последний — back, середина пуста, вне дыры ничего', () => {
  const S = page().get('CollapseScene');
  const track = { seg: i => ({ gap: [false, i >= 10 && i <= 13, false] }) };
  assert.deepEqual([9, 10, 11, 12, 13, 14].map(i => S.gapEdge(track, i, 1)), [null, 'front', null, null, 'back', null]);
  assert.equal(S.gapEdge(track, 10, 0), null);
});

test('пол под кромкой держится: падает только то, что уже за обломками', () => {
  const S = page().get('CollapseScene');
  assert.equal(S.floorDrop(-1), 0);
  assert.equal(S.floorDrop(1), 0, 'сегмент под откосом обломков на месте');
  assert.ok(S.floorDrop(S.FLOOR_HOLD + 1) > 0);
});

test('рычаг: ожидание, искры выстрела, перекинут к своей полосе; остряки ждут конца искр', () => {
  const S = page().get('CollapseScene'), hit = 0.14, thr = 0.12, left = { from: 1, to: 0 }, right = { from: 1, to: 2 };
  assert.equal(S.leverFrame(left, false, Infinity, hit), 'waiting');
  assert.equal(S.leverFrame(right, false, 0, hit), 'waiting', 'соседний рычаг той же развилки не трогается');
  assert.equal(S.leverFrame(left, true, 0.05, hit), 'hit');
  assert.equal(S.leverFrame(left, true, hit, hit), 'left');
  assert.equal(S.leverFrame(right, true, hit, hit), 'right');
  assert.equal(S.leverFrame(right, true, Infinity, hit), 'right', 'взведено без выстрела на глазах: сразу перекинут');
  assert.equal(S.leverPop(true, hit, hit, thr), 0);
  assert.equal(S.leverPop(true, hit + thr, hit, thr), 1);
  assert.equal(S.leverPop(false, 9, hit, thr), 0);
  const lever = { at: 12, to: 0, time: 5 };
  assert.ok(S.leverHolds(lever, 12, 5.05, hit), 'во время искр остряки на месте');
  assert.ok(!S.leverHolds(lever, 12, 5.2, hit), 'кончились искры — идут вместе с рычагом');
  assert.ok(!S.leverHolds(lever, 13, 5.05, hit), 'чужая развилка не держится');
  assert.ok(!S.leverHolds(null, 12, 5.05, hit));
});

test('кадры демона: выход из кладки, стойка по кругу, прыжок и удар в конце, файлы на месте', () => {
  const p = page(), S = p.get('CollapseScene'), A = p.get('CollapseArt').demon;
  const at = [0, 0.13, 0.25, 0.37, 0.53, 0.69, 0.85, 1.01].map(e => S.demonFrame(A, e).match(/(\w+_\d+)\.png/)[1]);
  assert.deepEqual(at, ['emerge_00', 'emerge_01', 'emerge_02', 'perch_00', 'perch_01', 'perch_02', 'perch_03', 'perch_00']);
  assert.match(S.demonLeapFrame(A, 0), /jump_00/);
  assert.match(S.demonLeapFrame(A, 0.99), /strike_01/);
  for (const url of Object.values(A).flat()) assert.ok(fs.existsSync(url), url);
});
