// Rail Link: Collapse run rules (js/CollapseRules.js): the track generator invariants of GDD v3 §3
// and the run state — shots, lane changes, hazards, resources, the collapse behind, one continue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const page = () => loadScripts(['js/Constants.js', 'js/CollapseRules.js']);
const LANES = [0, 1, 2];

// Drive the run with a fixed frame time until a condition or a frame limit.
function runFrames(run, frames, until = () => false) {
  for (let f = 0; f < frames && run.state === 'run' && !until(run); f++) run.update(1 / 60);
}

// A bot that always escapes: shoots the next fork when its own lane is unsafe ahead.
function escapeBot(run, CollapseRules) {
  const next = run.nextFork();
  if (!next || next.armed) return;
  if (run.track.laneSafe(run.lane, next.at, CollapseRules.LOOK)) return;
  const to = next.to.find(l => run.forkSafe(next.at, l));
  if (to !== undefined) run.shoot(next.at, to);
}

test('трасса детерминирована по зерну: одно зерно — одна трасса, другое зерно — другая', () => {
  const p = page();
  const CollapseTrack = p.get('CollapseTrack');
  const a = new CollapseTrack(42), b = new CollapseTrack(42), c = new CollapseTrack(7);
  const dump = t => JSON.stringify(Array.from({ length: 400 }, (_, i) => t.seg(i)));
  assert.equal(dump(a), dump(b));
  assert.notEqual(dump(a), dump(c));
});

test('у каждой опасности есть развилка-выход на безопасную полосу и развилка назад', () => {
  const p = page();
  const CollapseTrack = p.get('CollapseTrack');
  for (const seed of [1, 2, 3, 99, 2026]) {
    const t = new CollapseTrack(seed);
    let hazards = 0;
    for (let i = 1; i < 1500; i++) {
      const s = t.seg(i), before = t.seg(i - 1);
      for (const l of LANES) {
        const bad = s.gap[l] || s.lava[l];
        const badBefore = before.gap[l] || before.lava[l];
        if (!bad || badBefore) continue;
        hazards++;
        let end = i;
        while (t.seg(end).gap[l] || t.seg(end).lava[l]) end++;
        const escapes = before.forks.filter(f => f.from === l && t.laneSafe(f.to, i - 1, end - i + 2));
        assert.ok(escapes.length > 0, `зерно ${seed}: у опасности на полосе ${l}, сегмент ${i}, нет выхода`);
        assert.ok(t.seg(end).forks.some(f => f.to === l), `зерно ${seed}: нет развилки назад на полосу ${l} после ${end}`);
      }
    }
    assert.ok(hazards > 50, `зерно ${seed}: опасностей слишком мало (${hazards})`);
  }
});

test('развилки только между соседними полосами; никогда не рушатся все три полосы сразу', () => {
  const p = page();
  const t = new (p.get('CollapseTrack'))(5);
  for (let i = 0; i < 1500; i++) {
    const s = t.seg(i);
    for (const f of s.forks) assert.equal(Math.abs(f.from - f.to), 1, `сегмент ${i}`);
    assert.ok(LANES.some(l => !s.gap[l] && !s.lava[l]), `сегмент ${i}: все полосы опасны`);
  }
});

test('выстрел тратит патрон, без патронов стрелку не перевести, поезд переходит на стрелке', () => {
  const p = page();
  const run = new (p.get('CollapseRun'))(11);
  runFrames(run, 3000, r => !!r.nextFork());
  const next = run.nextFork();
  assert.ok(next, 'развилка впереди есть');
  const ammo = run.ammo, lane = run.lane;
  assert.equal(run.shoot(next.at, next.to[0]), 'ok');
  assert.equal(run.ammo, ammo - 1);
  assert.equal(run.shoot(next.at, next.to[0]), 'ok', 'повторный тап по той же стрелке бесплатен');
  assert.equal(run.ammo, ammo - 1);
  assert.equal(run.lane, lane, 'до стрелки поезд на своей полосе');
  runFrames(run, 600, r => r.pos > next.at);
  assert.equal(run.lane, next.to[0], 'после стрелки — на выбранной полосе');

  const dry = new (p.get('CollapseRun'))(11);
  runFrames(dry, 3000, r => !!r.nextFork());
  dry.ammo = 0;
  const n2 = dry.nextFork();
  assert.equal(dry.shoot(n2.at, n2.to[0]), 'no-ammo');
  assert.equal(dry.armed, null);
});

