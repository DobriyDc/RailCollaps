// The shop in the game (js/Shop.js): what a card offers in each state, what the function's list changes,
// the train a player wears, and the two sides that must agree: the trains and the price.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadScripts, ROOT } from './browser-scripts.mjs';

function shop({ selling = true, donating = false, stored = {}, inventory = [], invoice = { link: 'https://t.me/$x' }, status = 'paid' } = {}) {
  const store = new Map(Object.entries(stored)), worn = [], requests = [], texts = {}, enabled = {}, shown = {}, typed = {};
  const element = id => ({
    setText(t) { texts[id] = t; return this; },
    setEnabled(on) { enabled[id] = on; return this; },
    show(on) { shown[id] = on; return this; },
    getText() { return typed[id] || ''; },
  });
  const p = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Shop.js'], {
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    UI: { get: element },
    TG: { openInvoice: (link, done) => done(status) },
    Leaderboard: {
      enabled: selling,
      _headers: () => ({}),
      _request: async (route, init) => {
        requests.push({ route, body: init.body });
        return route === '/inventory' ? (inventory && { items: inventory }) : invoice;
      },
    },
  });
  const Shop = p.get('Shop'), clicks = {};
  Object.defineProperty(Shop, 'salesOpen', { get: () => selling, configurable: true });
  Object.defineProperty(Shop, 'donating', { get: () => donating, configurable: true });
  const scene = { wearTrain: id => worn.push(id) };
  return { Shop, scene, store, worn, requests, texts, enabled, shown, typed, clicks, boot: () => Shop.init(scene, (id, fn) => { clicks[id] = fn; }) };
}

const settle = () => new Promise(resolve => setTimeout(resolve));

test('магазин без функции: цены не продаются, поезд один, запросов нет', async () => {
  const s = shop({ selling: false });
  s.boot();
  s.Shop.open();
  await settle();
  assert.deepEqual(s.requests, []);
  assert.deepEqual(s.worn, ['base']);
  assert.equal(s.enabled.shopBuy0, false);
  assert.equal(s.texts.shopBuy0, 'Выбран');
  assert.equal(s.texts.shopName1, 'Адский паровоз');
  assert.equal(s.texts.shopDonate, 'Скоро');
  assert.equal(s.enabled.shopDonate, false);
  assert.equal(s.texts.shopBuy1, 'Скоро');
  assert.equal(s.enabled.shopBuy1, false);
  s.clicks.shopBuy1();
  await settle();
  assert.deepEqual(s.requests, []);
});

test('продажи закрыты числом: адрес таблицы их не открывает', () => {
  const p = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Shop.js'], { localStorage: { getItem: () => null, setItem() {} }, Leaderboard: { enabled: true } });
  assert.equal(p.get('COLLAPSE_SHOP_OPEN'), 0);
  assert.equal(p.get('Shop').selling, false);
});

test('покупка: цена на кнопке, оплата надевает поезд и запоминает его', async () => {
  const s = shop();
  s.boot();
  await settle();
  s.Shop.render();
  assert.equal(s.texts.shopBuy1, s.Shop.stars + ' ⭐');
  assert.equal(s.enabled.shopBuy1, true);
  await s.Shop.press('hell');
  assert.equal(s.requests.at(-1).route, '/invoice');
  assert.deepEqual(JSON.parse(s.requests.at(-1).body), { item: 'hell', lang: 'ru' });
  assert.equal(s.worn.at(-1), 'hell');
  assert.equal(s.store.get('collapse.train'), 'hell');
  assert.deepEqual(JSON.parse(s.store.get('collapse.owned')), ['base', 'hell']);
  assert.equal(s.texts.shopBuy1, 'Выбран');
  assert.equal(s.texts.shopBuy0, 'Выбрать');
  assert.match(s.texts.shopNote, /Спасибо/);
});

test('счёт закрыт или не вышел: поезд не выдан, ошибка только при сбое', async () => {
  const closed = shop({ status: 'cancelled' });
  closed.boot();
  await settle();
  await closed.Shop.press('bio');
  assert.ok(!closed.Shop.owned.has('bio'));
  assert.deepEqual(closed.worn, ['base']);
  assert.match(closed.texts.shopNote, /условия/);

  const broken = shop({ invoice: null });
  broken.boot();
  await settle();
  await broken.Shop.press('bio');
  assert.ok(!broken.Shop.owned.has('bio'));
  assert.match(broken.texts.shopNote, /Не вышло/);
  assert.equal(broken.Shop._buying, '');
});

