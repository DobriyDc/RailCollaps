// tuner.js — the tuner page: the real game in a phone-sized iframe, sliders beside it. Every number
// shown is read from the running game: the camera through View3D, the frame through Game._frameNow.
// The game knows nothing about this page; the run is kept alive from outside.

const $ = id => /** @type {any} */ (document.getElementById(id));
const CAM_FIELDS = KIT_SCHEMA.flatMap(g => g.fields).filter(f => f.name.startsWith('COLLAPSE_CAM_'));
const REF_FIELD = { name: 'UI_REF_HEIGHT', min: 480, max: 1080, step: 10, label: { ru: 'Общий масштаб: высота макета (px, меньше — крупнее)' } };
const UI_FIELDS = [
    { key: 'top', min: 40, max: 120, step: 1, label: 'Верхняя плашка (px макета)' },
    { key: 'bottom', min: 60, max: 160, step: 1, label: 'Нижняя плашка (px макета)' },
    { key: 'icon', min: 20, max: 60, step: 1, label: 'Иконка (px макета)' },
];

const state = {
    /** @type {Record<string, number>} */
    constants: {},
    /** @type {Record<string, number>} */
    code: {},
    ui: { top: 0, bottom: 0, icon: 0 },
    uiCode: { top: 0, bottom: 0, icon: 0 },
    size: [390, 844],
    inset: 0,
    paused: false,
    latency: 0,
    /** @type {any} */
    numbers: null,
};
/** @type {any} */ let frameWin = null;
/** @type {any} */ let app = null;
/** @type {any[]} */ let layoutCode = [];
/** @type {Map<string, { input: any, out: any, text: (v: number) => string }>} */
const sliders = new Map();
const lexical = name => frameWin.eval(name);     // the game's const and class are not window fields

function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('on'), 2600);
}
toast.timer = 0;

// --- Applying ---------------------------------------------------------------------------------

function applyNumbers() {
    for (const [name, value] of Object.entries(state.constants)) frameWin[name] = value;
    app.scene.applyCamera();
    const ui = lexical('UI');
    for (const [id, field, value] of TunerCore.uiEdits(state.ui)) {
        const e = ui.get(id);
        if (e && e.def[field] !== value) { e.def[field] = value; e.apply(); }
    }
    frameWin.document.documentElement.style.setProperty('--tg-safe-area-inset-top', state.inset + 'px');
    ui.resize();
    app.game._frame = null;       // the frame box and the tilt are counted once per size: count them again
    measure();
}

// The next rendered frame after an input: what the slider's response is.
function timeResponse(from) {
    app.scene.scene.onAfterRenderObservable.addOnce(() => {
        state.latency = performance.now() - from;
        $('latency').textContent = 'Отклик ' + Math.round(state.latency) + ' мс';
    });
}

function measure() {
    const game = app.game, scene = app.scene, view = scene.view, S = scene.constructor, ui = lexical('UI');
    const f = game._frameNow();
    view.refreshMatrices();
    const canvas = scene.canvas, W = canvas.clientWidth, H = canvas.clientHeight, cam = view.camera;
    const edge = (id, side) => ui.get(id).el.getBoundingClientRect()[side];
    const top = edge('frameTop', 'bottom'), bottom = edge('frameBottom', 'top'), strip = edge('iconStrip', 'top');
    // A sign's offset from the camera, the camera settled: from the middle lane and from a side lane.
    const shift = S.LANE_W * scene.signShift, offsets = [shift, S.LANE_W * (1 - scene.camFollow) - shift];
    const far = cam.position.z / S.SEG;
    const reachAt = (off, h, low, grid) => TunerCore.entry(seg => {
        const p = view.projectToScreen(cam.position.x + off, seg * S.SEG, h);
        return !p.behind && p.y >= top && p.y <= low && p.x >= 0 && p.x <= W;
    }, far, grid);
    const reach = (low, grid) => Math.min(...offsets.map(off => reachAt(off, TunerCore.SIGN_H, low, grid)));
    const c = game.run.c, slow = c.speedMax, fast = c.speedMax * c.boostMult;
    const signSeg = reach(bottom, 32), clearSeg = reach(strip, 64);
    const trainTop = view.projectToScreen(scene.train.position.x, 0, S.LOCO_TOP), trainFoot = view.projectToScreen(scene.train.position.x, 0, 0);
    const table = game.constructor.frameTable(f.cam, 0);
    state.numbers = {
        slow, fast, signSeg, clearSeg, floorSeg: reachAt(0, 0, bottom, 32),
        signSlow: signSeg / slow, signFast: signSeg / fast, clearSlow: clearSeg / slow, clearFast: clearSeg / fast,
        gapSide: table.gap[0], gapMid: table.gap[1],
        trainPct: (trainFoot.y - trainTop.y) / H * 100, bottomPct: (H - bottom) / H * 100, clearTop: trainTop.y - top,
    };
    showNumbers(state.numbers);
}

