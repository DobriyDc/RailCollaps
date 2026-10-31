import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { loadScripts, ROOT } from './browser-scripts.mjs';

const files = ['js/Constants.js', 'js/Lang.js'];
const storage = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
};

test('словарь: каждый ключ переведён, параметры RU/EN совпадают, обращения существуют', () => {
  const lang = loadScripts(files).get('Lang');
  for (const [key, word] of Object.entries(lang.words)) {
    assert.ok(word.ru?.trim(), key + ' RU');
    assert.ok(word.en?.trim(), key + ' EN');
    const params = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    assert.deepEqual(params(word.ru), params(word.en), key);
  }
  for (const key of Object.values(lang.bindings)) assert.ok(lang.words[key], key);
  for (const name of fs.readdirSync(ROOT + '/js').filter(n => n.endsWith('.js'))) {
    const src = fs.readFileSync(ROOT + '/js/' + name, 'utf8');
    for (const m of src.matchAll(/Lang\.t\('([^']+)'\s*[,)]/g)) assert.ok(lang.words[m[1]], name + ': ' + m[1]);
  }
});

test('язык меняется сразу и сохраняется при повторной загрузке скриптов', () => {
  const localStorage = storage();
  const texts = new Map();
  const UI = { get: id => ({ setText: value => texts.set(id, value) }) };
  const lang = loadScripts(files, { localStorage, UI }).get('Lang');
  let changes = 0;
  lang.listeners.add(() => changes++);
  lang.set('en');
  assert.equal(texts.get('menuStart'), 'Start');
  assert.equal(changes, 1);
  assert.equal(loadScripts(files, { localStorage }).get('Lang').code, 'en');
  lang.set('ru');
  assert.equal(texts.get('menuStart'), 'Старт');
  assert.equal(loadScripts(files, { localStorage }).get('Lang').code, 'ru');
  lang.set('invalid');
  assert.equal(lang.code, 'ru');
});

test('настройки: громкость обоих каналов переживает перезагрузку, ноль сохраняется', () => {
  const localStorage = storage();
  const boot = () => {
    const elements = new Map();
    const UI = { get(id) {
      if (!elements.has(id)) elements.set(id, {
        setText(v) { this.text = v; return this; }, setValue(v) { this.value = v; return this; },
        onClick(fn) { this.click = fn; return this; }, show(v) { this.visible = v; return this; },
        setEnabled(v) { this.enabled = v; return this; },
      });
      return elements.get(id);
    }};
    const ctx = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Sound3D.js', 'js/CollapseRules.js', 'js/Game.js'], {
      localStorage, UI, Image: class {}, CollapseScene: { LANE_W: 180 },
      TG: { inside: false, loadBest() {}, runEnded() {}, runStarted() {} },
      Leaderboard: { close() {}, refreshLanguage() {} },
    });
    const Game = ctx.get('Game'), audio = ctx.get('Sound3D');
    const game = new Game({ scene: { canvas: { addEventListener() {} }, sync() {}, reset() {} } });
    return { game, UI, audio, lang: ctx.get('Lang') };
  };
  const first = boot();
  first.UI.get('menuStart').click();
  assert.equal(first.UI.get('modeScreen').visible, true);
  assert.equal(first.UI.get('modeTutorial').enabled, false);
  first.UI.get('modeEndless').click();
  assert.equal(first.game.mode, 'play');
  assert.equal(first.UI.get('menu').visible, false);
  first.game.openMenu('settingsScreen');
  for (let i = 0; i < 20; i++) first.UI.get('musicMinus').click();
  first.UI.get('sfxMinus').click();
  first.lang.set('en');
  const second = boot();
  assert.equal(second.game.volumes.music, 0);
  assert.ok(Math.abs(second.game.volumes.sfx - 0.9) < 1e-9);
  assert.equal(second.audio.channelVolumes.music, 0);
  assert.ok(Math.abs(second.audio.channelVolumes.sfx - 0.9) < 1e-9);
  assert.equal(second.UI.get('musicValue').text, '0%');
  assert.equal(second.UI.get('sfxValue').text, '90%');
  assert.equal(second.lang.code, 'en');
  assert.equal(second.game.mode, 'menu');
});

test('микшер: настройки применяются после отложенной инициализации и после mute', () => {
  const audio = loadScripts(['js/Constants.js', 'js/Sound3D.js']).get('Sound3D');
  audio.setChannelVolume('music', 0);
  audio.setChannelVolume('sfx', 0.3);
  assert.equal(audio.ctx, null, 'settings do not initialize audio');
  audio.ctx = {};
  audio.master = { gain: {} };
  audio.buses = { music: { gain: {} }, sfx: { gain: {} } };
  audio.applyConstants();
  assert.equal(audio.buses.music.gain.value, 0);
  assert.equal(audio.buses.sfx.gain.value, 0.3);
  audio.setMuted(true);
  assert.equal(audio.master.gain.value, 0);
  audio.setMuted(false);
  assert.equal(audio.master.gain.value, audio.cfg().master);
  assert.equal(audio.buses.music.gain.value, 0);
  assert.equal(audio.buses.sfx.gain.value, 0.3);
});
