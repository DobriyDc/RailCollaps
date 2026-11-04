// CrazyGames (js/CrazyGames.js and its route in js/Ads.js): the SDK loads only on their portal and never
// in Telegram, the portal hears loading, gameplay start/stop and happytime, the continue goes to their
// rewarded ad there and nowhere else, and the game stays silent while an ad plays or the portal mutes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const storage = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
};

// The SDK as their docs describe it; calls — what the game told the portal, in order.
function fakeSdk({ environment = 'crazygames', locale = 'en-US', muteAudio = false, ad = cb => cb.adFinished() } = {}) {
  const calls = [], listeners = [];
  const record = name => () => calls.push(name);
  const sdk = {
    environment: 'uninitialized',
    async init() { calls.push('init'); sdk.environment = environment; },
    game: {
      settings: { muteAudio, disableChat: false },
      loadingStart: record('loadingStart'), loadingStop: record('loadingStop'),
      gameplayStart: record('gameplayStart'), gameplayStop: record('gameplayStop'), happytime: record('happytime'),
      addSettingsChangeListener: fn => listeners.push(fn),
    },
    user: { systemInfo: { locale, device: { type: 'desktop' } } },
    ad: { requestAd(type, cb) { calls.push('ad:' + type); setTimeout(() => ad(cb)); } },
  };
  return { sdk, calls, listeners };
}

// The page: its host, Telegram or not, the scripts it adds; a script that loads defines the SDK.
function page({ hostname = 'rail-collapse.game-files.crazygames.com', search = '', inside = false, sdk = fakeSdk(), localStorage = storage(), ids = {} } = {}) {
  const added = [], muted = [];
  const p = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Ads.js', 'js/CrazyGames.js'], {
    TG: { inside }, location: { hostname, search }, URLSearchParams, setTimeout, clearTimeout, localStorage,
    Sound3D: { setMuted: on => muted.push(on) },
    document: {
      documentElement: {}, createElement: () => ({ dataset: {} }),
      head: { appendChild(tag) { added.push(tag.src); p.ctx.CrazyGames = { SDK: sdk.sdk }; setTimeout(() => tag.onload()); } },
    },
  });
  const Ads = p.get('Ads');
  if (Object.keys(ids).length) Ads._ids = () => ({ adsgram: '', monetag: '', ...ids });
  return { CG: p.get('CG'), Ads, Lang: p.get('Lang'), added, muted, localStorage, ...sdk };
}

test('портал — только хост CrazyGames и их ?useLocalSdk=true, никогда внутри Telegram', () => {
  const { CG } = page();
  for (const host of ['crazygames.com', 'www.crazygames.com', 'cubes-2048-io.game-files.crazygames.com', 'games.crazygames.com']) {
    assert.equal(CG.onPortal(host, '', false), true, host);
    assert.equal(CG.onPortal(host, '', true), false, host + ' в Telegram');
  }
  for (const host of ['dobriydc.github.io', 'localhost', '127.0.0.1', 'notcrazygames.com', 'crazygames.com.evil.io', '', undefined]) {
    assert.equal(CG.onPortal(host, '', false), false, String(host));
  }
  assert.equal(CG.onPortal('localhost', '?useLocalSdk=true', false), true, 'проверка у себя');
  assert.equal(CG.onPortal('localhost', '?useLocalSdk=false', false), false);
  assert.equal(CG.onPortal('localhost', '?useLocalSdk=true', true), false, 'Telegram главнее');
});

test('вне портала SDK не грузится и все вызовы молчат; в Telegram — тоже', async () => {
  for (const s of [page({ hostname: 'dobriydc.github.io' }), page({ inside: true }), page({ hostname: 'localhost' })]) {
    await s.CG.boot();
    s.CG.gameplay(true);
    s.CG.happytime();
    s.CG.loaded();
    assert.deepEqual(s.added, []);
    assert.deepEqual(s.calls, []);
    assert.equal(s.CG.ready, false);
    assert.deepEqual(s.muted, []);
  }
});