function showNumbers(n) {
    const N = TunerCore.num;
    const rows = [
        ['Обзор, пол', N(n.floorSeg) + ' сегм.'],
        ['Провал сбоку / в центре', N(n.gapSide, 3) + ' / ' + N(n.gapMid, 3)],
        ['Табличка в кадре', N(n.signSeg) + ' сегм.'],
        ['Табличка на ' + N(n.slow), N(n.signSlow) + ' с', n.signSlow],
        ['Табличка на ' + N(n.fast), N(n.signFast) + ' с', n.signFast],
        ['Выше иконок', N(n.clearSlow) + ' / ' + N(n.clearFast) + ' с', Math.min(n.clearSlow, n.clearFast)],
        ['Поезд, высота кадра', N(n.trainPct, 1) + ' %'],
        ['Нижняя панель', N(n.bottomPct, 1) + ' %'],
        ['Над паровозом', N(n.clearTop, 1) + ' px'],
    ];
    $('numbers').replaceChildren(...rows.map(([label, value, sec]) => {
        const row = document.createElement('div');
        row.className = 'num' + (sec !== undefined && sec < TunerCore.RED_SEC ? ' bad' : '');
        const a = document.createElement('span'), b = document.createElement('b');
        a.textContent = label;
        b.textContent = value;
        row.append(a, b);
        return row;
    }));
}

// --- Controls ---------------------------------------------------------------------------------

function slider(host, key, f, label, read, write) {
    const row = document.createElement('label');
    row.className = 'slider';
    const title = document.createElement('span'), out = document.createElement('output'), input = document.createElement('input');
    title.textContent = label;
    input.type = 'range';
    input.min = f.min; input.max = f.max; input.step = f.step;
    const text = v => String(Math.round(v * 1000) / 1000).replace('.', ',');
    input.addEventListener('input', e => {
        const from = performance.now(), v = Number(input.value);
        write(v);
        syncSliders();
        applyNumbers();
        timeResponse(from);
        e.stopPropagation();
    });
    row.append(title, out, input);
    host.appendChild(row);
    sliders.set(key, { input, out, text });
    return read;
}

const masterValue = () => Math.round(state.code.COLLAPSE_CAM_Z / state.constants.COLLAPSE_CAM_Z * 100) / 100;

function syncSliders() {
    const value = key => key === 'master' ? masterValue() : key.startsWith('ui:') ? state.ui[key.slice(3)] : state.constants[key];
    for (const [key, s] of sliders) {
        const v = value(key);
        if (Number(s.input.value) !== v) s.input.value = v;
        s.out.textContent = s.text(v);
    }
}

