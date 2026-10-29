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

// The dodger of the balance table: real ammo, leaves its lane only when it is unsafe ahead, shoots
// every leaping demon, does not seek pickups.
function dodgeBot(run, CollapseRules) {
  escapeBot(run, CollapseRules);
  for (const d of run.leaping()) run.shootDemon(d.side);
}

// 20 seeds of one bot without a continue: distances (m) and times (s).
function series(p, bot) {
  const CollapseRun = p.get('CollapseRun'), R = p.get('CollapseRules');
  const out = [];
  for (let seed = 1; seed <= 20; seed++) {
    const run = new CollapseRun(seed);
    for (let f = 0; f < 60 * 900 && run.state === 'run'; f++) {
      if (bot) bot(run, R);
      run.update(1 / 60);
    }
    out.push({ m: run.meters, t: run.time, over: run.state === 'over' });
  }
  return out;
}
const median = a => { const s = [...a].sort((x, y) => x - y); return (s[9] + s[10]) / 2; };

test('решения решают: без тапов забег кончается за 30 с, медиана не дальше 300 м (20 зёрен)', () => {
  const idle = series(page(), null);
  const m = median(idle.map(r => r.m)), slowest = Math.max(...idle.map(r => r.t));
  assert.ok(m <= 300, `медиана без тапов ${m} м`);
  assert.ok(slowest <= 30, `самый долгий забег без тапов ${slowest.toFixed(1)} с`);
});

test('уклонист с честными патронами доезжает дальше 1500 м, но обвал без ускорителей его настигает (20 зёрен)', () => {
  const dodger = series(page(), dodgeBot);
  const m = median(dodger.map(r => r.m)), t = median(dodger.map(r => r.t));
  assert.ok(m >= 1500, `медиана уклониста ${m} м`);
  // A short run (GDD v3: a session of 2–4 minutes): the gap melts without boosts.
  assert.ok(dodger.every(r => r.over) && t <= 240, `медиана уклониста ${t.toFixed(0)} с, живых ${dodger.filter(r => !r.over).length}`);
});

test('замедлитель на поздней дистанции подпускает обвал до поезда, в начале — нет', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun');
  const clear = { kind: 'calm', gap: [false, false, false], lava: [false, false, false], pickup: [null, null, null], forks: [], demon: null };
  // The collapse at its natural distance after 20 s on a clear track from segment `from`, then a
  // decelerator: the gap before and the smallest gap while slowed.
  const slowAt = from => {
    const run = new CollapseRun(1);
    run.track.seg = () => clear;
    run.pos = from; run._seg = from; run.front = from - run.c.frontMaxGap; run.invuln = 1e9;
    runFrames(run, 60 * 20);
    const before = run.pos - run.front;
    run.slow = run.c.slowSec;
    let min = before;
    runFrames(run, Math.round(60 * run.c.slowSec), r => { min = Math.min(min, r.pos - r.front); return false; });
    return { before, min, km: run.pos * run.c.segMeters / 1000 };
  };
  const early = slowAt(0), late = slowAt(300);
  assert.ok(early.min >= 2, `в начале замедлитель губит: зазор ${early.before.toFixed(1)} -> ${early.min.toFixed(1)}`);
  assert.ok(late.min <= 1, `на ${late.km.toFixed(1)} км зазор ${late.before.toFixed(1)} -> ${late.min.toFixed(1)} сегм.: обвал не подходит`);
});

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
      if (run.leaping().length) run.shootDemon();
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
    if (run.leaping().length) run.shootDemon();
    run.update(1 / 60);
  }
  assert.equal(run.state, 'over');
  assert.equal(run.reason, 'caught');
});

// Drive a run to its first leaping demon, invulnerable on the way (lava and gaps do not matter here).
function toDemon(run) {
  run.invuln = 1e9;
  runFrames(run, 60 * 900, r => r.leaping().length > 0);
  run.invuln = 0;
}

test('выстрел по демону стоит патрон; без патронов демон бьёт, щит прощает удар', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun');

  const run = new CollapseRun(4);
  run.ammo = 999;
  toDemon(run);
  const d = run.leaping()[0];
  assert.ok(d, 'демон прыгнул');
  const ammo = run.ammo;
  assert.equal(run.shootDemon(d.side), 'ok');
  assert.equal(run.ammo, ammo - 1);
  assert.ok(!run.demons.includes(d), 'сбитый демон исчез');

  const dry = new CollapseRun(4);
  toDemon(dry);
  dry.ammo = 0;
  assert.equal(dry.shootDemon(), 'no-ammo');
  dry.shield = 1;
  runFrames(dry, 60 * 3, r => r.demons.length === 0);
  assert.equal(dry.state, 'run', 'щит принял удар демона');
  assert.equal(dry.shield, 0);
});

// Every demon segment of a track up to `n` segments: { at, sides: [-1|1, …] }.
function demonSegs(t, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = t.seg(i);
    if (s.demon) out.push({ at: i, sides: s.demon.map(d => d.side) });
  }
  return out;
}

