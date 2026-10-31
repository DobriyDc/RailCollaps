// Game.js — Rail Link: Collapse game flow on top of the kit: a run (CollapseRules.js), the tunnel
// (CollapseScene.js), input, HUD and the end of a run. main.js creates it (window.app.game) and
// calls update(dt) every frame BEFORE the render. The rules decide everything; this file feeds them
// taps, shows their state through UI.get(id) (records in UILayout.js) and turns their events into
// effects, haptics and the record.
//
// One dialog (the `over` panel of UILayout.js) serves three moments: the intro, the pause and the
// end of a run. `mode` says which one is up; its two buttons get the handlers of that moment.

class Game {
    /** @param {{ scene: CollapseScene }} app */
    constructor(app) {
        this.app = app;
        this.scene = app.scene;
        /** @type {CollapseRun | null} */
        this.run = null;
        this.mode = 'intro';          // 'intro' | 'play' | 'pause' | 'over'
        this.overIn = -1;             // s until the end dialog shows (the fall plays first)
        this.newRecord = false;
        this._chase = -1;             // the chase bar value shown
        this.adPending = false;
        this.flashLeft = 0;           // s the red flash of a demon hit stays up (hitFlash)
        this.best = parseInt(Store.get('collapse.best') || '0', 10) || 0;
        /** @type {Map<string, string>} */
        this._hudText = new Map();    // what the HUD shows: a DOM write only on change
        /** @type {{ cam: any, enter: any, reach: any, key: string } | null} */
        this._frame = null;           // the frame in segments ahead, by body and lane (frameTable)
        // Loaded ahead: an icon that fetches its file when it lights shows empty for its first moments.
        this._iconFiles = Object.values(Game.ICONS).map(url => { const img = new Image(); img.src = url; return img; });
        TG.loadBest(m => { if (m > this.best) { this.best = m; Store.set('collapse.best', String(m)); this._hudBest(); } });

        const pause = UI.get('pauseBtn');
        if (pause) pause.onClick(() => this.setPaused(this.mode !== 'pause'));
        const board = UI.get('boardBtn');
        if (board) board.onClick(() => { if (!this.adPending) Leaderboard.open(); });
        this.scene.canvas.addEventListener('pointerdown', e => this.tap(e));

        // The first frame shows the tunnel behind the intro dialog.
        this.run = new CollapseRun(Game.newSeed());
        this.scene.sync(this.run, 0);
        this._dialog('Rail Link: Collapse',
            'Тап по табличке развилки —\nмашинист стреляет по стрелке.\nКаждый выстрел стоит патрон.',
            ['Поехали', () => this.start()]);
        this._hudBest();
    }