function buildControls() {
    slider($('master'), 'master', { min: 0.5, max: 2, step: 0.01 }, 'Крупность поезда (ведёт высоту и дистанцию)', null,
        k => Object.assign(state.constants, TunerCore.master(k, state.code)));
    for (const f of CAM_FIELDS) slider($('camera'), f.name, f, f.label.ru + ' · ' + f.name, null, v => { state.constants[f.name] = v; });
    slider($('interface'), REF_FIELD.name, REF_FIELD, REF_FIELD.label.ru, null, v => { state.constants[REF_FIELD.name] = v; });
    for (const f of UI_FIELDS) slider($('interface'), 'ui:' + f.key, f, f.label, null, v => { state.ui[f.key] = v; });

    const chips = (host, items, label, pick, isOn) => {
        for (const item of items) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label(item);
            b.addEventListener('click', () => { pick(item); for (const c of host.children) c.classList.toggle('on', c === b); });
            b.classList.toggle('on', isOn(item));
            host.appendChild(b);
        }
    };
    chips($('sizes'), TunerCore.SIZES, s => s[0] + '×' + s[1], setSize, s => s[0] === state.size[0]);
    chips($('insets'), TunerCore.INSETS, i => i + ' px', setInset, i => i === state.inset);

    $('pause').addEventListener('click', togglePause);
    $('left').addEventListener('click', () => changeLane(-1));
    $('right').addEventListener('click', () => changeLane(1));
    $('demon').addEventListener('click', showDemon);
    $('reset').addEventListener('click', reset);
    $('copy').addEventListener('click', copySettings);
    $('save').addEventListener('click', saveSettings);
    $('sheet').addEventListener('click', () => {
        document.body.classList.toggle('folded');
        fitPhone();
    });
}

function setSize(size) {
    state.size = size;
    const frame = $('game');
    frame.style.width = size[0] + 'px';
    frame.style.height = size[1] + 'px';
    fitPhone();          // the frame's own resize event reaches main.js, then applyNumbers (boot)
}

function setInset(px) {
    state.inset = px;
    applyNumbers();
}

function fitPhone() {
    const stage = $('stage'), [w, h] = state.size;
    const k = Math.min(1, stage.clientWidth / w, stage.clientHeight / h);
    $('game').style.transform = 'scale(' + k + ')';
    $('phone').style.width = w * k + 'px';
    $('phone').style.height = h * k + 'px';
}

function reset() {
    state.constants = Object.assign({}, state.code);
    state.ui = Object.assign({}, state.uiCode);
    syncSliders();
    applyNumbers();
    toast('Значения из кода');
}

// --- The run ----------------------------------------------------------------------------------

function togglePause() {
    const game = app.game;
    state.paused = !state.paused;
    game.mode = state.paused ? 'pause' : 'play';      // no pause dialog: it would cover the frame being tuned
    $('pause').textContent = state.paused ? 'Дальше' : 'Пауза';
    measure();
}

// The lanes change at once, fork or no fork. On pause there is no time to run the crossing: jump.
function changeLane(dir) {
    const run = app.game.run, to = Math.max(0, Math.min(2, run.lane + dir));
    if (to === run.lane) return;
    run.armed = null;
    run.prevLane = run.lane;
    run.lane = to;
    run.switchAt = run.pos;
    run.events.push({ type: 'switched', at: Math.floor(run.pos), to });
    if (state.paused) {
        run.switchAt = run.pos - lexical('CollapseRules').SWITCH_LEN;
        app.scene._camSnap = true;
    }
}

// A pair from both walls; on pause it hangs late in the leap, clear of the loco, where it can be looked at.
function showDemon() {
    const run = app.game.run;
    for (const side of [-1, 1]) {
        if (run.demons.some(d => d.side === side)) continue;
        run.demons.push({ at: Math.floor(run.pos), side, wait: 0, t: run.c.demonSec * (state.paused ? 0.15 : 1) });
        run.events.push({ type: 'demon', at: Math.floor(run.pos), side });
    }
}

// The train does not die, the switches never run dry, the collapse stays behind: from outside the rules.
function keepAlive() {
    const game = app.game, run = game.run;
    if (run.invuln < 1e6) run.invuln = 1e9;
    if (run.ammo < 8) run.ammo = 8;
    if (run.pos - run.front < 3) run.front = run.pos - 3;
    if (game.mode === 'pause' && !state.paused) game.setPaused(false);    // the tab was hidden: Game paused itself
}

