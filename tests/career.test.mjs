import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

function page(data = new Map(), extra = {}) {
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const p = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/CollapseRules.js', 'js/CollapseStationRules.js', 'js/Career.js', 'js/Game.js'], {
    localStorage: storage, ...extra,
  });
  const career = p.get('Career'); career.load();
  return { ...p, career, data, storage };
}

test('баллы: пороги каждого забега отдельно, остатки не суммируются; обучение не считается', async () => {
  const { career: c } = page();
  for (const meters of [1999, 1999, 2000, 3999, 4000]) await c.record({ meters, delivered: 3 });
  assert.equal(c.state.earned, 4);
  assert.equal(c.state.balance, 4);
  assert.equal(c.state.meters, 13997);
  assert.equal(c.state.passengers, 15);
  await c.record({ tutorial: true, meters: 10000, delivered: 3 });
  assert.equal(c.state.earned, 4);
});

test('продолжение: дубли и повторный итог не начисляют заново, добавляется только прирост', async () => {
  const { career: c } = page(), run = { seed: 42, meters: 2500, delivered: 3 };
  await Promise.all(Array.from({ length: 8 }, () => c.record(run)));
  assert.equal(c.state.balance, 1);
  run.meters = 4500; run.delivered = 6;
  await c.record(run); await c.record(run);
  assert.deepEqual(JSON.parse(JSON.stringify(c.state)), { version: 2, meters: 4500, passengers: 6, earned: 2, balance: 2, upgrades: [0, 0, 0] });
  await c.record({ seed: 42, meters: 4500, delivered: 6 });
  assert.equal(c.state.earned, 4, 'новая попытка на том же маршруте считается отдельно');
});

test('сохранение восстанавливает баланс и звание; старый рекорд не выдумывает историю забегов', async () => {
  const a = page(); a.data.set('collapse.best', '999999');
  assert.equal(a.career.state.meters, 0);
  await a.career.record({ meters: 25000, delivered: 30 });
  const b = page(a.data);
  assert.equal(b.career.state.balance, 12); assert.equal(b.career.rank, 1);
  assert.equal(b.career.remaining, 50000); assert.equal(b.career.progress, 0);
  for (const [rank, meters] of b.career.thresholds.entries()) {
    b.career.state.meters = meters;
    assert.equal(b.career.rank, rank);
  }
  assert.equal(b.career.progress, 1); assert.equal(b.career.remaining, 0);
});

test('ошибка записи не расходует квитанцию; повтор после восстановления сохраняет ровно один раз', async () => {
  const p = page(), c = p.career, run = { meters: 4200, delivered: 4 };
  const write = p.storage.setItem;
  p.storage.setItem = () => { throw new Error('quota'); };
  await c.record(run);
  assert.equal(c.saveFailed, true); assert.equal(c.state.balance, 0);
  p.storage.setItem = write;
  await c.record(run); await c.record(run);
  assert.equal(c.saveFailed, false); assert.equal(c.state.balance, 2);
  const raw = '{broken'; p.data.set(c.KEY, raw);
  await c.record({ meters: 9999 });
  assert.equal(c.saveFailed, true); assert.equal(p.data.get(c.KEY), raw);
});

test('вкладки используют одну блокировку и не затирают баланс друг друга', async () => {
  let queue = Promise.resolve(); const keys = [], data = new Map();
  const navigator = { locks: { request(key, fn) { keys.push(key); const p = queue.then(fn); queue = p.catch(() => {}); return p; } } };
  const a = page(data, { navigator }), b = page(data, { navigator });
  await Promise.all([a.career.record({ meters: 2000 }), b.career.record({ meters: 4000 })]);
  const saved = page(data).career.state;
  assert.equal(saved.balance, 3); assert.equal(saved.meters, 6000);
  assert.deepEqual(keys, [a.career.KEY, a.career.KEY]);
});

test('Game: первая смерть и продолжение одного рейса дают только дополнительные баллы', async () => {
  const p = page(new Map(), {
    TG: { haptic() {}, runEnded() {}, saveBest() {} }, CG: { happytime() {} },
    Leaderboard: { submit() {} },
  }), Game = p.get('Game'), Run = p.get('CollapseStationRun');
  const run = new Run(42);
  const game = Object.assign(Object.create(Game.prototype), {
    run, scene: { onEvent() {} }, best: 0, portraitLeft: 0, _play() {}, _hudBest() {}, _careerView() {},
  });
  run.pos = 250; run._crash('gap'); game._onEvent({ type: 'crash', reason: 'gap' });
  await p.career.queue;
  assert.equal(p.career.state.balance, 1);
  run.continueRun(); run.pos = 450; run._crash('gap'); game._onEvent({ type: 'crash', reason: 'gap' });
  await p.career.queue;
  assert.equal(p.career.state.balance, 2); assert.equal(p.career.state.meters, 4500);
});

