// make-sounds.mjs — the game's sounds in assets/sounds/, synthesized from numbers:
//   step.wav — a footstep: a short thump with a gritty tail (the kit's sample);
//   sfx_*.wav — the events of a run, Game.SOUNDS says which is which;
//   loop_*.wav — wheels, steam and the rumble of the collapse, looped by Game._mix;
//   music_tunnel.wav — the track, 48 s, the same in the menu and in a run.
// Generated — no source file, no licence questions. Other files in assets/sounds are ordinary
// assets — this tool does not touch them. Mood: docs/STYLE.md, cast iron, steam and fire.
// An effect of your own is a few lines here: an oscillator or noise() × an envelope -> writeWav.
// A LOOPED sound must not click at the seam: make the noise and the envelope periodic over the
// loop and run the filter one loop ahead of the part you keep (see loopedNoise).
//
//   node tools/make-sounds.mjs          # writes the files
//   node tools/make-sounds.mjs --check  # exit 1 if a file on disk differs
//
// WAV: PCM 16 bit, mono, 22050 Hz — small files, plenty for effects; 11025 Hz for the rumble and the
// music: they live below 5 kHz, and it halves them. WAV and not mp3: no encoder here, and it loops to
// the sample where an mp3 pads its ends with silence.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'sounds');
const RATE = 22050;
const LOW_RATE = 11025;
const TAU = 2 * Math.PI;

// White noise −1..1 from a seed: the same bytes on every run (a plain LCG, 32 bit).
function noise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x80000000 - 1;
  };
}

// One-pole low-pass: k 0..1, smaller — duller.
function lowpass(k) {
  let y = 0;
  return (x) => (y += k * (x - y));
}

// A footstep, 0.14 s: a sine thump sliding 110 -> 55 Hz plus dull noise, both dying fast.
function step() {
  const n = Math.round(RATE * 0.14), out = new Float64Array(n);
  const rnd = noise(7), lp = lowpass(0.25);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase += 2 * Math.PI * (55 + 55 * Math.exp(-t * 40)) / RATE;
    const attack = Math.min(1, t / 0.004);
    out[i] = attack * (0.8 * Math.sin(phase) * Math.exp(-t * 38) + 0.5 * lp(rnd()) * Math.exp(-t * 55));
  }
  return out;
}

// A looped ambience (wind, blades, a machine), seconds long: dull noise that swells twice per
// loop. The noise sequence and the swell are periodic over the loop, and the filter runs one
// loop ahead of the part that is kept — its state at the end equals its state at the start,
// so the loop point is inaudible.
export function loopedNoise(seconds = 2, seed = 11, cutoff = 0.06, gain = 3.2) {
  const n = Math.round(RATE * seconds), out = new Float64Array(n), seq = new Float64Array(n);
  const rnd = noise(seed), lp = lowpass(cutoff);
  for (let i = 0; i < n; i++) seq[i] = rnd();
  for (let i = 0; i < 2 * n; i++) {
    const v = lp(seq[i % n]);
    if (i < n) continue;
    const swell = Math.sin(2 * Math.PI * (i - n) / n);
    out[i - n] = v * (0.35 + 0.65 * swell * swell) * gain;
  }
  return out;
}

// --- Parts of a sound: each adds itself into `out` at `at` seconds. A buffer with out.loop set takes
// the tail of what runs past its end at its start, so a loop has no seam by construction. ---

const buffer = (sec, rate, loop = false) => Object.assign(new Float64Array(Math.round(sec * rate)), { rate, loop });
const pole = (hz, rate) => 1 - Math.exp(-TAU * hz / rate);

function place(out, at, len, fn) {
  const n = out.length, start = Math.round(at * out.rate), end = out.loop ? Math.min(len, n) : Math.min(len, n - start);
  for (let i = 0; i < end; i++) out[(start + i) % n] += fn(i, i / out.rate);
}

