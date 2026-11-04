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
  assert.deepEqual({ ...c.state }, { version: 1, meters: 4500, passengers: 6, earned: 2, balance: 2 });
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