test('на портале: скрипт SDK с их хоста, init, начало и конец загрузки, язык портала без записи выбора', async () => {
  const s = page({ sdk: fakeSdk({ locale: 'ru-RU' }) });
  assert.equal(s.Lang.code, 'ru', 'до SDK — ничего не известно');
  s.Lang.code = 'en';
  await s.CG.boot();
  assert.deepEqual(s.added, ['https://sdk.crazygames.com/crazygames-sdk-v3.js']);
  assert.equal(s.CG.ready, true);
  assert.deepEqual(s.calls, ['init', 'loadingStart']);
  assert.equal(s.Lang.code, 'ru', 'локаль ru-RU — русский');
  assert.equal(s.localStorage.getItem('collapse.language'), null, 'догадка портала — не выбор игрока');
  s.CG.loaded();
  s.CG.loaded();
  assert.deepEqual(s.calls, ['init', 'loadingStart', 'loadingStop']);

  const chosen = storage();
  chosen.setItem('collapse.language', 'en');
  const own = page({ sdk: fakeSdk({ locale: 'ru-RU' }), localStorage: chosen });
  await own.CG.boot();
  assert.equal(own.Lang.code, 'en', 'выбор в настройках главнее портала');

  const late = page();
  late.CG.loaded();
  await late.CG.boot();
  assert.deepEqual(late.calls, ['init'], 'SDK пришёл после загрузки: загрузку не отмечаем');
});

test('окружение disabled или скрипт не загрузился — игра как везде', async t => {
  t.mock.method(console, 'warn', () => {});
  const off = page({ sdk: fakeSdk({ environment: 'disabled' }) });
  await off.CG.boot();
  assert.equal(off.CG.ready, false);
  off.CG.gameplay(true);
  assert.deepEqual(off.calls, ['init']);
  assert.equal(off.Ads.live, false);
  assert.equal(await off.Ads.rewarded(), true, 'без SDK награда бесплатна, как в браузере');

  const broken = page();
  broken.Ads._script = () => Promise.reject(new Error('blocked'));
  await broken.CG.boot();
  assert.equal(broken.CG.ready, false);
});

test('gameplay start/stop: портал слышит только смену состояния, и то, что было до SDK', async () => {
  const s = page();
  s.CG.gameplay(true);
  assert.deepEqual(s.calls, [], 'до SDK — ни звука');
  await s.CG.boot();
  assert.deepEqual(s.calls, ['init', 'loadingStart', 'gameplayStart']);
  for (let i = 0; i < 5; i++) s.CG.gameplay(true);
  s.CG.gameplay(false);
  s.CG.gameplay(false);
  s.CG.gameplay(true);
  s.CG.happytime();
  assert.deepEqual(s.calls.slice(3), ['gameplayStop', 'gameplayStart', 'happytime']);
});

test('звук: muteAudio портала глушит игру и следит за сменой настройки', async () => {
  const s = page({ sdk: fakeSdk({ muteAudio: true }) });
  await s.CG.boot();
  assert.equal(s.muted.at(-1), true);
  s.sdk.game.settings.muteAudio = false;
  for (const fn of s.listeners) fn({ muteAudio: false });
  assert.equal(s.muted.at(-1), false);
});

test('продолжение на портале — rewarded CrazyGames; Adsgram и Monetag не грузятся, звук молчит только пока идёт ролик', async () => {
  let started = null;
  const s = page({ ids: { adsgram: '11', monetag: '22' }, sdk: fakeSdk({ ad: cb => { cb.adStarted(); started = [...s.muted]; cb.adFinished(); } }) });
  await s.CG.boot();
  assert.equal(s.Ads.live, true);
  assert.equal(await s.Ads.rewarded(), true);
  assert.deepEqual(s.added, ['https://sdk.crazygames.com/crazygames-sdk-v3.js'], 'скрипты сетей Telegram не грузятся');
  assert.ok(s.calls.includes('ad:rewarded'));
  assert.equal(started.at(-1), true, 'ролик идёт — тишина');
  assert.equal(s.muted.at(-1), false, 'ролик кончился — звук вернулся');
});

