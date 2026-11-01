// Rail Link: Collapse run rules (js/CollapseRules.js): the track generator invariants of GDD v3 §3
// and the run state — shots, lane changes, hazards, resources, the collapse behind, one continue.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadScripts, ROOT } from './browser-scripts.mjs';

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
// every demon in the frame, does not seek pickups.
function dodgeBot(run, CollapseRules) {
  escapeBot(run, CollapseRules);
  for (const d of run.shootable()) run.shootDemon(d.side);
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

test('уклонист с честными патронами доезжает дальше 1500 м, а забег кончается и без обвала позади (20 зёрен)', () => {
  const dodger = series(page(), dodgeBot);
  const m = median(dodger.map(r => r.m)), t = median(dodger.map(r => r.t));
  assert.ok(m >= 1500, `медиана уклониста ${m} м`);
  // The bot never tires, a player does: most runs end on the hazards in minutes.
  assert.ok(dodger.filter(r => r.over).length >= 16 && t <= 420, `медиана уклониста ${t.toFixed(0)} с, живых ${dodger.filter(r => !r.over).length}`);
});

// Every collapse of a seed over `n` stretches, without a ride: the rolls alone.
function rolls(p, seed, n) {
  const run = new (p.get('CollapseRun'))(seed), c = run.c, out = [];
  run.invuln = 1e9;
  for (let i = 1; i < c.eventFrom + n * c.eventEvery; i++) {
    const was = run.collapseAt;
    run._enter(i);
    if (run.collapseAt !== was) out.push(run.collapseAt);
  }
  return out;
}

test('обвал — случайное событие: до 1500 м его нет, потом 12 % на 500 м пути, место случайно', () => {
  const p = page(), c = p.get('CollapseRules').cfg();
  assert.deepEqual([c.eventFrom * c.segMeters, c.eventEvery * c.segMeters, c.eventChance], [1500, 500, 0.12]);
  const hits = [];
  for (let seed = 1; seed <= 2000; seed++) hits.push(...rolls(p, seed, 10));
  const share = hits.length / (2000 * 10);
  assert.ok(share > 0.11 && share < 0.13, `доля участков с обвалом ${share}`);
  assert.ok(hits.every(at => at >= c.eventFrom), 'раньше 1500 м');
  const places = new Set(hits.map(at => (at - c.eventFrom) % c.eventEvery));
  assert.ok(places.size >= 45, `мест внутри участка ${places.size}`);
});

test('зерно задаёт обвалы и не меняет трассу', () => {
  const p = page(), run = new (p.get('CollapseRun'))(5), other = new (p.get('CollapseTrack'))(5);
  assert.deepEqual(rolls(p, 5, 60), rolls(p, 5, 60));
  assert.notDeepEqual(rolls(p, 5, 60), rolls(p, 6, 60));
  rolls(p, 5, 60);
  for (let i = 0; i < 400; i++) assert.equal(JSON.stringify(run.track.seg(i)), JSON.stringify(other.seg(i)), `сегмент ${i}`);
});

test('обвал выходит из темноты, идёт свою длину и останавливается; поезд уходит от него', () => {
  const p = page(), CollapseRun = p.get('CollapseRun');
  const clear = { kind: 'calm', gap: [false, false, false], lava: [false, false, false], pickup: [null, null, null], forks: [], demon: null };
  const run = new CollapseRun(1), c = run.c;
  run.track.seg = () => clear;
  run.pos = run._seg = 100;
  runFrames(run, 60);
  assert.ok(run.pos - run.front > 1e8, 'до события обвала нет');
  assert.equal(run.collapsing, false);
  run.events.length = 0;
  run.startCollapse();
  assert.deepEqual([...run.events].map(e => e.type), ['collapse']);
  assert.ok(Math.abs(run.pos - run.front - c.eventGap) < 1e-9);
  assert.equal(run.collapseRush, true);
  runFrames(run, Math.ceil(60 * c.eventRushSec) + 1);
  assert.equal(run.collapseRush, false);
  assert.ok(run.pos - run.front <= c.frontMaxGap + 1e-9, 'подошёл к зазору погони');
  const end = run.collapseEnd;
  runFrames(run, 60 * 60, r => r.pos >= end);
  assert.equal(run.state, 'run', 'на чистом ходу поезд уходит');
  const stood = run.front, gap = run.pos - run.front;
  assert.ok(gap > 1, `зазор в конце ${gap}`);
  runFrames(run, 60);
  assert.equal(run.front, stood, 'остановился');
  assert.ok(run.pos - run.front > gap);
});

// Card 28: the shop sells accelerators and rescues. Pickups on 20 seeds × 3000 segments before it.
const PICKUPS_BEFORE = { ammo: 905, boost: 506, slow: 443, shield: 402, rescue: 401 }, DODGER_BEFORE = 4759.5;

test('ускорители и спасения в 2,5–3 раза реже, остальное на тех же местах, забег проходим (20 зёрен × 3000)', () => {
  const p = page(), CollapseTrack = p.get('CollapseTrack');
  const count = { ammo: 0, boost: 0, slow: 0, shield: 0, rescue: 0 };
  for (let seed = 1; seed <= 20; seed++) {
    const t = new CollapseTrack(seed);
    for (let i = 0; i < 3000; i++) for (const kind of t.seg(i).pickup) if (kind) count[kind]++;
  }
  for (const kind of ['ammo', 'slow', 'shield']) assert.equal(count[kind], PICKUPS_BEFORE[kind], kind);
  for (const kind of ['boost', 'rescue']) {
    const rarer = PICKUPS_BEFORE[kind] / count[kind];
    assert.ok(rarer >= 2.5 && rarer <= 3, `${kind}: реже в ${rarer.toFixed(2)} раза`);
  }
  const m = median(series(p, dodgeBot).map(r => r.m));
  assert.ok(m >= 0.8 * DODGER_BEFORE, `медиана уклониста ${m} м, было ${DODGER_BEFORE}`);
});

test('объезд без ресурса — тихий участок без стрелок: табличка не ведёт в никуда', () => {
  const p = page(), t = new (p.get('CollapseTrack'))(1);
  let lanes = 0, trips = 0;
  for (let i = 0; i < 3000; i++) {
    const s = t.seg(i);
    if (s.kind !== 'detour') continue;
    lanes += s.pickup.filter(Boolean).length;
    trips += s.forks.length / 2;
  }
  assert.ok(lanes > 10, `объездов ${lanes}`);
  assert.equal(trips, lanes, 'на объезд две стрелки и один ресурс');
});

test('замедлитель подпускает обвал до поезда, пока тот идёт, а без обвала ничем не грозит', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun');
  const clear = { kind: 'calm', gap: [false, false, false], lava: [false, false, false], pickup: [null, null, null], forks: [], demon: null };
  // Past the rush of a collapse on a clear track, then a decelerator: the gap before and the
  // smallest gap while slowed.
  const slowAt = (from, on) => {
    const run = new CollapseRun(1);
    run.track.seg = () => clear;
    run.pos = from; run._seg = from; run.invuln = 1e9;
    if (on) run.startCollapse();
    runFrames(run, 60 * 5);
    const before = run.pos - run.front;
    run.slow = run.c.slowSec;
    let min = before;
    runFrames(run, Math.round(60 * run.c.slowSec), r => { min = Math.min(min, r.pos - r.front); return false; });
    return { before, min, km: run.pos * run.c.segMeters / 1000 };
  };
  const quiet = slowAt(0, false), chased = slowAt(300, true);
  assert.ok(quiet.min > 100, `без обвала зазор ${quiet.min.toFixed(1)}`);
  assert.ok(chased.min <= 1.5, `на ${chased.km.toFixed(1)} км зазор ${chased.before.toFixed(1)} -> ${chased.min.toFixed(1)} сегм.: обвал не подходит`);
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
        // The escape fork SWITCH_LEAD segments before the hazard: the crossing is over before it.
        const L = p.get('CollapseRules').SWITCH_LEAD, lead = t.seg(i - L);
        const escapes = lead.forks.filter(f => f.from === l && t.laneSafe(f.to, i - L, end - i + L + 1));
        assert.ok(escapes.length > 0, `зерно ${seed}: у опасности на полосе ${l}, сегмент ${i}, нет выхода`);
        assert.ok(t.seg(end).forks.some(f => f.to === l), `зерно ${seed}: нет развилки назад на полосу ${l} после ${end}`);
      }
    }
    assert.ok(hazards > 50, `зерно ${seed}: опасностей слишком мало (${hazards})`);
  }
});