test('список функции главнее памяти: возврат снимает поезд, покупка с другого устройства появляется', async () => {
  const refunded = shop({ stored: { 'collapse.owned': '["base","rune"]', 'collapse.train': 'rune' }, inventory: [] });
  refunded.boot();
  assert.equal(refunded.worn[0], 'rune');
  await settle();
  assert.equal(refunded.worn.at(-1), 'base');
  assert.deepEqual(JSON.parse(refunded.store.get('collapse.owned')), ['base']);

  const elsewhere = shop({ inventory: ['bio'] });
  elsewhere.boot();
  await settle();
  assert.ok(elsewhere.Shop.owned.has('bio'));

  const offline = shop({ stored: { 'collapse.owned': '["base","hell"]', 'collapse.train': 'hell' }, inventory: null });
  offline.boot();
  await settle();
  assert.equal(offline.worn.at(-1), 'hell', 'без ответа ничего не отбираем');
});

test('испорченная память и чужой поезд: начальный поезд', () => {
  for (const stored of [{ 'collapse.owned': '{', 'collapse.train': 'hell' }, { 'collapse.owned': '["tank"]', 'collapse.train': 'tank' }]) {
    const s = shop({ selling: false, stored });
    s.boot();
    assert.deepEqual(s.worn, ['base']);
  }
});

test('игра и функция продают одно и то же, у каждого поезда есть кадры и карточка', () => {
  const p = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/UILayout.js', 'js/Shop.js'], { localStorage: { getItem: () => null, setItem() {} } });
  const Shop = p.get('Shop'), layout = p.get('UI_LAYOUT'), Lang = p.get('Lang');
  const server = fs.readFileSync(path.join(ROOT, 'server/leaderboard/src/index.js'), 'utf8');
  const sold = JSON.parse(/const TRAINS = (\[.*?\]);/.exec(server)[1].replace(/'/g, '"'));
  assert.deepEqual([...Shop.TRAINS].filter(id => id !== Shop.FREE).map(String), sold);

  const scene = fs.readFileSync(path.join(ROOT, 'js/CollapseScene.js'), 'utf8');
  Shop.TRAINS.forEach((id, i) => {
    assert.ok(new RegExp('\\b' + id + ': \\{\\n\\s+loco:').test(scene), id);
    assert.ok(layout.some(r => r.id === 'shopBuy' + i));
    assert.ok(layout.some(r => r.id === 'shopBuy' + i + 'Skin'));
    assert.ok(Lang.words['train.' + id].ru && Lang.words['train.' + id].en);
  });
  assert.equal(Lang.t('shopSupport'), 'Поддержи разработчика!');
  assert.equal(layout.find(r => r.id === 'shopTitle').text, 'Поддержи разработчика!');
});

test('страница условий: без внешних скриптов, два языка, бот показывает её адрес', () => {
  const html = fs.readFileSync(path.join(ROOT, 'terms.html'), 'utf8');
  assert.doesNotMatch(html, /<script|<link|src=/i);
  assert.match(html, /Условия покупки/);
  assert.match(html, /Terms of purchase/);
  const server = fs.readFileSync(path.join(ROOT, 'server/leaderboard/src/index.js'), 'utf8');
  assert.match(server, /TERMS_URL = GAME_URL \+ 'terms\.html'/);
});

test('донат: сумму вписывает игрок, в пределах числа; оплата благодарит и ничего не надевает', async () => {
  const p = loadScripts(['js/Constants.js', 'js/Lang.js', 'js/Shop.js'], { localStorage: { getItem: () => null, setItem() {} }, Leaderboard: { enabled: true } });
  assert.equal(p.get('COLLAPSE_DONATE_OPEN'), 0, 'донаты открываются числом после деплоя функции');
  const s = shop({ selling: false, donating: true });
  s.boot();
  s.Shop.open();
  assert.equal(s.texts.shopDonate, 'Поддержать');
  assert.equal(s.enabled.shopDonate, true);
  s.clicks.shopDonate();
  assert.equal(s.shown.donateBox, true);
  assert.match(s.texts.donateHint, /От 1 до 10000/);
  for (const bad of ['', '0', '10001', '1.5']) {
    s.typed.donateAmount = bad;
    await s.clicks.donateSend();
    assert.match(s.texts.shopNote, /Впиши число/, bad);
  }
  assert.deepEqual(s.requests, []);
  s.typed.donateAmount = '50';
  await s.clicks.donateSend();
  await settle();
  assert.deepEqual(JSON.parse(s.requests.at(-1).body), { item: 'donation', stars: 50, lang: 'ru' });
  assert.equal(s.texts.shopNote, 'Спасибо за поддержку!');
  assert.equal(s.shown.donateBox, false);
  assert.deepEqual(s.worn, ['base'], 'донат не поезд');
});
