// Stations of the endless run (card 48, js/CollapseStationRules.js and js/CollapseStations.js): where
// stops stand, the stop is a respite, passengers pay on arrival and a hit drops one, the shop of four
// goods, the journal replays purchases, and the game and the table's function both run stations.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadScripts, ROOT } from './browser-scripts.mjs';
import { workerSource } from '../tools/build-worker.mjs';

const page = () => loadScripts(['js/Constants.js', 'js/CollapseRules.js', 'js/CollapseStationRules.js']);

function dodge(run, R) {
  const next = run.nextFork();
  if (next && !next.armed && !run.track.laneSafe(run.lane, next.at, R.LOOK)) {
    const to = next.to.find(l => run.forkSafe(next.at, l));
    if (to !== undefined) run.shoot(next.at, to);
  }
  for (const d of run.shootable()) run.shootDemon(d.side);
}

// To the next stop, or a failed test when the run ends before it.
function arrive(run, R) {
  for (let f = 0; f < 60 * 180 && !run.atStation; f++) { dodge(run, R); run.update(1 / 60); }
  assert.ok(run.atStation, `забег кончился на ${run.meters} м`);
}

// The shopper mends the train first, then cartridges, a shield, a rescue; shop = false only leaves.
function ride(p, seed, shop = true) {
  const R = p.get('CollapseRules'), run = new (p.get('CollapseStationRun'))(seed);
  for (let f = 0; f < 60 * 900 && run.state === 'run'; f++) {
    if (run.atStation) {
      for (;;) {
        const k = run.hp < run.c.hpMax ? 'repair' : run.ammo < 6 ? 'ammo' : run.shield < 1 ? 'shield' : run.rescue < 1 ? 'rescue' : null;
        if (!shop || !k || run.buy(k) !== 'ok') break;
      }
      run.leave();
    } else if (f < 60 * 300) dodge(run, R);     // the bot never tires: a run has to end
    run.update(1 / 60);
  }
  return run;
}

test('станции: первая на COLLAPSE_STATION_FIRST, дальше через перегон, подход и выход без опасностей', () => {
  const p = page(), run = new (p.get('CollapseStationRun'))(4), s = run.st;
  assert.equal(p.get('COLLAPSE_STATION_FIRST'), 130, '1300 м — решение владельца');
  let prev = 0;
  for (let k = 0; k < 4; k++) {
    const at = run.track.station(k);
    for (let i = at - s.approach; i < at + s.after; i++) {
      const seg = run.track.seg(i);
      assert.ok(!seg.gap.includes(true) && !seg.lava.includes(true) && !seg.forks.length && !seg.demon && !seg.pickup.some(Boolean), `сегмент ${i}`);
    }
    const want = k ? prev + s.stretch : s.first;
    assert.ok(at >= want && at < want + 15, `станция ${k}: ${at}, ждали от ${want}`);
    prev = at;
  }
});

test('стоянка: обвал стоит, стоянка кончается и без кнопки, потом обвал возвращается к обычному зазору', () => {
  const p = page(), R = p.get('CollapseRules'), run = new (p.get('CollapseStationRun'))(4), s = run.st, c = run.c;
  arrive(run, R);
  const gap = run.pos - run.front, left = run.stopLeft;
  assert.ok(gap >= run.gapBase, `зазор на станции ${gap}`);
  assert.equal(run.speed(), 0);
  run.update(1);
  assert.equal(run.pos - run.front, gap, 'на стоянке обвал стоит');
  assert.ok(run.stopLeft < left);
  for (let i = 0; i < s.stopSec * 4; i++) run.update(1 / 4);
  assert.equal(run.atStation, false, 'время стоянки кончается и без кнопки');
  assert.equal(run.stage, 1);
  for (let f = 0; f < 60 * (s.respiteSec + 1); f++) { dodge(run, R); run.update(1 / 60); }
  assert.equal(c.frontMaxGap, run.gapBase, 'передышка кончилась');
});

test('пассажиры: садятся в депо, платят по прибытии, удар высаживает одного, щит бережёт', () => {
  const p = page(), R = p.get('CollapseRules'), run = new (p.get('CollapseStationRun'))(4), s = run.st;
  assert.equal(run.passengers, s.seats);
  assert.equal(run.money, 0);
  run._hit('lava');
  assert.equal(run.hp, run.c.hpMax - 1);
  assert.equal(run.passengers, s.seats - 1, 'удар высадил одного');
  run.shield = 1;
  run._hit('lava');
  assert.equal(run.passengers, s.seats - 1, 'щит принял удар, пассажир на месте');
  arrive(run, R);
  const riders = run.paid.riders;
  assert.ok(riders <= s.seats - 1, `после удара доехали ${riders}`);
  assert.equal(run.paid.amount, riders * s.fare);
  assert.equal(run.money, riders * s.fare);
  assert.equal(run.delivered, riders);
  assert.equal(run.passengers, s.seats, 'места заполнились');
  run.leave();
  assert.equal(run.fare, s.fare + s.fareStep, 'плата перегона по COLLAPSE_STATION_FARE_STEP, сейчас та же');
});