// Card 17 (the owner): over 20 seeds × 3000 segments — segments with two neighbouring lanes that are
// a gap or lava, hazard runs without a neighbour whole for their full length, outer lanes both cut.
function trapCount(p) {
  const CollapseTrack = p.get('CollapseTrack'), R = p.get('CollapseRules');
  let adjacent = 0, lonely = 0, overlaps = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const t = new CollapseTrack(seed);
    for (let i = 1; i < 3000; i++) {
      const s = t.seg(i), bad = l => s.gap[l] || s.lava[l];
      if ((bad(0) && bad(1)) || (bad(1) && bad(2))) adjacent++;
      if (bad(0) && bad(2)) overlaps++;
      for (const l of LANES) {
        const before = t.seg(i - 1);
        if (!bad(l) || before.gap[l] || before.lava[l]) continue;
        let end = i;
        while (t.seg(end).gap[l] || t.seg(end).lava[l]) end++;
        if (!R.neighbors(l).some(n => t.laneSafe(n, i, end - i))) lonely++;
      }
    }
  }
  return { adjacent, lonely, overlaps };
}

test('провалы внахлёст, но не в ловушку: две соседние полосы никогда не тупиковые разом (20 зёрен × 3000)', () => {
  const r = trapCount(page());
  assert.equal(r.adjacent, 0, `сегментов с двумя соседними тупиковыми полосами: ${r.adjacent}`);
  assert.equal(r.lonely, 0, `опасностей без целого соседа на всю длину: ${r.lonely}`);
  assert.ok(r.overlaps > 100, `провалов внахлёст на крайних полосах: ${r.overlaps} — проверять нечего`);
  // The probe sees the rule: the same generator without CollapseRules.trapFree builds traps.
  const loose = page();
  loose.get('CollapseRules').trapFree = () => true;
  const bad = trapCount(loose);
  assert.ok(bad.adjacent > 0 && bad.lonely > 0, `без правила ловушек нет: ${JSON.stringify(bad)}`);
});

