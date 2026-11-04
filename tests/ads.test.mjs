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
  const p = loadScripts(['js/Constants.js', 'js/Ads.js', 'js/CrazyGames.js'], {
    document, TG: { inside }, setTimeout, clearTimeout, console,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
  });
  const Ads = p.get('Ads'), { window } = p.ctx;
  Ads._ids = () => ({ adsgram: '', monetag: '', ...ids });
  Ads._urls = () => ({ adsgram: 'adsgram.js', monetag: 'monetag.js' });
  return { Ads, window, added, store };
}

const all = { adsgram: '11', monetag: '22' };

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
  const p = loadScripts(['js/Constants.js', 'js/Ads.js', 'js/CrazyGames.js'], { TG: { inside: true } });
  const Ads = p.get('Ads'), html = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
  for (const network of Ads.active) assert.match(html, new RegExp(network, 'i'), network);
  assert.doesNotMatch(p.get('ADS_ADSGRAM_BLOCK'), /^(int|task)-/);
});

test('очередь: каждое предложение начинается со следующей сети и переживает перезагрузку', () => {
  const { Ads, store } = ads({ ids: all });
  const firsts = Array.from({ length: 4 }, () => Ads.order()[0]);
  assert.deepEqual([...firsts], ['adsgram', 'monetag', 'adsgram', 'monetag']);
  assert.equal(store.get('collapse.adTurn'), '4');
  assert.deepEqual([...Ads.order()], ['adsgram', 'monetag']);
  assert.deepEqual([...Ads.order()], ['monetag', 'adsgram']);

  const one = ads({ ids: { monetag: '22' } });
  assert.deepEqual([...one.Ads.order()], ['monetag']);
  assert.deepEqual([...one.Ads.order()], ['monetag']);
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

test('скрипт не загрузился: ход дальше, следующая попытка грузит его снова', async t => {
  t.mock.method(console, 'warn', () => {});
  const s = ads({ ids: { adsgram: '11', monetag: '22' }, scripts: { 'adsgram.js': false } });
  s.window.show_22 = async () => ({ reward_event_type: 'valued' });
  assert.equal(await s.Ads.rewarded(), true);
  s.store.set('collapse.adTurn', '0');
  assert.equal(await s.Ads.rewarded(), true);
  assert.equal(s.added.filter(tag => tag.src === 'adsgram.js').length, 2);
});

test('реклама после проигрыша: только в Telegram и только с сетью; первая сеть с роликом показывает, награды нет', async () => {
  const s = ads({ ids: { adsgram: '11', monetag: '22' }, scripts: { 'adsgram.js': false } });
  let shown = 0;
  s.window.show_22 = async () => { shown++; return { reward_event_type: 'non_valued' }; };
  assert.equal(s.Ads.afterLossLive, true);
  await s.Ads.afterLoss();
  assert.equal(shown, 1, 'Adsgram не загрузился — показал Monetag');

  for (const quiet of [ads({ ids: { monetag: '22' }, inside: false }), ads()]) {
    assert.equal(quiet.Ads.afterLossLive, false);
    await quiet.Ads.afterLoss();
    assert.equal(quiet.added.length, 0, 'вне Telegram и без сети ничего не грузится');
  }
});
