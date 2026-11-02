// make-font.mjs — the Cyrillic half of the game's pixel font, assets/fonts/alagard_cyrillic.ttf, from
// art_src/fonts_v1/alagard_cyrillic.txt: one glyph a block, a pixel a character. The Latin half is
// Alagard by Hewett Tsoi as published (assets/fonts/alagard.ttf, "Give credit if used"); it has no
// Cyrillic, so these letters are drawn on its grid: em 16 px, caps 11, x-height 8, descender 3. UI.js
// joins both under one family by unicode-range.
//
//   node tools/make-font.mjs          # writes the font
//   node tools/make-font.mjs --check  # exit 1 if the file on disk differs
//
// TrueType written by hand, no packages: every run of ink pixels is a rectangle contour, the
// metrics are Alagard's own (1024 units an em, 64 a pixel), the dates are zero — the same source
// gives the same bytes.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
export const SOURCE = path.join(ROOT, 'art_src', 'fonts_v1', 'alagard_cyrillic.txt');
export const OUT = path.join(ROOT, 'assets', 'fonts', 'alagard_cyrillic.ttf');
const UPEM = 1024, PX = 64, TOP = 12;
// Alagard's vertical metrics, so a line of either half stands the same.
const ASC = 768, DESC = -192, GAP = 92, TYPO = [768, -256, 92], WIN = [768, 192];

// The source -> [{ code, adv, rows: ['..##..', …] from y = TOP down }].
export function parseGlyphs(text) {
  const out = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(l => l && !l.startsWith('# '));   // a row of ink may start with #, a comment with "# "
    if (!lines.length) continue;
    const m = /^U\+([0-9A-F]{4,5}) \S+ (\d+)$/.exec(lines[0]);
    if (!m) throw new Error('bad glyph header: ' + lines[0]);
    const rows = lines.slice(1);
    if (rows.length !== 16 || rows.some(r => !/^[.#]+$/.test(r))) throw new Error('U+' + m[1] + ': 16 rows of . and # expected');
    out.push({ code: parseInt(m[1], 16), adv: Number(m[2]), rows });
  }
  return out.sort((a, b) => a.code - b.code);
}

// Ink as rectangles [x0, y0, x1, y1] in pixels, y up from the baseline: runs of a row, joined
// downward while the run below is the same.
export function rects(rows) {
  const open = new Map(), done = [];
  rows.forEach((row, i) => {
    const y = TOP - i, runs = new Set();
    for (const m of row.matchAll(/#+/g)) runs.add(m.index + ':' + (m.index + m[0].length));
    for (const [k, r] of open) if (!runs.has(k)) { done.push(r); open.delete(k); }
    for (const k of runs) {
      const [a, b] = k.split(':').map(Number);
      if (open.has(k)) open.get(k)[1] = y;
      else open.set(k, [a, y, b, y + 1]);
    }
  });
  return [...done, ...open.values()];
}

function glyphData(rs) {
  if (!rs.length) return { data: Buffer.alloc(0), box: null, points: 0, contours: 0 };
  const pts = rs.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0]].map(([x, y]) => [x * PX, y * PX]));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const n = rs.length, b = Buffer.alloc(10 + 2 * n + 2 + pts.length * 5);
  let o = b.writeInt16BE(n, 0);
  for (const v of box) o = b.writeInt16BE(v, o);
  for (let i = 0; i < n; i++) o = b.writeUInt16BE(i * 4 + 3, o);
  o = b.writeUInt16BE(0, o);                      // no instructions
  for (let i = 0; i < pts.length; i++) b[o++] = 1;   // on the curve, both coordinates as int16 deltas
  let last = 0;
  for (const [x] of pts) { o = b.writeInt16BE(x - last, o); last = x; }
  last = 0;
  for (const [, y] of pts) { o = b.writeInt16BE(y - last, o); last = y; }
  return { data: pad(b), box, points: pts.length, contours: n };
}

const pad = b => b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - b.length % 4)]) : b;

function checksum(b) {
  const p = pad(b);
  let s = 0;
  for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0;
  return s;
}

function table(size, fill) {
  const b = Buffer.alloc(size);
  fill(b);
  return b;
}