test('демоны выпрыгивают из стен: не в первые 600 м, сторона и число по зерну, одиночки — из обеих стен', () => {
  const p = page();
  const CollapseTrack = p.get('CollapseTrack');
  const segMeters = p.get('COLLAPSE_SEG_METERS');
  const dump = seed => { const t = new CollapseTrack(seed); return JSON.stringify(Array.from({ length: 3000 }, (_, i) => t.seg(i).demon)); };
  assert.equal(dump(42), dump(42), 'одно зерно — те же демоны');
  const singles = { '-1': 0, '1': 0 };
  for (let seed = 1; seed <= 20; seed++) {
    for (const d of demonSegs(new CollapseTrack(seed), 3000)) {
      // The owner's rule (card 09): no demons in the first 600 m.
      assert.ok(d.at * segMeters >= 600, `зерно ${seed}: демон на ${d.at * segMeters} м`);
      assert.ok(d.sides.length === 1 || (d.sides.length === 2 && d.sides[0] === -d.sides[1]), `зерно ${seed}: пара не из обеих стен`);
      if (d.sides.length === 1) singles[d.sides[0]]++;
    }
  }
  const all = singles['-1'] + singles['1'];
  assert.ok(all > 200, `одиночных демонов слишком мало (${all})`);
  assert.ok(Math.min(singles['-1'], singles['1']) > all * 0.35, `стены неравны: слева ${singles['-1']}, справа ${singles['1']}`);
});

test('двойные демоны — не раньше COLLAPSE_DEMON_PAIR_FROM и чаще с дистанцией', () => {
  const p = page();
  const CollapseTrack = p.get('CollapseTrack');
  const from = p.get('COLLAPSE_DEMON_PAIR_FROM'), full = p.get('COLLAPSE_DEMON_PAIR_FULL');
  // Pair share in the first quarter of the ramp and past its end: [pairs, demons].
  const near = [0, 0], far = [0, 0];
  for (let seed = 1; seed <= 40; seed++) {
    for (const d of demonSegs(new CollapseTrack(seed), full + 1000)) {
      const pair = d.sides.length === 2;
      if (pair) assert.ok(d.at >= from, `зерно ${seed}: пара на сегменте ${d.at} раньше ${from}`);
      const band = d.at < from ? null : d.at < from + (full - from) / 4 ? near : d.at >= full ? far : null;
      if (band) { band[0] += pair ? 1 : 0; band[1]++; }
    }
  }
  const nearShare = near[0] / near[1], farShare = far[0] / far[1];
  assert.ok(near[1] > 30 && far[1] > 300, `мало демонов для оценки: ${near[1]} / ${far[1]}`);
  assert.ok(farShare > 0.3, `на дальней дистанции пар мало: ${farShare.toFixed(2)}`);
  assert.ok(nearShare < farShare / 3, `пары не учащаются: ${nearShare.toFixed(2)} -> ${farShare.toFixed(2)}`);
});

test('пару демонов сбивают два выстрела в окно; два несбитых без щита — падение, щит прощает один', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun');
  const R = p.get('CollapseRules');
  // A pair placed by hand on the next segment: the rules release it as the generator would.
  const pairRun = () => {
    const run = new CollapseRun(9);
    run.ammo = 99;
    const at = Math.floor(run.pos) + 2;
    run.track.seg(at).demon = [{ side: -1, lag: 0 }, { side: 1, lag: run.c.pairLag }];
    runFrames(run, 600, r => r.demons.length > 0);
    return run;
  };

  // The first tap 0.2 s into the leap (the right one is still in its wall), the second 0.4 s later:
  // both demons fall, the run goes on.
  const shot = pairRun();
  const tap = 0.4;
  runFrames(shot, 12);
  assert.equal(shot.shootDemon(-1), 'ok');
  assert.equal(shot.shootDemon(1), 'invalid', 'правый ещё в стене');
  runFrames(shot, Math.round(tap * 60));
  assert.equal(shot.shootDemon(1), 'ok');
  assert.equal(shot.demons.length, 0);
  runFrames(shot, 60 * 3);
  assert.equal(shot.state, 'run');
  // The window for the second shot ends demonSec + pairLag after the first leap: two taps fit.
  assert.ok(shot.c.demonSec + shot.c.pairLag >= 2 * tap + R.STEP, 'окно пары вмещает два тапа');

  const dry = pairRun();
  dry.shield = 0;
  runFrames(dry, 60 * 4);
  assert.equal(dry.state, 'over');
  assert.equal(dry.reason, 'demon');

  const one = pairRun();
  one.shield = 1;
  runFrames(one, 60 * 4);
  assert.equal(one.state, 'over', 'щит прощает только одного демона из пары');
  assert.equal(one.reason, 'demon');
  assert.ok(one.events.some(e => e.type === 'shielded' && e.reason === 'demon'));
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