test('ошибки rewarded: нет рекламы — без награды; рекламы в сессии нет вовсе (базовый запуск, блокировщик) — награда без неё', async () => {
  const outcome = async code => {
    const s = page({ sdk: fakeSdk({ ad: cb => cb.adError({ code, message: code }) }) });
    await s.CG.boot();
    const granted = await s.Ads.rewarded();
    assert.equal(s.muted.at(-1), false, code + ': звук не глушили');
    return granted;
  };
  assert.equal(await outcome('unfilled'), false);
  assert.equal(await outcome('other'), false);
  assert.equal(await outcome('adCooldown'), false);
  assert.equal(await outcome('adsDisabled'), true);
  assert.equal(await outcome('adsDisabledBasicLaunch'), true, 'так отвечает SDK 3.8 в базовом запуске');
  assert.equal(await outcome('adblock'), true);
});

test('midgame: ролик между рейсами молчит игру, пока идёт, и отпускает её при любом ответе', async () => {
  for (const answer of [cb => { cb.adStarted(); cb.adFinished(); }, cb => cb.adError({ code: 'adCooldown' }), cb => cb.adError({ code: 'unfilled' })]) {
    const s = page({ sdk: fakeSdk({ ad: answer }) });
    await s.CG.boot();
    assert.equal(s.Ads.midgameLive, true);
    await s.Ads.midgame();
    assert.ok(s.calls.includes('ad:midgame'));
    assert.equal(s.muted.at(-1), false);
  }
  const telegram = page({ inside: true, ids: { monetag: '22' } });
  await telegram.CG.boot();
  assert.equal(telegram.Ads.midgameLive, false);
  await telegram.Ads.midgame();
  assert.deepEqual(telegram.calls, [], 'в Telegram ролика между рейсами нет');
});

test('в Telegram очередь сетей прежняя: CrazyGames не участвует', async () => {
  const s = page({ inside: true, ids: { monetag: '22' } });
  await s.CG.boot();
  assert.equal(s.CG.ready, false);
  assert.deepEqual([...s.Ads.order()], ['monetag']);
  assert.deepEqual(s.added, []);
});

// The game on the portal: one click from the menu into a run, a record calls happytime, an offer with
// no ad says so and does not come back, the dialog waits for the ad.
function game({ portal = true, tutorial = false, granted = true, lossAd = false } = {}) {
  const elements = new Map(), localStorage = storage(), events = [];
  if (tutorial) localStorage.setItem('collapse.tutorial', '1');
  const UI = { get(id) {
    if (!elements.has(id)) elements.set(id, {
      setText(v) { this.text = v; return this; }, setValue() { return this; }, setSrc() { return this; },
      onClick(fn) { this.click = fn; return this; }, show(v) { this.visible = v; return this; }, setEnabled() { return this; },
    });
    return elements.get(id);
  }};
  const ctx = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Sound3D.js', 'js/CollapseRules.js', 'js/CollapseStationRules.js', 'js/Game.js'], {
    localStorage, UI, Image: class {}, CollapseScene: { LANE_W: 180 },
    TG: { inside: false, loadBest() {}, saveBest() {}, runEnded() {}, runStarted() {}, haptic() {} },
    CG: { portal: portal, ready: portal, gameplay: on => events.push(on ? 'start' : 'stop'), happytime: () => events.push('happytime') },
    Ads: { rewarded: async () => granted, midgameLive: portal, midgame: () => { events.push('midgame'); return new Promise(r => setTimeout(r)); },
      afterLossLive: lossAd, afterLoss: () => { events.push('loss-ad'); return new Promise(r => setTimeout(r)); } },
    Leaderboard: { close() {}, refreshLanguage() {}, submit() {}, enabled: false },
    Shop: { init() {}, open() {}, render() {} }, Challenge: { parse: () => null }, CollapseStations: { dress() {}, hud() {}, onDeparted() {} },
  });
  const g = new (ctx.get('Game'))({ scene: { canvas: { addEventListener() {} }, sync() {}, reset() {}, onEvent() {} } });
  g._icons = g._hud = () => {};     // no frame, no plates
  // The frames until the end dialog shows; a new run that crashed at seg segments.
  const end = () => { for (let i = 0; i < 90 && !(UI.get('over').visible && g.overIn < 0); i++) g.update(1 / 60); };
  const crash = (seg = 10) => {
    g.start();
    g.run.pos = g.run._seg = seg;
    g.run._crash('gap');
    end();
  };
  return { g, UI, events, crash, end, lang: ctx.get('Lang') };
}