// --- Saving -----------------------------------------------------------------------------------

async function copySettings() {
    const text = TunerCore.settingsText(state), box = $('copybox');
    box.value = text;
    box.hidden = false;
    let done = false;
    try {
        await navigator.clipboard.writeText(text);
        done = true;
    } catch {
        box.select();
        try { done = document.execCommand('copy'); } catch { /* the text stays in the box, selected */ }
    }
    toast(done ? 'Скопировано: пришли в чат' : 'Выдели текст ниже и скопируй');
}

async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
}

async function saveSettings() {
    const changes = TunerCore.changes(state.constants, state.code);
    const layoutDirty = UI_FIELDS.some(f => state.ui[f.key] !== state.uiCode[f.key]);
    if (!changes.length && !layoutDirty) { toast('Всё уже как в коде'); return; }
    try {
        if (changes.length) {
            const r = await post('/api/save-constants', { changes });
            if (!r.ok) throw new Error(r.error || (r.results || []).filter(x => !x.ok).map(x => x.name + ': ' + x.error).join('; '));
        }
        if (layoutDirty) {
            const elements = TunerCore.layoutWith(layoutCode, state.ui);
            const r = await post('/api/save-ui', { elements });
            if (!r.ok) throw new Error(r.error);
            layoutCode = elements;
        }
        state.code = Object.assign({}, state.constants);
        state.uiCode = Object.assign({}, state.ui);
        syncSliders();
        toast('Записано: Constants.js' + (layoutDirty ? ', UILayout.js' : ''));
    } catch (e) {
        toast('Не записалось: ' + e.message);
        console.warn('tuner save:', e);
    }
}

// Saving needs the editor's server, which serves this page from its root. On Pages nothing is asked:
// a failed request would be a console error on every open.
async function findServer() {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !location.pathname.startsWith('/_utils/tuner')) return;
    const status = await fetch('/api/status').then(r => r.json()).catch(() => null);
    if (status && status.editor === 'arcengine') $('save').hidden = false;
}

// --- Boot -------------------------------------------------------------------------------------

async function text(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(url + ': ' + r.status);
    return r.text();
}

async function boot() {
    const [index, constants, layoutSrc] = await Promise.all([text('../../index.html'), text('../../js/Constants.js'), text('../../js/UILayout.js')]);
    layoutCode = new Function(layoutSrc + '\nreturn UI_LAYOUT;')();
    const frame = $('game');
    setSize(state.size);
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    frame.srcdoc = TunerCore.page(index, constants, new URL('../../', location.href).href);
    await loaded;
    frameWin = frame.contentWindow;
    app = frameWin.app;
    if (!app) throw new Error('игра не запустилась');
    await app.scene.ready;

    frameWin.COLLAPSE_CAM_Z = frameWin.TUNER_CODE_Z;
    for (const f of [...CAM_FIELDS, REF_FIELD]) state.code[f.name] = frameWin[f.name];
    state.constants = Object.assign({}, state.code);
    state.uiCode = TunerCore.uiValues(layoutCode);
    state.ui = Object.assign({}, state.uiCode);

    lexical('Sound3D').setMuted(true);
    app.game.start();
    keepAlive();
    const pauseBtn = lexical('UI').get('pauseBtn');
    if (pauseBtn) pauseBtn.onClick(togglePause);
    setInterval(keepAlive, 200);
    frameWin.addEventListener('resize', applyNumbers);
    new ResizeObserver(fitPhone).observe($('stage'));

    buildControls();
    syncSliders();
    applyNumbers();
    await findServer();
    $('latency').textContent = 'Отклик появится после первого ползунка';
    document.body.classList.add('ready');
}

boot().catch(e => {
    console.error(e);
    $('latency').textContent = 'Не запустилось: ' + e.message;
});
window.tuner = { state, setSize, setInset, applyNumbers };   // for the console and the QA scripts
