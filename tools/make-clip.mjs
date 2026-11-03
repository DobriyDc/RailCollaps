// ============================================================================
//  make-clip — a vertical promo clip of the game: a scene of docs/video/scenes played on the real game
//  in headless Edge, frame by frame, 1080x1920 at 30 fps, with the game's own sounds and music.
// ----------------------------------------------------------------------------
//  node tools/make-clip.mjs docs/video/scenes/01_demon.json [--lang=ru,en] [--out=build/clips]
//    --size=960x540   the page in CSS px (doubled in the video; default 540x960), e.g. a portal's preview
//    --query=land     added to the game's address
//    --silent         no sound track (portal previews)
//
//  The page runs at 540x960 CSS px with devicePixelRatio 2; tools/clip-page.js stops the frame loop,
//  stages the scene and makes each frame on request, the driver takes a screenshot of every one.
//  The sounds the game would play are logged with their time and mixed here by ffmpeg over the music,
//  the wheels and the steam. Needs ffmpeg on PATH (winget install Gyan.FFmpeg). docs/video/README.md
//  describes the scene files.
// ============================================================================
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import url from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => { const a = process.argv.find(x => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : def; };
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const FPS = 30;
const [VW, VH] = arg('size', '540x960').split('x').map(Number);   // the page, CSS px; the video is twice that
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function waitFor(fn, ms, what) {
  const until = Date.now() + ms;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* not yet */ }
    if (Date.now() > until) throw new Error('не дождались: ' + what);
    await sleep(100);
  }
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.wait = new Map(); this.handlers = [];
    ws.addEventListener('message', e => {
      const m = JSON.parse(String(e.data));
      if (m.id && this.wait.has(m.id)) { const w = this.wait.get(m.id); this.wait.delete(m.id); if (m.error) w.reject(new Error(m.error.message)); else w.resolve(m.result); }
      else if (m.method) for (const h of this.handlers) h(m);
    });
  }
  static async open(u) { const ws = new WebSocket(u); await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }); return new Cdp(ws); }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((res, rej) => this.wait.set(id, { resolve: res, reject: rej }));
  }
}

// The frames of one scene in one language: PNGs in `dir`, the logged sounds back.
async function capture(scene, lang, dir) {
  const browser = BROWSERS.find(b => fs.existsSync(b));
  if (!browser) throw new Error('нет Edge или Chrome');
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.mjs'), '--port=' + port, '--no-open'], { stdio: 'ignore' });
  const pageUrl = `http://127.0.0.1:${port}/` + (arg('query', '') ? '?' + arg('query', '') : '');
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'clip-profile-'));
  let edge = null, cdp = null;
  try {
    await waitFor(async () => (await fetch(pageUrl)).ok, 15000, 'dev-server');
    edge = spawn(browser, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
    const active = await waitFor(() => { const f = path.join(profile, 'DevToolsActivePort'); return fs.existsSync(f) && fs.readFileSync(f, 'utf8').trim().split(/\r?\n/); }, 20000, 'DevToolsActivePort');
    cdp = await Cdp.open(`ws://127.0.0.1:${active[0]}${active[1]}`);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => cdp.send(m, p, sessionId);
    const errors = [];
    let loaded = false;
    cdp.handlers.push(m => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Page.loadEventFired') loaded = true;
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    });
    await S('Page.enable');
    await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: VW < VH, screenWidth: VW, screenHeight: VH });
    await S('Page.navigate', { url: pageUrl });
    await waitFor(() => loaded, 30000, 'загрузка');
    await sleep(3500);
    const ev = async expr => {
      const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await ev('document.fonts.ready.then(() => 1)');
    await ev('window.__clipCfg = ' + JSON.stringify({ ...scene, lang }) + '; 1');
    await ev(fs.readFileSync(path.join(ROOT, 'tools', 'clip-page.js'), 'utf8') + '; 1');
    await ev('document.fonts.ready.then(() => 1)');
    const n = await ev('__clip.frames');
    for (let i = 0; i < n; i++) {
      const st = await ev(`__clip.step(${i})`);
      const shot = await S('Page.captureScreenshot', { format: 'png' });
      await fsp.writeFile(path.join(dir, 'f' + String(i).padStart(4, '0') + '.png'), Buffer.from(shot.data, 'base64'));
      if (i % (FPS * 2) === 0) console.log(`  ${lang} кадр ${i}/${n} ${JSON.stringify(st)}`);
    }
    if (errors.length) console.log('  ошибки страницы:', errors.slice(0, 3));
    return await ev('__clip.sounds()');
  } finally {
    if (cdp) await Promise.race([cdp.send('Browser.close').catch(() => {}), sleep(2000)]);
    for (const p of [edge, server]) if (p && p.pid != null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      else try { p.kill('SIGKILL'); } catch { /* gone */ }
    }
    await sleep(300);
    await fsp.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}