test('бот, уходящий от опасностей, проезжает 250 сегментов без падений', () => {
  const p = page();
  const CollapseRules = p.get('CollapseRules');
  for (const seed of [3, 17, 404]) {
    const run = new (p.get('CollapseRun'))(seed);
    run.ammo = 999;
    for (let f = 0; f < 60 * 300 && run.state === 'run' && run.pos < 250; f++) {
      escapeBot(run, CollapseRules);
      if (run.demon) run.shootDemon();
      run.update(1 / 60);
    }
    assert.equal(run.state, 'run', `зерно ${seed}: упал (${run.reason}) на ${run.pos.toFixed(1)}`);
    assert.ok(run.pos >= 250);
  }
});

test('без действий поезд падает; спасение вытаскивает из провала, щит прощает удар', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun');
  const idle = new CollapseRun(8);
  runFrames(idle, 60 * 300);
  assert.equal(idle.state, 'over');
  assert.ok(['gap', 'lava', 'demon', 'caught'].includes(idle.reason));

  const saved = new CollapseRun(8);
  saved.rescue = 2; saved.shield = 2;
  runFrames(saved, 60 * 300, r => r.events.some(e => e.type === 'rescued' || e.type === 'shielded'));
  assert.ok(saved.events.some(e => e.type === 'rescued' || e.type === 'shielded'), 'ресурс сработал');
  assert.equal(saved.state, 'run');
});

test('обвал позади догоняет медленный поезд; одно продолжение за забег', () => {
  const p = page();
  const run = new (p.get('CollapseRun'))(21);
  run.front = run.pos - 0.2;
  run.update(1 / 60);
  assert.equal(run.state, 'over');
  assert.equal(run.reason, 'caught');
  assert.equal(run.canContinue, true);
  assert.equal(run.continueRun(), true);
  assert.equal(run.state, 'run');
  assert.ok(run.pos - run.front >= 8 - 1e-9, 'обвал отодвинут');
  run.front = run.pos;
  run.invuln = 0;
  run.update(1 / 60);
  assert.equal(run.state, 'over');
  assert.equal(run.canContinue, false, 'второго продолжения нет');
});

test('ресурсы: патроны пополняются, ускоритель и замедлитель меняют скорость и гасят друг друга', () => {
  const p = page();
  const run = new (p.get('CollapseRun'))(1);
  const v0 = run.speed();
  run.boost = 1;
  assert.ok(run.speed() > v0);
  run.boost = 0; run.slow = 1;
  assert.ok(run.speed() < v0);
  // Pickups apply through _collect on the train's lane.
  const seg = run.track.seg(3);
  seg.pickup[run.lane] = 'ammo';
  const ammo = run.ammo;
  run._collect(3);
  assert.equal(run.ammo, ammo + run.c.ammoPickup);
  run._collect(3);
  assert.equal(run.ammo, ammo + run.c.ammoPickup, 'один ресурс берётся один раз');
});

