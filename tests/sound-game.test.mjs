// The game's sound: every event a run can push has a file on disk, the files are what the generator
// makes and neither empty nor clipped, the loops follow the rules, pause and the end silence them,
// and nothing starts before the first tap. Web Audio is a fake: this is the logic, not the speakers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadScripts, ROOT } from './browser-scripts.mjs';
import { buildSounds, OUT_DIR } from '../tools/make-sounds.mjs';

const REASONS = ['gap', 'lava', 'demon', 'caught'];
const MADE = buildSounds();

function fakeAudio() {
  const param = () => ({ value: 1, setTargetAtTime(v) { this.value = v; } });
  const all = [];
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.calls = []; all.push(this); }
    createGain() { return { gain: param(), connect() {} }; }
    createBufferSource() { return { playbackRate: param(), connect() {}, start() { this.started = true; }, stop() { this.stopped = true; } }; }
    decodeAudioData() { return Promise.resolve({}); }
    suspend() { this.state = 'suspended'; this.calls.push('suspend'); return Promise.resolve(); }
    resume() { this.state = 'running'; this.calls.push('resume'); return Promise.resolve(); }
  }
  return { AudioContext, all };
}

function page() {
  const listeners = [], document = { hidden: false, handler: null, documentElement: {}, addEventListener(type, fn) { this.handler = fn; } };
  const audio = fakeAudio(), fetched = [];
  const p = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Sound3D.js', 'js/CollapseRules.js', 'js/Game.js'], {
    document, AudioContext: audio.AudioContext,
    addEventListener(type, fn) { listeners.push(fn); }, removeEventListener(type, fn) { listeners.splice(listeners.indexOf(fn), 1); },
    fetch(src) { fetched.push(src); return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }); },
    localStorage: { getItem: () => null, setItem() {} },
    UI: { get: () => null, def: () => null }, Image: class {}, CollapseScene: { LANE_W: 180 },
    TG: { inside: false, loadBest() {}, saveBest() {}, runEnded() {}, runStarted() {}, haptic() {} },
    Leaderboard: { close() {}, refreshLanguage() {}, submit() {} },
  });
  p.ctx.window.addEventListener = p.ctx.addEventListener;
  const Game = p.get('Game');
  const scene = { canvas: { addEventListener() {} }, sync() {}, reset() {}, onEvent() {} };
  const game = new Game({ scene });
  game._icons = game._hud = () => {};     // no frame, no plates: this test is about the sound
  return { p, game, Game, Sound3D: p.get('Sound3D'), audio, listeners, document, fetched, tap: () => [...listeners].forEach(fn => fn()) };
}

const settle = () => new Promise(r => setTimeout(r, 0));

test('каждое событие забега даёт свой звук: типы берутся из кода правил и станций, файл на диске', () => {
  const Game = page().Game;
  const src = ['js/CollapseRules.js', 'js/CollapseStations.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const types = [...new Set([...src.matchAll(/events\.push\(\{ type: '([^']+)'/g)].map(m => m[1]))];
  assert.ok(types.length >= 14, `событий ${types.length}`);
  const made = MADE;
  const missing = [];
  for (const type of types) {
    for (const reason of type === 'crash' || type === 'shielded' ? REASONS : ['']) {
      const files = Array.from(Game.soundsOf({ type, reason }));
      if (!files.length) missing.push(type + ' ' + reason);
      for (const f of files) if (!made[path.basename(f)] || !fs.existsSync(path.join(ROOT, f))) missing.push(f);
    }
  }
  assert.deepEqual(missing, []);
  const crashes = REASONS.map(reason => Game.soundsOf({ type: 'crash', reason })[0]);
  assert.equal(new Set(crashes).size, REASONS.length, 'у каждой причины конца свой звук');
  for (const f of [...Object.values(Game.SOUNDS), ...Object.values(Game.LOOPS), Game.MUSIC]) assert.ok(made[path.basename(f)], f);
});

test('файлы — те, что делает генератор; не пустые и не клипуют; музыка 40–60 с', () => {
  const made = MADE;
  for (const [name, bytes] of Object.entries(made)) {
    assert.ok(fs.readFileSync(path.join(OUT_DIR, name)).equals(bytes), name + ' отличается от генератора');
    const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.length));
    const peak = pcm.reduce((a, v) => Math.max(a, Math.abs(v)), 0) / 32768;
    const rms = Math.sqrt(pcm.reduce((a, v) => a + v * v, 0) / pcm.length) / 32768;
    assert.ok(peak < 0.95, `${name}: пик ${peak}`);
    assert.ok(rms > 0.015, `${name}: тише некуда, rms ${rms}`);
    if (!/^(loop|music)/.test(name)) continue;
    const steps = Array.from(pcm, (v, i) => Math.abs(v - pcm[i ? i - 1 : 0])).sort((a, b) => a - b);
    const seam = Math.abs(pcm[0] - pcm[pcm.length - 1]);
    assert.ok(seam <= steps[steps.length >> 1], `${name}: шов ${seam} при обычном шаге ${steps[steps.length >> 1]}`);
  }
  const sec = (made['music_tunnel.wav'].length - 44) / 2 / made['music_tunnel.wav'].readUInt32LE(24);
  assert.ok(sec >= 40 && sec <= 60, `музыка ${sec} с`);
});

