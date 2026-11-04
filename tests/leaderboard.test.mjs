// The shared table (card 23): the journal of a run replays to the same meters, the function
// (server/leaderboard, the real bundle of tools/build-worker.mjs over a real SQLite with schema.sql)
// refuses what is not a run of that player, and the game without an address does not touch the net.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadScripts, ROOT } from './browser-scripts.mjs';
import { workerSource } from '../tools/build-worker.mjs';
import { BUILD_EXCLUDE, CODE_FILES, collectRefs } from '../tools/asset-scan.mjs';

const TOKEN = '123456:FAKE-TOKEN-FOR-TESTS', ORIGIN = 'https://dobriydc.github.io';
const page = () => loadScripts(['js/Constants.js', 'js/CollapseRules.js', 'js/CollapseStationRules.js']);
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

// The bundle as the deploy builds it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-worker-'));
const bundle = path.join(tmp, 'worker.mjs');
fs.writeFileSync(bundle, workerSource());
const worker = (await import(url.pathToFileURL(bundle))).default;
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A D1 of the Worker's API over SQLite in memory, with the schema of the deploy.
function memoryD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'server/leaderboard/schema.sql'), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return { prepare: sql => statement(sql), rows: () => db.prepare('SELECT * FROM scores').all().map(r => ({ ...r })), raw: db };
}

// initData as Telegram signs it (skill telegram-miniapp). Spoiled by hand in the probes.
function initData({ id = 111, first = 'Аня', token = TOKEN, age = 30, spoil = null } = {}) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - age), query_id: 'AAA', user: JSON.stringify({ id, first_name: first }) });
  const check = [...p].map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  if (spoil) spoil(p);
  return p.toString();
}

const env = () => ({ BOT_TOKEN: TOKEN, DB: memoryD1() });
const call = (e, method, route, { auth = initData(), body, origin = ORIGIN } = {}) => {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (auth) headers.Authorization = 'tma ' + auth;
  return worker.fetch(new Request('https://collapse.test' + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), e);
};

// A live run as the game drives it: frames of an uneven length through update(), taps between them,
// shots at forks and demons, one continue after the first crash; at every stop a cartridge crate when
// it can be paid, then "go on".
function live(p, seed) {
  const CollapseRun = p.get('CollapseStationRun'), R = p.get('CollapseRules');
  const run = new CollapseRun(seed), dice = R.rng(seed ^ 0x51ed);
  for (let f = 0; f < 60 * 900; f++) {
    if (run.state === 'over') { if (!run.continueRun()) break; }
    if (run.atStation) { run.buy('ammo'); run.leave(); }
    const next = run.time < 120 ? run.nextFork() : null;      // the bot never tires: a run has to end
    if (next && !next.armed && !run.track.laneSafe(run.lane, next.at, R.LOOK)) {
      const to = next.to.find(l => run.forkSafe(next.at, l));
      if (to !== undefined) run.shoot(next.at, to);
    }
    for (const d of run.shootable()) if (dice() < 0.9) run.shootDemon(d.side);
    run.update(1 / 75 + dice() / 40);
  }
  return run;
}

test('реплей журнала на 20 зёрнах совпадает с живым забегом до метра, функция записывает те же метры', async () => {
  const p = page(), CollapseRun = p.get('CollapseStationRun'), maxSteps = p.get('LEADERBOARD_MAX_STEPS');
  const e = env();
  let actions = 0, demons = 0, continues = 0;
  for (const seed of SEEDS) {
    const run = live(p, seed);
    const log = JSON.parse(JSON.stringify(run.log));
    const again = CollapseRun.replay(seed, log, maxSteps);
    assert.ok(again, `зерно ${seed}: реплей отклонён`);
    assert.equal(again.meters, run.meters, `зерно ${seed}`);
    assert.equal(again.steps, run.steps, `зерно ${seed}`);
    assert.equal(again.pos, run.pos, `зерно ${seed}`);
    actions += log.length;
    demons += log.filter(a => a[1] === 'd').length;
    continues += log.filter(a => a[1] === 'c').length;
    const res = await call(e, 'POST', '/score', { auth: initData({ id: 1000 + seed }), body: { rules: p.get('COLLAPSE_RULES_VERSION'), seed, meters: run.meters, log } });
    assert.equal(res.status, 200, `зерно ${seed}: ${await res.clone().text()}`);
    assert.equal(e.DB.rows().find(r => r.user_id === 1000 + seed).meters, run.meters);
  }
  assert.ok(actions > 200 && demons > 0 && continues === 20, `действий ${actions}, демонов ${demons}, продолжений ${continues}`);
});

test('журнал не влияет на правила: забег с выброшенным журналом идёт шаг в шаг', () => {
  const p = page(), CollapseRun = p.get('CollapseStationRun');
  const state = r => JSON.stringify([r.meters, r.pos, r.front, r.steps, r.lane, r.ammo, r.reason]);
  for (const seed of SEEDS) {
    const plain = live(p, seed);
    const Mute = class extends CollapseRun { constructor(s) { super(s); this.log = { push() {} }; } };
    const muted = live({ get: name => (name === 'CollapseStationRun' ? Mute : p.get(name)) }, seed);
    assert.equal(state(muted), state(plain));
  }
});

