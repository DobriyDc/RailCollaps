// The tutorial (card 27): the steps of CollapseRules.TUTORIAL, a bot through all of them, a mistake
// back to its step, and the game that keeps it out of the record and the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const page = () => loadScripts(['js/Constants.js', 'js/CollapseRules.js']);
const LIMIT = 60 * 120;     // frames: far beyond any tutorial
const going = run => run.state === 'run' && !run.missed && !run.finished;

// The player: shoots the next fork and every leaping demon, except on the step named `lazy`.
function play(run, lazy) {
  if (run.step.id === lazy) return;
  const next = run.nextFork();
  if (next && !next.armed) run.shoot(next.at, next.to[0]);
  for (const d of run.leaping()) run.shootDemon(d.side);
}

// The kit each step starts with on a clean pass.
function cleanKits(p) {
  const kits = [], run = new (p.get('CollapseTutorial'))();
  for (let f = 0; f < LIMIT && going(run); f++) {
    kits[run.index] ||= { ...run._kit };
    play(run);
    run.update(1 / 60);
  }
  return kits;
}

test('бот проходит обучение от начала до конца за 30–60 с: все шаги подряд, ни одной ошибки', () => {
  const p = page(), run = new (p.get('CollapseTutorial'))(), seen = [];
  for (let f = 0; f < LIMIT && going(run); f++) {
    if (seen.at(-1) !== run.step.id) seen.push(run.step.id);
    play(run);
    run.update(1 / 60);
  }
  assert.equal(run.state, 'run', run.reason);
  assert.equal(run.missed, false);
  assert.equal(run.finished, true);
  assert.deepEqual(seen, Array.from(p.get('CollapseRules').TUTORIAL, s => s.id));
  assert.ok(run.time >= 30 && run.time <= 60, `обучение ${run.time.toFixed(1)} с`);
});

test('ошибка возвращает на тот же шаг: с его начала, с теми же запасами, и шаг проходится заново', () => {
  const p = page(), T = p.get('CollapseTutorial'), steps = p.get('CollapseRules').TUTORIAL, kits = cleanKits(p);
  const why = { sign: 'miss', ammo: 'miss', cross: 'gap', gap: 'gap', lava: 'lava', demon: 'demon', collapse: 'caught' };
  for (const [id, reason] of Object.entries(why)) {
    const i = steps.findIndex(s => s.id === id);
    const wrong = new T(i, kits[i]);
    for (let f = 0; f < LIMIT && going(wrong) && wrong.index === i; f++) wrong.update(1 / 60);
    assert.equal(wrong.index, i, id);
    assert.equal(wrong.missed ? 'miss' : wrong.reason, reason, id);
    const again = wrong.retry();
    assert.deepEqual([again.index, again.state, again.failed, again.lane], [i, 'run', true, steps[i].lane], id);
    assert.equal(again.pos, new T(i).pos, id);
    assert.equal(again.ammo, kits[i].ammo, id);
    assert.ok(again.pos - again.front >= again.c.frontMaxGap, id);
    for (let f = 0; f < LIMIT && going(again) && again.index === i; f++) {
      play(again);
      again.update(1 / 60);
    }
    assert.ok(again.state === 'run' && !again.missed && again.index === i + 1, `${id}: шаг не проходится заново`);
  }
});

test('показ работает сам: щит принимает лаву, спасение вытаскивает из провала на полосу следующего шага', () => {
  const p = page(), T = p.get('CollapseTutorial'), steps = p.get('CollapseRules').TUTORIAL;
  for (const [id, field] of [['shield', 'shield'], ['rescue', 'rescue']]) {
    const i = steps.findIndex(s => s.id === id), run = new T(i);
    for (let f = 0; f < LIMIT && going(run) && run.index === i; f++) run.update(1 / 60);
    assert.deepEqual([run.state, run.missed, run.index, run[field]], ['run', false, i + 1, 0], id);
    assert.equal(run.lane, steps[i + 1].lane, id);
  }
});

