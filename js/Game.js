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
        this.best = parseInt(Store.get('collapse.best') || '0', 10) || 0;
        /** @type {Map<string, string>} */
        this._hudText = new Map();    // what the HUD shows: a DOM write only on change
        TG.loadBest(m => { if (m > this.best) { this.best = m; Store.set('collapse.best', String(m)); this._hudBest(); } });

        const pause = UI.get('pauseBtn');
        if (pause) pause.onClick(() => this.setPaused(this.mode !== 'pause'));
        this.scene.canvas.addEventListener('pointerdown', e => this.tap(e));

        // The first frame shows the tunnel behind the intro dialog.
        this.run = new CollapseRun(Game.newSeed());
        this.scene.sync(this.run, 0);
        this._dialog('Rail Link: Collapse',
            'Тап по табличке развилки —\nмашинист стреляет по стрелке.\nКаждый выстрел стоит патрон.',
            ['Поехали', () => this.start()]);
        this._hudBest();
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
        this.scene.sync(run, this.mode === 'pause' ? 0 : dt);
        this._hud(run);
    }

    _onEvent(ev) {
        const run = this.run;
        this.scene.onEvent(ev, run);
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

Game.REASONS = {
    gap: 'Поезд ушёл в провал.',
    lava: 'Поток лавы накрыл паровоз.',
    demon: 'Демон добрался до кабины.',
    caught: 'Обвал догнал поезд.',
};