// The frames and the sound into one MP4: the music, the wheels, the steam, the rumble while the
// scene says, every logged effect at its time.
function encode(scene, dir, sounds, out) {
  if (process.argv.includes('--silent')) {
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-t', String(scene.seconds),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (ff.status !== 0) throw new Error('ffmpeg: ' + String(ff.stderr).split('\n').slice(-6).join('\n'));
    return;
  }
  const snd = p => path.join(ROOT, p);
  const inputs = ['-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'),
    '-stream_loop', '-1', '-i', snd('assets/sounds/music_tunnel.wav'),
    '-stream_loop', '-1', '-i', snd('assets/sounds/loop_wheels.wav'),
    '-stream_loop', '-1', '-i', snd('assets/sounds/loop_steam.wav'),
    '-stream_loop', '-1', '-i', snd('assets/sounds/loop_rumble.wav')];
  const rb = scene.rumble || { from: 0, to: 0, volume: 0 };
  const parts = [`[1:a]volume=${scene.music == null ? 0.5 : scene.music}[m]`, '[2:a]volume=0.45[w]', '[3:a]volume=0.25[s]',
    `[4:a]volume='${rb.volume}*between(t,${rb.from},${rb.to})':eval=frame[r]`];
  const labels = ['[m]', '[w]', '[s]', '[r]'];
  sounds.forEach(([ms, src], k) => {
    inputs.push('-i', snd(src));
    parts.push(`[${5 + k}:a]adelay=${ms}|${ms}[e${k}]`);
    labels.push(`[e${k}]`);
  });
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,alimiter=limit=0.9,afade=t=out:st=${scene.seconds - 0.8}:d=0.8[a]`);
  const args = ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[a]', '-t', String(scene.seconds),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out];
  const ff = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (ff.status !== 0) throw new Error('ffmpeg: ' + String(ff.stderr).split('\n').slice(-6).join('\n'));
}

async function main() {
  const sceneFile = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!sceneFile) { console.log('node tools/make-clip.mjs <сцена.json> [--lang=ru,en] [--out=build/clips]'); return; }
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('нет ffmpeg в PATH: winget install Gyan.FFmpeg');
  const scene = JSON.parse(fs.readFileSync(path.resolve(sceneFile), 'utf8'));
  const outDir = path.resolve(ROOT, arg('out', 'build/clips'));
  await fsp.mkdir(outDir, { recursive: true });
  const name = path.basename(sceneFile, '.json');
  for (const lang of arg('lang', 'ru,en').split(',')) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'clip-frames-'));
    try {
      const t0 = Date.now();
      const sounds = await capture(scene, lang, dir);
      const out = path.join(outDir, `${name}_${lang}` + (arg('size', '') ? `_${VW * 2}x${VH * 2}` : '') + '.mp4');
      encode(scene, dir, sounds, out);
      console.log(`${path.relative(ROOT, out) || out}: ${scene.seconds} с, звуков ${sounds.length}, ${Math.round((Date.now() - t0) / 1000)} с работы`);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch(e => { console.error('make-clip: ' + (e && e.message || e)); process.exitCode = 1; }).finally(() => process.exit());