test('журнал не из забега отклоняется реплеем: не по порядку, после конца, отказ правил, забег без конца', () => {
  const p = page(), CollapseRun = p.get('CollapseStationRun'), run = live(p, 3), max = p.get('LEADERBOARD_MAX_STEPS');
  const [a, b] = run.log;
  assert.equal(CollapseRun.replay(3, [b, a, ...run.log.slice(2)], max), null, 'не по порядку');
  assert.equal(CollapseRun.replay(3, [...run.log, [run.steps + 500, 'c']], max), null, 'после конца');
  assert.equal(CollapseRun.replay(3, [[0, 'f', 3, 1]], max), null, 'выстрел по стрелке, которой нет');
  assert.equal(CollapseRun.replay(3, [[0, 'c']], max), null, 'продолжение живого забега');
  assert.equal(CollapseRun.replay(3, [[0, 'x']], max), null, 'неизвестное действие');
  assert.equal(CollapseRun.replay(3, [], 60), null, 'забег не кончился за предел шагов');
});

test('функция отказывает подделкам: записи нет ни от одной', async t => {
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const p = page(), run = live(p, 7), rules = p.get('COLLAPSE_RULES_VERSION'), max = p.get('LEADERBOARD_AUTH_MAX_SEC');
  const honest = { rules, seed: 7, meters: run.meters, log: run.log };
  const forged = [
    ['подделанные метры', { body: { ...honest, meters: run.meters + 10 } }, 422, 'meters_mismatch'],
    ['метры меньше настоящих', { body: { ...honest, meters: run.meters - 10 } }, 422, 'meters_mismatch'],
    ['журнал другого зерна', { body: { ...honest, seed: 8 } }, 422, 'bad_replay'],
    ['сдвинутый журнал', { body: { ...honest, log: run.log.map(([s, ...a]) => [s + 600, ...a]) } }, 422, 'bad_replay'],
    ['пустой журнал с чужими метрами', { body: { ...honest, log: [] } }, 422, 'meters_mismatch'],
    ['другая версия правил', { body: { ...honest, rules: rules + 1 } }, 409, 'rules_version'],
    ['чужой initData: другой токен', { auth: initData({ token: '999999:ANOTHER-FAKE-TOKEN' }), body: honest }, 401, 'bad_auth'],
    ['подмена игрока в подписанной строке', { auth: initData({ spoil: q => q.set('user', JSON.stringify({ id: 222, first_name: 'Вор' })) }), body: honest }, 401, 'bad_auth'],
    ['подпись не того вида', { auth: initData({ spoil: q => q.set('hash', 'zz') }), body: honest }, 401, 'bad_auth'],
    ['нет подписи', { auth: initData({ spoil: q => q.delete('hash') }), body: honest }, 401, 'bad_auth'],
    ['нет initData', { auth: null, body: honest }, 401, 'no_auth'],
    ['просроченный auth_date', { auth: initData({ age: max + 1 }), body: honest }, 401, 'expired'],
    ['чужой сайт', { origin: 'https://evil.example', body: honest }, 403, 'bad_origin'],
    ['запрос без Origin', { origin: null, body: honest }, 403, 'bad_origin'],
    ['журнал не массив', { body: { ...honest, log: 'x' } }, 400, 'bad_request'],
    ['журнал сверх предела', { body: { ...honest, log: Array.from({ length: p.get('LEADERBOARD_MAX_LOG') + 1 }, () => []) } }, 400, 'bad_request'],
  ];
  for (const [name, opts, status, error] of forged) {
    const e = env();                                   // each forgery alone: the limit is its own probe
    const res = await call(e, 'POST', '/score', opts);
    assert.equal(res.status, status, name);
    assert.equal((await res.json()).error, error, name);
    assert.deepEqual(e.DB.rows(), [], name);
  }
  const e = env();
  const ok = await call(e, 'POST', '/score', { body: honest });
  assert.equal(ok.status, 200, 'тот же забег без подделки проходит: отказы выше — из-за подделки');
  assert.equal(e.DB.rows().length, 1);
  assert.equal(forged.length, 16);
});

test('предел запросов: лишний запрос игрока — 429, другой игрок и новое окно проходят', async t => {
  let now = Date.UTC(2026, 9, 31, 12, 0, 0);
  t.mock.method(Date, 'now', () => now);
  const p = page(), limit = p.get('LEADERBOARD_RATE_MAX'), e = env();
  for (let i = 0; i < limit; i++) assert.equal((await call(e, 'GET', '/top')).status, 200, `запрос ${i + 1}`);
  const over = await call(e, 'GET', '/top');
  assert.equal(over.status, 429);
  assert.equal(over.headers.get('Retry-After'), String(p.get('LEADERBOARD_RATE_WINDOW_SEC')));
  const run = live(p, 2);
  const score = await call(e, 'POST', '/score', { body: { rules: p.get('COLLAPSE_RULES_VERSION'), seed: 2, meters: run.meters, log: run.log } });
  assert.equal(score.status, 429);
  assert.deepEqual(e.DB.rows(), [], 'запрос сверх предела ничего не пишет');
  assert.equal((await call(e, 'GET', '/top', { auth: initData({ id: 222 }) })).status, 200);
  now += p.get('LEADERBOARD_RATE_WINDOW_SEC') * 1000;
  assert.equal((await call(e, 'GET', '/top')).status, 200);
});