test('портал: одна кнопка от меню до рейса — обучение, пока не пройдено, потом бесконечный', () => {
  const fresh = game();
  fresh.UI.get('menuStart').click();
  assert.equal(fresh.g.mode, 'play');
  assert.equal(fresh.g.run.tutorial, true);

  const passed = game({ tutorial: true });
  passed.UI.get('menuStart').click();
  assert.equal(passed.g.mode, 'play');
  assert.ok(!passed.g.run.tutorial);
  assert.ok(passed.g.run.stations, 'бесконечный рейс со станциями');

  const telegram = game({ portal: false });
  telegram.UI.get('menuStart').click();
  assert.equal(telegram.g.mode, 'menu', 'вне портала — выбор режима');
  assert.equal(telegram.UI.get('modeScreen').visible, true);
});

test('портал: каждый кадр говорит, идёт ли рейс; пауза и конец — стоп', () => {
  const { g, events } = game({ tutorial: true });
  g.update(0.016);
  g.start();
  g.update(0.016);
  g.setPaused(true);
  g.update(0.016);
  g.setPaused(false);
  g.update(0.016);
  g.openMenu();
  g.update(0.016);
  assert.deepEqual(events, ['stop', 'start', 'stop', 'start', 'stop']);
});

test('портал: рекорд — happytime, кроме первого рейса', () => {
  const { g, events, crash } = game({ tutorial: true });
  crash(10);
  assert.ok(g.best > 0 && g.newRecord);
  assert.ok(!events.includes('happytime'), 'первый рекорд — не праздник');
  crash(5);
  assert.ok(!events.includes('happytime'));
  crash(20);
  assert.equal(g.newRecord, true);
  assert.equal(events.filter(e => e === 'happytime').length, 1);
});

test('портал: реклама не нашлась — диалог говорит попробовать позже и не предлагает снова; пока ждём, «Ещё раз» не жмётся', async () => {
  const { g, UI, lang, crash } = game({ tutorial: true, granted: false });
  crash();
  assert.equal(g.mode, 'over');
  assert.equal(UI.get('continueBtn').visible, true);
  const run = g.run, offer = g.continueForAd();
  assert.equal(g.adPending, true);
  UI.get('restartBtn').click();
  assert.equal(g.run, run, 'диалог ждёт ответа рекламы');
  await offer;
  assert.equal(g.mode, 'over');
  assert.equal(UI.get('continueBtn').visible, false);
  assert.ok(UI.get('overText').text.endsWith(lang.t('adNone')));
  lang.set('en');
  assert.equal(UI.get('continueBtn').visible, false, 'смена языка не возвращает кнопку');
  UI.get('restartBtn').click();
  assert.notEqual(g.run, run);
});