    // Segments ahead of the train where a body standing on the floor at x (half width hw, top at
    // height `top`, world units) first shows between the frame's plates, 0 — only beside the train.
    // Pure pinhole math over numbers read from the real camera: cam { x, y, z, pitch, fov, aspect,
    // top, bottom } — top and bottom are the plates' edges in clip space (-1..1). No Babylon: the
    // probes run the same function in node on the numbers of Constants.js.
    static frameEntry(cam, x, hw, top) {
        const S = CollapseScene, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), t = Math.tan(cam.fov / 2);
        const shows = (d, y) => {
            const drop = cam.y - y, depth = d * cp + drop * sp;
            if (depth < 10) return false;
            const v = (d * sp - drop * cp) / (depth * t);
            return v <= cam.top && v >= cam.bottom && Math.abs(x - cam.x) - hw <= depth * t * cam.aspect;
        };
        // From the lens toward the train: a tall body shows in the frame before its foot does.
        for (let seg = Math.ceil(cam.z / S.SEG * 8) / 8; seg > 0; seg -= 0.125) {
            for (let k = 0; k <= 8; k++) if (shows(cam.z - seg * S.SEG, top * k / 8)) return seg;
        }
        return 0;
    }

    // frameEntry by body and lane for a camera at camX; camX null — the camera nearest each lane
    // (`follow` — the share of the train's offset it takes), the farthest that lane's edge can get.
    static frameTable(cam, camX, follow = 0) {
        const S = CollapseScene, out = {};
        for (const [body, b] of Object.entries(Game.BODIES)) {
            out[body] = [0, 1, 2].map(l => {
                const x = S.laneX(l);
                return Game.frameEntry(Object.assign({}, cam, { x: camX === null ? x * follow : camX }), x, b.hw, b.top);
            });
        }
        return out;
    }

    // Items of CollapseRun.ahead (nearest first) -> Map of icon id -> item: a demon to the slot of its
    // wall, the rest to their lane, the nearest big and the next one small. The window never holds a
    // third one on a lane at the default lead (the probe counts it); with a longer one it waits.
    static iconSlots(items) {
        const slots = new Map();
        for (const item of items) {
            const ids = item.lane < 0 ? [item.side < 0 ? 'iconWallLeft' : 'iconWallRight'] : ['iconLane' + item.lane, 'iconLane' + item.lane + 'Next'];
            const id = ids.find(i => !slots.has(i));
            if (id) slots.set(id, item);
        }
        return slots;
    }

    static newSeed() {
        return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    }

    start() {
        this.scene.reset();
        this.run = new CollapseRun(Game.newSeed());
        this.mode = 'play';
        this.overIn = -1;
        this.adPending = false;
        this.flashLeft = 0;
        this._frame = null;           // the safe area may have changed since the last run
        this._show('hitFlash', false);
        this._show('over', false);
        TG.runStarted();
    }

    // Pause by the button or when the app is minimized; resuming is always the player's tap.
    setPaused(on) {
        if (on && this.mode === 'play') {
            this.mode = 'pause';
            this._dialog('Пауза', 'Забег стоит.\nОбвал тоже.', ['Дальше', () => this.setPaused(false)], ['Заново', () => this.start()]);
        } else if (!on && this.mode === 'pause') {
            this.mode = 'play';
            this._show('over', false);
        }
        const b = UI.get('pauseBtn');
        if (b) b.setText(this.mode === 'pause' ? '▶' : 'II');
    }

    // A tap on the canvas: the nearest fork sign or demon within reach; a demon is shot by its side.
    tap(e) {
        const run = this.run;
        if (this.mode !== 'play' || !run || run.state !== 'run') return;
        const r = this.scene.canvas.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        let best = null, bestD = Math.max(56, r.width * 0.16);
        for (const t of this.scene.tapTargets(run)) {
            const d = Math.hypot(t.x - px, t.y - py);
            if (d < bestD) { best = t; bestD = d; }
        }
        if (!best) return;
        const res = best.kind === 'demon' ? run.shootDemon(best.side) : run.shoot(best.at, best.to);
        if (res === 'no-ammo') TG.haptic('deny');
    }

    async continueForAd() {
        const run = this.run;
        if (this.adPending || !run || !run.canContinue) return;
        this.adPending = true;
        this._show('continueBtn', false);
        const granted = await Ads.rewarded();
        this.adPending = false;
        if (this.run !== run || this.mode !== 'over') return;     // restarted while the ad played
        if (granted && run.continueRun()) {
            this.mode = 'play';
            this._show('over', false);
            TG.runStarted();
        }
    }

    update(dt) {
        const run = this.run;
        if (!run) return;
        if (this.mode === 'play') run.update(dt);
        for (const ev of run.takeEvents()) this._onEvent(ev);
        if (this.overIn >= 0 && (this.overIn -= dt) < 0) this._showOver();
        if (this.flashLeft > 0 && (this.flashLeft -= dt) <= 0) this._show('hitFlash', false);
        this.scene.sync(run, this.mode === 'pause' ? 0 : dt);
        this._hud(run);
        this._icons(run);
    }

    _onEvent(ev) {
        const run = this.run;
        this.scene.onEvent(ev, run);
        // A demon reached the cab (the shield took it or not): a short red flash over the screen.
        if ((ev.type === 'crash' || ev.type === 'shielded') && ev.reason === 'demon') {
            this.flashLeft = typeof COLLAPSE_FX_FLASH_SEC !== 'undefined' ? COLLAPSE_FX_FLASH_SEC : 0.15;
            this._show('hitFlash', true);
        }
        if (ev.type === 'shot') TG.haptic('shot');
        else if (ev.type === 'pickup') TG.haptic('pickup');
        else if (ev.type === 'shielded' || ev.type === 'rescued') TG.haptic('shield');
        else if (ev.type === 'crash') {
            TG.haptic('crash');
            TG.runEnded();
            this.mode = 'over';
            this.overIn = typeof COLLAPSE_OVER_DELAY_SEC !== 'undefined' ? COLLAPSE_OVER_DELAY_SEC : 0.7;
            if (run.meters > this.best) {
                this.best = run.meters;
                this.newRecord = true;
                Store.set('collapse.best', String(this.best));
                TG.saveBest(this.best);
                TG.haptic('record');
            } else this.newRecord = false;
            this._hudBest();
            Leaderboard.submit(run);
        }
    }

    // The end of a run: reason, meters, record; a continue for an ad only once per run.
    _showOver() {
        const run = this.run;
        const why = Game.REASONS[run.reason] || '';
        this._dialog(this.newRecord ? 'Новый рекорд!' : 'Обвал',
            why + '\nПройдено ' + run.meters + ' м. Рекорд ' + this.best + ' м.',
            ['Заново', () => this.start()],
            run.canContinue ? ['Продолжить за рекламу', () => this.continueForAd()] : null);
    }

    // The dialog: title, text, the main button and an optional second one ([label, handler]).
    _dialog(title, text, main, second) {
        const set = (id, s) => { const el = UI.get(id); if (el) el.setText(s); };
        set('overTitle', title);
        set('overText', text);
        const b = UI.get('restartBtn');
        if (b) b.setText(main[0]).onClick(main[1]);
        const c = UI.get('continueBtn');
        if (c) {
            if (second) c.setText(second[0]).onClick(second[1]);
            c.show(!!second);
        }
        this._show('boardBtn', Leaderboard.enabled);
        this._show('hint', false);
        this._show('over', true);
    }

    _show(id, on) {
        const el = UI.get(id);
        if (el && el.visible !== on) el.show(on);
    }

    _set(id, text) {
        if (this._hudText.get(id) === text) return;
        this._hudText.set(id, text);
        const el = UI.get(id);
        if (el) el.setText(text);
    }

    // The icons over the bottom plate: rules say what comes (CollapseRun.ahead), the frame says where
    // its edge is, the records of UILayout.js say how an icon looks. Only during a run.
    _icons(run) {
        const lit = new Map();
        if (this.mode === 'play') {
            const f = this._frameNow();
            for (const [id, item] of Game.iconSlots(run.ahead(run.c.iconLead, f.enter, f.reach))) lit.set(id, Game.ICONS[item.kind]);
        }
        for (const id of Game.ICON_IDS) {
            const url = lit.get(id) || '';
            if (url && this._hudText.get(id) !== url) {
                this._hudText.set(id, url);
                const el = UI.get(id);
                if (el) el.setSrc(url);
            }
            this._show(id, !!url);
        }
    }

    // The camera as Game.frameEntry reads it; the box between the plates, counted once per screen size.
    _frameNow() {
        const scene = this.scene, cam = scene.view.camera, engine = scene.engine;
        const size = engine.getRenderWidth() + 'x' + engine.getRenderHeight();
        if (!this._frame || this._frame.key.split(':')[0] !== size) {
            const box = scene.canvas.getBoundingClientRect();
            const edge = (id, side, def) => { const e = UI.get(id); return e ? e.el.getBoundingClientRect()[side] : def; };
            const ndc = y => 1 - 2 * (y - box.top) / box.height;
            const view = { y: scene.camY, z: cam.position.z, pitch: Math.abs(cam.rotation.x), fov: cam.fov, aspect: engine.getAspectRatio(cam),
                top: ndc(edge('frameTop', 'bottom', box.top)), bottom: ndc(edge('frameBottom', 'top', box.bottom)) };
            this._frame = { key: size + ':', cam: view, enter: null, reach: Game.frameTable(view, null, scene.camFollow) };
        }
        const f = this._frame, key = size + ':' + Math.round(scene.camX / 8);
        if (f.key !== key) {
            f.key = key;
            f.enter = Game.frameTable(f.cam, scene.camX);
        }
        return f;
    }

    _hudBest() { this._set('best', 'Рекорд ' + this.best + ' м'); }

    _hud(run) {
        this._set('dist', run.meters + ' м');
        this._set('ammo', 'Патроны ' + run.ammo);
        this._set('rescue', 'Спасение ' + run.rescue);
        this._set('shield', 'Щит ' + run.shield);
        this._set('effect', run.boost > 0 ? 'Ускоритель ' + run.boost.toFixed(1) + ' с'
            : run.slow > 0 ? 'Замедлитель ' + run.slow.toFixed(1) + ' с' : '');
        const gap = Math.round(Math.max(0, Math.min(1, (run.pos - run.front) / run.c.frontMaxGap)) * 100) / 100;
        if (this._chase !== gap) {
            this._chase = gap;
            const chase = UI.get('chase');
            if (chase) chase.setValue(gap);
        }
        if (this.mode !== 'play') return;
        const next = run.nextFork();
        this._show('hint', true);
        this._set('hint', run.ammo <= 0 ? 'Патроны кончились — ищи ящик с патронами'
            : next && !next.armed ? 'Тап по табличке — выстрел по стрелке' : '');
    }
}

