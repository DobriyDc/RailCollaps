// Stations in the endless run (card 38, js/CollapseStations.js): only with ?stations, the plain run and
// its replay are untouched, the stop is a respite, purchases change the run and replay with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadScripts, ROOT } from './browser-scripts.mjs';
import { workerSource } from '../tools/build-worker.mjs';

// The page in the order of index.html; the scene's art table is all the file needs from the scene.
const page = () => {
  const p = loadScripts(['js/Constants.js', 'js/CollapseRules.js']);
  vm.runInContext('const CollapseArt = { pickup: {} }; const CollapseScene = {};', p.ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/CollapseStations.js'), 'utf8'), p.ctx, { filename: 'js/CollapseStations.js' });
  return p;
};

function dodge(run, R) {
  const next = run.nextFork();
  if (next && !next.armed && !run.track.laneSafe(run.lane, next.at, R.LOOK)) {
    const to = next.to.find(l => run.forkSafe(next.at, l));
    if (to !== undefined) run.shoot(next.at, to);
  }
  for (const d of run.shootable()) run.shootDemon(d.side);
}

// To the first stop, or a failed test when the run ends before it.
function arrive(run, R) {
  for (let f = 0; f < 60 * 120 && !run.atStation; f++) { dodge(run, R); run.update(1 / 60); }
  assert.ok(run.atStation, `забег кончился на ${run.meters} м`);
}

// The shopper spends what it has at every stop and leaves at once; shop = false — only leaves.
function ride(p, seed, shop = true, stopAt = Infinity) {
  const R = p.get('CollapseRules'), run = new (p.get('CollapseStationRun'))(seed);
  for (let f = 0; f < 60 * 900 && run.state === 'run' && run.stage < stopAt; f++) {
    if (run.atStation) {
      for (;;) {
        const k = run.ammo < 6 ? 'ammo' : run.shield < 1 ? 'shield' : run.rescue < 1 ? 'rescue' : run.ammo < 12 ? 'ammo' : null;
        if (!shop || !k || run.buy(k) !== 'ok') break;
      }
      run.leave();
    } else if (f < 60 * 300) dodge(run, R);     // the bot never tires: a run has to end
    run.update(1 / 60);
  }
  return run;
}

test('бот проходит 3 станции на 18 зёрнах из 20, с лавкой дальше, чем без неё', () => {
  const p = page(), seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  const shopper = seeds.map(s => ride(p, s)), miser = seeds.map(s => ride(p, s, false));
  const passed = list => list.filter(r => r.stage >= 3).length;
  assert.ok(passed(shopper) >= 18, `с лавкой ${passed(shopper)} из 20`);
  assert.ok(passed(shopper) > passed(miser), `с лавкой ${passed(shopper)}, без неё ${passed(miser)}`);
});

test('станция стоит на покое, обвал отстаёт, а потом возвращается к обычному зазору', () => {
  const p = page(), R = p.get('CollapseRules'), run = new (p.get('CollapseStationRun'))(4), s = run.st, c = run.c;
  for (let k = 0; k < 4; k++) {
    const at = run.track.station(k);
    for (let i = at - s.approach; i < at + s.after; i++) {
      const seg = run.track.seg(i);
      assert.ok(!seg.gap.includes(true) && !seg.lava.includes(true) && !seg.forks.length && !seg.demon && !seg.pickup.some(Boolean), `сегмент ${i}`);
    }
    assert.ok(at >= (k + 1) * s.stretch && at < (k + 1) * (s.stretch + 15), `станция ${k}: ${at}`);
  }
  // A collapse past its rush when the approach begins.
  for (let f = 0; f < 60 * 120 && run.pos < run.stationAt - s.approach - 1; f++) { dodge(run, R); run.update(1 / 60); }
  run.startCollapse();
  run.collapseEnd = 1e9;
  run.collapseFrom = -99;
  run.front = run.pos - run.gapBase;
  arrive(run, R);
  const gap = run.pos - run.front, left = run.stopLeft;
  assert.ok(gap > run.gapBase + s.approach * 0.8, `зазор на станции ${gap}`);
  assert.equal(run.speed(), 0);
  run.update(1);
  assert.equal(run.pos - run.front, gap, 'на стоянке обвал стоит');
  assert.ok(run.stopLeft < left);
  for (let i = 0; i < 8 * 4; i++) run.update(1 / 4);
  assert.equal(run.atStation, false, 'время стоянки кончается и без кнопки');
  assert.equal(run.stage, 1);
  for (let f = 0; f < 60 * (s.respiteSec + 1); f++) { dodge(run, R); run.update(1 / 60); }
  assert.equal(c.frontMaxGap, run.gapBase, 'передышка кончилась');
  assert.ok(run.pos - run.front <= run.gapBase + 1e-6);
});

test('лавка: цена, предел, только на стоянке; новый забег начинается без денег', () => {
  const p = page(), R = p.get('CollapseRules'), run = new (p.get('CollapseStationRun'))(4);
  assert.equal(run.buy('ammo'), 'closed');
  arrive(run, R);
  const { price } = run.st, ammo = run.ammo;
  run.money = price.ammo + price.shield * 2;
  assert.equal(run.buy('ammo'), 'ok');
  assert.equal(run.ammo, ammo + run.c.ammoPickup);
  assert.equal(run.money, price.shield * 2);
  assert.equal(run.buy('rescue'), 'ok');
  assert.equal(run.buy('rescue'), 'no-money');
  run.shield = run.c.shieldMax;
  assert.equal(run.buy('shield'), 'full');
  assert.equal(run.buy('boost'), 'closed', 'в лавке три товара');
  assert.equal(new (p.get('CollapseStationRun'))(4).money, 0);
});

test('реплей учитывает покупки: тот же финиш, а без покупки другой или никакой', () => {
  const p = page(), Run = p.get('CollapseStationRun');
  let bought = 0, differs = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const run = ride(p, seed), log = JSON.parse(JSON.stringify(run.log));
    assert.equal(run.state, 'over', `зерно ${seed}`);
    const again = Run.replay(seed, log, run.steps + 60);
    assert.ok(again, `зерно ${seed}`);
    assert.deepEqual([again.meters, again.steps, again.money, again.stage, again.ammo], [run.meters, run.steps, run.money, run.stage, run.ammo], `зерно ${seed}`);
    const i = log.findIndex(a => a[1] === 'b');
    if (i < 0) continue;
    bought++;
    const without = Run.replay(seed, log.filter((_, k) => k !== i), run.steps + 60);
    if (!without || without.meters !== run.meters || without.ammo !== run.ammo || without.money !== run.money) differs++;
  }
  assert.ok(bought >= 8 && differs === bought, `покупок ${bought}, изменили забег ${differs}`);
  assert.equal(Run.replay(1, [[3, 'b', 'ammo']], 600), null, 'покупка вне станции');
});