test('CORS: только https://dobriydc.github.io, предзапрос разрешает заголовок подписи', async () => {
  const e = env();
  const ask = origin => worker.fetch(new Request('https://collapse.test/score', { method: 'OPTIONS', headers: { Origin: origin } }), e);
  const yes = await ask(ORIGIN);
  assert.equal(yes.status, 204);
  assert.equal(yes.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(yes.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  for (const other of ['https://evil.example', 'https://dobriydc.github.io.evil.example', 'http://dobriydc.github.io', 'null']) {
    const no = await ask(other);
    assert.equal(no.status, 403, other);
    assert.equal(no.headers.get('Access-Control-Allow-Origin'), null, other);
  }
  const res = await call(e, 'GET', '/top');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('бот: /start в личке получает приветствие на языке игрока, остальное без ответа', async t => {
  const buttons = [];
  const net = t.mock.method(globalThis, 'fetch', async (address, init) => {
    buttons.push({ address, ...JSON.parse(init.body) });
    return new Response('{"ok":true}');
  });
  const e = { ...env(), BOT_WEBHOOK_SECRET: 'webhook-secret' };
  const update = (message, secret = 'webhook-secret', method = 'POST') => worker.fetch(new Request('https://collapse.test/bot', {
    method, headers: secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}, body: method === 'POST' ? JSON.stringify({ message }) : undefined,
  }), e);
  const start = (language_code, text = '/start', type = 'private') => ({ text, chat: { id: 7, type }, from: { id: 7, language_code } });

  const ru = await (await update(start('ru'))).json();
  assert.equal(ru.method, 'sendPhoto');
  assert.equal(ru.chat_id, 7);
  assert.equal(ru.parse_mode, 'HTML');
  assert.match(ru.caption, /^<b>Машинист, на пост\.<\/b>/);
  assert.ok(ru.caption.length <= 1024);
  assert.match(ru.photo, /^https:\/\/dobriydc\.github\.io\/RailCollaps\/server\/leaderboard\/welcome\.png$/);
  assert.ok(fs.existsSync(path.join(ROOT, 'server/leaderboard/welcome.png')));
  const button = ru.reply_markup.inline_keyboard[0][0];
  assert.equal(button.text, '▶ Играть');
  assert.equal(button.web_app.url, 'https://dobriydc.github.io/RailCollaps/');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].address, 'https://api.telegram.org/bot' + TOKEN + '/setChatMenuButton');
  assert.equal(buttons[0].chat_id, 7);
  assert.equal(buttons[0].menu_button.text, '▶ Играть');

  for (const language of ['en', 'uk', undefined]) {
    const other = await (await update(start(language))).json();
    assert.match(other.caption, /^<b>Engineer/, String(language));
    assert.equal(other.reply_markup.inline_keyboard[0][0].text, '▶ Play');
    assert.equal(buttons.at(-1).menu_button.text, '▶ Play');
  }
  assert.equal((await (await update(start('ru', '/start ref_1'))).json()).method, 'sendPhoto');

  buttons.length = 0;
  for (const quiet of [start('ru', 'привет'), start('ru', '/started'), start('ru', '/start', 'group'), undefined]) {
    const res = await update(quiet);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '');
  }
  assert.equal((await update(start('ru'), 'wrong')).status, 403);
  assert.equal((await update(start('ru'), null)).status, 403);
  assert.equal((await update(null, 'webhook-secret', 'GET')).status, 404);
  assert.equal((await worker.fetch(new Request('https://collapse.test/bot', { method: 'POST', body: '{' }), env())).status, 404);
  assert.equal(buttons.length, 0);

  net.mock.mockImplementation(async () => { throw new Error('net down'); });
  assert.equal((await (await update(start('ru'))).json()).method, 'sendPhoto');
});