// Struck iron: damped partials [ratio, level, decay 1/s], not harmonic — harmonics would be a note.
const IRON = [[1, 1, 14], [2.76, 0.6, 22], [5.4, 0.35, 38], [8.93, 0.2, 60]];
const BELL = [[1, 1, 2.2], [2.01, 0.5, 3], [3.17, 0.4, 5], [5.4, 0.2, 9]];
const TIN = [[1, 1, 40], [3.1, 0.7, 70], [6.2, 0.4, 120]];

function strike(out, at, f, gain = 1, partials = IRON) {
  for (const [ratio, level, decay] of partials) {
    const w = TAU * f * ratio / out.rate;
    place(out, at, Math.ceil(out.rate * 7 / decay), (i, t) => gain * level * Math.min(1, i / 8) * Math.exp(-decay * t) * Math.sin(w * i));
  }
}

// A low boom: a sine sliding from..to Hz.
function thump(out, at, from, to, slide, decay, gain = 1) {
  let phase = 0;
  place(out, at, Math.ceil(out.rate * 7 / decay), (i, t) => {
    phase += TAU * (to + (from - to) * Math.exp(-t * slide)) / out.rate;
    return gain * Math.min(1, i / 8) * Math.exp(-decay * t) * Math.sin(phase);
  });
}

// Noise between low and high Hz (high may be a function of t): steam, fire, gravel.
function burst(out, at, sec, { seed = 1, low = 200, high = 4000, attack = 0.002, decay = 8, gain = 1 }) {
  const rnd = noise(seed), kLow = pole(low, out.rate);
  let lp = 0, lo = 0;
  place(out, at, Math.round(sec * out.rate), (i, t) => {
    lp += pole(typeof high === 'function' ? high(t) : high, out.rate) * (rnd() - lp);
    lo += kLow * (lp - lo);
    return gain * Math.min(1, t / attack) * Math.exp(-decay * t) * (lp - lo);
  });
}

// A throat: a saw of `harmonics` partials sliding along pitch(t), shaken by noise.
function growl(out, at, sec, pitch, { seed = 1, rough = 0.5, attack = 0.02, decay = 3, gain = 1, harmonics = 12 }) {
  const rnd = noise(seed), wob = lowpass(0.01);
  let phase = 0;
  place(out, at, Math.round(sec * out.rate), (i, t) => {
    phase += TAU * pitch(t) / out.rate;
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin(phase * h) / h;
    return gain * Math.min(1, t / attack) * Math.exp(-decay * t) * v * (1 + rough * 30 * wob(rnd()));
  });
}

// A held note of a machine: harmonics with an attack, a decay and no click at its end.
function note(out, at, f, sec, { harmonics = 8, attack = 0.02, decay = 1.2, gain = 1 }) {
  const n = Math.round(sec * out.rate), w = TAU * f / out.rate, tail = out.rate * 0.05;
  place(out, at, n, (i, t) => {
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin(w * h * i) / h;
    return gain * Math.min(1, t / attack) * Math.min(1, (n - i) / tail) * Math.exp(-decay * t) * v;
  });
}

// Noise between low and high Hz over the whole buffer, periodic: the filters run one loop ahead.
function bed(out, seed, low, high, gain) {
  const n = out.length, seq = new Float64Array(n), rnd = noise(seed);
  for (let i = 0; i < n; i++) seq[i] = rnd();
  const k = pole(high, out.rate), lp = lowpass(k), lp2 = lowpass(k), lo = lowpass(pole(low, out.rate));
  for (let i = 0; i < 2 * n; i++) {
    const x = lp2(lp(seq[i % n])), y = x - lo(x);
    if (i >= n) out[i - n] += y * gain;
  }
}

function leveled(x, peak) {
  const mean = x.reduce((a, v) => a + v, 0) / x.length, top = x.reduce((a, v) => Math.max(a, Math.abs(v - mean)), 1e-9);
  return x.map(v => (v - mean) * peak / top);
}