test('портал: «Ещё раз» после рейса, где продолжение уже взято, — сначала midgame; где предлагали продолжить — без него', async () => {
  const { g, UI, events, crash, end } = game({ tutorial: true });
  crash();
  await g.continueForAd();
  assert.equal(g.mode, 'play', 'продолжил за рекламу');
  const run = g.run;
  run._crash('gap');
  end();
  assert.equal(UI.get('continueBtn').visible, false, 'второго предложения нет');
  const again = UI.get('restartBtn').click;
  again();
  assert.equal(events.filter(e => e === 'midgame').length, 1);
  assert.equal(g.adPending, true);
  again();
  UI.get('overMenu').click();
  assert.equal(g.run, run, 'пока идёт ролик, диалог не жмётся');
  assert.equal(g.mode, 'over');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(g.adPending, false);
  assert.notEqual(g.run, run, 'после ролика — новый рейс');
  assert.equal(g.mode, 'play');
  assert.equal(events.filter(e => e === 'midgame').length, 1, 'один ролик на одно нажатие');

  crash();
  assert.equal(UI.get('continueBtn').visible, true);
  UI.get('restartBtn').click();
  assert.equal(events.filter(e => e === 'midgame').length, 1, 'отказ от продолжения — без ролика');
  assert.equal(g.mode, 'play');

  const telegram = game({ portal: false, tutorial: true });
  telegram.crash();
  await telegram.g.continueForAd();
  telegram.g.run._crash('gap');
  telegram.end();
  assert.equal(telegram.g.mode, 'over');
  telegram.UI.get('restartBtn').click();
  assert.equal(telegram.g.mode, 'play', 'вне портала «Ещё раз» сразу');
  assert.ok(!telegram.events.includes('midgame'));
});

test('Telegram: проигрыш всегда кончается рекламой — по «Ещё раз» или «В меню», одной на рейс, не поверх предложения продолжить', async () => {
  const { g, UI, events, crash, end } = game({ portal: false, tutorial: true, lossAd: true });
  crash();
  assert.equal(UI.get('continueBtn').visible, true, 'предложение продолжить остаётся');
  assert.ok(!events.includes('loss-ad'), 'на экране поражения реклама не всплывает сама');
  const run = g.run;
  UI.get('restartBtn').click();
  assert.equal(events.filter(e => e === 'loss-ad').length, 1);
  assert.equal(g.adPending, true);
  UI.get('restartBtn').click();
  UI.get('overMenu').click();
  assert.equal(g.run, run, 'пока идёт реклама, диалог не жмётся');
  await new Promise(r => setTimeout(r, 5));
  assert.notEqual(g.run, run, 'после рекламы — новый рейс');
  assert.equal(g.mode, 'play');
  assert.equal(events.filter(e => e === 'loss-ad').length, 1, 'одна реклама на одно поражение');

  crash();
  await g.continueForAd();
  assert.equal(g.mode, 'play', 'продолжил за рекламу');
  g.run._crash('gap');
  end();
  UI.get('overMenu').click();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(g.mode, 'menu');
  assert.equal(events.filter(e => e === 'loss-ad').length, 2, 'и в меню — через рекламу');

  g.start();
  g.setPaused(true);
  UI.get('restartBtn').click();
  assert.equal(g.mode, 'play', 'перезапуск из паузы — не проигрыш');
  assert.equal(events.filter(e => e === 'loss-ad').length, 2);

  const off = game({ portal: false, tutorial: true });
  off.crash();
  off.UI.get('restartBtn').click();
  assert.equal(off.g.mode, 'play', 'без рекламы — сразу');
});

// The table on CrazyGames (js/Leaderboard.js): a better run of the player's week goes to the function with
// the token of their account; a guest, a worse run of the same week and the switch off send nothing.
function board({ user = { __dangerousUserId: 'u1', username: 'RustyCake' }, initData = '', on = true, answer = () => ({ meters: 1 }) } = {}) {
  const requests = [], tokenAsks = [], localStorage = storage();
  const p = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Ads.js', 'js/CrazyGames.js', 'js/Leaderboard.js'], {
    TG: { inside: !!initData, initData }, setTimeout, clearTimeout, localStorage, AbortController,
    fetch: async (address, init) => {
      requests.push({ address, auth: init.headers && init.headers.Authorization, body: init.body && JSON.parse(init.body) });
      const body = answer(address);
      return { ok: !!body, status: body ? 200 : 502, json: async () => body || { error: 'crazygames_no-active-season' } };
    },
  });
  const CG = p.get('CG'), Leaderboard = p.get('Leaderboard'), clock = { now: Date.UTC(2026, 10, 3, 12) };
  p.get('Date').now = () => clock.now;
  CG.sdk = { user: { isUserAccountAvailable: true, getUser: async () => user, getUserToken: async o => { tokenAsks.push(o); return 'TOKEN'; } } };
  if (on) Object.defineProperty(Leaderboard, 'portal', { get: () => CG.ready });
  const send = async meters => { Leaderboard.submit({ seed: 5, meters, log: [[1, 's', 0, 1]] }); await new Promise(r => setTimeout(r, 5)); };
  return { Leaderboard, CG, requests, tokenAsks, localStorage, clock, send, p };
}