test('трасса той же модели: стрелки ведут на полосу следующего шага и в целую колею, ловушек нет', () => {
  const p = page(), R = p.get('CollapseRules'), t = new (p.get('CollapseTutorialTrack'))();
  const shape = JSON.stringify(Object.keys(new (p.get('CollapseTrack'))(1).seg(0)).sort());
  R.TUTORIAL.forEach((step, n) => {
    const from = t.starts[n];
    for (let i = from; i < from + step.len; i++) {
      assert.equal(JSON.stringify(Object.keys(t.seg(i)).sort()), shape, `сегмент ${i}`);
      for (const f of t.seg(i).forks) {
        assert.equal(f.from, step.lane, `${step.id}: стрелка не с полосы шага`);
        assert.equal(f.to, R.TUTORIAL[n + 1].lane, `${step.id}: стрелка не на полосу следующего шага`);
        assert.ok(t.laneSafe(f.to, i, R.LOOK), `${step.id}: стрелка ведёт в опасность`);
      }
    }
    for (const [at, lane, len = 1] of [...(step.gaps || []), ...(step.lava || [])]) {
      assert.ok(R.trapFree(t.segs, lane, from + at, len), `${step.id}: ловушка`);
      if (step.forks) assert.ok(step.forks.some(([f, l]) => l === lane && at - f >= R.SWITCH_LEAD), `${step.id}: стрелка выхода ближе перевода`);
    }
  });
  const end = t.segs.length;
  assert.equal(t.seg(end + 20).kind, 'calm', 'за обучением тихая колея');
});

test('обвал мягче обычного: дальше и медленнее, а догоняет только на своём шаге', () => {
  const p = page(), run = new (p.get('CollapseTutorial'))(), usual = new (p.get('CollapseRun'))(1);
  assert.ok(run.frontSpeed() < usual.frontSpeed());
  assert.ok(run.pos - run.front > usual.pos - usual.front);
  const collapse = p.get('CollapseRules').TUTORIAL.findIndex(s => s.id === 'collapse');
  let least = 1e9;
  for (let f = 0; f < LIMIT && run.index < collapse; f++) {
    play(run);
    run.update(1 / 60);
    least = Math.min(least, run.pos - run.front);
  }
  assert.ok(least >= 4, `обвал подошёл на ${least.toFixed(1)} сегм. раньше своего шага`);
});

test('у каждого шага подсказка на обоих языках, не длиннее 90 знаков', () => {
  const p = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/CollapseRules.js']);
  const words = p.get('Lang').words;
  for (const s of p.get('CollapseRules').TUTORIAL) {
    const w = words['tutorial.' + s.id];
    assert.ok(w?.ru && w?.en, s.id);
    assert.ok(Math.max(w.ru.length, w.en.length) + words['tutorial.retry'].ru.length < 90, s.id);
  }
});

// The game with stubs: a fake UI, a table and TG that count calls.
function boot() {
  const store = new Map(), elements = new Map(), submits = [], saves = [];
  const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const UI = { get(id) {
    if (!elements.has(id)) elements.set(id, {
      setText(v) { this.text = v; return this; }, setAngle(v) { this.angle = v; return this; }, setSrc(v) { this.src = v; return this; }, setValue() { return this; },
      onClick(fn) { this.click = fn; return this; }, show(v) { this.visible = v; return this; },
    });
    return elements.get(id);
  } };
  const ctx = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Sound3D.js', 'js/CollapseRules.js', 'js/Game.js'], {
    localStorage, UI, Image: class {}, CollapseScene: { LANE_W: 180 },
    TG: { inside: false, loadBest() {}, runEnded() {}, runStarted() {}, haptic() {}, saveBest: m => saves.push(m) },
    Leaderboard: { close() {}, refreshLanguage() {}, submit: r => submits.push(r), enabled: true },
  });
  const game = new (ctx.get('Game'))({ scene: { canvas: { addEventListener() {} }, sync() {}, reset() {}, onEvent() {} } });
  game._icons = () => {};
  return { game, UI, store, submits, saves, lang: ctx.get('Lang') };
}