// Saturation of a signal brought to 1 first: k means the same on every sound.
const drive = (x, k) => Object.assign(leveled(x, 1).map(v => Math.tanh(v * k)), { rate: x.rate });

// An effect ready to play: no step in at its start or out at its end.
function effect(x, peak, sharp = 0.0005) {
  const y = leveled(x, peak), n = y.length, fade = x.rate * 0.012, rise = x.rate * sharp;
  return y.map((v, i) => v * Math.min(1, (i + 1) / rise) * Math.min(1, (n - i) / fade));
}

// A loop ready to play: the piece turned round to a zero crossing. It is periodic, so nothing changes
// but the place of the seam; the browser's resampler sees nothing past the ends of a file and pulls
// them toward zero, so a seam anywhere else clicks after decoding, however smooth it is in the file.
function seamless(x, peak) {
  const y = leveled(x, peak), n = y.length;
  let best = 0, least = Infinity;
  for (let i = 0; i < n; i++) {
    const at = (i + 1) % n, score = Math.abs(y[i]) + Math.abs(y[at]);
    if (score < least) { least = score; best = at; }
  }
  return y.map((_, i) => y[(i + best) % n]);
}

// --- Effects ---

function shot() {
  const x = buffer(0.5, RATE);
  thump(x, 0, 190, 48, 34, 13, 1.1);
  burst(x, 0, 0.12, { seed: 3, low: 500, high: 7000, decay: 42, gain: 2.4 });
  burst(x, 0.01, 0.48, { seed: 4, low: 180, high: 900, decay: 8, gain: 1.1 });
  strike(x, 0.012, 1250, 0.14, TIN);
  return effect(drive(x, 1.8), 0.9);
}

function dryClick() {
  const x = buffer(0.12, RATE);
  strike(x, 0, 1500, 0.8, TIN);
  strike(x, 0.035, 900, 0.5, TIN);
  return effect(x, 0.42);
}

function switchClang() {
  const x = buffer(0.6, RATE);
  strike(x, 0, 410, 1);                      // the lever
  burst(x, 0.02, 0.1, { seed: 5, low: 900, high: 5000, decay: 30, gain: 1.4 });
  strike(x, 0.14, 245, 1.2);                 // the points going over
  thump(x, 0.14, 120, 60, 40, 16, 0.7);
  return effect(drive(x, 1.3), 0.78);
}

function pickup() {
  const x = buffer(0.32, RATE);
  strike(x, 0, 880, 0.8, TIN);
  strike(x, 0.07, 1320, 1, IRON.map(([r, l, d]) => [r, l, d * 1.6]));
  thump(x, 0, 150, 80, 40, 22, 0.5);
  return effect(x, 0.62);
}

function shield() {
  const x = buffer(0.95, RATE);
  strike(x, 0, 148, 1.2, BELL);
  strike(x, 0.005, 523, 0.5);
  thump(x, 0, 150, 52, 26, 8, 1);
  burst(x, 0, 0.2, { seed: 6, low: 700, high: 5000, decay: 22, gain: 1 });
  return effect(drive(x, 1.6), 0.85);
}

function rescue() {
  const x = buffer(0.95, RATE);
  burst(x, 0, 0.95, { seed: 7, low: 700, high: 6000, attack: 0.06, decay: 3.2, gain: 3 });
  for (const [at, f] of [[0.04, 300], [0.13, 340], [0.22, 280]]) strike(x, at, f, 0.9);
  thump(x, 0.04, 110, 55, 20, 7, 0.7);
  return effect(x, 0.8, 0.01);
}