test('провалы длиннее и растут с дистанцией: на старте COLLAPSE_GAP_MIN, к полной сложности до COLLAPSE_GAP_MAX', () => {
  const p = page();
  const CollapseTrack = p.get('CollapseTrack'), c = p.get('CollapseRules').cfg();
  const early = [], late = [];
  for (let seed = 1; seed <= 20; seed++) {
    const t = new CollapseTrack(seed);
    for (let i = 1; i < 3000; i++) {
      for (const l of LANES) {
        if (!t.seg(i).gap[l] || t.seg(i - 1).gap[l]) continue;
        let end = i;
        while (t.seg(end).gap[l]) end++;
        if (i < 100) early.push(end - i);
        if (i >= c.difficultySegs) late.push(end - i);
      }
    }
  }
  const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  assert.ok(early.every(n => n <= c.gapMin + 1), `на старте провалы ${Math.max(...early)} сегм.`);
  assert.ok(med(late) >= 5 && Math.min(...late) >= c.gapMinEnd && Math.max(...late) === c.gapMax,
    `на полной сложности медиана ${med(late)}, ${Math.min(...late)}–${Math.max(...late)} сегм.`);
});

test('уклонист с бесконечными патронами не гибнет ни от провала, ни от лавы (20 зёрен)', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun'), R = p.get('CollapseRules');
  for (let seed = 1; seed <= 20; seed++) {
    const run = new CollapseRun(seed);
    for (let f = 0; f < 60 * 900 && run.state === 'run'; f++) {
      run.ammo = 99;
      dodgeBot(run, R);
      run.update(1 / 60);
    }
    assert.ok(!['gap', 'lava'].includes(run.reason), `зерно ${seed}: ${run.reason} на ${run.meters} м`);
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
      if (run.shootable().length) run.shootDemon();
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
  run.startCollapse();
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
  run.startCollapse();
  for (let f = 0; f < 60 * 120 && run.state === 'run'; f++) {
    run.slow = 1;                                   // the decelerator never wears off
    escapeBot(run, CollapseRules);
    if (run.shootable().length) run.shootDemon();
    run.update(1 / 60);
  }
  assert.equal(run.state, 'over');
  assert.equal(run.reason, 'caught');
});

