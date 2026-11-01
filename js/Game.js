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
        this.portrait = 'calm';
        this.portraitLeft = 0;
        this.flashLeft = 0;           // s the red flash of a demon hit stays up (hitFlash)
        this.best = parseInt(Store.get('collapse.best') || '0', 10) || 0;
        /** @type {Map<string, string>} */
        this._hudText = new Map();    // what the HUD shows: a DOM write only on change
        /** @type {{ cam: any, enter: any, reach: any, key: string, floor: number, row: { center: number, scale: number, width: number } } | null} */
        this._frame = null;           // the frame in segments ahead, by body and lane (frameTable)
        // Loaded ahead: an icon that fetches its file when it lights shows empty for its first moments.
        this._iconFiles = [...Object.values(Game.ICONS), ...Object.values(Game.PORTRAITS), ...Object.values(Game.PORTRAITS_HURT).flat(), ...Object.values(Game.HP), ...(UI.DIGITS || [])].map(url => { const img = new Image(); img.src = url; return img; });
        TG.loadBest(m => { if (m > this.best) { this.best = m; Store.set('collapse.best', String(m)); this._hudBest(); } });

        this.soundOn = false;         // the first tap came: nothing plays or loads before it
        /** @type {Record<string, SoundHandle>} */
        this._loops = {};             // wheels, steam, rumble: this file owns them (_mix)
        /** @type {SoundHandle | null} */
        this._music = null;
        this._leapt = new WeakSet();  // demons already heard in their leap: the rules have no event for it
        Sound3D.onGesture(() => this._wakeSound());

        const on = (id, fn) => { const el = UI.get(id); if (el) el.onClick(this._clicked(fn)); };
        on('pauseBtn', () => this.setPaused(this.mode !== 'pause'));
        on('boardBtn', () => { if (!this.adPending) Leaderboard.open(); });
        this.scene.canvas.addEventListener('pointerdown', e => this.tap(e));

        this.run = new CollapseRun(Game.newSeed());
        this.scene.sync(this.run, 0);
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
        on('orientationPortrait', () => this.setOrientation(false));
        on('orientationLand', () => this.setOrientation(true));
        on('rotateBack', () => this.setOrientation(false));
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
        this._show('tutorialBox', false);
        for (const id of ['mainScreen', 'modeScreen', 'settingsScreen', 'shopScreen']) this._show(id, id === screen);
        for (const id of ['frameTop', 'frameBottom', 'iconStrip', 'stationShop', 'collapseNote']) this._show(id, false);
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
        for (const [id, land, key] of [['orientationPortrait', false, 'portrait'], ['orientationLand', true, 'landscape']]) {
            this._set(id, (IS_LAND === land ? '✓ ' : '') + Lang.t(key));
        }
    }

    // The camera, the plates and the scale of the layout hang on IS_LAND, read once at load: the choice
    // reloads the page. ?land in the address would overrule it, so it goes too.
    setOrientation(land) {
        if (land === IS_LAND) return;
        Store.set('collapse.orientation', land ? 'land' : 'portrait');
        const url = new URL(location.href);
        url.searchParams.delete('land');
        history.replaceState(null, '', url.href);
        location.reload();
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

    // What an icon of this slot looks like: frame and size — records of UILayout.js. A hazard on the
    // train's lane is the big red one and pulses, on another lane it is small and quiet; a pickup is
    // never framed as a threat. The nearest thing on the train's lane takes the big size.
    static iconLook(id, item, own) {
        const here = item.lane === own, small = 'iconLane' + item.lane + 'Next';
        const hazard = item.kind === 'gap' || item.kind === 'lava';
        return { frame: hazard ? (here ? 'iconLookHot' : 'iconLookNear') : 'iconLookPickup', size: here ? id : small, pulse: here && hazard && id !== small };
    }

    // Where the lanes' icons stand on the row, layout px from its center. xs — each lane's projection;
    // half — half width of its icons, 0 — no icon; W — the row's width; edge — kept free at each side.
    // A lane past the edge stops there, and the lanes behind it line up inward, so the order of the
    // lanes survives. side: -1, 1 — the icon was moved that way off its lane's place: the edge holds
    // it tight, the fork levers stand just inside. Then the pointer shows.
    static iconRow(xs, half, W, edge, gap) {
        const x = xs.slice(), side = [0, 0, 0], lit = [0, 1, 2].filter(l => half[l] > 0);
        for (let i = lit.length - 1, wall = W / 2 - edge + gap; i >= 0; i--) {
            const l = lit[i], max = wall - gap - half[l];
            if (x[l] > max) { x[l] = max; side[l] = 1; }
            wall = x[l] - half[l];
        }
        for (let i = 0, wall = -W / 2 + edge - gap; i < lit.length; i++) {
            const l = lit[i], min = wall + gap + half[l];
            if (x[l] < min) { x[l] = min; side[l] = -1; }
            wall = x[l] + half[l];
        }
        return { x, side };
    }

    // World z of the floor at clip height v of the frame, over the numbers of Game.frameEntry.
    static floorZ(cam, v) {
        return cam.z - cam.y / Math.tan(cam.pitch - Math.atan(v * Math.tan(cam.fov / 2)));
    }

    static newSeed() {
        return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    }

    // ?stations in the address: the endless run goes through stations (CollapseStations.js).
    static stationsOn() { return typeof CollapseStations !== 'undefined' && CollapseStations.on; }

    static newRun() { return Game.stationsOn() ? new CollapseStationRun(Game.newSeed()) : new CollapseRun(Game.newSeed()); }

    /** @param {any} run */
    static stationsLine(run) { return run.stations ? '\n' + Lang.t('stationsPassed', { value: run.stage }) : ''; }

    // A run: a new endless one unless given another (the tutorial, a retry of its step).
    start(run = Game.newRun()) {
        this._show('menu', false);
        for (const id of ['frameTop', 'frameBottom', 'iconStrip']) this._show(id, true);
        this._set('pauseBtn', '');
        this.portrait = 'calm';
        this.portraitLeft = 0;
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
        this._show('hpRow', !run.tutorial);
        this._hudBest();
        if (Game.stationsOn()) CollapseStations.dress(this, run);
        TG.runStarted();
    }

    // The wide game on a tall screen waits behind the request to turn the phone, and a run pauses; a
    // phone that cannot turn leaves by rotateBack. Telegram locks only the orientation the phone is
    // already in, so the lock follows the turn, both ways: the choice may come with the phone held wrong.
    fitOrientation() {
        const c = this.scene.canvas, tall = c.clientHeight > c.clientWidth;
        TG.holdOrientation(tall !== IS_LAND);
        if (!IS_LAND) return;
        this._show('rotateNote', tall);
        this._show('rotateBack', tall);
        if (tall) this.setPaused(true);
    }

    // Pause by the button or when the app is minimized; resuming is always the player's tap.
    setPaused(on) {
        if (on && this.mode === 'play') {
            this.mode = 'pause';
            this._pauseDialog();
            this._soundDown();
        } else if (!on && this.mode === 'pause') {
            this.mode = 'play';
            this._show('over', false);
        }
        const b = UI.get('pauseBtn');
        if (b) b.setText('');
    }

    _pauseDialog() {
        this._dialog(Lang.t('pause'), Lang.t('pauseText'), [Lang.t('resume'), () => this.setPaused(false)],
            [Lang.t('restart'), () => this.start(this.run.tutorial ? new CollapseTutorial() : undefined)]);
        this._show('overMenu', this.run.tutorial);
        this._set('pauseBtn', '');
    }

    // A tap on the canvas: the nearest fork lever or demon within reach; a demon is shot by its side.
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
        this._mix(run);
        if (!run || this.mode === 'menu') return;
        if (this.mode === 'play') {
            run.update(dt);
            this.portraitLeft = Math.max(0, this.portraitLeft - dt);
        }
        for (const ev of run.takeEvents()) this._onEvent(ev);
        this._leaps(run);
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
        for (const src of Game.soundsOf(ev)) this._play(src);
        const reaction = Game.portraitEvent(ev);
        if (reaction && (this.portraitLeft <= 0 || Game.PORTRAIT_PRIORITY.indexOf(reaction) >= Game.PORTRAIT_PRIORITY.indexOf(this.portrait))) {
            this.portrait = reaction;
            this.portraitLeft = typeof UI_PORTRAIT_SEC !== 'undefined' ? UI_PORTRAIT_SEC : 0.9;
        }
        // A demon struck the cab (the shield took it or not): a short red flash over the screen.
        if ((ev.type === 'crash' || ev.type === 'shielded' || ev.type === 'hurt') && ev.reason === 'demon') {
            this.flashLeft = typeof COLLAPSE_FX_FLASH_SEC !== 'undefined' ? COLLAPSE_FX_FLASH_SEC : 0.15;
            this._show('hitFlash', true);
        }
        if (ev.type === 'shot') TG.haptic('shot');
        else if (ev.type === 'pickup') TG.haptic('pickup');
        else if (['shielded', 'rescued', 'collapse', 'hurt'].includes(ev.type)) TG.haptic('shield');
        else if (ev.type === 'crash') {
            TG.haptic('crash');
            TG.runEnded();
            this.mode = 'over';
            this.overIn = typeof COLLAPSE_OVER_DELAY_SEC !== 'undefined' ? COLLAPSE_OVER_DELAY_SEC : 0.7;
            if (run.tutorial) return;     // neither the record nor the table: _showOver sends it back to its step
            if (/** @type {any} */ (run).stations) return;     // a variant to compare: its runs stay out of the record and the table
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

    // The first tap of the page: the effects load ahead, a shot must not wait for its file, then the
    // music, the longest of them. It plays from then on, in the menu too.
    _wakeSound() {
        this.soundOn = true;
        for (const src of Object.values(Game.SOUNDS)) Sound3D.load(src);
        for (const src of Object.values(Game.LOOPS)) Sound3D.load(src);
        this._music = Sound3D.music(Game.MUSIC);
    }

    _play(src) { if (this.soundOn) Sound3D.play(src); }

    // A handler of a button with its sound after it: a pause stops what plays, its own click included.
    _clicked(fn) {
        return () => {
            fn();
            this._play(Game.SOUNDS.button);
        };
    }

    // Everything the sfx channel plays stops now, the music goes quiet at the next look of _mix.
    _soundDown() {
        Sound3D.stopChannel('sfx');
        this._loops = {};
        if (this._music) this._music.setVolume(0);
    }

    // The leap is a phase of a demon, not an event: heard once, as the scene starts to draw it.
    _leaps(run) {
        if (this.mode !== 'play') return;
        for (const d of run.demons) {
            if (d.wait > 0 || d.t > run.c.demonSec || this._leapt.has(d)) continue;
            this._leapt.add(d);
            this._play(Game.SOUNDS.demonLeap);
        }
    }

    // What the loops should do now. speed, top, gap, far — of the rules, in their units: the wheels and
    // the steam follow the speed and fall silent with a standing train, the rumble grows as the
    // collapse comes near. Pure: the probes run it without a sound.
    static loopMix(speed, top, gap, far) {
        const U = 'undefined';
        const rateMin = typeof AUDIO_TRAIN_RATE_MIN !== U ? AUDIO_TRAIN_RATE_MIN : 0.85;
        const rateMax = typeof AUDIO_TRAIN_RATE_MAX !== U ? AUDIO_TRAIN_RATE_MAX : 1.7;
        const rumbleFar = typeof AUDIO_RUMBLE_FAR !== U ? AUDIO_RUMBLE_FAR : 0.1;
        const curve = typeof AUDIO_RUMBLE_CURVE !== U ? AUDIO_RUMBLE_CURVE : 2;
        const pace = Math.max(0, speed / top);
        const near = 1 - Math.max(0, Math.min(1, gap / far));
        const going = Math.min(1, pace * 2);       // half the top speed is already at speed: the train starts there
        return {
            rate: rateMin + (rateMax - rateMin) * pace,
            wheels: going * (typeof AUDIO_WHEELS_VOLUME !== U ? AUDIO_WHEELS_VOLUME : 0.5),
            steam: going * (typeof AUDIO_STEAM_VOLUME !== U ? AUDIO_STEAM_VOLUME : 0.3),
            rumble: gap === Infinity ? 0 : (rumbleFar + (1 - rumbleFar) * near ** curve) * (typeof AUDIO_RUMBLE_VOLUME !== U ? AUDIO_RUMBLE_VOLUME : 0.9),
        };
    }

    // Every frame: the loops live only while the train runs. Pause, the end of a run and the menu stop
    // them; the pause takes the music too, and it comes back where it was.
    _mix(run) {
        if (!this.soundOn) return;
        if (this._music) this._music.setVolume(this.mode === 'pause' ? 0 : 1);
        if (this.mode !== 'play' || !run || run.state !== 'run') {
            for (const handle of Object.values(this._loops)) handle.stop();
            this._loops = {};
            return;
        }
        const mix = Game.loopMix(run.speed(), run.c.speedMax, run.collapsing ? run.pos - run.front : Infinity, run.c.eventGap);
        for (const [name, src] of Object.entries(Game.LOOPS)) {
            const train = name !== 'rumble', volume = mix[name], rate = train ? mix.rate : 1;
            if (!this._loops[name]) this._loops[name] = Sound3D.play(src, { loop: true, volume, rate });
            else this._loops[name].setVolume(volume).setRate(rate);
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
            why + '\n' + Lang.t('result', { meters: run.meters, best: this.best }) + Game.stationsLine(run),
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
        if (b) b.setText(main[0]).onClick(this._clicked(main[1]));
        const c = UI.get('continueBtn');
        if (c) {
            if (second) c.setText(second[0]).onClick(this._clicked(second[1]));
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
            const hz = typeof COLLAPSE_DEMON_BLINK_HZ !== 'undefined' ? COLLAPSE_DEMON_BLINK_HZ : 3;
            const off = Math.floor(run.time * hz * 2) % 2 === 1;       // a demon's icon blinks: both walls of a pair in step
            for (const [id, item] of Game.iconSlots(run.ahead(run.c.iconLead, f.enter, f.reach))) if (item.lane >= 0 || !off) lit.set(id, item);
        }
        this._iconPlaces(run, lit);
        for (const id of Game.ICON_IDS) {
            const item = lit.get(id), url = item ? Game.ICONS[item.kind] : '';
            if (url && this._hudText.get(id) !== url) {
                this._hudText.set(id, url);
                const el = UI.get(id);
                if (el) el.setSrc(url);
            }
            this._show(id, !!url);
        }
    }

    // The lanes' icons follow the lanes: the camera moves the rails on the screen every frame, so x is
    // the rails' projection on the bottom edge of the frame. The record keeps y and the size.
    _iconPlaces(run, lit) {
        const own = Math.round(run.laneX()), half = [0, 0, 0], looks = new Map();
        const hz = typeof COLLAPSE_ICON_PULSE_HZ !== 'undefined' ? COLLAPSE_ICON_PULSE_HZ : 2;
        const amp = typeof COLLAPSE_ICON_PULSE_AMP !== 'undefined' ? COLLAPSE_ICON_PULSE_AMP : 0.1;
        for (const [id, item] of lit) {
            if (item.lane < 0) continue;
            const look = Game.iconLook(id, item, own), size = UI.def(look.size);
            looks.set(id, look);
            if (size) half[item.lane] = Math.max(half[item.lane], size.w / 2 * (look.pulse ? 1 + amp : 1));
        }
        let side = [0, 0, 0];
        if (looks.size) {
            const f = this._frameNow(), view = this.scene.view, rail = UI.def('frameLeft');
            view.refreshMatrices();       // this frame's camera: the scene takes its matrices only when it renders
            const xs = [0, 1, 2].map(l => (view.projectToScreen(CollapseScene.laneX(l), f.floor, 0).x - f.row.center) / f.row.scale);
            const gap = typeof COLLAPSE_ICON_GAP !== 'undefined' ? COLLAPSE_ICON_GAP : 4;
            const row = Game.iconRow(xs, half, f.row.width, rail ? rail.w : 0, gap);
            side = row.side;
            const beat = 0.5 + 0.5 * Math.sin(run.time * hz * 2 * Math.PI);
            for (const [id, look] of looks) {
                const el = UI.get(id);
                if (!el) continue;
                el.setX(row.x[lit.get(id).lane]).setLook(look.frame, look.size).setPulse(look.pulse ? 1 + amp * beat : 1);
            }
        }
        this._show('iconEdgeLeft', side.includes(-1));
        this._show('iconEdgeRight', side.includes(1));
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
            const land = IS_LAND, top = ndc(edge(this.run && this.run.tutorial ? 'tutorialBox' : land ? '' : 'frameTop', 'bottom', box.top));
            const wide = land ? (edge('frameBottom', 'left', box.right) - edge('frameTop', 'right', box.left)) / box.width : 1;
            scene.fitFrame(top, wide);
            const view = { y: scene.camY, z: cam.position.z, pitch: Math.abs(cam.rotation.x), fov: cam.fov, aspect: engine.getAspectRatio(cam) * wide,
                top, bottom: ndc(edge(land ? '' : 'frameBottom', 'top', box.bottom)) };
            const strip = UI.get('iconStrip'), rect = strip ? strip.el.getBoundingClientRect() : box;
            this._frame = { key: size + ':', cam: view, enter: null, reach: Game.frameTable(view, null, scene.camFollow), floor: Game.floorZ(view, view.bottom),
                row: { center: rect.left + rect.width / 2 - box.left, scale: UI.scale(), width: rect.width / UI.scale() } };
        }
        const f = this._frame, key = size + ':' + Math.round(scene.camX / 8);
        if (f.key !== key) {
            f.key = key;
            f.enter = Game.frameTable(f.cam, scene.camX);
        }
        return f;
    }

    _hudBest() { this._set('best', String(this.best)); }

    // The sounds of an event of a run, the one owner of that link; the probe walks the events the
    // rules can push against this. A demon driven off is a shot and its end, no 'shot' comes with it.
    static soundsOf(ev) {
        const S = Game.SOUNDS;
        switch (ev.type) {
            case 'shot': return [S.shot];
            case 'no-ammo': return [S.dry];
            case 'switched': return [S.switch];
            case 'pickup': return [S.pickup];
            case 'shielded': return [S.shield];
            case 'rescued': return [S.rescue];
            case 'demon': return [S.demonShow];
            case 'demon-on': return [S.demonHang];
            case 'hurt': return [ev.reason === 'lava' ? S.lava : S.hit];
            case 'collapse': return [S.collapse];
            case 'demon-killed': return [S.shot, S.demonDown];
            case 'crash': return [ev.reason === 'gap' ? S.fall : ev.reason === 'lava' ? S.lava : ev.reason === 'caught' ? S.caught : S.hit];
            case 'continued': return [S.continue];
            case 'station': return [S.station];
            case 'departed': return [S.depart];
            case 'money': return [S.coin];
            case 'bought': return [S.bought];
            default: return [];
        }
    }

    static portraitEvent(ev) {
        if (ev.type === 'crash' || ev.type === 'shielded' || ev.type === 'hurt') return ev.reason === 'gap' ? 'fall' : ev.reason === 'lava' ? 'fire' : 'hit';
        if (['pickup', 'demon-killed', 'rescued', 'continued'].includes(ev.type)) return 'joy';
        if (['demon', 'demon-on', 'no-ammo', 'collapse'].includes(ev.type)) return 'tense';
        return '';
    }

    // The next fork is the way out of a hazard on the train's lane and is not armed yet.
    _forkDanger(run) {
        const f = run.nextFork();
        return !!f && !f.armed && !run.forkSafe(f.at, run.lane);
    }

    _portrait(run) {
        const urgent = run.ammo <= 0 || run.pos - run.front < run.c.frontMaxGap * (typeof UI_PORTRAIT_TENSE_GAP !== 'undefined' ? UI_PORTRAIT_TENSE_GAP : 0.5) || run.demons.length > 0 || this._forkDanger(run);
        const state = this.portraitLeft > 0 || run.state !== 'run' ? this.portrait : urgent ? 'tense' : 'calm';
        const el = UI.get('portrait'), src = Game.portraitOf(state, run.c.hpMax - Math.max(1, run.hp));
        if (el && this._hudText.get('portrait') !== src) {
            this._hudText.set('portrait', src);
            el.setSrc(src);
        }
    }

    // The face for a state: the more lives are lost, the worse it looks.
    static portraitOf(state, lost) {
        return lost > 0 ? Game.PORTRAITS_HURT[state][Math.min(lost, 2) - 1] : Game.PORTRAITS[state];
    }

    // The trains of the HUD: lit while the lives last.
    _hpView(run) {
        const key = String(run.hp);
        if (this._hudText.get('hp') === key) return;
        this._hudText.set('hp', key);
        for (let i = 0; i < 3; i++) {
            const el = UI.get('hp' + i);
            if (el) el.setSrc(i < run.hp ? Game.HP.full : Game.HP.empty);
        }
    }

    _hud(run) {
        this._portrait(run);
        this._hpView(run);
        this._set('dist', String(run.meters));
        this._set('ammo', String(run.ammo));
        this._set('rescue', String(run.rescue));
        this._set('shield', String(run.shield));
        this._set('effect', run.boost > 0 ? Lang.t('boost', { value: run.boost.toFixed(1) })
            : run.slow > 0 ? Lang.t('slow', { value: run.slow.toFixed(1) }) : '');
        const gap = Math.round(Math.max(0, Math.min(1, (run.pos - run.front) / run.c.frontMaxGap)) * 100) / 100;
        if (this._chase !== gap) {
            this._chase = gap;
            const chase = UI.get('chase');
            if (chase) chase.setValue(gap);
        }
        this._show('collapseNote', this.mode === 'play' && !run.tutorial && run.collapseRush);
        if (this.mode !== 'play') return;
        if (run.tutorial) {
            this._show('hint', false);
            this._set('best', String(run.index + 1));
            this._set('tutorialText', (run.failed ? Lang.t('tutorial.retry') + ' ' : '') + Lang.t('tutorial.' + run.step.id));
            return;
        }
        if (run.stations) { CollapseStations.hud(this, run); return; }
        const next = run.nextFork();
        this._show('hint', true);
        this._set('hint', run.ammo <= 0 ? Lang.t('noAmmo')
            : next && !next.armed ? Lang.t('hint') : '');
    }
}

// Incoming symbols use the same raster family as the dashboard.
Game.ICONS = {
    gap: 'assets/ui/hud_v3/icon_gap.png',
    lava: 'assets/ui/hud_v3/icon_lava.png',
    demon: 'assets/ui/hud_v3/icon_demon.png',
    ammo: 'assets/ui/hud_v3/pickup_ammo.png',
    boost: 'assets/ui/hud_v3/pickup_boost.png',
    slow: 'assets/ui/hud_v3/pickup_slow.png',
    shield: 'assets/ui/hud_v3/pickup_shield.png',
    rescue: 'assets/ui/hud_v3/pickup_rescue.png',
};
Game.ICON_IDS = ['iconWallLeft', 'iconLane0', 'iconLane0Next', 'iconLane1', 'iconLane1Next', 'iconLane2', 'iconLane2Next', 'iconWallRight'];

Game.PORTRAITS = {
    calm: 'assets/ui/hud_v3/portrait_calm.png',
    tense: 'assets/ui/hud_v3/portrait_tense.png',
    joy: 'assets/ui/hud_v3/portrait_joy.png',
    hit: 'assets/ui/hud_v3/portrait_hit.png',
    fire: 'assets/ui/hud_v3/portrait_fire.png',
    fall: 'assets/ui/hud_v3/portrait_fall.png',
};
Game.PORTRAITS_HURT = {
    calm: ['assets/ui/hud_v3/portrait_calm_w1.png', 'assets/ui/hud_v3/portrait_calm_w2.png'],
    tense: ['assets/ui/hud_v3/portrait_tense_w1.png', 'assets/ui/hud_v3/portrait_tense_w2.png'],
    joy: ['assets/ui/hud_v3/portrait_joy_w1.png', 'assets/ui/hud_v3/portrait_joy_w2.png'],
    hit: ['assets/ui/hud_v3/portrait_hit_w1.png', 'assets/ui/hud_v3/portrait_hit_w2.png'],
    fire: ['assets/ui/hud_v3/portrait_fire_w1.png', 'assets/ui/hud_v3/portrait_fire_w2.png'],
    fall: ['assets/ui/hud_v3/portrait_fall_w1.png', 'assets/ui/hud_v3/portrait_fall_w2.png'],
};
Game.PORTRAIT_PRIORITY = ['calm', 'tense', 'joy', 'hit', 'fire', 'fall'];
Game.HP = { full: 'assets/ui/hud_v3/icon_hp_full.png', empty: 'assets/ui/hud_v3/icon_hp_empty.png' };

// Generated by tools/make-sounds.mjs. Literal paths: the builder's scanner reads them.
Game.SOUNDS = {
    shot: 'assets/sounds/sfx_shot.wav',
    dry: 'assets/sounds/sfx_dry.wav',
    switch: 'assets/sounds/sfx_switch.wav',
    pickup: 'assets/sounds/sfx_pickup.wav',
    shield: 'assets/sounds/sfx_shield.wav',
    rescue: 'assets/sounds/sfx_rescue.wav',
    demonShow: 'assets/sounds/sfx_demon_show.wav',
    demonLeap: 'assets/sounds/sfx_demon_leap.wav',
    demonHang: 'assets/sounds/sfx_demon_hang.wav',
    demonDown: 'assets/sounds/sfx_demon_down.wav',
    hit: 'assets/sounds/sfx_hit.wav',
    lava: 'assets/sounds/sfx_lava.wav',
    fall: 'assets/sounds/sfx_fall.wav',
    caught: 'assets/sounds/sfx_caught.wav',
    collapse: 'assets/sounds/sfx_collapse.wav',
    continue: 'assets/sounds/sfx_continue.wav',
    station: 'assets/sounds/sfx_station.wav',
    depart: 'assets/sounds/sfx_depart.wav',
    coin: 'assets/sounds/sfx_coin.wav',
    bought: 'assets/sounds/sfx_bought.wav',
    button: 'assets/sounds/sfx_button.wav',
};
Game.LOOPS = {
    wheels: 'assets/sounds/loop_wheels.wav',
    steam: 'assets/sounds/loop_steam.wav',
    rumble: 'assets/sounds/loop_rumble.wav',
};
Game.MUSIC = 'assets/sounds/music_tunnel.wav';