test('станции снаружи правил: функция таблицы и обычный забег про них не знают', () => {
  const src = workerSource();
  assert.ok(!/STATION|stations|money/i.test(src), 'в функции таблицы нет станций');
  const p = page(), Plain = p.get('CollapseRun');
  assert.equal(p.get('CollapseStations').on, false, 'без ?stations выключено');
  assert.ok(!('money' in new Plain(1).track.seg(10).pickup));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/Game.js') < html.indexOf('js/CollapseStations.js') && html.indexOf('js/CollapseStations.js') < html.indexOf('js/main.js'));
});

test('Game: без ?stations обычный забег, с ?stations забег станций не идёт ни в рекорд, ни в таблицу', () => {
  const boot = stations => {
    const submitted = [], store = new Map(), elements = new Map();
    const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
    const UI = { DIGITS: [], get: id => {
      if (!elements.has(id)) elements.set(id, { visible: true, _enabled: true, setText() { return this; }, setAngle() { return this; }, setSrc() { return this; }, setValue() { return this; },
        onClick(fn) { this.click = fn; return this; }, show(v) { this.visible = v; return this; }, setEnabled(v) { this._enabled = v; return this; } });
      return elements.get(id);
    } };
    const globals = { localStorage, UI, Image: class {}, CollapseArt: { pickup: {} }, CollapseScene: { LANE_W: 180 }, CollapseStationView: undefined,
      TG: { inside: false, loadBest() {}, runEnded() {}, runStarted() {}, haptic() {}, saveBest() {} },
      Leaderboard: { enabled: false, close() {}, refreshLanguage() {}, submit: r => submitted.push(r) },
      Shop: { init() {}, open() {}, render() {} }, Challenge: { parse: () => null } };
    Object.assign(globals, { location: { search: stations ? '?stations' : '' }, URLSearchParams });
    const ctx = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Sound3D.js', 'js/CollapseRules.js', 'js/Game.js'], globals);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/CollapseStations.js'), 'utf8').replace(/^class CollapseStationView[\s\S]*?^}\n/m, 'class CollapseStationView { sync() {} }\n').replace(/^CollapseStationView\..*$/gm, ''), ctx.ctx);
    const scene = { canvas: { addEventListener() {} }, sync() {}, reset() {}, onEvent() {} };
    return { game: new (ctx.get('Game'))({ scene }), submitted, store, elements };
  };
  const plain = boot(false);
  plain.game.start();
  assert.equal(plain.game.run.stations, undefined);
  plain.game.run.pos = 50;
  plain.game._onEvent({ type: 'crash', reason: 'gap' });
  assert.equal(plain.submitted.length, 1);
  assert.equal(plain.store.get('collapse.best'), '500');

  const on = boot(true);
  on.game.start();
  assert.equal(on.game.run.stations, true);
  assert.equal(on.elements.get('stationMoney').visible, true);
  assert.equal(on.elements.get('best').visible, false);
  on.game.run.pos = 50;
  on.game._onEvent({ type: 'crash', reason: 'gap' });
  assert.equal(on.submitted.length, 0, 'в таблицу не идёт');
  assert.equal(on.store.get('collapse.best'), undefined, 'рекорд обычного режима не тронут');
});
