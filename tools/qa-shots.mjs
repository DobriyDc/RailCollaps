// ============================================================================
//  qa-shots — screenshots of the game at phone sizes without anyone's browser pane
// ----------------------------------------------------------------------------
//  Headless Edge (or Chrome) driven over the DevTools protocol through Node's built-in WebSocket:
//  Emulation.setDeviceMetricsOverride gives the page the exact CSS viewport ordered (headless
//  Windows Edge will not shrink its window below ~496 px, so a window size flag cannot do it).
//  Next to every PNG goes a JSON: the ordered size, innerWidth/innerHeight, devicePixelRatio,
//  console errors and uncaught exceptions, the result of --eval.
//
//  node tools/qa-shots.mjs                              # 360x640 and 390x844 -> docs/qa/shots/
//  node tools/qa-shots.mjs --sizes=360x640 --out=docs/qa/x --name=start --wait=4000
//  node tools/qa-shots.mjs --eval-file=path/to/setup.js # an async function body run before the shot
//  node tools/qa-shots.mjs --url=http://localhost:8080/ # an already running server
//  node tools/qa-shots.mjs --help
//  options: --browser=<exe>  --dpr=1  --keep (leave the browser profile folder)
//           --timeout=120000 (ms for the whole run; past it the browser is closed and the exit code is 1)
//  Exit code 1 — a page error, a console error, innerWidth/innerHeight not as ordered, or the timeout.
//  The browser and our dev server never outlive the run: Browser.close, then the process tree, then
//  whatever still carries our profile folder on its command line (orphans fall out of the tree).
// ============================================================================
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import url from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const a = process.argv.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : def;
};
const flag = name => process.argv.includes('--' + name);

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function parseSizes(s) {
  return s.split(',').map(x => {
    const m = /^(\d+)x(\d+)$/.exec(x.trim());
    if (!m) throw new Error('размер не WxH: ' + x);
    return { width: Number(m[1]), height: Number(m[2]) };
  });
}

const HELP = `qa-shots — кадры игры на размерах телефона (headless Edge или Chrome)

  node tools/qa-shots.mjs [параметры]

  --sizes=360x640,390x844   размеры кадра, CSS px
  --out=docs/qa/shots       папка для PNG и JSON
  --name=game               начало имени файла
  --wait=3000               мс после загрузки страницы
  --eval=<код>              тело async-функции, выполнить в странице перед кадром
  --eval-file=<файл>        то же из файла
  --url=<адрес>             уже запущенный сервер, адрес с параметрами
  --query=<параметры>       дописать к адресу страницы, например look=pixel&cam=1.6
  --browser=<exe>           путь к браузеру
  --dpr=1                   devicePixelRatio
  --timeout=120000          предел всего запуска, мс
  --keep                    оставить папку профиля браузера
  --help                    эта справка

Код выхода 1 — ошибка страницы, не тот размер окна или вышел предел времени.`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

async function waitFor(fn, ms, what) {
  const until = Date.now() + ms;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* not yet */ }
    if (Date.now() > until) throw new Error('не дождались: ' + what);
    await sleep(100);
  }
}

// One DevTools connection: send(method, params, sessionId) -> result; on(method, fn).
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.wait = new Map();
    this.handlers = [];
    ws.addEventListener('message', e => {
      const m = JSON.parse(String(e.data));
      if (m.id && this.wait.has(m.id)) {
        const { resolve, reject } = this.wait.get(m.id);
        this.wait.delete(m.id);
        if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
      } else if (m.method) {
        for (const h of this.handlers) h(m);
      }
    });
  }
  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    return new Cdp(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((resolve, reject) => this.wait.set(id, { resolve, reject }));
  }
  on(fn) { this.handlers.push(fn); }
  close() { this.ws.close(); }
}

async function shoot(cdp, pageUrl, size, opts) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  const errors = [];
  let loaded = false;
  cdp.on(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push({ kind: 'exception', text: (d.exception && d.exception.description) || d.text });
    } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) {
      errors.push({ kind: 'console', text: m.params.args.map(a => a.value !== undefined ? String(a.value) : a.description || a.type).join(' ') });
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push({ kind: 'log', text: m.params.entry.text + (m.params.entry.url ? ' ' + m.params.entry.url : '') });
    } else if (m.method === 'Page.loadEventFired') {
      loaded = true;
    }
  });
  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');
  await S('Emulation.setDeviceMetricsOverride', {
    width: size.width, height: size.height, deviceScaleFactor: opts.dpr, mobile: true,
    screenWidth: size.width, screenHeight: size.height,
  });
  await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await S('Page.navigate', { url: pageUrl });
  await waitFor(() => loaded, 30000, 'загрузка ' + pageUrl);
  await sleep(opts.wait);
  let evalResult = null;
  if (opts.evalSrc) {
    const r = await S('Runtime.evaluate', {
      expression: '(async () => {\n' + opts.evalSrc + '\n})()', awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) errors.push({ kind: 'eval', text: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text });
    else evalResult = r.result.value === undefined ? null : r.result.value;
    await sleep(200);
  }
  const v = await S('Runtime.evaluate', {
    expression: 'JSON.stringify({ innerWidth, innerHeight, devicePixelRatio, title: document.title })', returnByValue: true,
  });
  const view = JSON.parse(v.result.value);
  const shot = await S('Page.captureScreenshot', { format: 'png' });
  await cdp.send('Target.closeTarget', { targetId });
  return { view, png: Buffer.from(shot.data, 'base64'), errors, evalResult };
}