function demonShow() {
  const x = buffer(0.75, RATE);
  growl(x, 0, 0.75, t => 66 + 34 * Math.sin(t * 6), { seed: 8, rough: 0.8, attack: 0.08, decay: 2.2, gain: 0.9 });
  burst(x, 0, 0.75, { seed: 9, low: 1200, high: 5000, attack: 0.1, decay: 5, gain: 1.6 });
  return effect(drive(x, 2), 0.72, 0.01);
}

function demonLeap() {
  const x = buffer(0.5, RATE);
  growl(x, 0, 0.5, t => 240 + 1300 * t * t + 180 * t, { seed: 10, rough: 0.6, attack: 0.01, decay: 1.2, gain: 0.7, harmonics: 7 });
  burst(x, 0, 0.5, { seed: 11, low: 500, high: t => 1500 + 9000 * t, attack: 0.05, decay: 3, gain: 1.8 });
  return effect(drive(x, 2.2), 0.72, 0.005);
}

function demonDown() {
  const x = buffer(0.65, RATE);
  growl(x, 0, 0.45, t => 520 * Math.exp(-t * 6) + 62, { seed: 12, rough: 0.7, attack: 0.004, decay: 5, gain: 0.8, harmonics: 9 });
  thump(x, 0, 130, 45, 22, 9, 0.9);
  burst(x, 0.05, 0.6, { seed: 13, low: 900, high: 7000, attack: 0.02, decay: 7, gain: 1.8 });     // the ash
  return effect(drive(x, 1.8), 0.82);
}

function crashHit() {
  const x = buffer(0.8, RATE);
  thump(x, 0, 150, 38, 20, 6, 1.4);
  burst(x, 0, 0.3, { seed: 14, low: 300, high: 4000, decay: 16, gain: 2.6 });
  strike(x, 0, 190, 0.9);
  strike(x, 0.03, 317, 0.7);
  strike(x, 0.09, 233, 0.6);
  return effect(drive(x, 2.2), 0.9);
}

function lava() {
  const x = buffer(1.05, RATE);
  burst(x, 0, 1.05, { seed: 15, low: 1400, high: 7500, attack: 0.02, decay: 3.2, gain: 3 });      // the hiss on iron
  burst(x, 0, 1.05, { seed: 16, low: 90, high: 500, attack: 0.03, decay: 2.6, gain: 2.2 });       // the roar
  thump(x, 0, 110, 44, 18, 7, 1);
  for (const [at, f] of [[0.1, 170], [0.24, 120], [0.37, 210], [0.55, 140]]) thump(x, at, f, f * 0.6, 40, 24, 0.5);   // the boil
  return effect(drive(x, 1.6), 0.86);
}

function fall() {
  const x = buffer(1.5, RATE);
  burst(x, 0, 1.1, { seed: 17, low: 260, high: t => 4200 * Math.exp(-t * 2.6) + 260, attack: 0.12, decay: 1.1, gain: 3.6 });
  growl(x, 0, 1.1, t => 170 * Math.exp(-t * 1.5) + 42, { seed: 18, rough: 0.3, attack: 0.1, decay: 1.2, gain: 0.32, harmonics: 8 });
  thump(x, 1.02, 110, 34, 12, 5, 1.5);       // the bottom
  burst(x, 1.02, 0.46, { seed: 19, low: 150, high: 1800, decay: 6, gain: 3 });
  return effect(drive(x, 1.7), 0.88, 0.01);
}

function caught() {
  const x = buffer(1.6, RATE), rnd = noise(20);
  thump(x, 0, 120, 30, 9, 2.4, 1.6);
  burst(x, 0, 1.6, { seed: 21, low: 90, high: 1300, attack: 0.04, decay: 2, gain: 4 });
  for (let i = 0; i < 14; i++) {             // the blocks
    const at = 0.02 + 1.2 * (i / 14) ** 1.4, f = 70 + 80 * (rnd() + 1);
    thump(x, at, f, f * 0.5, 30, 18, 0.7);
    strike(x, at, 170 + 130 * (rnd() + 1), 0.22);
  }
  return effect(drive(x, 2.2), 0.9);
}