test('циклы: чем быстрее поезд — тем быстрее колёса, чем ближе обвал — тем громче, стоящий поезд молчит', () => {
  const { Game } = page(), mix = (speed, gap) => Game.loopMix(speed, 4.5, gap, 6);
  assert.ok(mix(4.5, 6).rate > mix(2.2, 6).rate, 'скорость проигрывания растёт со скоростью');
  assert.ok(mix(6.75, 6).rate > mix(4.5, 6).rate, 'ускоритель сверху');
  assert.equal(mix(0, 6).wheels, 0);
  assert.equal(mix(0, 6).steam, 0);
  assert.ok(mix(2.2, 6).wheels > 0.8 * mix(4.5, 6).wheels, 'со старта колёса на ходу');
  assert.ok(mix(3, 1).rumble > 2 * mix(3, 4).rumble, 'обвал рядом гораздо громче');
  assert.ok(mix(3, 6).rumble > 0, 'далёкий обвал слышен');
  assert.ok(mix(3, 6).rumble === mix(3, 60).rumble, 'станция растит отрыв, рокот не уходит в минус');
});

test('до первого тапа нет ни контекста, ни запросов; тап будит всё один раз, и звук идёт сразу', async () => {
  const { game, Sound3D, audio, fetched, listeners, tap, Game } = page();
  game.start();
  game.update(0.016);
  assert.equal(Sound3D.ctx, null);
  assert.deepEqual(fetched, []);
  assert.equal(audio.all.length, 0);
  tap();
  assert.equal(audio.all.length, 1);
  assert.equal(audio.all[0].state, 'running');
  assert.ok(fetched.includes(Game.MUSIC));
  assert.ok(fetched.includes(Game.SOUNDS.shot));
  assert.equal(new Set(fetched).size, fetched.length, 'каждый файл один раз');
  const left = listeners.length;
  tap();
  assert.equal(audio.all.length, 1);
  assert.equal(listeners.length, left);
  await settle();
});

test('пауза, конец забега и меню глушат циклы; пауза глушит и музыку, продолжение возвращает', async () => {
  const { game, Sound3D, tap, Game } = page();
  const loops = () => [...Sound3D.playing].filter(h => Object.values(Game.LOOPS).includes(h.src));
  tap();
  game.update(0.016);
  assert.equal(loops().length, 0, 'в меню циклов нет');
  assert.equal(game._music.playing, true, 'в меню играет музыка');
  game.start();
  game.update(0.016);
  assert.equal(loops().length, 3);
  game.update(0.016);
  assert.equal(loops().length, 3, 'кадр за кадром — те же циклы, без наслоения');
  const [wheels] = loops();
  await settle();

  game.setPaused(true);
  assert.equal(loops().length, 0, 'пауза');
  assert.equal(wheels.playing, false);
  game.update(0.016);
  assert.equal(game._music.volume, 0, 'музыка молчит');
  assert.equal(loops().length, 0);
  game.setPaused(false);
  game.update(0.016);
  assert.equal(loops().length, 3, 'продолжение');
  assert.equal(game._music.volume, 1);

  game.run.front = game.run.pos;      // caught
  game.update(0.05);
  game.update(0.016);
  assert.equal(game.mode, 'over');
  assert.equal(loops().length, 0, 'конец забега');
  game.start();
  game.update(0.016);
  assert.equal(loops().length, 3);
  game.openMenu();
  game.update(0.016);
  assert.equal(loops().length, 0, 'меню');
  await settle();
});

test('демон слышен в прыжке один раз: ни раньше, ни на каждый кадр', () => {
  const { game, Sound3D, tap, Game } = page();
  tap();
  game.start();
  const leaps = () => [...Sound3D.playing].filter(h => h.src === Game.SOUNDS.demonLeap).length;
  const d = { at: 1, side: 1, wait: 0, t: 1.2 };
  game.run.demons.push(d);
  game._leaps(game.run);
  assert.equal(leaps(), 0, 'на стене');
  d.t = 0.5;
  game._leaps(game.run);
  game._leaps(game.run);
  assert.equal(leaps(), 1);
});

test('сворачивание останавливает весь звук, возврат запускает; скрытая вкладка сильнее возврата', () => {
  const { Sound3D, audio, document, tap } = page();
  tap();
  const ctx = audio.all[0];
  assert.equal(ctx.state, 'running');
  Sound3D.setHeld(true);
  assert.equal(ctx.state, 'suspended');
  document.hidden = true;
  document.handler();
  Sound3D.setHeld(false);
  assert.equal(ctx.state, 'suspended', 'вкладка ещё скрыта');
  document.hidden = false;
  document.handler();
  assert.equal(ctx.state, 'running');
  Sound3D.setHeld(true);
  document.handler();
  assert.equal(ctx.state, 'suspended', 'видимая страница не поднимает свёрнутое приложение');
  tap();
  ctx.state = 'interrupted';      // iOS after the background
  Sound3D._unlock();
  assert.equal(ctx.state, 'running', 'тап поднимает interrupted');
});

test('обе громкости на нуле: обе шины ноль, что бы ни играло', () => {
  const { game, Sound3D, tap } = page();
  tap();
  game.volumes.music = game.volumes.sfx = 0.1;
  game.changeVolume('music', -1);
  game.changeVolume('sfx', -1);
  assert.equal(Sound3D.buses.music.gain.value, 0);
  assert.equal(Sound3D.buses.sfx.gain.value, 0);
});

test('rate: опция доходит до источника, setRate — плавно, повтор ничего не планирует', async () => {
  const { Sound3D, tap } = page();
  tap();
  const h = Sound3D.play('assets/sounds/loop_wheels.wav', { loop: true, rate: 1.3 });
  await settle();
  await settle();
  assert.equal(h.source.playbackRate.value, 1.3);
  h.setRate(1.6);
  assert.equal(h.source.playbackRate.value, 1.6);
  let calls = 0;
  h.source.playbackRate.setTargetAtTime = () => calls++;
  h.setRate(1.6);
  assert.equal(calls, 0);
  h.stop();
});