// The font file from the parsed glyphs.
export function buildFont(glyphs) {
  const all = [{ code: -1, adv: 8, rows: [] }, ...glyphs];   // glyph 0: .notdef, empty
  const built = all.map(g => ({ ...glyphData(rects(g.rows)), adv: g.adv * PX, code: g.code }));
  const n = built.length, boxes = built.filter(g => g.box).map(g => g.box);
  const xMin = Math.min(...boxes.map(b => b[0])), yMin = Math.min(...boxes.map(b => b[1]));
  const xMax = Math.max(...boxes.map(b => b[2])), yMax = Math.max(...boxes.map(b => b[3]));
  const codes = glyphs.map(g => g.code);

  const glyf = Buffer.concat(built.map(g => g.data));
  const loca = table(4 * (n + 1), b => { let off = 0; built.forEach((g, i) => { b.writeUInt32BE(off, 4 * i); off += g.data.length; }); b.writeUInt32BE(off, 4 * n); });
  const hmtx = table(4 * n, b => built.forEach((g, i) => { b.writeUInt16BE(g.adv, 4 * i); b.writeInt16BE(g.box ? g.box[0] : 0, 4 * i + 2); }));
  const head = table(54, b => {
    b.writeUInt16BE(1, 0); b.writeUInt16BE(0, 2); b.writeUInt32BE(0x00010000, 4);
    b.writeUInt32BE(0, 8);                         // checkSumAdjustment, set below
    b.writeUInt32BE(0x5F0F3CF5, 12); b.writeUInt16BE(0x000B, 16); b.writeUInt16BE(UPEM, 18);
    // created, modified: 0 — the same bytes on every run
    b.writeInt16BE(xMin, 36); b.writeInt16BE(yMin, 38); b.writeInt16BE(xMax, 40); b.writeInt16BE(yMax, 42);
    b.writeUInt16BE(0, 44); b.writeUInt16BE(8, 46); b.writeInt16BE(2, 48); b.writeInt16BE(1, 50); b.writeInt16BE(0, 52);
  });
  const hhea = table(36, b => {
    b.writeUInt32BE(0x00010000, 0); b.writeInt16BE(ASC, 4); b.writeInt16BE(DESC, 6); b.writeInt16BE(GAP, 8);
    b.writeUInt16BE(Math.max(...built.map(g => g.adv)), 10);
    b.writeInt16BE(Math.min(...built.filter(g => g.box).map(g => g.box[0])), 12);
    b.writeInt16BE(Math.min(...built.filter(g => g.box).map(g => g.adv - g.box[2])), 14);
    b.writeInt16BE(Math.max(...built.filter(g => g.box).map(g => g.box[2])), 16);
    b.writeInt16BE(1, 18); b.writeUInt16BE(n, 34);
  });
  const maxp = table(32, b => {
    b.writeUInt32BE(0x00010000, 0); b.writeUInt16BE(n, 4);
    b.writeUInt16BE(Math.max(...built.map(g => g.points)), 6); b.writeUInt16BE(Math.max(...built.map(g => g.contours)), 8);
    b.writeUInt16BE(2, 14);                        // maxZones
  });
  const os2 = table(96, b => {
    b.writeUInt16BE(4, 0);
    b.writeInt16BE(Math.round(built.slice(1).reduce((s, g) => s + g.adv, 0) / (n - 1)), 2);
    b.writeUInt16BE(400, 4); b.writeUInt16BE(5, 6); b.writeUInt16BE(0, 8);
    for (const [at, v] of [[10, 512], [12, 512], [16, 64], [18, 512], [20, 512], [24, 320], [26, 64], [28, 256]]) b.writeInt16BE(v, at);
    b.writeUInt32BE(1 << 9, 42);                   // ulUnicodeRange1: Cyrillic
    b.write('NONE', 58, 'latin1'); b.writeUInt16BE(0x0040, 62);
    b.writeUInt16BE(Math.min(...codes), 64); b.writeUInt16BE(Math.min(0xFFFF, Math.max(...codes)), 66);
    b.writeInt16BE(TYPO[0], 68); b.writeInt16BE(TYPO[1], 70); b.writeInt16BE(TYPO[2], 72);
    b.writeUInt16BE(WIN[0], 74); b.writeUInt16BE(WIN[1], 76);
    b.writeUInt32BE(1 << 2, 78);                   // ulCodePageRange1: 1251
    b.writeInt16BE(8 * PX, 86); b.writeInt16BE(11 * PX, 88); b.writeUInt16BE(0, 90); b.writeUInt16BE(32, 92);
  });
  // cmap: format 4, a segment per code, both the Unicode and the Windows records point at it.
  const segs = [...glyphs.map((g, i) => [g.code, i + 1]), [0xFFFF, 0]];
  const sc = segs.length, sr = 2 * 2 ** Math.floor(Math.log2(sc));
  const sub = table(16 + 8 * sc, b => {
    b.writeUInt16BE(4, 0); b.writeUInt16BE(16 + 8 * sc, 2); b.writeUInt16BE(0, 4);
    b.writeUInt16BE(2 * sc, 6); b.writeUInt16BE(sr, 8); b.writeUInt16BE(Math.log2(sr / 2), 10); b.writeUInt16BE(2 * sc - sr, 12);
    segs.forEach(([c], i) => b.writeUInt16BE(c, 14 + 2 * i));
    segs.forEach(([c], i) => b.writeUInt16BE(c, 16 + 2 * sc + 2 * i));
    segs.forEach(([c, gid], i) => b.writeUInt16BE(c === 0xFFFF ? 1 : (gid - c + 0x10000) & 0xFFFF, 16 + 4 * sc + 2 * i));
    // idRangeOffset: all zero
  });
  const cmap = Buffer.concat([table(20, b => {
    b.writeUInt16BE(0, 0); b.writeUInt16BE(2, 2);
    b.writeUInt16BE(0, 4); b.writeUInt16BE(3, 6); b.writeUInt32BE(20, 8);
    b.writeUInt16BE(3, 12); b.writeUInt16BE(1, 14); b.writeUInt32BE(20, 16);
  }), sub]);
  const names = [[0, 'Cyrillic by Rail Link: Collapse on the grid of Alagard by Hewett Tsoi (Pix3M)'], [1, 'Alagard Cyrillic'], [2, 'Regular'],
    [3, 'RailLink:AlagardCyrillic'], [4, 'Alagard Cyrillic'], [5, 'Version 1.000'], [6, 'AlagardCyrillic']];
  const strs = names.map(([, s]) => Buffer.from(s, 'utf16le').swap16());
  const name = Buffer.concat([table(6 + 12 * names.length, b => {
    b.writeUInt16BE(0, 0); b.writeUInt16BE(names.length, 2); b.writeUInt16BE(6 + 12 * names.length, 4);
    let off = 0;
    names.forEach(([id], i) => {
      const o = 6 + 12 * i;
      b.writeUInt16BE(3, o); b.writeUInt16BE(1, o + 2); b.writeUInt16BE(0x409, o + 4); b.writeUInt16BE(id, o + 6);
      b.writeUInt16BE(strs[i].length, o + 8); b.writeUInt16BE(off, o + 10); off += strs[i].length;
    });
  }), ...strs]);
  const post = table(32, b => { b.writeUInt32BE(0x00030000, 0); b.writeInt16BE(-128, 8); b.writeInt16BE(64, 10); });

  const tables = { 'OS/2': os2, cmap, glyf, head, hhea, hmtx, loca, maxp, name, post };
  const tags = Object.keys(tables).sort();
  const nt = tags.length, es = Math.floor(Math.log2(nt)), tsr = 16 * 2 ** es;
  const dir = Buffer.alloc(12 + 16 * nt);
  dir.writeUInt32BE(0x00010000, 0); dir.writeUInt16BE(nt, 4); dir.writeUInt16BE(tsr, 6); dir.writeUInt16BE(es, 8); dir.writeUInt16BE(nt * 16 - tsr, 10);
  let off = dir.length;
  const body = [];
  tags.forEach((tag, i) => {
    const t = tables[tag], o = 12 + 16 * i;
    dir.write(tag.padEnd(4), o, 'latin1'); dir.writeUInt32BE(checksum(t), o + 4); dir.writeUInt32BE(off, o + 8); dir.writeUInt32BE(t.length, o + 12);
    body.push(pad(t));
    off += pad(t).length;
  });
  const font = Buffer.concat([dir, ...body]);
  const at = dir.readUInt32BE(12 + 16 * tags.indexOf('head') + 8);
  font.writeUInt32BE((0xB1B0AFBA - checksum(font)) >>> 0, at + 8);
  return font;
}