test('магазин: поезд выдаёт только сообщение Telegram об оплате, возврат его забирает', async t => {
  const STARS = page().get('COLLAPSE_TRAIN_STARS');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (address, init) => {
    calls.push({ method: address.split('/').pop(), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: 'https://t.me/$invoice' }));
  });
  const e = { ...env(), BOT_WEBHOOK_SECRET: 'webhook-secret' };
  const update = body => worker.fetch(new Request('https://collapse.test/bot', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret' }, body: JSON.stringify(body),
  }), e);
  const items = async () => (await (await call(e, 'GET', '/inventory')).json()).items;
  const from = { id: 111, language_code: 'ru' }, chat = { id: 111, type: 'private' };
  const query = (over = {}) => ({ id: 'q1', from, currency: 'XTR', total_amount: STARS, invoice_payload: 'hell', ...over });
  const paid = (over = {}) => ({ message: { from, chat, successful_payment: {
    currency: 'XTR', total_amount: STARS, invoice_payload: 'hell', telegram_payment_charge_id: 'charge-1', ...over } } });

  assert.deepEqual(await items(), []);

  const invoice = await call(e, 'POST', '/invoice', { body: { item: 'hell', lang: 'ru' } });
  assert.equal(invoice.status, 200);
  assert.equal((await invoice.json()).link, 'https://t.me/$invoice');
  const made = calls.at(-1);
  assert.equal(made.method, 'createInvoiceLink');
  assert.equal(made.body.currency, 'XTR');
  assert.equal(made.body.provider_token, '');
  assert.equal(made.body.payload, 'hell');
  assert.deepEqual(made.body.prices, [{ label: 'Адский паровоз', amount: STARS }]);
  assert.ok(made.body.title.length <= 32 && made.body.description.length <= 255);
  assert.deepEqual(await items(), [], 'счёт ещё не покупка');

  for (const bad of [{ item: 'base' }, { item: 'tank' }, {}]) assert.equal((await call(e, 'POST', '/invoice', { body: bad })).status, 400);
  assert.equal((await call(e, 'POST', '/invoice', { auth: initData({ token: 'чужой' }), body: { item: 'hell' } })).status, 401);

  const stands = await (await update({ pre_checkout_query: query() })).json();
  assert.deepEqual([stands.method, stands.pre_checkout_query_id, stands.ok], ['answerPreCheckoutQuery', 'q1', true]);
  for (const bad of [{ total_amount: 1 }, { currency: 'USD' }, { invoice_payload: 'tank' }]) {
    const no = await (await update({ pre_checkout_query: query(bad) })).json();
    assert.equal(no.ok, false, JSON.stringify(bad));
    assert.match(no.error_message, /заказ/);
  }

  assert.equal((await update(paid({ invoice_payload: 'tank' }))).status, 200);
  assert.equal((await update(paid({ currency: 'USD' }))).status, 200);
  assert.deepEqual(await items(), [], 'чужой платёж не выдаёт поезд');

  const thanks = await (await update(paid())).json();
  assert.equal(thanks.method, 'sendMessage');
  assert.match(thanks.text, /Спасибо/);
  await update(paid());
  assert.deepEqual(await items(), ['hell'], 'повтор сообщения не дублирует покупку');
  assert.deepEqual(e.DB.raw.prepare('SELECT user_id, stars FROM purchases').all().map(r => ({ ...r })), [{ user_id: 111, stars: STARS }]);

  assert.equal((await call(e, 'POST', '/invoice', { body: { item: 'hell' } })).status, 409);
  assert.equal((await (await update({ pre_checkout_query: query() })).json()).ok, false, 'второй раз не продаём');
  assert.equal((await call(e, 'GET', '/inventory', { auth: initData({ id: 222 }) }).then(r => r.json())).items.length, 0, 'покупка не чужая');

  assert.equal((await update({ message: { from, chat, refunded_payment: { telegram_payment_charge_id: 'charge-1' } } })).status, 200);
  assert.deepEqual(await items(), []);

  for (const [command, pattern] of [['/terms', /terms\.html/], ['/paysupport', /t\.me\/PatrKir306/]]) {
    const answer = await (await update({ message: { from, chat, text: command } })).json();
    assert.equal(answer.method, 'sendMessage');
    assert.match(answer.text, pattern);
  }
  assert.equal(await (await update({ message: { from, chat: { id: 5, type: 'group' }, text: '/terms' } })).text(), '');
});

test('таблица: лучший результат игрока за сезон, топ и место, старый сезон цел', async () => {
  const p = page(), rules = p.get('COLLAPSE_RULES_VERSION'), e = env();
  const a = live(p, 5), b = live(p, 6), [lo, hi] = a.meters < b.meters ? [[5, a], [6, b]] : [[6, b], [5, a]];
  assert.notEqual(a.meters, b.meters);
  const send = (id, [seed, run], first) => call(e, 'POST', '/score', { auth: initData({ id, first }), body: { rules, seed, meters: run.meters, log: run.log } });
  e.DB.raw.prepare('INSERT INTO scores VALUES (?, ?, ?, ?, ?)').run(rules - 1, 111, 'Прошлый сезон', 999999, 1);

  assert.equal((await send(111, hi, 'Аня')).status, 200);
  const worse = await (await send(111, lo, 'Аня')).json();
  assert.equal(worse.best, hi[1].meters, 'худший забег не затирает лучший');
  assert.equal(worse.place, 1);
  assert.equal((await (await send(222, lo, 'Борис')).json()).place, 2);

  const top = await (await call(e, 'GET', '/top', { auth: initData({ id: 222 }) })).json();
  assert.deepEqual(top, { season: rules, rows: [
    { place: 1, name: 'Аня', meters: hi[1].meters, me: false },
    { place: 2, name: 'Борис', meters: lo[1].meters, me: true },
  ], me: { place: 2, meters: lo[1].meters } });
  const nobody = await (await call(e, 'GET', '/top', { auth: initData({ id: 333 }) })).json();
  assert.equal(nobody.me, null);
  assert.equal(e.DB.rows().filter(r => r.season === rules - 1).length, 1, 'запись старого сезона цела');
  assert.deepEqual(Object.keys(e.DB.rows()[0]).sort(), ['at', 'meters', 'name', 'season', 'user_id']);
});

