// tuner-core.js — the camera and interface tuner without DOM: the page around the real game, what
// the sliders write, what is saved or copied. tuner.js drives the page; tests/tuner.test.mjs runs this
// file in node.

/** @satisfies {Record<string, any>} */
const TunerCore = {
    SIZES: [[320, 568], [360, 640], [390, 844], [412, 915], [430, 932]],
    INSETS: [0, 48, 92],                // px of the Telegram safe area at the top
    BOOT_Z: 4000,                       // the scene's segment window is built once: for the farthest camera of the slider
    RED_SEC: 0.6,                       // below this reaction time a number goes red
    SIGN_H: 70,                         // height of a fork sign's tap target, as in CollapseScene.tapTargets
    CONSTANTS_TAG: '<script src="js/Constants.js"></script>',

    // The game's own index.html, so there is no second list of scripts. Constants.js goes inline with
    // top-level const -> var (as _utils/editor/loader.js): lexical constants could not be changed live.
    page(indexHtml, constantsSrc, baseUrl) {
        if (!indexHtml.includes(this.CONSTANTS_TAG) || !indexHtml.includes('<head>')) throw new Error('index.html: нет места для настройщика');
        const src = constantsSrc.replace(/^﻿/, '').replace(/^const\s+/gm, 'var ').replace(/<\/script/gi, '<\\/script');
        const inline = '<script>' + src + '\nvar TUNER_CODE_Z = COLLAPSE_CAM_Z;\nCOLLAPSE_CAM_Z = ' + this.BOOT_Z + ';\n</' + 'script>';
        return indexHtml.replace('<head>', () => '<head>\n    <base href="' + baseUrl + '">').replace(this.CONSTANTS_TAG, () => inline);
    },

    // The master slider: k times closer than the code's camera, so the train is about k times bigger.
    // The tilt follows by itself (CollapseScene.fitFrame), k = 1 gives back the code's numbers exactly.
    master(k, code) {
        if (k === 1) return { COLLAPSE_CAM_Y: code.COLLAPSE_CAM_Y, COLLAPSE_CAM_Z: code.COLLAPSE_CAM_Z };
        return { COLLAPSE_CAM_Y: Math.round(code.COLLAPSE_CAM_Y / k), COLLAPSE_CAM_Z: Math.round(code.COLLAPSE_CAM_Z / k) };
    },

    // What the interface sliders mean in UILayout.js records: [id, field, value].
    uiEdits(ui) {
        const next = Math.round(ui.icon * 26 / 36), wall = Math.round(ui.icon * 32 / 36);
        const out = [['frameTop', 'h', ui.top], ['frameBottom', 'h', ui.bottom], ['iconStrip', 'y', ui.bottom], ['iconStrip', 'h', ui.icon + 12]];
        for (const l of [0, 1, 2]) {
            for (const f of ['w', 'h']) out.push(['iconLane' + l, f, ui.icon], ['iconLane' + l + 'Next', f, next]);
        }
        for (const id of ['iconWallLeft', 'iconWallRight']) for (const f of ['w', 'h']) out.push([id, f, wall]);
        return out;
    },

    // The slider values the layout holds: the inverse of uiEdits.
    uiValues(layout) {
        const rec = id => layout.find(d => d.id === id);
        return { top: rec('frameTop').h, bottom: rec('frameBottom').h, icon: rec('iconLane0').w };
    },

    // A copy of the layout with the interface sliders in it: what goes to POST /api/save-ui.
    layoutWith(layout, ui) {
        const out = layout.map(d => Object.assign({}, d));
        for (const [id, field, value] of this.uiEdits(ui)) out.find(d => d.id === id)[field] = value;
        return out;
    },

    // Constants that differ from the code: [{ name, value }] — the body of POST /api/save-constants.
    changes(now, code) {
        return Object.keys(now).filter(n => now[n] !== code[n]).map(n => ({ name: n, value: now[n] }));
    },

    // How far ahead, segments, a target is still inside the frame: bisection between the train and the
    // lens, down to the grid docs/qa/default measured on: 1/32 of a segment for a sign and the floor, 1/64
    // for the icon strip. shows(seg) comes from the real camera (View3D.projectToScreen).
    entry(shows, far, grid = 32) {
        if (!shows(0)) return 0;
        let lo = 0, hi = far;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (shows(mid)) lo = mid; else hi = mid;
        }
        return Math.floor(lo * grid) / grid;
    },

    num(v, digits = 2) { return v.toFixed(digits).replace('.', ','); },

    // The text the owner sends to the chat.
    settingsText(s) {
        const lines = ['Настройки Rail Link: Collapse', `Экран ${s.size[0]}×${s.size[1]}, отступ Telegram ${s.inset} px`];
        const changed = this.changes(s.constants, s.code);
        const ui = [['Верхняя плашка', 'top'], ['Нижняя плашка', 'bottom'], ['Иконка', 'icon']].filter(([, k]) => s.ui[k] !== s.uiCode[k]);
        if (!changed.length && !ui.length) lines.push('Всё как в коде');
        for (const c of changed) lines.push(`${c.name} = ${c.value} (в коде ${s.code[c.name]})`);
        for (const [label, k] of ui) lines.push(`${label}: ${s.ui[k]} px (в коде ${s.uiCode[k]})`);
        const n = s.numbers;
        lines.push(`Табличка ${this.num(n.signSeg)} сегм.: ${this.num(n.signSlow)} с на ${this.num(n.slow)}, ${this.num(n.signFast)} с на ${this.num(n.fast)} сегм./с`);
        lines.push(`Поезд ${this.num(n.trainPct, 1)} % высоты, нижняя панель ${this.num(n.bottomPct, 1)} %`);
        return lines.join('\n');
    },
};