// The whole tree of a spawned process. On Windows child.kill() ends only the process itself.
function killTree(child) {
  if (!child || child.pid == null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5000 });
  else try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
}

// Processes that fell out of the tree (their parent died first) still name our profile folder.
function killByProfile(browser, profile) {
  const tag = path.basename(profile);
  if (process.platform === 'win32') {
    const exe = path.basename(browser);
    const ps = `Get-CimInstance Win32_Process -Filter "Name='${exe}'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 8000 });
  } else {
    spawnSync('pkill', ['-9', '-f', tag], { stdio: 'ignore', timeout: 5000 });
  }
}

// Closes everything the run started. Every step is bounded: a wedged browser must not wedge the exit.
async function shutdown(cdp, edge, server, browser, profile) {
  if (cdp) {
    await Promise.race([cdp.send('Browser.close').catch(() => {}), sleep(2000)]);
    cdp.close();
  }
  killTree(edge);
  killByProfile(browser, profile);
  killTree(server);
  await sleep(200);
  if (!flag('keep')) await fsp.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}

async function main() {
  if (flag('help')) { console.log(HELP); return; }
  const sizes = parseSizes(arg('sizes', '360x640,390x844'));
  const out = path.resolve(ROOT, arg('out', 'docs/qa/shots'));
  const name = arg('name', 'game');
  const evalFile = arg('eval-file', null);
  const opts = {
    wait: Number(arg('wait', '3000')),
    dpr: Number(arg('dpr', '1')),
    evalSrc: evalFile ? fs.readFileSync(path.resolve(evalFile), 'utf8') : arg('eval', null),
  };
  const browser = arg('browser', null) || BROWSERS.find(b => fs.existsSync(b));
  if (!browser) throw new Error('нет Edge или Chrome: --browser=<путь к exe>');
  const limit = Number(arg('timeout', '120000'));

  // The game: an already running server or our own dev server on a free port.
  let pageUrl = arg('url', null), server = null;
  if (!pageUrl) {
    const port = await freePort();
    server = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.mjs'), '--port=' + port, '--no-open'], { stdio: 'ignore', detached: process.platform !== 'win32' });
    pageUrl = `http://127.0.0.1:${port}/`;
    await waitFor(async () => (await fetch(pageUrl)).ok, 15000, 'dev-server ' + pageUrl);
  }
  const query = arg('query', '');
  if (query) pageUrl += (pageUrl.includes('?') ? '&' : '?') + query;

  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'qa-shots-'));
  const edge = spawn(browser, [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio',
    '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ], { stdio: 'ignore', detached: process.platform !== 'win32' });

  let failed = false, cdp = null, timer = null;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('вышел предел времени ' + limit + ' мс')), limit);
    for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => reject(new Error('прервано: ' + sig)));
  });
  const work = async () => {
    // Port 0: the browser picks a port and writes it with the browser endpoint into the profile.
    const active = await waitFor(() => {
      const f = path.join(profile, 'DevToolsActivePort');
      return fs.existsSync(f) && fs.readFileSync(f, 'utf8').trim().split(/\r?\n/);
    }, 20000, 'DevToolsActivePort');
    cdp = await Cdp.open(`ws://127.0.0.1:${active[0]}${active[1]}`);
    await fsp.mkdir(out, { recursive: true });
    for (const size of sizes) {
      const r = await shoot(cdp, pageUrl, size, opts);
      const base = path.join(out, `${name}-${size.width}x${size.height}`);
      const ok = r.view.innerWidth === size.width && r.view.innerHeight === size.height && r.errors.length === 0;
      failed = failed || !ok;
      await fsp.writeFile(base + '.png', r.png);
      const meta = {
        ordered: size, innerWidth: r.view.innerWidth, innerHeight: r.view.innerHeight,
        devicePixelRatio: r.view.devicePixelRatio, title: r.view.title, url: pageUrl,
        browser: path.basename(browser), waitMs: opts.wait, eval: evalFile || (opts.evalSrc ? 'inline' : null),
        evalResult: r.evalResult, errors: r.errors, ok,
      };
      await fsp.writeFile(base + '.json', JSON.stringify(meta, null, 2) + '\n');
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${path.relative(ROOT, base)}.png  inner ${r.view.innerWidth}x${r.view.innerHeight}, ошибок ${r.errors.length}`);
      for (const e of r.errors) console.log('     ' + e.kind + ': ' + e.text.split('\n')[0]);
    }
  };
  try {
    await Promise.race([work(), expired]);
  } finally {
    clearTimeout(timer);
    await shutdown(cdp, edge, server, browser, profile);
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  // An explicit exit: a socket left open by a wedged browser must not keep the process alive.
  main().catch(e => { console.error('qa-shots: ' + (e && e.message || e)); process.exitCode = 1; }).finally(() => process.exit());
}