// The rules of a version do not change: the fingerprint of the numbers and of what they do. A new
// fingerprint without a new version would make the function refuse honest runs of older clients.
test('правила изменились — подними COLLAPSE_RULES_VERSION и добавь отпечаток сюда', () => {
  const FINGERPRINTS = { 1: '630a834b', 2: 'ba60d729', 3: '0f2242e0', 4: '5a5ecf1d', 5: '227e15a6', 6: '20d9426f', 7: '6590e0d4', 8: '21308824', 9: '2f1ccabf', 10: '956e640a', 11: '4270642e' };
  const p = page(), R = p.get('CollapseRules'), stations = p.get('CollapseStationRules').cfg();
  const { iconLead, ...numbers } = R.cfg();
  const walk = SEEDS.slice(0, 5).map(seed => { const r = live(p, seed); return [r.meters, r.steps, r.pos]; });
  const print = crypto.createHash('sha256').update(JSON.stringify(p.get('COLLAPSE_RULES_VERSION') >= 7 ? [numbers, stations, walk] : [numbers, walk])).digest('hex').slice(0, 8);
  assert.equal(print, FINGERPRINTS[p.get('COLLAPSE_RULES_VERSION')]);
});

test('игра без адреса функции: ни запроса, ни кнопки, ни экрана', async () => {
  const calls = [];
  const fetchStub = async (...a) => { calls.push(a); return new Response('{}'); };
  const load = app => {
    const p = loadScripts(['js/Constants.js', 'js/UILayout.js', 'js/Telegram.js', 'js/CollapseRules.js', 'js/Leaderboard.js'],
      { fetch: fetchStub, AbortController, setTimeout, clearTimeout, Telegram: { WebApp: app } });
    return Object.assign(p, { L: p.get('Leaderboard') });
  };
  const signed = { initData: 'auth_date=1&hash=x' };

  // The address is the owner's to set: the probe empties it, whatever Constants.js holds.
  const empty = load(signed);
  Object.defineProperty(empty.L, 'url', { get: () => '' });
  assert.equal(empty.L.enabled, false);
  empty.L.submit(new (empty.get('CollapseRun'))(1));
  assert.equal(await empty.L.top(), null);
  assert.equal(empty.get('UI_LAYOUT').find(d => d.id === 'boardBtn').visible, 0);
  assert.equal(empty.get('UI_LAYOUT').find(d => d.id === 'board').visible, 0);
  assert.equal(calls.length, 0);

  // With an address, in Telegram: the journal goes out, a dead network does not throw.
  const on = load(signed);
  Object.defineProperty(on.L, 'url', { get: () => 'https://collapse.test' });
  assert.equal(on.L.enabled, true);
  const run = live(page(), 4);
  on.L.submit(run);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://collapse.test/score');
  assert.deepEqual(JSON.parse(calls[0][1].body), { rules: on.get('COLLAPSE_RULES_VERSION'), seed: 4, meters: run.meters, log: JSON.parse(JSON.stringify(run.log)) });
  assert.equal(calls[0][1].headers.Authorization, 'tma ' + signed.initData);

  const outside = load({ initData: '' });
  Object.defineProperty(outside.L, 'url', { get: () => 'https://collapse.test' });
  assert.equal(outside.L.enabled, false, 'вне Telegram подписать запрос нечем');
});

test('сборка: server/ не едет в архив, Leaderboard.js едет, в функции нет секретов', async () => {
  assert.ok(BUILD_EXCLUDE.includes('server'));
  assert.ok(CODE_FILES.includes('js/Leaderboard.js'));
  assert.ok(!CODE_FILES.some(f => f.startsWith('server/')));
  const { allFiles } = await collectRefs(ROOT);
  assert.ok(!allFiles.some(f => f.startsWith('server/')));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/Leaderboard.js') < html.indexOf('js/Game.js'));
  const toml = fs.readFileSync(path.join(ROOT, 'server/leaderboard/wrangler.toml'), 'utf8');
  assert.doesNotMatch(toml, /account_id|BOT_TOKEN\s*=|\b\d{6,}:[\w-]{20,}/);
  assert.match(toml, /database_id = "REPLACE_WITH_D1_DATABASE_ID"/);
});