test('провалы конечны: не длиннее COLLAPSE_GAP_MAX, за провалом полоса снова целая', () => {
  const p = page();
  const max = p.get('COLLAPSE_GAP_MAX');
  for (const seed of [1, 2, 3]) {
    const t = new (p.get('CollapseTrack'))(seed);
    for (const l of LANES) {
      let run = 0, longest = 0;
      for (let i = 0; i < 2000; i++) {
        run = t.seg(i).gap[l] ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      assert.ok(longest > 0 && longest <= max, `зерно ${seed}, полоса ${l}: самый длинный провал ${longest}`);
    }
  }
});

test('окно реакции: обязательная развилка не ближе COLLAPSE_REACT_SEC пути на предельной скорости', () => {
  const p = page();
  const R = p.get('CollapseRules');
  const c = R.cfg();
  for (const seed of [1, 2, 3, 99]) {
    const t = new (p.get('CollapseTrack'))(seed);
    let last = -1e9, checked = 0;
    for (let i = 0; i < 2000; i++) {
      const s = t.seg(i);
      if (!s.forks.length) continue;
      if (s.kind.endsWith('-lead')) {
        const sec = (i - last) / R.maxSpeedAt(c, i);
        assert.ok(sec >= c.reactSec - 1e-9, `зерно ${seed}: развилка ${i} через ${sec.toFixed(2)} с после ${last}`);
        checked++;
      }
      last = i;
    }
    assert.ok(checked > 50);
  }
});

test('поезд без действий падает не позже 300 с игрового времени', () => {
  const p = page();
  for (const seed of [8, 13, 77]) {
    const idle = new (p.get('CollapseRun'))(seed);
    runFrames(idle, 60 * 300);
    assert.equal(idle.state, 'over', `зерно ${seed}: едет ${idle.time.toFixed(0)} с`);
    assert.ok(idle.time <= 300);
  }
});

test('обвал позади сам догоняет медленный поезд, даже если бот уходит от всех опасностей', () => {
  const p = page();
  const CollapseRules = p.get('CollapseRules');
  const run = new (p.get('CollapseRun'))(3);
  run.ammo = 999;
  for (let f = 0; f < 60 * 120 && run.state === 'run'; f++) {
    run.slow = 1;                                   // the decelerator never wears off
    escapeBot(run, CollapseRules);
    if (run.demon) run.shootDemon();
    run.update(1 / 60);
  }
  assert.equal(run.state, 'over');
  assert.equal(run.reason, 'caught');
});

test('выстрел по демону стоит патрон; без патронов демон бьёт, щит прощает удар', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun');
  const toDemon = run => runFrames(run, 60 * 600, r => !!r.demon);

  const run = new CollapseRun(4);
  run.ammo = 999; run.rescue = 99; run.shield = 0;
  toDemon(run);
  assert.ok(run.demon, 'демон прыгнул');
  const ammo = run.ammo;
  assert.equal(run.shootDemon(), 'ok');
  assert.equal(run.ammo, ammo - 1);
  assert.equal(run.demon, null);

  const dry = new CollapseRun(4);
  dry.rescue = 99;
  toDemon(dry);
  dry.ammo = 0;
  assert.equal(dry.shootDemon(), 'no-ammo');
  dry.invuln = 0; dry.shield = 1;
  runFrames(dry, 60 * 3, r => !r.demon);
  assert.equal(dry.state, 'run', 'щит принял удар демона');
  assert.equal(dry.shield, 0);
});

test('щит прощает поток лавы и касание обвала; спасение ставит поезд на целую полосу', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun');
  const lavaRun = new CollapseRun(1);
  lavaRun.track.seg(3).lava[lavaRun.lane] = true;
  lavaRun.shield = 1;
  runFrames(lavaRun, 60 * 3, r => r.pos > 3.2);
  assert.equal(lavaRun.state, 'run');
  assert.equal(lavaRun.shield, 0);

  const caught = new CollapseRun(1);
  caught.shield = 1;
  caught.front = caught.pos - 0.2;
  caught.update(1 / 60);
  assert.equal(caught.state, 'run');
  assert.ok(caught.pos - caught.front >= caught.c.shieldGap - 0.1, 'обвал отброшен');

  const fall = new CollapseRun(1);
  fall.track.seg(3).gap[fall.lane] = true;
  fall.rescue = 1;
  runFrames(fall, 60 * 3, r => r.pos > 3.2);
  assert.equal(fall.state, 'run');
  assert.equal(fall.rescue, 0);
  assert.equal(fall.track.seg(3).gap[fall.lane], false, 'на целой полосе');

  const noRescue = new CollapseRun(1);
  noRescue.track.seg(3).gap[noRescue.lane] = true;
  runFrames(noRescue, 60 * 3, r => r.pos > 3.2);
  assert.equal(noRescue.reason, 'gap');
});