// The collapse starts far behind: a heavy blow in the dark, then stone going on and on.
function collapseStart() {
  const x = buffer(2.2, RATE), rnd = noise(90);
  thump(x, 0, 80, 26, 7, 1.8, 1.5);
  burst(x, 0, 2.2, { seed: 91, low: 50, high: 520, attack: 0.05, decay: 1.5, gain: 4.2 });
  for (let i = 0; i < 9; i++) {              // the blocks, farther and farther apart
    const at = 0.25 + 1.7 * (i / 9) ** 1.5, f = 55 + 40 * (rnd() + 1);
    thump(x, at, f, f * 0.55, 26, 14, 0.5 * (1 - i / 14));
  }
  return effect(drive(x, 1.8), 0.82, 0.01);
}

// A demon lands on the cab: a thud on iron and claws scraping down it.
function demonHang() {
  const x = buffer(0.6, RATE);
  thump(x, 0, 150, 60, 22, 11, 1.1);
  strike(x, 0.01, 260, 0.45);
  burst(x, 0.05, 0.5, { seed: 95, low: 1800, high: 6500, attack: 0.02, decay: 5, gain: 1.8 });
  return effect(drive(x, 1.5), 0.8);
}

function continued() {
  const x = buffer(0.85, RATE);
  burst(x, 0, 0.85, { seed: 22, low: 500, high: t => 1000 + 6000 * t, attack: 0.25, decay: 2.2, gain: 3.4 });
  thump(x, 0.02, 80, 44, 12, 6, 0.9);
  strike(x, 0.3, 210, 0.5);
  return effect(x, 0.7, 0.01);
}

function station() {
  const x = buffer(1.3, RATE);
  note(x, 0, 1046, 0.7, { harmonics: 4, attack: 0.06, decay: 3.4, gain: 0.4 });     // the brakes
  note(x, 0, 1077, 0.7, { harmonics: 3, attack: 0.08, decay: 3.8, gain: 0.3 });
  burst(x, 0.2, 1.1, { seed: 23, low: 900, high: 6500, attack: 0.1, decay: 3, gain: 2.2 });
  strike(x, 0.5, 622, 0.9, BELL);
  strike(x, 0.86, 622, 0.7, BELL);
  return effect(x, 0.74, 0.01);
}

function depart() {
  const x = buffer(1.15, RATE);
  note(x, 0, 392, 1.1, { harmonics: 5, attack: 0.07, decay: 0.5, gain: 0.5 });      // the whistle
  note(x, 0, 466, 1.1, { harmonics: 5, attack: 0.09, decay: 0.5, gain: 0.45 });
  burst(x, 0, 1.15, { seed: 24, low: 1500, high: 7000, attack: 0.1, decay: 1.5, gain: 1.1 });
  return effect(x, 0.72, 0.01);
}

function coin() {
  const x = buffer(0.13, RATE);
  strike(x, 0, 1760, 1, TIN);
  return effect(x, 0.36);
}

function bought() {
  const x = buffer(0.3, RATE);
  strike(x, 0, 300, 1);
  strike(x, 0.06, 1400, 0.5, TIN);
  thump(x, 0, 130, 65, 40, 18, 0.8);
  return effect(x, 0.66);
}

function button() {
  const x = buffer(0.1, RATE);
  strike(x, 0, 640, 1, TIN);
  burst(x, 0, 0.03, { seed: 25, low: 800, high: 5000, decay: 90, gain: 1.2 });
  return effect(x, 0.46);
}

// --- Loops: rate 1 is the train at the speed of the start of a run ---