test('магазин: донат — сумма игрока в пределах, запись после оплаты, возврат её убирает, поездов не даёт', async t => {
  const p = page(), MIN = p.get('COLLAPSE_DONATE_MIN'), MAX = p.get('COLLAPSE_DONATE_MAX');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (address, init) => {
    calls.push({ method: address.split('/').pop(), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: 'https://t.me/$tip' }));
  });
  const e = { ...env(), BOT_WEBHOOK_SECRET: 'webhook-secret' };
  const update = body => worker.fetch(new Request('https://collapse.test/bot', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret' }, body: JSON.stringify(body),
  }), e);
  const from = { id: 111, language_code: 'en' }, chat = { id: 111, type: 'private' };
  const rows = () => e.DB.raw.prepare('SELECT charge_id, user_id, stars FROM donations').all().map(r => ({ ...r }));

  const invoice = await call(e, 'POST', '/invoice', { body: { item: 'donation', stars: 77, lang: 'en' } });
  assert.equal(invoice.status, 200);
  const made = calls.at(-1);
  assert.equal(made.body.payload, 'donation');
  assert.deepEqual(made.body.prices, [{ label: 'Support the developer', amount: 77 }]);
  assert.ok(made.body.title.length <= 32 && made.body.description.length <= 255);
  for (const stars of [0, MIN - 1, MAX + 1, 1.5, '50', null]) {
    assert.equal((await call(e, 'POST', '/invoice', { body: { item: 'donation', stars } })).status, 400, String(stars));
  }

  const query = (over = {}) => ({ pre_checkout_query: { id: 'q2', from, currency: 'XTR', total_amount: 77, invoice_payload: 'donation', ...over } });
  assert.equal((await (await update(query())).json()).ok, true);
  assert.equal((await (await update(query({ total_amount: MAX + 1 }))).json()).ok, false);
  assert.equal((await (await update(query({ currency: 'USD' }))).json()).ok, false);

  const paid = { message: { from, chat, successful_payment: { currency: 'XTR', total_amount: 77, invoice_payload: 'donation', telegram_payment_charge_id: 'tip-1' } } };
  const thanks = await (await update(paid)).json();
  assert.match(thanks.text, /Thank you/);
  await update(paid);
  assert.deepEqual(rows(), [{ charge_id: 'tip-1', user_id: 111, stars: 77 }], 'повтор сообщения не дублирует донат');
  assert.deepEqual((await (await call(e, 'GET', '/inventory')).json()).items, [], 'донат не поезд');

  await update({ message: { from, chat, refunded_payment: { telegram_payment_charge_id: 'tip-1' } } });
  assert.deepEqual(rows(), []);
});

// CrazyGames: the function takes the run of a player logged in there by the token of their account (RS256,
// the key of its kid among CrazyGames' keys), replays it and hands the meters to the CrazyGames table.
const CG_ORIGIN = 'https://rail-collapse.game-files.crazygames.com';
const CG_KEYS = 'https://userportal.crazygames.com/.well-known/jwks.json';
const CG_SCORES = 'https://leaderboard.crazygames.com/leaderboard/scores';
const cgPair = kid => ({ kid, ...crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }) });
const CG_KEY = cgPair('ingame-auth'), CG_NEXT = cgPair('ingame-auth-2'), CG_STRANGER = cgPair('ingame-auth');
let cgPublished = [CG_KEY];
const b64url = b => Buffer.from(b).toString('base64url');
function cgToken({ pair = CG_KEY, userId = 'UOuZBKgjwpY9k4TSBB2NPugbsHD3', exp = Date.now() / 1000 + 3600, alg = 'RS256', kid = pair.kid } = {}) {
  const head = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ userId, username: 'RustyCake.ZU9H', gameId: 'rail-collapse', iat: Math.floor(Date.now() / 1000), exp: Math.floor(exp) }));
  return head + '.' + body + '.' + b64url(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), pair.privateKey));
}
// fetch of the function: CrazyGames' keys and their table; sent — what reached the table.
function cgNet(t, answer = { success: true, total: 1, successCount: 1, failureCount: 0, errors: [] }) {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (address, init) => {
    if (address === CG_KEYS) return Response.json({ keys: cgPublished.map(p => ({ ...p.publicKey.export({ format: 'jwk' }), kid: p.kid, alg: 'RS256', use: 'sig' })) });
    if (address === CG_SCORES) { sent.push({ key: init.headers['X-API-Key'], ...JSON.parse(init.body) }); return Response.json(answer); }
    throw new Error('unexpected fetch ' + address);
  });
  return sent;
}
const cgEnv = () => ({ ...env(), CRAZYGAMES_API_KEY: 'cg-api-key' });
const cgCall = (e, { token = cgToken(), body, origin = CG_ORIGIN, method = 'POST', auth } = {}) => {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (auth !== undefined) { if (auth) headers.Authorization = auth; } else if (token) headers.Authorization = 'cg ' + token;
  return worker.fetch(new Request('https://collapse.test/crazygames/score', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), e);
};

