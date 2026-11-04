// A challenge (js/Challenge.js and its way through Game): a broken link starts the game as usual, the link
// brings the same track, the race shows its goal and its result, and "again" stays on that tunnel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const challenge = (globals = {}) => loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Challenge.js'], { localStorage: { getItem: () => null, setItem() {} }, ...globals });

function boot({ startParam = '', inside = true, globals = {} } = {}) {
  const elements = new Map(), shared = [];
  const UI = { get(id) {
    if (!elements.has(id)) elements.set(id, {
      setText(v) { this.text = v; return this; }, setAngle() { return this; }, setSrc() { return this; }, setValue(v) { this.value = v; return this; },
      onClick(fn) { this.click = fn; return this; }, show(v) { this.visible = v; return this; }, setEnabled(v) { this.enabled = v; return this; },
    });
    return elements.get(id);
  } };
  const ctx = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Sound3D.js', 'js/CollapseRules.js', 'js/CollapseStationRules.js', 'js/Challenge.js', 'js/CrazyGames.js', 'js/Game.js'], {
    localStorage: { getItem: () => null, setItem() {} }, UI, Image: class {}, CollapseScene: { LANE_W: 180 },
    TG: { inside, startParam, loadBest() {}, saveBest() {}, runEnded() {}, runStarted() {}, haptic() {}, share: (url, text) => shared.push({ url, text }) },
    Leaderboard: { enabled: false, close() {}, refreshLanguage() {}, submit() {} },
    Ads: { afterLossLive: false, midgameLive: false },
    Shop: { init() {}, open() {}, render() {} }, CollapseStations: { dress() {}, hud() {}, onDeparted() {} },
    ...globals,
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
  assert.equal(C.link({ seed: 77, meters: 1740 }), p.get('TELEGRAM_APP_URL') + '?startapp=c77_1740_v' + p.get('COLLAPSE_RULES_VERSION') + '_000');
  C.share({ seed: 77, meters: 1740 });
  assert.equal(sent[0].url, C.link({ seed: 77, meters: 1740 }));
  assert.match(sent[0].text, /1740 м/);
  assert.ok(sent[0].url.length < 512);
});

test('вызов с улучшениями: версия, три уровня и одинаковая временная комплектация', () => {
  const p = challenge(), C = p.get('Challenge'), rules = p.get('COLLAPSE_RULES_VERSION');
  const token = C.token({ seed: 42, meters: 4000, upgrades: [1, 2, 3] });
  assert.ok(token.length <= 64);
  const parsed = C.parse(token);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), { seed: 42, meters: 4000, upgrades: [1, 2, 3] });
  assert.equal(C.parse('c42_4000_v' + (rules - 1) + '_123'), null);
  for (const bad of ['444', '12', '1234', '-12', '1.2']) assert.equal(C.parse('c42_4000_v' + rules + '_' + bad), null);
  const { game, UI } = boot({ startParam: token });
  assert.match(UI.get('challengeText').text, /Комплектация друга/);
  UI.get('challengeAccept').click();
  assert.equal(game.run.ammo, 10); assert.equal(game.run.fare, 12);
  assert.deepEqual([...game.run.upgrades], [1, 2, 3]);
  game.startChallenge(); assert.deepEqual([...game.run.upgrades], [1, 2, 3]);
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
  assert.equal(shared[0].url, ctx.get('Challenge').link(game.run));
});

test('CrazyGames: поздний SDK открывает вызов, тот же маршрут и цель сохраняются при повторе', async () => {
  const p = boot({ inside: false }), cg = p.ctx.get('CG');
  const rules = String(p.ctx.get('COLLAPSE_RULES_VERSION'));
  let join;
  cg.sdk = { game: { inviteLink() {}, inviteParams: { challenge: 'c4242_50', rules }, addJoinRoomListener(fn) { join = fn; } } };
  p.game.portalReady();
  assert.equal(p.UI.get('challengeScreen').visible, true);
  p.UI.get('challengeAccept').click();
  assert.equal(p.game.run.seed, 4242);
  assert.equal(p.game.goal, 50);
  const current = p.game.run;
  join({ challenge: 'c777_90', rules });
  assert.equal(p.game.run, current, 'новое приглашение не прерывает рейс');
  p.game.run.pos = 100;
  p.game.mode = 'over';
  p.game._showOver();
  assert.equal(p.UI.get('challengeBtn').visible, true);
  await p.game._again();
  assert.equal(p.game.run.seed, 4242, 'повтор относится к текущему вызову');
  p.game.openMenu();
  assert.equal(p.game.challenge.seed, 777, 'в меню предложен отложенный вызов');
  p.UI.get('challengeAccept').click();
  assert.equal(p.game.run.seed, 777);
  assert.equal(p.game.goal, 90);
});

test('CrazyGames: битые, старые и нулевые вызовы оставляют обычное меню', () => {
  const p = boot({ inside: false }), cg = p.ctx.get('CG');
  const rules = String(p.ctx.get('COLLAPSE_RULES_VERSION'));
  for (const inviteParams of [null, {}, { challenge: 'c1_50', rules: 'old' }, { challenge: 'c1_0', rules }, { challenge: 'c4294967296_1', rules }]) {
    cg.sdk = { game: { inviteParams } };
    p.game.portalReady();
    assert.equal(p.game.challenge, null);
    assert.equal(p.UI.get('mainScreen').visible, true);
  }
});

test('CrazyGames: кнопка копирует ссылку SDK с результатом и не уводит в Telegram', async () => {
  const copied = [], p = boot({ inside: false, globals: { navigator: { clipboard: { async writeText(url) { copied.push(url); } } } } });
  const cg = p.ctx.get('CG');
  let sent;
  cg.sdk = { game: { inviteLink(params) { sent = params; return 'https://www.crazygames.com/game/example?invite=abc'; } } };
  p.game.start();
  p.game.run.pos = 100;
  p.game.mode = 'over';
  p.game._showOver();
  await p.game.shareChallenge();
  assert.equal(sent.challenge, p.ctx.get('Challenge').token(p.game.run));
  assert.equal(sent.rules, String(p.ctx.get('COLLAPSE_RULES_VERSION')));
  assert.equal(copied[0], 'https://www.crazygames.com/game/example?invite=abc');
  assert.equal(p.UI.get('challengeBtn').text, 'Ссылка скопирована!');
  assert.deepEqual(p.shared, []);
});

test('CrazyGames: отмена отправки не копирует, запрет Clipboard использует резерв и убирает буфер', async () => {
  let copies = 0, removed = 0;
  const navigator = { share: async () => { throw Object.assign(new Error(), { name: 'AbortError' }); }, clipboard: { async writeText() { throw new Error('denied'); } } };
  const p = boot({ inside: false, globals: {
    navigator,
    document: { documentElement: {}, activeElement: null, body: { appendChild() {} }, createElement: () => ({ style: {}, select() {}, remove() { removed++; } }), execCommand: () => { copies++; return true; } },
  } });
  p.ctx.get('CG').sdk = { game: { inviteLink: () => 'https://www.crazygames.com/game/example?invite=abc' } };
  const C = p.ctx.get('Challenge'), run = { seed: 77, meters: 100 };
  assert.equal(await C.sharePortal(run), 'cancelled');
  assert.equal(copies, 0);
  delete navigator.share;
  assert.equal(await C.sharePortal(run), 'copied');
  assert.equal(copies, 1);
  assert.equal(removed, 1);
  p.ctx.ctx.document.execCommand = () => false;
  assert.equal(await C.sharePortal(run), 'failed');
  assert.equal(removed, 2);
});