test('таблица CrazyGames: сезон — с понедельника 09:00 UTC', () => {
  const { Leaderboard } = board();
  const week = iso => Leaderboard.portalWeek(Date.parse(iso));
  assert.equal(week('2026-11-02T09:00:00Z'), week('2026-11-09T08:59:59Z'), 'понедельник 09:00 — неделя до следующего');
  assert.equal(week('2026-11-02T08:59:59Z') + 1, week('2026-11-02T09:00:00Z'));
  assert.equal(week('2026-11-09T09:00:00Z'), week('2026-11-02T09:00:00Z') + 1);
});

test('таблица CrazyGames: уходит лучший рейс недели с токеном аккаунта; хуже — нет; новая неделя — снова', async () => {
  const b = board();
  await b.send(120);
  assert.equal(b.requests.length, 1);
  const [first] = b.requests;
  assert.match(first.address, /\/crazygames\/score$/);
  assert.equal(first.auth, 'cg TOKEN');
  assert.deepEqual({ ...first.body, log: undefined }, { rules: b.p.get('COLLAPSE_RULES_VERSION'), seed: 5, meters: 120, log: undefined });
  assert.deepEqual(b.tokenAsks.map(o => o.signingKeyType), ['IN_GAME_AUTH']);
  await b.send(90);
  await b.send(120);
  assert.equal(b.requests.length, 1, 'не лучше недели — запроса нет');
  await b.send(150);
  assert.equal(b.requests.length, 2);
  b.clock.now += 7 * 86400e3;
  await b.send(60);
  assert.equal(b.requests.length, 3, 'новый сезон: первый рейс снова в таблицу');
  await b.send(0);
  assert.equal(b.requests.length, 3, 'ноль метров не отправляем');
});

test('таблица CrazyGames: неудача не запоминается — тот же рекорд уйдёт со следующим рейсом', async t => {
  t.mock.method(console, 'warn', () => {});
  let up = false;
  const b = board({ answer: () => (up ? { meters: 1 } : null) });
  await b.send(120);
  assert.equal(b.requests.length, 1);
  up = true;
  await b.send(110);
  assert.equal(b.requests.length, 2, 'неделя не записана: пробуем снова');
  await b.send(100);
  assert.equal(b.requests.length, 2);
});

test('таблица CrazyGames: гость, выключатель, Telegram — ни токена, ни запроса к их таблице', async () => {
  const guest = board({ user: null });
  await guest.send(120);
  assert.deepEqual([guest.requests.length, guest.tokenAsks.length], [0, 0], 'гость: их таблица знает только аккаунты');

  const off = board({ on: false });
  assert.equal(off.Leaderboard.portal, false, 'LEADERBOARD_CRAZYGAMES = 0 в Constants.js, пока CrazyGames не пригласил');
  await off.send(120);
  assert.equal(off.requests.length, 0);

  const tg = board({ initData: 'signed' });
  await tg.send(120);
  assert.equal(tg.requests.length, 1);
  assert.match(tg.requests[0].address, /\/score$/);
  assert.doesNotMatch(tg.requests[0].address, /crazygames/);
  assert.equal(tg.requests[0].auth, 'tma signed');
  assert.equal(tg.tokenAsks.length, 0);
});