test('лавка: четыре товара, ремонт до полной, пределы, только на стоянке', () => {
  const p = page(), R = p.get('CollapseRules'), run = new (p.get('CollapseStationRun'))(4);
  assert.equal(run.buy('repair'), 'closed');
  arrive(run, R);
  const { price } = run.st;
  assert.deepEqual([...p.get('CollapseStationRules').GOODS], ['repair', 'ammo', 'shield', 'rescue']);
  assert.equal(run.refusal('repair'), 'full', 'поезд цел');
  run.hp = run.c.hpMax - 1;
  run.money = price.repair + price.ammo;
  assert.equal(run.buy('repair'), 'ok');
  assert.equal(run.hp, run.c.hpMax);
  assert.equal(run.buy('repair'), 'full');
  const ammo = run.ammo;
  assert.equal(run.buy('ammo'), 'ok');
  assert.equal(run.ammo, ammo + run.c.ammoPickup);
  assert.equal(run.money, 0);
  run.shield = 0;
  assert.equal(run.buy('shield'), 'no-money');
  run.money = 999;
  run.shield = run.c.shieldMax;
  assert.equal(run.buy('shield'), 'full');
  assert.equal(run.buy('boost'), 'closed', 'ускорителя в лавке нет');
});

test('каждые две станции демоны на 10 % вероятнее, обвал на 10 пунктов; спасение в лавке за 300 (владелец, 2026-11-03)', () => {
  const p = page(), Run = p.get('CollapseStationRun'), st = p.get('CollapseStationRules').cfg();
  assert.equal(st.price.rescue, 300);
  assert.ok(st.demonStep <= 0.1, 'демоны не больше 10 %');
  const run = new Run(5), t = run.track, base = t.demonBase, chance0 = run.c.eventChance;
  const chances = [], demons = [];
  for (let k = 0; k < 6; k++) {
    t.station(k);
    demons.push(+(t.cfg.demonChance / base).toFixed(4));
    if (k) { run.stopLeft = 1; run._depart(); }
    chances.push(+(run.c.eventChance - chance0).toFixed(4));
  }
  assert.deepEqual(demons, [1, 1.1, 1.1, 1.2, 1.2, 1.3]);
  assert.deepEqual(chances, [0, 0, 0.1, 0.1, 0.2, 0.2]);
});

test('реплей учитывает покупки и кнопку «Дальше»: тот же финиш, а без покупки другой или никакой', () => {
  const p = page(), Run = p.get('CollapseStationRun');
  let bought = 0, differs = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const run = ride(p, seed), log = JSON.parse(JSON.stringify(run.log));
    assert.equal(run.state, 'over', `зерно ${seed}`);
    const again = Run.replay(seed, log, run.steps + 60);
    assert.ok(again, `зерно ${seed}`);
    assert.deepEqual([again.meters, again.steps, again.money, again.stage, again.ammo, again.delivered], [run.meters, run.steps, run.money, run.stage, run.ammo, run.delivered], `зерно ${seed}`);
    const i = log.findIndex(a => a[1] === 'b');
    if (i < 0) continue;
    bought++;
    const without = Run.replay(seed, log.filter((_, k) => k !== i), run.steps + 60);
    if (!without || without.meters !== run.meters || without.ammo !== run.ammo || without.money !== run.money || without.hp !== run.hp) differs++;
  }
  assert.ok(bought >= 5 && differs === bought, `покупок ${bought}, изменили забег ${differs}`);
  assert.equal(Run.replay(1, [[3, 'b', 'ammo']], 600), null, 'покупка вне станции');
  assert.equal(Run.replay(1, [[3, 'n']], 600), null, '«Дальше» вне станции');
});

test('с лавкой бот едет дальше, чем без неё', () => {
  const p = page(), seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  const median = list => { const m = list.map(r => r.meters).sort((a, b) => a - b); return m[m.length >> 1]; };
  const shopper = median(seeds.map(s => ride(p, s))), miser = median(seeds.map(s => ride(p, s, false)));
  assert.ok(shopper > miser, `с лавкой ${shopper} м, без неё ${miser} м`);
});

