// Game.js — Rail Link: Collapse game flow on top of the kit: a run (CollapseRules.js), the tunnel
// (CollapseScene.js), input, HUD and the end of a run. main.js creates it (window.app.game) and
// calls update(dt) every frame BEFORE the render. The rules decide everything; this file feeds them
// taps, shows their state through UI.get(id) (records in UILayout.js) and turns their events into
// effects, haptics and the record.

class Game {
    /** @param {{ scene: CollapseScene }} app */
    constructor(app) {
        this.app = app;
        this.scene = app.scene;
        /** @type {CollapseRun | null} */
        this.run = null;
        this.paused = false;
        this.best = parseInt(Store.get('collapse.best') || '0', 10) || 0;
        TG.loadBest(m => { if (m > this.best) { this.best = m; this._hudBest(); } });

        const restart = UI.get('restartBtn');
        if (restart) restart.onClick(() => this.start());
        const cont = UI.get('continueBtn');
        if (cont) cont.onClick(() => this.continueForAd());
        const pause = UI.get('pauseBtn');
        if (pause) pause.onClick(() => this.setPaused(!this.paused));

        const canvas = this.scene.canvas;
        canvas.addEventListener('pointerdown', e => this.tap(e));
        TG.boot(() => this.setPaused(true));

        // The first frame shows the tunnel behind the intro dialog.
        this.run = new CollapseRun(Game.newSeed());
        this.scene.sync(this.run, 0);
        this._dialog('Rail Link: Collapse', 'Тап по табличке развилки —\nмашинист стреляет по стрелке.\nКаждый выстрел стоит патрон.', 'Поехали', false);
        this._hudBest();
    }

    static newSeed() {
        return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    }

    start() {
        this.run = new CollapseRun(Game.newSeed());
        this.paused = false;
        this._show('over', false);
        this._show('hint', true);
        TG.runStarted();
    }

    setPaused(on) {
        if (!this.run || this.run.state !== 'run') return;
        this.paused = !!on;
        const b = UI.get('pauseBtn');
        if (b) b.setText(this.paused ? '▶' : 'II');
        if (this.paused) this._dialog('Пауза', 'Забег стоит.\nОбвал тоже.', 'Заново', false, 'Дальше');
        else this._show('over', false);
    }

    // A tap on the canvas: the nearest fork sign or the demon within reach.
    tap(e) {
        const run = this.run;
        if (!run || run.state !== 'run' || this.paused) return;
        const r = this.scene.canvas.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const reach = Math.max(56, r.width * 0.16);
        let best = null, bestD = reach;
        for (const t of this.scene.tapTargets(run)) {
            const d = Math.hypot(t.x - px, t.y - py);
            if (d < bestD) { best = t; bestD = d; }
        }
        if (!best) return;
        const res = best.kind === 'demon' ? run.shootDemon() : run.shoot(best.at, best.to);
        if (res === 'no-ammo') TG.haptic('deny');
    }

    async continueForAd() {
        const run = this.run;
        if (!run || !run.canContinue) return;
        this._show('continueBtn', false);
        const granted = await Ads.rewarded();
        if (granted && run.continueRun()) {
            this._show('over', false);
            TG.runStarted();
        } else {
            this._show('continueBtn', false);
        }
    }

    update(dt) {
        const run = this.run;
        if (!run) return;
        if (this._resumeQueued) { this._resumeQueued = false; this.paused = false; this._show('over', false); }
        if (!this.paused && run.state === 'run' && !this._overVisible) run.update(dt);
        for (const ev of run.takeEvents()) this._onEvent(ev);
        this.scene.sync(run, dt);
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
            const m = run.meters;
            const record = m > this.best;
            if (record) {
                this.best = m;
                Store.set('collapse.best', String(m));
                TG.saveBest(m);
                TG.haptic('record');
            }
            this._hudBest();
            const why = { gap: 'Поезд ушёл в провал.', lava: 'Поток лавы накрыл паровоз.', demon: 'Демон добрался до кабины.', caught: 'Обвал догнал поезд.' }[run.reason] || '';
            setTimeout(() => {
                this._dialog(record ? 'Новый рекорд!' : 'Обвал', why + '
Пройдено ' + m + ' м.', 'Заново', run.canContinue);
            }, 700);
        }
    }

    _dialog(title, text, button, canContinue, resume) {
        const t = UI.get('overTitle'); if (t) t.setText(title);
        const x = UI.get('overText'); if (x) x.setText(text);
        const b = UI.get('restartBtn'); if (b) b.setText(button);
        const c = UI.get('continueBtn');
        if (c) {
            c.setText(resume || 'Продолжить за рекламу');
            c.show(!!canContinue || !!resume);
            c.onClick(resume ? () => { this._resumeQueued = true; } : () => this.continueForAd());
        }
        this._show('hint', false);
        this._show('over', true);
    }

    _show(id, on) {
        const el = UI.get(id);
        if (el) el.show(on);
        if (id === 'over') this._overVisible = on;
    }

    _hudBest() {
        const b = UI.get('best');
        if (b) b.setText('Рекорд ' + this.best + ' м');
    }

    _hud(run) {
        const set = (id, text) => { const el = UI.get(id); if (el) el.setText(text); };
        set('dist', run.meters + ' м');
        set('ammo', 'Патроны ' + run.ammo);
        set('rescue', 'Спасение ' + run.rescue);
        set('shield', 'Щит ' + run.shield);
        set('effect', run.boost > 0 ? 'Ускоритель ' + run.boost.toFixed(1) + ' с' : run.slow > 0 ? 'Замедлитель ' + run.slow.toFixed(1) + ' с' : '');
        const chase = UI.get('chase');
        if (chase) chase.setValue(Math.max(0, Math.min(1, (run.pos - run.front) / run.c.frontMaxGap)));
        const next = run.nextFork();
        set('hint', run.ammo <= 0 ? 'Патроны кончились — ищи ящик с патронами'
            : next && !next.armed ? 'Тап по табличке — выстрел по стрелке' : '');
    }
}