test('депо: старые баллы переносятся, покупка и уровни переживают загрузку', async () => {
  const data = new Map([['collapse.career.v1', JSON.stringify({ version: 1, meters: 25000, passengers: 12, earned: 12, balance: 12 })]]);
  const { career: c } = page(data);
  assert.equal(c.state.balance, 12); assert.equal(c.rank, 1);
  assert.equal(await c.buy('ammo'), 'ok');
  const again = page(data).career;
  assert.equal(again.state.balance, 10); assert.equal(again.state.earned, 12);
  assert.deepEqual([...again.state.upgrades], [1, 0, 0]);
  assert.equal(again.state.meters, 25000); assert.equal(again.rank, 1);
});

test('депо: девять покупок стоят 68 баллов; пределы и новые начисления сохраняют уровни', async () => {
  const { career: c } = page();
  await c.record({ meters: 200000 });
  for (const kind of c.goods) for (let level = 0; level < 3; level++) assert.equal(await c.buy(kind), 'ok');
  assert.equal(c.state.balance, 32); assert.equal(c.state.earned, 100); assert.equal(c.rank, 3);
  assert.deepEqual([...c.state.upgrades], [3, 3, 3]);
  assert.equal(await c.buy('ammo'), 'max'); assert.equal(await c.buy('bogus'), 'unknown');
  await c.record({ meters: 4000 });
  assert.equal(c.state.balance, 34); assert.deepEqual([...c.state.upgrades], [3, 3, 3]);
});

test('депо: двойное нажатие, нехватка баллов и отказ хранения не списывают лишнее', async () => {
  const p = page(), c = p.career;
  assert.equal(await c.buy('ammo'), 'no-money');
  await c.record({ meters: 10000 });
  const raw = p.data.get(c.KEY), write = p.storage.setItem;
  p.storage.setItem = () => { throw new Error('quota'); };
  assert.equal(await c.buy('ammo'), 'failed');
  assert.equal(c.state.balance, 5); assert.equal(c.state.upgrades[0], 0); assert.equal(p.data.get(c.KEY), raw);
  p.storage.setItem = write;
  assert.deepEqual(await Promise.all([c.buy('ammo'), c.buy('ammo')]), ['ok', 'busy']);
  assert.equal(c.state.balance, 3); assert.equal(c.state.upgrades[0], 1);
  assert.equal(await c.buy('ammo'), 'no-money'); assert.equal(c.state.balance, 3);
});

test('депо: две вкладки не покупают два разных уровня по одной показанной цене', async () => {
  let queue = Promise.resolve(); const data = new Map();
  const navigator = { locks: { request(key, fn) { const p = queue.then(fn); queue = p.catch(() => {}); return p; } } };
  const a = page(data, { navigator }); await a.career.record({ meters: 20000 });
  const b = page(data, { navigator });
  assert.deepEqual(await Promise.all([a.career.buy('ammo'), b.career.buy('ammo')]), ['ok', 'changed']);
  assert.equal(page(data).career.state.balance, 8);
  await Promise.all([a.career.record({ meters: 2000 }), b.career.buy('fare')]);
  const saved = page(data).career.state;
  assert.equal(saved.balance, 6); assert.deepEqual([...saved.upgrades], [1, 1, 0]);
  assert.equal(a.get('Game').newRun().fare, 11, 'новый рейс видит покупку из другой вкладки');
});

test('депо: комплект фиксируется на старте; рейс дня базовый, вызов даёт комплект друга', async () => {
  const p = page(), Game = p.get('Game'), c = p.career;
  const before = Game.newRun();
  await c.record({ meters: 4000 }); await c.buy('ammo');
  assert.equal(before.ammo, 8); assert.equal(Game.newRun().ammo, 10);
  before._crash('gap'); before.continueRun();
  assert.equal(before.ammo, 8); assert.deepEqual([...before.upgrades], [0, 0, 0]);
  const game = Object.assign(Object.create(Game.prototype), { start(run) { this.run = run; } });
  game.startDaily(); assert.deepEqual([...game.run.upgrades], [0, 0, 0]);
  game.challenge = { seed: 42, meters: 2000, upgrades: [2, 1, 3] };
  game.startChallenge(); assert.equal(game.run.ammo, 12); assert.equal(game.run.fare, 11);
  assert.deepEqual([...game.run.upgrades], [2, 1, 3]); assert.deepEqual([...c.state.upgrades], [1, 0, 0]);
});

test('депо: уровни действительно меняют плату и штраф вагонов, конфигурация копируется', () => {
  const p = page(), Run = p.get('CollapseStationRun'), profile = [3, 3, 3];
  const run = new Run(42, profile); profile[0] = 0;
  assert.equal(run.ammo, 14); assert.equal(run.fare, 13);
  run._arrive(); assert.equal(run.money, 39);
  run.money = 240; run.stopLeft = 1;
  for (let i = 0; i < 3; i++) assert.equal(run.buy('wagon'), 'ok');
  assert.ok(Math.abs(run.speedFactor - 0.986 ** 3) < 1e-12);
  const base = new Run(42); assert.equal(base.ammo, 8); assert.equal(base.fare, 10);
});