// The codes a TrueType file maps to a glyph: its format 4 cmap (both halves of the family have one).
export function fontCodes(buf) {
  const n = buf.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < n; i++) if (buf.toString('latin1', 12 + 16 * i, 16 + 16 * i) === 'cmap') cmap = buf.readUInt32BE(20 + 16 * i);
  if (cmap < 0) throw new Error('no cmap');
  const codes = new Set();
  for (let i = 0; i < buf.readUInt16BE(cmap + 2); i++) {
    const sub = cmap + buf.readUInt32BE(cmap + 8 + 8 * i);
    if (buf.readUInt16BE(sub) !== 4) continue;
    const segs = buf.readUInt16BE(sub + 6) / 2, ends = sub + 14, starts = ends + 2 * segs + 2;
    const deltas = starts + 2 * segs, offsets = deltas + 2 * segs;
    for (let s = 0; s < segs; s++) {
      const a = buf.readUInt16BE(starts + 2 * s), b = buf.readUInt16BE(ends + 2 * s), ro = buf.readUInt16BE(offsets + 2 * s);
      for (let c = a; c <= b && c !== 0xFFFF; c++) {
        const g = ro ? buf.readUInt16BE(offsets + 2 * s + ro + 2 * (c - a)) : 1;
        if (g) codes.add(c);
      }
    }
  }
  return codes;
}

export function make() {
  return buildFont(parseGlyphs(fs.readFileSync(SOURCE, 'utf8')));
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const font = make();
  if (process.argv.includes('--check')) {
    const same = fs.existsSync(OUT) && fs.readFileSync(OUT).equals(font);
    console.log(same ? 'шрифт совпадает с исходником' : 'шрифт отличается от исходника: node tools/make-font.mjs');
    process.exit(same ? 0 : 1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, font);
  console.log(path.relative(ROOT, OUT) + ': ' + font.length + ' байт, знаков ' + parseGlyphs(fs.readFileSync(SOURCE, 'utf8')).length);
}
