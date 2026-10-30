// Rail Link: Collapse tunnel signals (js/CollapseScene.js): what the scene shows is asked from the run,
// never decided by the scene. Only the pure statics — the 3D part is checked in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const page = () => loadScripts(['js/Constants.js', 'js/CollapseRules.js', 'js/CollapseScene.js']);

test('красный крест стоит на полосе перед каждой опасностью — на той же границе, что и стрелка выхода', () => {
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
        assert.ok(CollapseScene.crossAt(run, b, lane), `зерно ${seed}: нет креста перед опасностью ${i} на полосе ${lane}`);
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
