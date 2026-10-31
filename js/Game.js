// Game.js — Rail Link: Collapse game flow on top of the kit: a run (CollapseRules.js), the tunnel
// (CollapseScene.js), input, HUD and the end of a run. main.js creates it (window.app.game) and
// calls update(dt) every frame BEFORE the render. The rules decide everything; this file feeds them
// taps, shows their state through UI.get(id) (records in UILayout.js) and turns their events into
// effects, haptics and the record.
//
// Menu panels own navigation; the over panel serves pause and the end of a run.

class Game {
    /** @param {{ scene: CollapseScene }} app */
    constructor(app) {
        this.app = app;
        this.scene = app.scene;
        /** @type {CollapseRun | null} */
        this.run = null;
        this.mode = 'menu';           // 'menu' | 'play' | 'pause' | 'over'
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

        this.run = new CollapseRun(Game.newSeed());
        this.scene.sync(this.run, 0);
        const on = (id, fn) => { const el = UI.get(id); if (el) el.onClick(fn); };
        on('menuStart', () => this.openMenu('modeScreen'));
        on('menuSettings', () => this.openMenu('settingsScreen'));
        on('menuShop', () => this.openMenu('shopScreen'));
        on('menuExit', () => TG.close());
        on('modeEndless', () => this.start());
        on('modeTutorial', () => this.start(new CollapseTutorial()));
        for (const id of ['modeBack', 'settingsBack', 'shopBack', 'overMenu']) on(id, () => this.openMenu());
        this.volumes = {};
        const audio = Sound3D.cfg();
        for (const channel of Sound3D.CHANNELS) {
            const saved = Store.get('collapse.volume.' + channel);
            const value = saved === null ? audio[channel] : Number(saved);
            this.volumes[channel] = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : audio[channel];
            Sound3D.setChannelVolume(channel, this.volumes[channel]);
            on(channel + 'Minus', () => this.changeVolume(channel, -1));
            on(channel + 'Plus', () => this.changeVolume(channel, 1));
        }
        on('languageRU', () => Lang.set('ru'));
        on('languageEN', () => Lang.set('en'));
        this.tutorialPassed = Store.get('collapse.tutorial') === '1';
        Lang.listeners.add(() => this.refreshLanguage());
        this.refreshLanguage();
        this.openMenu();
    }

    openMenu(screen = 'mainScreen') {
        if (this.adPending) return;
        this.mode = 'menu';
        this.overIn = -1;
        this.flashLeft = 0;
        TG.runEnded();
        Leaderboard.close();
        this._show('over', false);
        this._show('hitFlash', false);
        this._show('menu', true);
        for (const id of ['mainScreen', 'modeScreen', 'settingsScreen', 'shopScreen']) this._show(id, id === screen);
        for (const id of ['frameTop', 'frameBottom', 'iconStrip']) this._show(id, false);
        this._show('menuExit', TG.inside);
    }

    refreshLanguage() {
        Lang.apply();
        Leaderboard.refreshLanguage();
        this._hudText.clear();
        this._hudBest();
        if (this.run) this._hud(this.run);
        if (this.mode === 'pause') this._pauseDialog();
        else if (this.mode === 'over' && this.overIn < 0) this._showOver();
        this._settingsView();
        this._tutorialLabel();
    }

    _tutorialLabel() { this._set('modeTutorial', (this.tutorialPassed ? '✓ ' : '') + Lang.t('tutorial')); }

    changeVolume(channel, direction) {
        const step = typeof AUDIO_VOLUME_STEP !== 'undefined' ? AUDIO_VOLUME_STEP : 0.1;
        this.volumes[channel] = Math.max(0, Math.min(1, this.volumes[channel] + direction * step));
        Store.set('collapse.volume.' + channel, String(this.volumes[channel]));
        Sound3D.setChannelVolume(channel, this.volumes[channel]);
        this._settingsView();
    }