test('CrazyGames: честный рейс по токену их аккаунта уходит в их таблицу: id, метры, время; ответ с их Origin', async t => {
  const sent = cgNet(t), p = page(), run = live(p, 7), e = cgEnv();
  const res = await cgCall(e, { body: { rules: p.get('COLLAPSE_RULES_VERSION'), seed: 7, meters: run.meters, log: run.log } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { meters: run.meters });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), CG_ORIGIN);
  assert.equal(sent.length, 1);
  const [score] = sent[0].scores;
  assert.equal(sent[0].key, 'cg-api-key');
  assert.deepEqual([score.userId, score.score], ['UOuZBKgjwpY9k4TSBB2NPugbsHD3', run.meters]);
  assert.match(score.timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.deepEqual(e.DB.rows(), [], 'своя таблица не тронута: эта — их');

  const pre = await worker.fetch(new Request('https://collapse.test/crazygames/score', { method: 'OPTIONS', headers: { Origin: 'https://www.crazygames.com' } }), e);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://www.crazygames.com');
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('CrazyGames: подделки не доходят до их таблицы', async t => {
  const sent = cgNet(t), p = page(), run = live(p, 7), rules = p.get('COLLAPSE_RULES_VERSION');
  const honest = { rules, seed: 7, meters: run.meters, log: run.log };
  const [head, claims] = cgToken().split('.');
  const forged = [
    ['подпись чужим ключом с тем же kid', { token: cgToken({ pair: CG_STRANGER }), body: honest }, 401, 'bad_auth'],
    ['ключ не CrazyGames', { token: cgToken({ pair: cgPair('nobody') }), body: honest }, 401, 'bad_auth'],
    ['подменённый игрок в подписанном токене', { token: [head, b64url(JSON.stringify({ userId: 'thief', exp: Date.now() / 1000 + 60 })), cgToken().split('.')[2]].join('.'), body: honest }, 401, 'bad_auth'],
    ['alg не RS256', { token: cgToken({ alg: 'HS256' }), body: honest }, 401, 'bad_auth'],
    ['токен без подписи', { token: head + '.' + claims + '.', body: honest }, 401, 'bad_auth'],
    ['мусор вместо токена', { token: 'x.y.z', body: honest }, 401, 'bad_auth'],
    ['просроченный токен', { token: cgToken({ exp: Date.now() / 1000 - 1 }), body: honest }, 401, 'expired'],
    ['нет токена', { auth: null, body: honest }, 401, 'no_auth'],
    ['подпись Telegram вместо токена', { auth: 'tma ' + initData(), body: honest }, 401, 'no_auth'],
    ['подделанные метры', { body: { ...honest, meters: run.meters + 10 } }, 422, 'meters_mismatch'],
    ['журнал другого зерна', { body: { ...honest, seed: 8 } }, 422, 'bad_replay'],
    ['другая версия правил', { body: { ...honest, rules: rules + 1 } }, 409, 'rules_version'],
    ['сайт игры в Telegram', { origin: ORIGIN, body: honest }, 403, 'bad_origin'],
    ['чужой сайт', { origin: 'https://evil.example', body: honest }, 403, 'bad_origin'],
    ['чужой сайт с crazygames.com внутри', { origin: 'https://crazygames.com.evil.example', body: honest }, 403, 'bad_origin'],
    ['не https', { origin: 'http://www.crazygames.com', body: honest }, 403, 'bad_origin'],
    ['без Origin', { origin: null, body: honest }, 403, 'bad_origin'],
  ];
  for (const [name, opts, status, error] of forged) {
    const res = await cgCall(cgEnv(), opts);
    assert.equal(res.status, status, name);
    assert.equal((await res.json()).error, error, name);
  }
  assert.equal(sent.length, 0);
  const off = await cgCall(env(), { body: honest });
  assert.deepEqual([off.status, (await off.json()).error], [500, 'not_configured'], 'без ключа их API — отказ');
  assert.equal((await cgCall(cgEnv(), { body: honest })).status, 200, 'тот же рейс без подделки проходит');
  assert.equal(sent.length, 1);
  assert.equal((await call(cgEnv(), 'POST', '/score', { origin: CG_ORIGIN, body: honest })).status, 403, 'таблица Telegram с портала закрыта');
});

test('CrazyGames: токен без kid проверяется всеми их ключами; новый ключ подтягивается сам, но не чаще раза в минуту; отказ их таблицы — 502 с причиной', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const p = page(), run = live(p, 3), body = { rules: p.get('COLLAPSE_RULES_VERSION'), seed: 3, meters: run.meters, log: run.log };
  cgNet(t);
  assert.equal((await cgCall(cgEnv(), { body })).status, 200);
  assert.equal((await cgCall(cgEnv(), { token: cgToken({ kid: undefined }), body })).status, 200, 'без kid — как локальный токен SDK');
  assert.equal((await cgCall(cgEnv(), { token: cgToken({ pair: CG_STRANGER, kid: undefined }), body })).status, 401, 'без kid чужой ключ не проходит');
  now += 3700e3;                                   // the keys are reloaded: a minute since the last load counts from here
  assert.equal((await cgCall(cgEnv(), { body })).status, 200);
  cgPublished = [CG_KEY, CG_NEXT];
  try {
    assert.equal((await cgCall(cgEnv(), { token: cgToken({ pair: CG_NEXT }), body })).status, 401, 'ключи загружены меньше минуты назад: не перезагружаем');
    now += 61e3;
    assert.equal((await cgCall(cgEnv(), { token: cgToken({ pair: CG_NEXT }), body })).status, 200, 'ротация ключей');
  } finally {
    cgPublished = [CG_KEY];
  }
  t.mock.restoreAll();
  cgNet(t, { success: true, total: 1, successCount: 0, failureCount: 1, errors: [{ score: {}, type: 'no-active-season' }] });
  const res = await cgCall(cgEnv(), { body });
  assert.deepEqual([res.status, (await res.json()).error], [502, 'crazygames_no-active-season']);
});

test('CrazyGames: предел запросов на игрока, счётчик не пересекается с игроками Telegram', async t => {
  cgNet(t);
  const p = page(), limit = p.get('LEADERBOARD_RATE_MAX'), e = cgEnv();
  const run = live(p, 2), body = { rules: p.get('COLLAPSE_RULES_VERSION'), seed: 2, meters: run.meters, log: run.log };
  for (let i = 0; i < limit; i++) assert.equal((await cgCall(e, { body })).status, 200, `запрос ${i + 1}`);
  const over = await cgCall(e, { body });
  assert.equal(over.status, 429);
  assert.equal(over.headers.get('Access-Control-Allow-Origin'), CG_ORIGIN);
  assert.equal((await cgCall(e, { token: cgToken({ userId: 'another' }), body })).status, 200);
  const ids = e.DB.raw.prepare('SELECT user_id FROM rate').all().map(r => r.user_id);
  assert.equal(ids.length, 2);
  assert.ok(ids.every(id => Number.isSafeInteger(id) && id < 0), 'номера счётчика CrazyGames — отрицательные, у Telegram — положительные');
  assert.equal((await call(e, 'GET', '/top')).status, 200, 'игрок Telegram не задет');
});

test('рейс дня: один сид на день для всех, день сменяется в полночь по Москве, вчерашний рейс ещё принимается', () => {
  const p = page(), D = p.get('CollapseDaily');
  assert.equal(p.get('COLLAPSE_DAILY_SHIFT_H'), 3);
  const d = D.day(Date.parse('2026-11-04T20:59:59Z'));          // 23:59:59 по Москве
  assert.equal(D.day(Date.parse('2026-11-04T21:00:00Z')), d + 1, 'полночь по Москве — новый день');
  assert.equal(D.day(Date.parse('2026-11-04T00:00:00Z')), d);
  const seeds = Array.from({ length: 60 }, (_, i) => D.seed(d + i));
  assert.equal(new Set(seeds).size, 60, 'каждый день своя трасса');
  for (const s of seeds) assert.ok(Number.isInteger(s) && s > 0 && s <= 0xffffffff);
  const now = Date.parse('2026-11-04T12:00:00Z');
  assert.equal(D.dayOf(D.seed(d), now), d);
  assert.equal(D.dayOf(D.seed(d - 1), now), d - 1, 'рейс, начатый до полуночи');
  assert.equal(D.dayOf(D.seed(d - 2), now), -1);
  assert.equal(D.dayOf(5, now), -1);
});

test('рейс дня в функции: своя таблица дня и сезон; чужой сид или не тот день в таблицу дня не попадают', async () => {
  const p = page(), rules = p.get('COLLAPSE_RULES_VERSION'), D = p.get('CollapseDaily'), e = env();
  const day = D.day(Date.now()), seed = D.seed(day), run = live(p, seed), other = live(p, 5);
  const send = (id, s, r, daily) => call(e, 'POST', '/score', { auth: initData({ id, first: 'Игрок' + id }), body: { rules, seed: s, meters: r.meters, log: r.log, daily } });
  assert.equal((await send(111, seed, run, day)).status, 200);
  assert.equal((await send(222, 5, other, day)).status, 200, 'чужой сид — только сезон');
  assert.equal((await send(333, seed, run, day - 5)).status, 200, 'не тот день — только сезон');
  assert.deepEqual(e.DB.raw.prepare('SELECT day, user_id, meters FROM daily').all().map(r => ({ ...r })), [{ day, user_id: 111, meters: run.meters }]);
  assert.equal(e.DB.rows().filter(r => r.season === rules).length, 3, 'все трое в сезоне');
  const top = await (await call(e, 'GET', '/top?board=daily', { auth: initData({ id: 111 }) })).json();
  assert.deepEqual(top, { season: rules, day, rows: [{ place: 1, name: 'Игрок111', meters: run.meters, me: true }], me: { place: 1, meters: run.meters } });
  const season = await (await call(e, 'GET', '/top', { auth: initData({ id: 111 }) })).json();
  assert.equal(season.day, undefined);
  assert.equal(season.rows.length, 3);
});

test('игра: рейс дня называет свой день при отправке, таблица дня — свой запрос, дата дня', async () => {
  const calls = [];
  const fetchStub = async (...a) => { calls.push(a); return new Response('{"season":9,"day":1,"rows":[],"me":null}'); };
  const p = loadScripts(['js/Constants.js', 'js/UILayout.js', 'js/Telegram.js', 'js/CollapseRules.js', 'js/Leaderboard.js'],
    { fetch: fetchStub, AbortController, setTimeout, clearTimeout, Telegram: { WebApp: { initData: 'auth_date=1&hash=x' } } });
  const L = p.get('Leaderboard');
  Object.defineProperty(L, 'url', { get: () => 'https://collapse.test' });
  const day = Math.floor(Date.parse('2026-11-04T12:00:00Z') / 86400e3), run = live(page(), 4);
  run.daily = day;
  L.submit(run);
  assert.equal(JSON.parse(calls[0][1].body).daily, day);
  await L.top('daily');
  assert.equal(calls[1][0], 'https://collapse.test/top?board=daily');
  assert.equal(L.dayDate(day), '04.11');
  run.daily = null;
  L.submit(run);
  assert.equal(JSON.parse(calls[2][1].body).daily, undefined, 'обычный рейс дня не называет');
});