test('кнопка запускает обучение, крушение возвращает на шаг: ни рекорда, ни таблицы, ни меню', () => {
  const b = boot(), game = b.game;
  b.UI.get('modeTutorial').click();
  assert.equal(game.mode, 'play');
  assert.equal(game.run.tutorial, true);
  assert.equal(b.UI.get('tutorialBox').visible, true);
  game.run.pos = game.run._seg = 900;     // farther than any record
  game.run._crash('gap');
  game.update(1 / 60);
  assert.equal(game.mode, 'over');
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  assert.equal(game.mode, 'play', 'обучение идёт снова');
  assert.deepEqual([game.run.tutorial, game.run.index, game.run.failed], [true, 0, true]);
  assert.equal(game.best, 0, 'рекорд не тронут');
  assert.equal(b.store.get('collapse.best'), undefined);
  assert.deepEqual([b.submits.length, b.saves.length], [0, 0], 'в таблицу и в облако не ушло');
  assert.notEqual(b.UI.get('over').visible, true, 'диалога конца забега нет');
  assert.match(b.UI.get('tutorialText').text, /^Ещё раз\./);
  game.setPaused(true);
  assert.equal(b.UI.get('overMenu').visible, true, 'из паузы обучения есть выход в меню');
  b.UI.get('continueBtn').click();
  assert.deepEqual([game.mode, game.run.tutorial, game.run.index], ['play', true, 0], '«Заново» в паузе — обучение с начала');
});

test('промах возвращает на шаг сразу, подсказка меняется с языком', () => {
  const b = boot(), game = b.game;
  b.UI.get('modeTutorial').click();
  const first = game.run;
  for (let i = 0; i < 60 * 10 && game.run === first; i++) game.update(1 / 60);
  assert.notEqual(game.run, first, 'без тапа шаг не пройден');
  assert.deepEqual([game.run.index, game.mode], [0, 'play']);
  game.update(1 / 60);
  assert.match(b.UI.get('tutorialText').text, /Тап по табличке/);
  assert.equal(b.UI.get('best').text, '1');
  b.lang.set('en');
  game.update(1 / 60);
  assert.match(b.UI.get('tutorialText').text, /Tap the sign/);
});

test('конец обучения: пройдено в Store, новый забег бесконечного режима, он уже идёт в таблицу', () => {
  const b = boot(), game = b.game;
  b.UI.get('modeTutorial').click();
  game.run.finished = true;
  game.update(1 / 60);
  assert.equal(b.store.get('collapse.tutorial'), '1');
  assert.deepEqual([game.mode, game.run.tutorial, game.run.pos], ['play', false, 0]);
  assert.equal(b.UI.get('tutorialBox').visible, false);
  assert.equal(b.UI.get('best').text, '0');
  assert.match(b.UI.get('modeTutorial').text, /^✓ /);
  assert.equal(b.submits.length, 0);
  game.run._crash('gap');
  game.update(1 / 60);
  assert.equal(b.submits.length, 1);
});


test('портрет: все шесть кадров приходят из состояния и событий правил, манометр читает скорость', () => {
  const b = boot(), g = b.game;
  const states = ['calm', 'tense', 'joy', 'hit', 'fire', 'fall'];
  for (const state of states) {
    g.start();
    if (state === 'tense') g.run.ammo = 0;
    if (state === 'joy') {
      let at = 1;
      while (!g.run.track.seg(at).pickup.some(Boolean)) at++;
      g.run.lane = g.run.track.seg(at).pickup.findIndex(Boolean);
      g.run._collect(at);
    }
    if (state === 'hit' || state === 'fire') { g.run.shield = 1; g.run._hit(state === 'hit' ? 'demon' : 'lava'); }
    if (state === 'fall') g.run._crash('gap');
    g.update(0);
    assert.equal(b.UI.get('portrait').src, g.constructor.PORTRAITS[state], state);
  }
  g.start(); g._hud(g.run);
  const start = b.UI.get('needle').angle;
  g.run.pos = 10000; g._hud(g.run);
  const fast = b.UI.get('needle').angle;
  g.run.boost = g.run.c.boostSec; g._hud(g.run);
  assert.ok(start < fast && fast < b.UI.get('needle').angle);
  assert.equal(b.UI.get('needle').angle, 120);
});
