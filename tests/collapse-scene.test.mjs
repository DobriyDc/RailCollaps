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
        // The exit fork stands at the boundary before the hazard; the cross is in the same row.
        assert.ok(t.seg(i - 1).forks.some(f => f.from === lane), `зерно ${seed}: нет развилки-выхода перед ${i}`);
        assert.ok(CollapseScene.crossAt(run, i - 1, lane), `зерно ${seed}: нет креста перед опасностью ${i} на полосе ${lane}`);
      }
    }
    assert.ok(hazards > 50, `зерно ${seed}: опасностей ${hazards}`);
  }
});
