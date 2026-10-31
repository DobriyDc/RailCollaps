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
const page = () => loadScripts(['js/Constants.js', 'js/CollapseRules.js']);
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
// shots at forks and demons, one continue after the first crash.
function live(p, seed) {
  const CollapseRun = p.get('CollapseRun'), R = p.get('CollapseRules');
  const run = new CollapseRun(seed), dice = R.rng(seed ^ 0x51ed);
  for (let f = 0; f < 60 * 900; f++) {
    if (run.state === 'over') { if (!run.continueRun()) break; }
    const next = run.nextFork();
    if (next && !next.armed && !run.track.laneSafe(run.lane, next.at, R.LOOK)) {
      const to = next.to.find(l => run.forkSafe(next.at, l));
      if (to !== undefined) run.shoot(next.at, to);
    }
    for (const d of run.leaping()) if (dice() < 0.9) run.shootDemon(d.side);
    run.update(1 / 75 + dice() / 40);
  }
  return run;
}

test('реплей журнала на 20 зёрнах совпадает с живым забегом до метра, функция записывает те же метры', async () => {
  const p = page(), CollapseRun = p.get('CollapseRun'), maxSteps = p.get('LEADERBOARD_MAX_STEPS');
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
  const p = page(), CollapseRun = p.get('CollapseRun');
  const state = r => JSON.stringify([r.meters, r.pos, r.front, r.steps, r.lane, r.ammo, r.reason]);
  for (const seed of SEEDS) {
    const plain = live(p, seed);
    const Mute = class extends CollapseRun { constructor(s) { super(s); this.log = { push() {} }; } };
    const muted = live({ get: name => (name === 'CollapseRun' ? Mute : p.get(name)) }, seed);
    assert.equal(state(muted), state(plain));
  }
});

test('журнал не из забега отклоняется реплеем: не по порядку, после конца, отказ правил, забег без конца', () => {
  const p = page(), CollapseRun = p.get('CollapseRun'), run = live(p, 3), max = p.get('LEADERBOARD_MAX_STEPS');
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
    ['сдвинутый журнал', { body: { ...honest, log: run.log.map(([s, ...a]) => [s + 7, ...a]) } }, 422, 'bad_replay'],
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
  const FINGERPRINTS = { 1: '630a834b' };
  const p = page(), R = p.get('CollapseRules');
  const { iconLead, ...numbers } = R.cfg();
  const walk = SEEDS.slice(0, 5).map(seed => { const r = live(p, seed); return [r.meters, r.steps, r.pos]; });
  const print = crypto.createHash('sha256').update(JSON.stringify([numbers, walk])).digest('hex').slice(0, 8);
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
  assert.deepEqual(JSON.parse(calls[0][1].body), { rules: 1, seed: 4, meters: run.meters, log: JSON.parse(JSON.stringify(run.log)) });
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
