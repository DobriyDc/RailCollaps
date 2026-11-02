// The bot's setup (tools/bot-setup.mjs): texts within Telegram's limits and equal to the document,
// the token never printed, the first refusal stops the calls. The privacy page stands on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './browser-scripts.mjs';
import { ABOUT_RU, CALLS, DESCRIPTION_RU, GAME_URL, NAME, isToken, send } from '../tools/bot-setup.mjs';

const TOKEN = '123456:FAKE-TOKEN-FOR-TESTS-ONLY';

test('тексты бота в пределах Telegram и совпадают с документом', () => {
  assert.ok([...NAME].length <= 64);
  assert.ok([...DESCRIPTION_RU].length <= 512);
  assert.ok([...ABOUT_RU].length <= 120);
  const doc = fs.readFileSync(path.join(ROOT, 'docs/bot-welcome.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(doc.includes(DESCRIPTION_RU));
  assert.ok(doc.includes(ABOUT_RU));
  const index = fs.readFileSync(path.join(ROOT, 'server/leaderboard/src/index.js'), 'utf8');
  assert.ok(index.includes("GAME_URL = '" + GAME_URL + "'"));
});

test('настройка бота: все вызовы по очереди, отказ останавливает, токен не печатается', async t => {
  const logged = [];
  t.mock.method(console, 'log', line => logged.push(String(line)));
  const seen = [];
  const yes = async (address, init) => { seen.push({ address, body: JSON.parse(init.body) }); return { json: async () => ({ ok: true }) }; };
  assert.deepEqual(await send(TOKEN, CALLS, yes), { ok: true });
  assert.deepEqual(seen.map(s => s.address.split('/').pop()), CALLS.map(c => c[0]));
  assert.ok(seen.every(s => s.address.startsWith('https://api.telegram.org/bot' + TOKEN + '/')));
  assert.equal(seen[1].body.language_code, 'ru');
  assert.equal(seen[3].body.menu_button.web_app.url, GAME_URL);

  seen.length = 0;
  const refuse = async (address, init) => { seen.push(address); return { json: async () => ({ ok: seen.length < 2, description: 'Too Many Requests' }) }; };
  assert.deepEqual(await send(TOKEN, CALLS, refuse), { ok: false, method: 'setMyDescription', why: 'Too Many Requests' });
  assert.equal(seen.length, 2);
  assert.ok(!logged.some(line => line.includes(TOKEN)));
});

test('токен: форма проверяется до отправки', () => {
  assert.ok(isToken(TOKEN));
  for (const bad of ['', '123', 'abc:def', '123456:short', '123 456:FAKE-TOKEN-FOR-TESTS-ONLY']) assert.ok(!isToken(bad), bad);
});

test('страница политики: без внешних скриптов, с двумя языками и способом связи', () => {
  const html = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
  assert.doesNotMatch(html, /<script|<link|src=/i);
  assert.match(html, /<title>Rail Link: Collapse/);
  assert.match(html, /Политика конфиденциальности/);
  assert.match(html, /Privacy policy/);
  assert.match(html, /t\.me\/PatrKir306/);
  assert.doesNotMatch(html, /github\.com\/DobriyDc\/RailCollaps\/issues/);
});