// Drive a run to its first demon in the frame, invulnerable on the way (lava and gaps do not matter here).
function toDemon(run) {
  run.invuln = 1e9;
  runFrames(run, 60 * 900, r => r.shootable().length > 0);
  run.invuln = 0;
}

test('выстрел по демону стоит патрон; без патронов демон бьёт, щит прощает удар', () => {
  const p = page();
  const CollapseRun = p.get('CollapseRun');

  const run = new CollapseRun(4);
  run.ammo = 999;
  toDemon(run);
  const d = run.shootable()[0];
  assert.ok(d, 'демон в кадре');
  const ammo = run.ammo;
  assert.equal(run.shootDemon(d.side), 'ok');
  assert.equal(run.ammo, ammo - 1);
  assert.ok(!run.demons.includes(d), 'сбитый демон исчез');

  const dry = new CollapseRun(4);
  toDemon(dry);
  dry.ammo = 0;
  assert.equal(dry.shootDemon(), 'no-ammo');
  dry.shield = 1;
  runFrames(dry, 60 * 4, r => r.shield === 0);
  assert.equal(dry.state, 'run', 'щит принял удар демона');
  assert.equal(dry.shield, 0);
  assert.equal(dry.hp, dry.c.hpMax, 'жизнь цела');
  assert.equal(dry.demons.length, 1, 'демон остался висеть');
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

// A run with demons on the next segment, stepped to the moment the nose enters it.
function demonRun(p, demons) {
  const run = new (p.get('CollapseRun'))(9);
  run.ammo = 9;
  run.track.seg(2).demon = demons;
  while (!run.demons.length) run._step(p.get('CollapseRules').STEP);
  return run;
}
const stepUntil = (p, run, done) => { let n = 0; while (!done(run) && n++ < 600) run._step(p.get('CollapseRules').STEP); return n; };

test('демон: предупреждение, появление, прыжок; с первого кадра появления сбит, до него нет, без выстрела удар', () => {
  const p = page(), R = p.get('CollapseRules');
  const hidden = demonRun(p, [{ side: -1, lag: 0 }]);
  const none = { gap: [9, 9, 9], lava: [9, 9, 9], pickup: [9, 9, 9] };
  assert.deepEqual([...hidden.ahead(1, none)].map(i => [i.kind, i.side]), [['demon', -1]], 'предупреждение со своей стены');
  assert.equal(hidden.shootDemon(-1), 'invalid', 'до появления тап не сбивает');
  assert.equal(hidden.ammo, 9, 'и не тратит патрон');
  const warned = stepUntil(p, hidden, r => r.shootable().length > 0);
  assert.ok(warned * R.STEP >= hidden.c.demonWarn - 2 * R.STEP, `предупреждение ${warned} шагов`);
  assert.deepEqual([...hidden.ahead(1, none)], [], 'в кадре предупреждения уже нет');
  assert.ok(hidden.events.some(e => e.type === 'demon' && e.side === -1));
  assert.equal(hidden.shootDemon(-1), 'ok', 'первый кадр появления');
  assert.equal(hidden.demons.length, 0);

  const idle = demonRun(p, [{ side: 1, lag: 0 }]);
  idle.shield = 0;
  stepUntil(p, idle, r => r.shootable().length > 0);
  const perched = stepUntil(p, idle, r => r.shootable()[0].t <= r.c.demonSec);
  const shown = perched + stepUntil(p, idle, r => r.state !== 'run');
  assert.equal(idle.reason, 'demon');
  assert.ok(perched * R.STEP >= idle.c.demonPerch - R.STEP, `стоит ${perched} шагов`);
  assert.ok(shown * R.STEP >= 1.6 - 1e-9, `от появления до удара ${shown} шагов`);
});

test('пара: обе стены горят вместе, у второй появление со своим сдвигом, журнал не примет выстрела до появления', () => {
  const p = page(), R = p.get('CollapseRules'), Run = p.get('CollapseRun');
  const none = { gap: [9, 9, 9], lava: [9, 9, 9], pickup: [9, 9, 9] };
  const run = demonRun(p, [{ side: -1, lag: 0 }, { side: 1, lag: 0.35 }]);
  assert.deepEqual([...run.ahead(1, none)].map(i => i.side).sort(), [-1, 1], 'пара видна как пара');
  stepUntil(p, run, r => r.shootable().length > 0);
  assert.deepEqual([...run.shootable()].map(d => d.side), [-1]);
  assert.deepEqual([...run.ahead(1, none)].map(i => i.side), [1], 'вторая стена горит до своего появления');
  const lag = stepUntil(p, run, r => r.shootable().length > 1);
  assert.ok(Math.abs(lag * R.STEP - 0.35) <= 2 * R.STEP, `сдвиг ${lag} шагов`);

  // The journal of a run that shoots a demon in its first frame replays; the same shot a step before
  // the demon shows was never possible.
  const seed = 3, live = new Run(seed), max = 60 * 900;
  let shot = null;
  while (live.state === 'run' && live.steps < max) {
    escapeBot(live, R);
    if (!shot && live.shootable().length) { live.shootDemon(); shot = live.log.at(-1); }
    live._step(R.STEP);
  }
  assert.ok(shot, 'бот дошёл до демона');
  assert.equal(Run.replay(seed, [...live.log], max).meters, live.meters);
  const moved = [...live.log].map(e => e === shot ? [e[0] - 1, ...e.slice(1)] : e);
  assert.equal(Run.replay(seed, moved, max), null);
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
    runFrames(run, 600, r => r.shootable().length > 0);
    return run;
  };

  // The first tap 0.2 s after it shows (the right one is not in the frame yet), the second 0.4 s later:
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
  // The window for the second shot ends perch + leap + pairLag after the first shows: two taps fit.
  assert.ok(shot.c.demonPerch + shot.c.demonSec + shot.c.pairLag >= 2 * tap + R.STEP, 'окно пары вмещает два тапа');

  const dry = pairRun();
  dry.shield = 0;
  runFrames(dry, 60 * 4);
  assert.equal(dry.state, 'over');
  assert.equal(dry.reason, 'demon');

  const one = pairRun();
  one.shield = 1;
  runFrames(one, 60 * 4);
  assert.equal(one.state, 'over', 'щит принимает только один удар');
  assert.equal(one.reason, 'demon');
  assert.ok(one.events.some(e => e.type === 'shielded' && e.reason === 'demon'));
});

test('демон садится на поезд, висит и бьёт раз в 0,7 с, каждый удар снимает жизнь, выстрел снимает демона', () => {
  const p = page(), R = p.get('CollapseRules');
  const run = demonRun(p, [{ side: 1, lag: 0 }]), c = run.c;
  assert.deepEqual([c.hpMax, c.demonStrikeSec], [3, 0.7]);
  stepUntil(p, run, r => r.events.some(e => e.type === 'demon-on'));
  const d = run.demons[0];
  assert.equal(d.on, true, 'висит на поезде');
  assert.equal(run.hp, 3, 'посадка не удар');
  const hits = [];
  let t = 0;
  for (let n = 0; n < 240 && run.state === 'run'; n++) {
    const hp = run.hp;
    run._step(R.STEP);
    t += R.STEP;
    if (run.hp < hp) hits.push(t);
  }
  assert.equal(run.state, 'over');
  assert.equal(run.reason, 'demon');
  assert.equal(hits.length, 3);
  hits.forEach((at, k) => assert.ok(Math.abs(at - 0.7 * (k + 1)) < 2 * R.STEP, `удар ${k + 1} на ${at.toFixed(2)} с`));
  assert.equal(run.events.filter(e => e.type === 'hurt' && e.reason === 'demon').length, 2);

  const saved = demonRun(p, [{ side: -1, lag: 0 }]);
  stepUntil(p, saved, r => r.hp === 2);
  assert.equal(saved.shootDemon(-1), 'ok', 'висящего можно сбить');
  assert.equal(saved.demons.length, 0);
  for (let n = 0; n < 180; n++) saved._step(R.STEP);
  assert.equal(saved.hp, 2, 'сбитый больше не бьёт');
});

test('жизни: лава снимает одну, последняя кончает забег; провал и обвал бьют сразу; щит вместо жизни; продолжение возвращает все', () => {
  const p = page(), CollapseRun = p.get('CollapseRun');
  const run = new CollapseRun(1);
  assert.equal(run.hp, 3);
  run._hit('lava');
  assert.deepEqual([run.state, run.hp], ['run', 2]);
  assert.ok(run.events.some(e => e.type === 'hurt' && e.reason === 'lava'));
  run.shield = 1;
  run._hit('lava');
  assert.deepEqual([run.hp, run.shield], [2, 0], 'щит принял');
  run._hit('lava');
  run._hit('lava');
  assert.deepEqual([run.state, run.reason, run.hp], ['over', 'lava', 0]);
  assert.equal(run.continueRun(), true);
  assert.equal(run.hp, 3);

  const fall = new CollapseRun(1);
  fall._fall(3);
  assert.deepEqual([fall.state, fall.reason, fall.hp], ['over', 'gap', 3]);
  const caught = new CollapseRun(1);
  caught._hit('caught');
  assert.deepEqual([caught.state, caught.reason, caught.hp], ['over', 'caught', 3]);
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
  caught.startCollapse();
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

test('все числа забега крутятся в редакторе: у каждой COLLAPSE_* строка в схеме, значение внутри ползунка', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/Constants.js'), 'utf8');
  const names = [...src.matchAll(/^const (COLLAPSE_[A-Z0-9_]+) = /gm)].map(m => m[1]);
  const p = loadScripts(['js/Constants.js', '_utils/editor/schema.js']);
  const fields = p.get('KIT_SCHEMA').flatMap(g => g.fields);
  const byName = new Map(fields.map(f => [f.name, f]));
  assert.ok(names.length > 40, `констант забега ${names.length}`);
  for (const name of names) {
    const f = byName.get(name);
    assert.ok(f, `${name}: нет строки в _utils/editor/schema.js`);
    assert.ok(f.label && f.label.en && f.label.ru, `${name}: подпись en/ru`);
    const v = p.get(name);
    assert.ok(f.min <= v && v <= f.max && f.step > 0, `${name} = ${v} вне ползунка ${f.min}..${f.max}`);
  }
  for (const f of fields.filter(x => x.name.startsWith('COLLAPSE_'))) {
    assert.ok(names.includes(f.name), `${f.name}: строка схемы без константы`);
  }
});