    _settingsView() {
        for (const channel of Sound3D.CHANNELS) {
            this._set(channel + 'Value', Lang.t('percent', { value: Math.round(this.volumes[channel] * 100) }));
            const bar = UI.get(channel + 'Bar');
            if (bar) bar.setValue(this.volumes[channel]);
        }
        for (const [id, code] of [['languageRU', 'ru'], ['languageEN', 'en']]) {
            this._set(id, (Lang.code === code ? '✓ ' : '') + Lang.t(code));
        }
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
        for (const [body, b] of Object.entries(S.BODIES)) {
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

    // A run: a new endless one unless given another (the tutorial, a retry of its step).
    start(run = new CollapseRun(Game.newSeed())) {
        this._show('menu', false);
        for (const id of ['frameTop', 'frameBottom', 'iconStrip']) this._show(id, true);
        this._set('pauseBtn', Lang.t('pauseIcon'));
        this.scene.reset();
        this.run = run;
        this.mode = 'play';
        this.overIn = -1;
        this.adPending = false;
        this.flashLeft = 0;
        this._frame = null;           // the safe area may have changed since the last run
        this._show('hitFlash', false);
        this._show('over', false);
        this._show('tutorialBox', run.tutorial);
        this._hudBest();
        TG.runStarted();
    }

    // Pause by the button or when the app is minimized; resuming is always the player's tap.
    setPaused(on) {
        if (on && this.mode === 'play') {
            this.mode = 'pause';
            this._pauseDialog();
        } else if (!on && this.mode === 'pause') {
            this.mode = 'play';
            this._show('over', false);
        }
        const b = UI.get('pauseBtn');
        if (b) b.setText(Lang.t(this.mode === 'pause' ? 'resumeIcon' : 'pauseIcon'));
    }

    _pauseDialog() {
        this._dialog(Lang.t('pause'), Lang.t('pauseText'), [Lang.t('resume'), () => this.setPaused(false)],
            [Lang.t('restart'), () => this.start(this.run.tutorial ? new CollapseTutorial() : undefined)]);
        this._show('overMenu', this.run.tutorial);
        this._set('pauseBtn', Lang.t('resumeIcon'));
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
        if (!run || this.mode === 'menu') return;
        if (this.mode === 'play') run.update(dt);
        for (const ev of run.takeEvents()) this._onEvent(ev);
        if (this.mode === 'play' && run.tutorial && (run.missed || run.finished)) { this._tutorialEnd(run); return; }
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
            if (run.tutorial) return;     // neither the record nor the table: _showOver sends it back to its step
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

    // A miss goes back to the step; the last step passed goes on to the endless mode, a new run: the
    // table replays a run from its seed, and the tutorial's track is not of any seed.
    _tutorialEnd(run) {
        if (run.missed) { this.start(run.retry()); return; }
        this.tutorialPassed = true;
        Store.set('collapse.tutorial', '1');
        this._tutorialLabel();
        this.start();
    }

    // The end of a run: reason, meters, record; a continue for an ad only once per run.
    _showOver() {
        const run = this.run;
        if (run.tutorial) { this.start(run.retry()); return; }
        const why = run.reason ? Lang.t('reason.' + run.reason) : '';
        this._dialog(Lang.t(this.newRecord ? 'recordTitle' : 'overTitle'),
            why + '\n' + Lang.t('result', { meters: run.meters, best: this.best }),
            [Lang.t('restart'), () => this.start()],
            run.canContinue && !this.adPending ? [Lang.t('continue'), () => this.continueForAd()] : null);
        this._show('overMenu', true);
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

    // The camera as Game.frameEntry reads it, tilted to the top plate; the box between the plates,
    // counted once per screen size and per run.
    _frameNow() {
        const scene = this.scene, cam = scene.view.camera, engine = scene.engine;
        const size = engine.getRenderWidth() + 'x' + engine.getRenderHeight();
        if (!this._frame || this._frame.key.split(':')[0] !== size) {
            const box = scene.canvas.getBoundingClientRect();
            const edge = (id, side, def) => { const e = UI.get(id); return e ? e.el.getBoundingClientRect()[side] : def; };
            const ndc = y => 1 - 2 * (y - box.top) / box.height;
            const top = ndc(edge('frameTop', 'bottom', box.top));
            scene.fitFrame(top);
            const view = { y: scene.camY, z: cam.position.z, pitch: Math.abs(cam.rotation.x), fov: cam.fov, aspect: engine.getAspectRatio(cam),
                top, bottom: ndc(edge('frameBottom', 'top', box.bottom)) };
            this._frame = { key: size + ':', cam: view, enter: null, reach: Game.frameTable(view, null, scene.camFollow) };
        }
        const f = this._frame, key = size + ':' + Math.round(scene.camX / 8);
        if (f.key !== key) {
            f.key = key;
            f.enter = Game.frameTable(f.cam, scene.camX);
        }
        return f;
    }

    _hudBest() { this._set('best', Lang.t('best', { value: this.best })); }

    _hud(run) {
        this._set('dist', Lang.t('meters', { value: run.meters }));
        this._set('ammo', Lang.t('ammo', { value: run.ammo }));
        this._set('rescue', Lang.t('rescue', { value: run.rescue }));
        this._set('shield', Lang.t('shield', { value: run.shield }));
        this._set('effect', run.boost > 0 ? Lang.t('boost', { value: run.boost.toFixed(1) })
            : run.slow > 0 ? Lang.t('slow', { value: run.slow.toFixed(1) }) : '');
        const gap = Math.round(Math.max(0, Math.min(1, (run.pos - run.front) / run.c.frontMaxGap)) * 100) / 100;
        if (this._chase !== gap) {
            this._chase = gap;
            const chase = UI.get('chase');
            if (chase) chase.setValue(gap);
        }
        if (this.mode !== 'play') return;
        if (run.tutorial) {
            this._show('hint', false);
            this._set('best', Lang.t('tutorial.progress', { value: run.index + 1, total: CollapseRules.TUTORIAL.length }));
            this._set('tutorialText', (run.failed ? Lang.t('tutorial.retry') + ' ' : '') + Lang.t('tutorial.' + run.step.id));
            return;
        }
        const next = run.nextFork();
        this._show('hint', true);
        this._set('hint', run.ammo <= 0 ? Lang.t('noAmmo')
            : next && !next.armed ? Lang.t('hint') : '');
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
