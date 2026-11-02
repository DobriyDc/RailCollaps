// A challenge (js/Challenge.js and its way through Game): a broken link starts the game as usual, the link
// brings the same track, the race shows its goal and its result, and "again" stays on that tunnel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const challenge = (globals = {}) => loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Challenge.js'], { localStorage: { getItem: () => null, setItem() {} }, ...globals });

function boot({ startParam = '', inside = true } = {}) {
  const elements = new Map(), shared = [];
  const UI = { get(id) {
    if (!elements.has(id)) elements.set(id, {
      setText(v) { this.text = v; return this; }, setAngle() { return this; }, setSrc() { return this; }, setValue(v) { this.value = v; return this; },
      onClick(fn) { this.click = fn; return this; }, show(v) { this.visible = v; return this; }, setEnabled(v) { this.enabled = v; return this; },
    });
    return elements.get(id);
  } };
  const ctx = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Sound3D.js', 'js/CollapseRules.js', 'js/CollapseStationRules.js', 'js/Challenge.js', 'js/Game.js'], {
    localStorage: { getItem: () => null, setItem() {} }, UI, Image: class {}, CollapseScene: { LANE_W: 180 },
    TG: { inside, startParam, loadBest() {}, saveBest() {}, runEnded() {}, runStarted() {}, haptic() {}, share: (url, text) => shared.push({ url, text }) },
    Leaderboard: { enabled: false, close() {}, refreshLanguage() {}, submit() {} },
    Shop: { init() {}, open() {}, render() {} }, CollapseStations: { dress() {}, hud() {}, onDeparted() {} },
  });
  const Game = ctx.get('Game');
  const game = new Game({ scene: { canvas: { addEventListener() {} }, sync() {}, reset() {} } });
  game._frameNow = () => null;
  return { game, UI, shared, ctx, Game };
}

test('ссылка: только c<зерно>_<метры>, всё остальное не вызов', () => {
  const C = challenge().get('Challenge');
  assert.deepEqual({ ...C.parse('c4294967295_1740') }, { seed: 4294967295, meters: 1740 });
  assert.deepEqual({ ...C.parse('c0_0') }, { seed: 0, meters: 0 });
  for (const bad of ['', null, undefined, 'c', 'c12', 'c12_', 'c_12', 'x12_34', 'c12_34_5', 'c4294967296_1', 'c1_12345678', 'c12_34<script>', 'src_ads']) {
    assert.equal(C.parse(bad), null, String(bad));
  }
});

test('отправка: ссылка на приложение с зерном и дистанцией, текст с дистанцией', () => {
  const sent = [];
  const p = challenge({ TG: { share: (url, text) => sent.push({ url, text }) } }), C = p.get('Challenge');
  assert.equal(C.link({ seed: 77, meters: 1740 }), p.get('TELEGRAM_APP_URL') + '?startapp=c77_1740');
  C.share({ seed: 77, meters: 1740 });
  assert.equal(sent[0].url, p.get('TELEGRAM_APP_URL') + '?startapp=c77_1740');
  assert.match(sent[0].text, /1740 м/);
  assert.ok(sent[0].url.length < 512);
});

test('без ссылки и с битой ссылкой игра открывает обычное меню', () => {
  for (const startParam of ['', 'c12', 'src_ads']) {
    const { game, UI } = boot({ startParam });
    assert.equal(game.challenge, null);
    assert.equal(UI.get('mainScreen').visible, true);
    assert.equal(UI.get('challengeScreen').visible, false);
  }
});

test('вызов: экран, тот же тоннель, цель на экране, итог и «заново» на той же трассе', () => {
  const { game, UI, Game } = boot({ startParam: 'c4242_50' });
  assert.equal(UI.get('challengeScreen').visible, true);
  assert.equal(UI.get('mainScreen').visible, false);
  assert.match(UI.get('challengeText').text, /50 м/);

  UI.get('challengeAccept').click();
  assert.equal(game.mode, 'play');
  assert.equal(game.run.seed, 4242);
  assert.equal(game.goal, 50);
  assert.equal(UI.get('challengeGoal').visible, true);
  game._hud(game.run);
  assert.equal(UI.get('challengeGoal').text, 'Цель: 50 м');

  game.run.pos = 1000;
  game._hud(game.run);
  assert.equal(UI.get('challengeGoal').text, 'Цель взята!');
  game.run.reason = 'gap';
  game.newRecord = false;
  game._showOver();
  assert.match(UI.get('overText').text, /Вызов выигран/);
  assert.equal(UI.get('challengeBtn').visible, true);

  UI.get('restartBtn').click();
  assert.equal(game.run.seed, 4242, 'заново — тот же тоннель');
  assert.equal(game.goal, 50);

  game.run.reason = 'gap';
  game._showOver();
  assert.match(UI.get('overText').text, /не хватило 50 м/);

  game.openMenu();
  assert.equal(UI.get('challengeGoal').visible, false);
  game.start();
  assert.equal(game.goal, 0, 'обычный рейс без цели');
  assert.notEqual(game.run.seed, 4242);
  assert.ok(Game.newSeed);
});

test('«Потом» ведёт в меню, вне Telegram кнопки вызова нет', () => {
  const { game, UI } = boot({ startParam: 'c4242_50' });
  UI.get('challengeLater').click();
  assert.equal(UI.get('mainScreen').visible, true);
  assert.equal(game.mode, 'menu');

  const browser = boot({ inside: false });
  browser.game.start();
  browser.game.run.reason = 'gap';
  browser.game.newRecord = false;
  browser.game._showOver();
  assert.equal(browser.UI.get('challengeBtn').visible, false);
});

test('кнопка отправляет свой забег, даже если он начался с чужого вызова', () => {
  const { game, UI, shared, ctx } = boot({ startParam: 'c4242_50' });
  UI.get('challengeAccept').click();
  game.run.pos = 300;
  UI.get('challengeBtn').click();
  assert.equal(shared[0].url, ctx.get('TELEGRAM_APP_URL') + '?startapp=c4242_' + game.run.meters);
});