test('функция таблицы переигрывает станции, игра грузит правила станций до игры', () => {
  const src = workerSource();
  assert.match(src, /class CollapseStationRun extends CollapseRun/);
  assert.match(src, /CollapseStationRun\.replay\(body\.seed/);
  assert.match(src, /const COLLAPSE_STATION_FIRST = 130;/);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = f => html.indexOf('js/' + f);
  assert.ok(at('CollapseRules.js') < at('CollapseStationRules.js') && at('CollapseStationRules.js') < at('Game.js'));
  assert.ok(at('Game.js') < at('CollapseStations.js') && at('CollapseStations.js') < at('main.js'));
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'js/Constants.js'), 'utf8'), /MONEY|\?stations/);
});

test('Game: забег всегда со станциями, идёт в рекорд и таблицу, подсказка станции один раз', () => {
  const submitted = [], store = new Map(), elements = new Map();
  const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const UI = { DIGITS: [], get: id => {
    if (!elements.has(id)) elements.set(id, { visible: true, _enabled: true, text: '', setText(t) { this.text = t; return this; }, setAngle() { return this; }, setSrc() { return this; }, setValue() { return this; },
      onClick(fn) { this.click = fn; return this; }, show(v) { this.visible = v; return this; }, setEnabled(v) { this._enabled = v; return this; } });
    return elements.get(id);
  } };
  const globals = { localStorage, UI, Image: class {}, CollapseArt: { pickup: {} }, CollapseScene: { LANE_W: 180 },
    TG: { inside: false, loadBest() {}, runEnded() {}, runStarted() {}, haptic() {}, saveBest() {} },
    Leaderboard: { enabled: false, close() {}, refreshLanguage() {}, submit: r => submitted.push(r) },
    Shop: { init() {}, open() {}, render() {} }, Challenge: { parse: () => null } };
  const ctx = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Sound3D.js', 'js/CollapseRules.js', 'js/CollapseStationRules.js', 'js/CrazyGames.js', 'js/Game.js'], globals);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/CollapseStations.js'), 'utf8').replace(/^class CollapseStationView[\s\S]*?^}\n/m, 'class CollapseStationView { sync() {} }\n').replace(/^CollapseStationView\..*$/gm, ''), ctx.ctx);
  const scene = { canvas: { addEventListener() {} }, sync() {}, reset() {}, onEvent() {} };
  const game = new (ctx.get('Game'))({ scene });

  game.start();
  assert.equal(game.run.stations, true);
  assert.equal(elements.get('stationNext').visible, true);
  game.mode = 'play';
  game._hud(game.run);
  assert.match(elements.get('stationNext').text, /До станции 1[34]\d\d м\nПассажиров: 3/);

  const run = game.run, s = run.st;
  run.pos = run.stationAt;
  run.stopLeft = s.stopSec;
  run._arrive();
  game._hud(run);
  assert.equal(elements.get('stationShop').visible, true);
  assert.match(elements.get('stationPaid').text, /Довезли 3 из 3: \+30/);
  assert.match(elements.get('stationTip').text, /Пассажиры платят/);
  assert.match(elements.get('stationTitle').text, /жетонов 30/);
  assert.equal(elements.get('stationRepair')._enabled, false, 'поезд цел — ремонт не продаётся');
  elements.get('stationAmmo').click();
  assert.equal(run.money, 30 - s.price.ammo);
  elements.get('stationGo').click();
  for (const ev of run.takeEvents()) game._onEvent(ev);
  assert.equal(store.get('collapse.stationTip'), '1', 'подсказка показана один раз');

  run.pos = 50;
  game._onEvent({ type: 'crash', reason: 'gap' });
  assert.equal(submitted.length, 1, 'забег со станциями идёт в таблицу');
  assert.equal(store.get('collapse.best'), String(run.meters));
});

test('перрон идёт до стены тоннеля и к камере при любой полосе: на широком экране у станции нет лавы (владелец, 2026-11-04)', () => {
  const p = loadScripts(['js/Constants.js', 'js/CollapseRules.js', 'js/CollapseScene.js', 'js/CollapseStations.js']);
  const S = p.get('CollapseScene'), P = p.get('CollapseStationView').PLATFORM;
  for (const lane of [0, 1, 2]) for (const side of [-1, 1]) {
    const from = S.laneX(lane) + side * P.inner, to = from + side * P.w;
    if (Math.abs(from) < S.WALL_X) assert.ok(side * to >= S.WALL_X, `полоса ${lane}, сторона ${side}: перрон кончается на ${to}`);
  }
  assert.ok(P.near >= 1000, 'перед стоящим поездом до низа кадра — перрон, а не лава');
});