// Two rail joints per loop, each hit twice: the front and the back bogie.
function wheels() {
  const x = buffer(1.6, RATE, true);
  bed(x, 26, 60, 900, 1.6);
  [[0, 1], [0.13, 0.8], [0.8, 0.92], [0.93, 0.74]].forEach(([at, gain], i) => {
    thump(x, at, 170, 80, 60, 30, gain);
    burst(x, at, 0.07, { seed: 27 + i, low: 300, high: 2600, decay: 55, gain: 1.8 * gain });
    strike(x, at + 0.004, 460, 0.1 * gain);
  });
  return seamless(drive(x, 1.4), 0.8);
}

// Four chuffs per loop, the first of a pair stronger, on a bed of leaking steam.
function steam() {
  const x = buffer(2, RATE, true);
  bed(x, 31, 1500, 7000, 0.5);
  [1, 0.65, 0.85, 0.55].forEach((gain, i) => {
    burst(x, i * 0.5, 0.48, { seed: 32 + i, low: 450, high: 5200, attack: 0.03, decay: 9, gain: 3.6 * gain });
  });
  return seamless(x, 0.78);
}

// Falling rock: a bed that swells twice per loop and blocks at uneven places.
function rumble() {
  const x = buffer(5, LOW_RATE, true), rnd = noise(36);
  bed(x, 37, 28, 240, 14);
  bed(x, 38, 200, 800, 1.4);
  for (let i = 0; i < x.length; i++) x[i] *= 0.72 + 0.28 * Math.sin(TAU * 2 * i / x.length);
  for (let i = 0; i < 9; i++) {
    const f = 55 + 30 * (rnd() + 1);
    thump(x, (rnd() + 1) * 2.5, f, f * 0.55, 18, 9, 0.8);
  }
  return seamless(drive(x, 1.5), 0.85);
}

// --- Music: 16 bars of 3 s, D phrygian. Everything is struck or starts inside the buffer, so its
// tail wraps round; what runs through the whole piece has a whole number of periods in it. ---

const BAR = 3, BARS = 16, MUSIC_SEC = BAR * BARS;

function music() {
  const x = buffer(MUSIC_SEC, LOW_RATE, true), n = x.length;
  // The furnace under it all: two low saws breathing against each other.
  for (const [f, cycles, gain] of [[36.71, 3, 0.2], [55, 5, 0.12]]) {
    const w = TAU * Math.round(f * MUSIC_SEC) / n, swell = TAU * cycles / n;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let h = 1; h <= 9; h++) v += Math.sin(w * h * i) / h;
      x[i] += gain * (0.7 + 0.3 * Math.sin(swell * i)) * v;
    }
  }
  bed(x, 40, 300, 1800, 0.5);                // the draught in the tunnel

  const ROOTS = [73.42, 73.42, 77.78, 65.41, 73.42, 73.42, 58.27, 55];
  const PADS = [[146.83, 174.61, 220], [155.56, 196, 233.08], [116.54, 146.83, 174.61], [110, 130.81, 164.81]];
  for (let bar = 0; bar < BARS; bar++) {
    const at = bar * BAR, part = bar >> 2, root = ROOTS[bar % ROOTS.length];
    note(x, at, root * 2, 1.9, { harmonics: 7, attack: 0.015, decay: 1.5, gain: 0.5 });
    note(x, at + 2.25, root * 2, 0.7, { harmonics: 7, attack: 0.015, decay: 2.4, gain: 0.34 });
    thump(x, at, 150, 58, 22, 9, 0.6);       // the steam hammer
    thump(x, at + 1.5, 150, 58, 22, 9, 0.48);
    if (part >= 1) strike(x, at + 0.75, 311, 0.5);        // the anvil comes in
    if (part >= 1) strike(x, at + 2.25, 293, 0.56);
    if (part >= 3) for (let k = 0; k < 8; k++) if ((0b10110110 >> k) & 1) strike(x, at + k * 0.375 + 0.1875, 622, 0.07, TIN);    // the chain
    if (bar % 4 === 3) burst(x, at + 1.5, 1.5, { seed: 41 + bar, low: 700, high: 3600, attack: 0.2, decay: 2, gain: 1 });       // the valve
  }
  // The organ of the place: one dark chord per four bars, swelling and dying.
  PADS.forEach((chord, i) => {
    const N = Math.round((4 * BAR + 3) * LOW_RATE);
    for (const f of chord) {
      const w = TAU * f / LOW_RATE;
      place(x, i * 4 * BAR, N, (s) => 0.2 * Math.sin(Math.PI * s / N) ** 2
        * (Math.sin(w * s) + 0.5 * Math.sin(2 * w * s) + 0.3 * Math.sin(3 * w * s) + 0.12 * Math.sin(5 * w * s)));
    }
  });
  return seamless(drive(x, 0.9), 0.82);
}

