// The rewarded ad (js/Ads.js): the networks take turns, a network with no ad passes on, a closed ad gives
// no reward, a failed script does not stop the offer, and no script loads unless it should.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadScripts, ROOT } from './browser-scripts.mjs';

function ads({ ids = {}, inside = true, scripts = {} } = {}) {
  const store = new Map(), added = [];
  const document = {
    createElement: () => ({ dataset: {} }),
    head: {
      appendChild(tag) {
        added.push(tag);
        const run = scripts[tag.src];
        setTimeout(() => (run === false ? tag.onerror() : tag.onload()));
      },
    },
  };
  const p = loadScripts(['js/Constants.js', 'js/Ads.js'], {
    document, TG: { inside }, setTimeout, clearTimeout, console,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
  });
  const Ads = p.get('Ads'), { window } = p.ctx;
  Ads._ids = () => ({ adsgram: '', monetag: '', adexium: '', ...ids });
  Ads._urls = () => ({ adsgram: 'adsgram.js', monetag: 'monetag.js', adexium: 'adexium.js' });
  return { Ads, window, added, store };
}

const all = { adsgram: '11', monetag: '22', adexium: '33' };

test('сеть выключена без идентификатора: скрипты не грузятся, награда бесплатна', async () => {
  const off = ads();
  assert.equal(await off.Ads.rewarded(), true);
  assert.equal(off.added.length, 0);

  const browser = ads({ ids: all, inside: false });
  assert.equal(browser.Ads.live, false);
  assert.equal(await browser.Ads.rewarded(), true);
  assert.equal(browser.added.length, 0);
});

test('включённая сеть названа в политике, id Reward-блока Adsgram без префикса другого формата', () => {
  const p = loadScripts(['js/Constants.js', 'js/Ads.js'], { TG: { inside: true } });
  const Ads = p.get('Ads'), html = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
  for (const network of Ads.active) assert.match(html, new RegExp(network, 'i'), network);
  assert.doesNotMatch(p.get('ADS_ADSGRAM_BLOCK'), /^(int|task)-/);
});

test('очередь: каждое предложение начинается со следующей сети и переживает перезагрузку', () => {
  const { Ads, store } = ads({ ids: all });
  const firsts = Array.from({ length: 6 }, () => Ads.order()[0]);
  assert.deepEqual([...firsts], ['adsgram', 'monetag', 'adexium', 'adsgram', 'monetag', 'adexium']);
  assert.equal(store.get('collapse.adTurn'), '6');
  assert.deepEqual([...Ads.order()], ['adsgram', 'monetag', 'adexium']);

  const two = ads({ ids: { monetag: '22', adexium: '33' } });
  assert.deepEqual([...two.Ads.order()], ['monetag', 'adexium']);
  assert.deepEqual([...two.Ads.order()], ['adexium', 'monetag']);
});

test('Adsgram: досмотр даёт награду, пропуск нет, ошибка передаёт ход следующей сети', async () => {
  const seen = [];
  const s = ads({ ids: { adsgram: '11', monetag: '22' } });
  let show = async () => ({ done: true });
  s.window.Adsgram = { init(o) { seen.push(o.blockId); return { show: () => show() }; } };
  s.window.show_22 = async () => ({ reward_event_type: 'valued' });

  s.store.set('collapse.adTurn', '0');
  assert.equal(await s.Ads.rewarded(), true);
  assert.deepEqual(seen, ['11']);
  assert.equal(s.added[0].src, 'adsgram.js');

  s.store.set('collapse.adTurn', '0');
  show = async () => { throw { done: false, error: false }; };
  assert.equal(await s.Ads.rewarded(), false, 'закрыл рекламу: без награды и без второй сети');
  assert.equal(s.added.length, 1);

  s.store.set('collapse.adTurn', '0');
  show = async () => { throw { done: false, error: true }; };
  assert.equal(await s.Ads.rewarded(), true, 'нет рекламы: показала следующая сеть');
  assert.deepEqual({ ...s.added[1].dataset }, { zone: '22', sdk: 'show_22' });
});

test('Monetag: награда только за valued, ранний выход без неё, пустая лента идёт дальше', async () => {
  const s = ads({ ids: { monetag: '22' } });
  s.window.show_22 = async () => ({ reward_event_type: 'non_valued' });
  assert.equal(await s.Ads.rewarded(), false);
  s.window.show_22 = async () => ({ reward_event_type: 'valued' });
  assert.equal(await s.Ads.rewarded(), true);
  s.window.show_22 = async () => { throw new Error('Empty feed'); };
  assert.equal(await s.Ads.rewarded(), false);
});

test('Adexium: события показа, закрытие раньше конца без награды, тишина считается пустой лентой', async () => {
  const s = ads({ ids: { adexium: '33' } });
  const made = [];
  let script = ads_ => { ads_.fire('adReceived', { id: 1 }); ads_.fire('adPlaybackCompleted'); ads_.fire('adClosed'); };
  s.window.AdexiumWidget = class {
    constructor(o) { this.o = o; this.fns = {}; this.shown = []; made.push(this); }
    on(name, fn) { this.fns[name] = fn; }
    fire(name, value) { this.fns[name](value); }
    displayAd(ad) { this.shown.push(ad); }
    requestAd(format) { this.format = format; setTimeout(() => script(this)); }
  };
  assert.equal(await s.Ads.rewarded(), true);
  assert.equal(made[0].o.wid, '33');
  assert.equal(made[0].format, 'interstitial');
  assert.equal(made[0].shown.length, 1);

  script = a => { a.fire('adReceived', { id: 2 }); a.fire('adClosed'); };
  assert.equal(await s.Ads.rewarded(), false);
  script = a => a.fire('noAdFound');
  assert.equal(await s.Ads.rewarded(), false);
  assert.equal(made.length, 1, 'виджет один на все предложения');

  Object.defineProperty(s.Ads, 'waitMs', { get: () => 5 });
  script = () => {};
  assert.equal(await s.Ads.rewarded(), false);
});

test('скрипт не загрузился: ход дальше, следующая попытка грузит его снова', async t => {
  t.mock.method(console, 'warn', () => {});
  const s = ads({ ids: { adsgram: '11', monetag: '22' }, scripts: { 'adsgram.js': false } });
  s.window.show_22 = async () => ({ reward_event_type: 'valued' });
  assert.equal(await s.Ads.rewarded(), true);
  s.store.set('collapse.adTurn', '0');
  assert.equal(await s.Ads.rewarded(), true);
  assert.equal(s.added.filter(tag => tag.src === 'adsgram.js').length, 2);
});
