// ============================================================================
//  check-art — the gate of the world's art: every PNG the world_v3 and train_v3 manifests list
//  stands on the one palette of docs/STYLE.md and on the pixel grid.
// ----------------------------------------------------------------------------
//  A visible pixel off the palette, a soft alpha, a size other than the manifest's, a raster
//  scaled up by a whole factor (every 2x2, 3x3 or 4x4 block one color) — the asset does not pass.
//  node tools/art/check-art.mjs     exit 1 on any finding. tests/art-gate.test.mjs runs the same in the gates.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');
const MANIFESTS = ['art_src/world_v3/world_manifest_v3.json', 'art_src/train_v3/train_manifest_v3.json'];

// The fenced block under the palette heading of docs/STYLE.md: its owner.
export function readPalette(root = ROOT) {
  const text = fs.readFileSync(path.join(root, 'docs/STYLE.md'), 'utf8');
  const block = /## Палитра\s+```([\s\S]*?)```/.exec(text);
  if (!block) throw new Error('docs/STYLE.md: нет блока палитры');
  return new Set(block[1].trim().split(/\s+/).map(h => parseInt(h, 16)));
}

// An 8-bit non-interlaced PNG -> { w, h, rgba }. Every asset of the two packs is one.
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG');
  let at = 8, w = 0, h = 0, type = 0, depth = 0, lace = 0, plte = null, trns = null;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), tag = buf.toString('latin1', at + 4, at + 8), body = buf.subarray(at + 8, at + 8 + len);
    if (tag === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; type = body[9]; lace = body[12]; }
    else if (tag === 'PLTE') plte = body;
    else if (tag === 'tRNS') trns = body;
    else if (tag === 'IDAT') idat.push(body);
    at += 12 + len;
  }
  if (depth !== 8 || lace) throw new Error(`PNG: глубина ${depth}, чересстрочность ${lace}`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, rows = Buffer.alloc(stride * h);
  for (let y = 0, p = 0; y < h; y++) {
    const f = raw[p++], row = y * stride, up = row - stride;
    for (let x = 0; x < stride; x++, p++) {
      const a = x >= ch ? rows[row + x - ch] : 0, b = y ? rows[up + x] : 0, c = x >= ch && y ? rows[up + x - ch] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      rows[row + x] = (raw[p] + pred) & 255;
    }
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4;
    if (type === 3) { const n = rows[s]; plte.copy(rgba, d, n * 3, n * 3 + 3); rgba[d + 3] = trns && n < trns.length ? trns[n] : 255; }
    else if (type === 2 || type === 6) { rows.copy(rgba, d, s, s + 3); rgba[d + 3] = type === 6 ? rows[s + 3] : 255; }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = rows[s]; rgba[d + 3] = type === 4 ? rows[s + 1] : 255; }
  }
  return { w, h, rgba };
}

// The factor a raster was scaled up by; 1 — it stands on its own grid. Too small a raster proves nothing:
// a flat cap of 24 px (chimney_top.png) falls on a 2 px grid by itself.
const GRID_MIN = 32;
export function upscaled({ w, h, rgba }) {
  const whole = k => {
    for (let y = 0; y < h; y += k) {
      for (let x = 0; x < w; x += k) {
        const a = rgba.readUInt32LE((y * w + x) * 4);
        for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (rgba.readUInt32LE(((y + j) * w + x + i) * 4) !== a) return false;
      }
    }
    return true;
  };
  if (Math.min(w, h) < GRID_MIN) return 1;
  for (const k of [4, 3, 2]) if (!(w % k) && !(h % k) && whole(k)) return k;
  return 1;
}

export function checkImage(img, palette, size) {
  const out = [], { w, h, rgba } = img;
  if (size && (w !== size[0] || h !== size[1])) out.push(`размер ${w}×${h}, в манифесте ${size[0]}×${size[1]}`);
  let off = 0, soft = 0;
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    if (a !== 0 && a !== 255) soft++;
    if (a && !palette.has(rgba[i * 4] << 16 | rgba[i * 4 + 1] << 8 | rgba[i * 4 + 2])) off++;
  }
  if (off) out.push(`вне палитры ${off} px`);
  if (soft) out.push(`полупрозрачных ${soft} px`);
  const k = upscaled(img);
  if (k > 1) out.push(`вне сетки: растр увеличен в ${k} раза`);
  return out;
}

export function manifestAssets(root = ROOT) {
  return MANIFESTS.flatMap(m => JSON.parse(fs.readFileSync(path.join(root, m), 'utf8')).assets)
    .map(a => ({ file: a.file, size: a.size || a.size_px }));
}

export function checkAll(root = ROOT) {
  const palette = readPalette(root), found = [], list = manifestAssets(root);
  for (const a of list) {
    const problems = checkImage(decodePng(fs.readFileSync(path.join(root, a.file))), palette, a.size);
    for (const p of problems) found.push(a.file + ': ' + p);
  }
  return { checked: list.length, found };
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const { checked, found } = checkAll();
  for (const f of found) console.log(f);
  console.log(`проверено ${checked}, находок ${found.length}`);
  process.exitCode = found.length ? 1 : 0;
}