// Samples −1..1 -> the bytes of a WAV file.
// grain: samples rounded to this step. Zeros in the low bits are what the archive's deflate can
// take: music at 16 — a quarter of its size under a noise floor of −66 dB.
function writeWav(samples, rate = RATE, grain = 1) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767 / grain) * grain, i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8, 'latin1');
  head.writeUInt32LE(16, 16);          // fmt chunk size
  head.writeUInt16LE(1, 20);           // PCM
  head.writeUInt16LE(1, 22);           // mono
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);    // bytes per second
  head.writeUInt16LE(2, 32);           // bytes per sample frame
  head.writeUInt16LE(16, 34);          // bits
  head.write('data', 36, 'latin1');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// File name -> bytes. Only what this tool owns: other files in assets/sounds are left alone.
function buildSounds() {
  return {
    'step.wav': writeWav(step()),
    'sfx_shot.wav': writeWav(shot()),
    'sfx_dry.wav': writeWav(dryClick()),
    'sfx_switch.wav': writeWav(switchClang()),
    'sfx_pickup.wav': writeWav(pickup()),
    'sfx_shield.wav': writeWav(shield()),
    'sfx_rescue.wav': writeWav(rescue()),
    'sfx_demon_show.wav': writeWav(demonShow()),
    'sfx_demon_leap.wav': writeWav(demonLeap()),
    'sfx_demon_hang.wav': writeWav(demonHang()),
    'sfx_demon_down.wav': writeWav(demonDown()),
    'sfx_hit.wav': writeWav(crashHit()),
    'sfx_lava.wav': writeWav(lava()),
    'sfx_fall.wav': writeWav(fall()),
    'sfx_caught.wav': writeWav(caught()),
    'sfx_collapse.wav': writeWav(collapseStart()),
    'sfx_continue.wav': writeWav(continued()),
    'sfx_station.wav': writeWav(station()),
    'sfx_depart.wav': writeWav(depart()),
    'sfx_coin.wav': writeWav(coin()),
    'sfx_bought.wav': writeWav(bought()),
    'sfx_button.wav': writeWav(button()),
    'loop_wheels.wav': writeWav(wheels()),
    'loop_steam.wav': writeWav(steam()),
    'loop_rumble.wav': writeWav(rumble(), LOW_RATE),
    'music_tunnel.wav': writeWav(music(), LOW_RATE, 16),
  };
}

export { buildSounds, OUT_DIR, RATE };

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const sounds = buildSounds(), check = process.argv.includes('--check');
  let differs = false;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, bytes] of Object.entries(sounds)) {
    const file = path.join(OUT_DIR, name);
    if (check) {
      const same = fs.existsSync(file) && fs.readFileSync(file).equals(bytes);
      console.log(name + (same ? ' is up to date' : ' differs from the generator'));
      differs = differs || !same;
    } else {
      fs.writeFileSync(file, bytes);
      console.log(`${path.relative(ROOT, file).split(path.sep).join('/')}: ${bytes.length} bytes, ${((bytes.length - 44) / 2 / bytes.readUInt32LE(24)).toFixed(2)} s`);
    }
  }
  if (check) process.exit(differs ? 1 : 0);
}