// Temporary icons from the sprites in the game (card 21); the final ones are card 22.
Game.ICONS = {
    gap: 'assets/px/ui/hazard.png',
    lava: 'assets/px/fx/lava_burst.png',
    demon: 'assets/px/demon/jump_1.png',
    ammo: 'assets/px/hud/ammo.png',
    boost: 'assets/px/hud/boost.png',
    slow: 'assets/px/hud/slow.png',
    shield: 'assets/px/hud/shield.png',
    rescue: 'assets/px/hud/rescue.png',
};
Game.ICON_IDS = ['iconWallLeft', 'iconLane0', 'iconLane0Next', 'iconLane1', 'iconLane1Next', 'iconLane2', 'iconLane2Next', 'iconWallRight'];

// What of each object the frame can catch: half width and top, world units. These are the sizes of
// CollapseScene._segView: a hole as wide as its lane, the lava flow (170 x 760 from y 120), a pickup
// (90 x 135 from y 6, its bob 10).
Game.BODIES = {
    gap: { hw: CollapseScene.LANE_W / 2, top: 0 },
    lava: { hw: 85, top: 880 },
    pickup: { hw: 45, top: 151 },
};

Game.REASONS = {
    gap: 'Поезд ушёл в провал.',
    lava: 'Поток лавы накрыл паровоз.',
    demon: 'Демон добрался до кабины.',
    caught: 'Обвал догнал поезд.',
};
