// CollapseStations.js — stations in the endless run (card 38), only with ?stations in the address.
// Everything lives here and extends the rules from outside: CollapseRules.js does not know about it,
// so the plain run, its replay and the leaderboard function (it bundles CollapseRules.js only) stay as
// they were. The file is loaded after Game.js and never reaches the server: a station run is not
// sent to the table.
//
// The loop: money on the track -> the stop at a station, the collapse left behind -> the shop -> the
// next stretch, denser and in its own hue. The run owns all of it; Game shows it through hud() and
// CollapseStationView draws it. Money ends with the run: nothing is stored.

/** @satisfies {Record<string, any>} */
const CollapseStations = {
    GOODS: ['ammo', 'shield', 'rescue'],
    on: typeof location !== 'undefined' && new URLSearchParams(location.search).has('stations'),
    /** @type {CollapseStationView | null} */
    view: null,
    _bound: false,

    // All the numbers of Constants.js with defaults, apart from CollapseRules.cfg(): they stay out of
    // the fingerprint of the rules.
    cfg() {
        const U = 'undefined';
        return {
            stretch: typeof COLLAPSE_STATION_STRETCH !== U ? COLLAPSE_STATION_STRETCH : 100,
            approach: typeof COLLAPSE_STATION_APPROACH !== U ? COLLAPSE_STATION_APPROACH : 12,
            after: typeof COLLAPSE_STATION_AFTER !== U ? COLLAPSE_STATION_AFTER : 4,
            stopSec: typeof COLLAPSE_STATION_STOP_SEC !== U ? COLLAPSE_STATION_STOP_SEC : 8,
            respiteSec: typeof COLLAPSE_STATION_RESPITE_SEC !== U ? COLLAPSE_STATION_RESPITE_SEC : 10,
            brake: typeof COLLAPSE_STATION_BRAKE !== U ? COLLAPSE_STATION_BRAKE : 6,
            crawl: typeof COLLAPSE_STATION_CRAWL !== U ? COLLAPSE_STATION_CRAWL : 0.25,
            hardStep: typeof COLLAPSE_STATION_HARD_STEP !== U ? COLLAPSE_STATION_HARD_STEP : 0.4,
            frontStep: typeof COLLAPSE_STATION_FRONT_STEP !== U ? COLLAPSE_STATION_FRONT_STEP : 0.1,
            moneyEvery: typeof COLLAPSE_STATION_MONEY_EVERY !== U ? COLLAPSE_STATION_MONEY_EVERY : 2,
            moneyValue: typeof COLLAPSE_STATION_MONEY_VALUE !== U ? COLLAPSE_STATION_MONEY_VALUE : 5,
            moneySwitch: typeof COLLAPSE_STATION_MONEY_SWITCH !== U ? COLLAPSE_STATION_MONEY_SWITCH : 0.2,
            price: {
                ammo: typeof COLLAPSE_STATION_PRICE_AMMO !== U ? COLLAPSE_STATION_PRICE_AMMO : 30,
                shield: typeof COLLAPSE_STATION_PRICE_SHIELD !== U ? COLLAPSE_STATION_PRICE_SHIELD : 50,
                rescue: typeof COLLAPSE_STATION_PRICE_RESCUE !== U ? COLLAPSE_STATION_PRICE_RESCUE : 80,
            },
            tints: [
                typeof COLLAPSE_STATION_TINT_0 !== U ? COLLAPSE_STATION_TINT_0 : 0xffffff,
                typeof COLLAPSE_STATION_TINT_1 !== U ? COLLAPSE_STATION_TINT_1 : 0x9fd0ff,
                typeof COLLAPSE_STATION_TINT_2 !== U ? COLLAPSE_STATION_TINT_2 : 0xb8ff9a,
                typeof COLLAPSE_STATION_TINT_3 !== U ? COLLAPSE_STATION_TINT_3 : 0xe0a0ff,
            ],
        };
    },

    // Every run of Game.start: the frame of a station run, or the plain frame back (the tutorial).
    dress(game, run) {
        if (!this.on) return;
        const on = !!run.stations;
        if (!this._bound) {
            this._bound = true;
            for (const kind of this.GOODS) {
                const b = UI.get('station' + this._id(kind));
                if (b) b.onClick(() => { if (game.run.stations) game.run.buy(kind); });
            }
            const go = UI.get('stationGo');
            if (go) go.onClick(() => { if (game.run.stations) game.run.leave(); });
        }
        game._show('best', !on);
        game._show('recordIcon', !on);
        for (const id of ['stationMoney', 'stationMoneyIcon', 'stationNext']) game._show(id, on);
        game._show('stationShop', false);
        if (!this.view) this.view = new CollapseStationView(game.scene);
        this.view.sync(run);
    },

    _id(kind) { return kind[0].toUpperCase() + kind.slice(1); },

    // The frame and the shop during a station run, every frame; the rules decide, this only shows.
    hud(game, run) {
        game._show('hint', false);
        game._set('stationMoney', String(run.money));
        game._set('stationNext', Lang.t('stationNext', { value: run.toStation }));
        game._show('stationNext', !run.atStation);
        game._show('stationShop', run.atStation);
        if (run.atStation) {
            game._set('stationTitle', Lang.t('stationTitle', { value: run.stage + 1 }));
            for (const kind of this.GOODS) {
                const id = 'station' + this._id(kind), why = run.refusal(kind);
                game._set(id, Lang.t(why === 'full' ? 'station.full.' + kind : 'station.' + kind, { value: run.goods(kind), price: run.st.price[kind] }));
                const b = UI.get(id);
                if (b && b._enabled !== !why) b.setEnabled(!why);
            }
            game._set('stationGo', Lang.t('stationGo', { value: Math.ceil(run.stopLeft) }));
        }
        if (this.view) this.view.sync(run);
    },
};

// The track with stations: the plain generator between them, on the same dice; a station is a calm
// stretch laid at the first pattern boundary after its planned place, so nothing hangs over it. Money
// has its own dice and only fills free places: it moves no hazard of the stretch it lies on.
class CollapseStationTrack extends CollapseTrack {
    constructor(seed) {
        super(seed);
        this.st = CollapseStations.cfg();
        /** @type {number[]} */
        this.stations = [];                // the boundary of each stop, in order
        this.moneyDice = CollapseRules.rng(this.seed ^ 0x5eed);
        this.moneyLane = 1;
    }

    // Boundary of stop k. The generator goes as far as it takes: one seed, one place of every stop.
    station(k) {
        while (this.stations.length <= k) this._pattern();
        return this.stations[k];
    }

    _pattern() {
        const at = this.segs.length, s = this.st, n = this.stations.length;
        if (at + s.approach >= (n ? this.stations[n - 1] : 0) + s.stretch) { this._station(at); return; }
        super._pattern();
        this._money(at);
    }

    _station(at) {
        const s = this.st;
        for (let i = 0; i < s.approach + s.after; i++) this._push(collapseSegment('station'));
        this.stations.push(at + s.approach);
        // The next stretch: the generator is that much farther along, demons are that much likelier.
        const k = 1 + s.hardStep, base = this.cfg;
        this.cfg = Object.assign({}, base, { difficultySegs: base.difficultySegs / k, demonChance: Math.min(1, base.demonChance * k) });
    }

    // A line of money along the safe track of the new pattern, every moneyEvery segments.
    _money(from) {
        const s = this.st, roll = this.moneyDice;
        for (let i = from; i < this.segs.length; i++) {
            if (i % s.moneyEvery) continue;
            const seg = this.segs[i];
            const free = [0, 1, 2].filter(l => !seg.gap[l] && !seg.lava[l] && !seg.pickup[l]);
            if (!free.length) continue;
            if (!free.includes(this.moneyLane) || roll() < s.moneySwitch) this.moneyLane = free[Math.floor(roll() * free.length)];
            seg.pickup[this.moneyLane] = 'money';
        }
    }
}

// The run with stations. The train brakes into the stop and stands there; the collapse stands still
// from the approach on, so the gap grows by itself, and catches up over respiteSec after the stop.
// The journal gains [step, 'b', kind] a purchase and [step, 'n'] the "go on" button.
class CollapseStationRun extends CollapseRun {
    constructor(seed) {
        super(seed, new CollapseStationTrack(seed));
        this.st = CollapseStations.cfg();
        this.stations = true;
        this.gapBase = this.c.frontMaxGap;
        this.money = 0;
        this.stage = 0;               // stations passed, the stretch the train is on
        this.earned = [0];            // money of every stretch, for the balance table
        this.stopLeft = 0;            // s of the stop left, 0 — on the way
        this.stationAt = /** @type {CollapseStationTrack} */ (this.track).station(0);
        this.leftAt = -1e9;           // the boundary of the last stop
    }

    get atStation() { return this.stopLeft > 0; }

    // m to the next stop: the HUD's number.
    get toStation() { return Math.max(0, Math.ceil((this.stationAt - this.pos) * this.c.segMeters)); }

    speed() {
        if (this.stopLeft > 0) return 0;
        const s = this.st, near = Math.min(this.stationAt - this.pos, this.pos - this.leftAt);
        return super.speed() * Math.max(s.crawl, Math.min(1, near / s.brake));
    }

    frontSpeed() {
        const s = this.st;
        return this.pos >= this.stationAt - s.approach ? 0 : super.frontSpeed() + s.frontStep * this.stage;
    }

    // Money is not a pickup for the HUD: no icon, no portrait, no haptics per coin. A standing train
    // has nothing coming at it.
    ahead(sec, enter, reach = enter) { return this.atStation ? [] : super.ahead(sec, enter, reach).filter(item => item.kind !== 'money'); }

    _collect(i) {
        if (this.track.seg(i).pickup[this.lane] !== 'money' || this._taken.has(i)) { super._collect(i); return; }
        this._taken.add(i);
        this.money += this.st.moneyValue;
        this.earned[this.stage] += this.st.moneyValue;
        this.events.push({ type: 'money', at: i });
    }

    _step(h) {
        if (this.stopLeft > 0) {
            this.steps++;
            this.time += h;
            this.stopLeft -= h;
            if (this.stopLeft <= 0) this._depart();
            return;
        }
        super._step(h);
        if (this.state !== 'run') return;
        const s = this.st, c = this.c;
        if (this.pos >= this.stationAt - s.approach) c.frontMaxGap = this.gapBase + s.approach;
        else c.frontMaxGap = Math.max(this.gapBase, c.frontMaxGap - s.approach / s.respiteSec * h);
        if (this.pos >= this.stationAt) {
            this.pos = this.stationAt;
            this.stopLeft = s.stopSec;
            this.events.push({ type: 'station', at: this.stationAt });
        }
    }

    _depart() {
        this.stopLeft = 0;
        this.leftAt = this.stationAt;
        this.stage++;
        this.earned.push(0);
        this.stationAt = /** @type {CollapseStationTrack} */ (this.track).station(this.stage);
        this.events.push({ type: 'departed', stage: this.stage });
    }

    // What one purchase gives.
    goods(kind) { return kind === 'ammo' ? this.c.ammoPickup : 1; }

    // Why `kind` cannot be bought now: '' — it can. The shop only shows this.
    refusal(kind) {
        const c = this.c, price = this.st.price[kind];
        if (price === undefined || !this.atStation) return 'closed';
        if ((kind === 'shield' && this.shield >= c.shieldMax) || (kind === 'rescue' && this.rescue >= c.rescueMax)) return 'full';
        return this.money < price ? 'no-money' : '';
    }

    buy(kind) {
        const why = this.refusal(kind);
        if (why) return why;
        this.money -= this.st.price[kind];
        if (kind === 'ammo') this.ammo += this.goods(kind);
        else if (kind === 'shield') this.shield++;
        else this.rescue++;
        this.log.push([this.steps, 'b', kind]);
        this.events.push({ type: 'bought', kind });
        return 'ok';
    }

    // The "go on" button: the stop ends now; without it the time does that.
    leave() {
        if (!this.atStation) return 'invalid';
        this.log.push([this.steps, 'n']);
        this._depart();
        return 'ok';
    }

    // CollapseRun.replay for this journal, with the same contract: the ended run or null.
    static replay(seed, log, maxSteps) {
        const run = new CollapseStationRun(seed);
        const advance = to => {
            while (run.state === 'run' && run.steps < to) {
                run._step(CollapseRules.STEP);
                run.events.length = 0;
            }
        };
        for (const [step, act, a, b] of log) {
            if (!Number.isInteger(step) || step < run.steps || step > maxSteps) return null;
            advance(step);
            if (run.steps !== step) return null;
            const done = act === 'f' ? run.shoot(a, b) === 'ok'
                : act === 'd' ? run.shootDemon(a) === 'ok'
                : act === 'b' ? run.buy(a) === 'ok'
                : act === 'n' ? run.leave() === 'ok'
                : act === 'c' && run.continueRun();
            if (!done) return null;
        }
        advance(maxSteps);
        return run.state === 'over' ? run : null;
    }
}

// The station in the tunnel: a ready arch of the collapse art behind the stopped train, heaps of the
// same bricks at its feet, the stop's number on a plate beside the loco, the hue of the stretch on the
// light of the tunnel. The frame is narrow and ends at the height of the chimney, so all of it stands
// low and deep; the plate goes with the train's lane. Draws only: the place and the stage come from the run.
class CollapseStationView {
    /** @param {CollapseScene} host */
    constructor(host) {
        const A = CollapseStationView;
        this.host = host;
        this.rig = host.rig;
        this.air = host.rig.air.clone();
        this.torch = host.rig.torchCol.slice();
        this.lamp = host.rig.lampCol.slice();
        this.tint = -1;
        // The coin's art is square and a pickup's sprite is not: it stands in the middle of the sprite.
        const coin = host.spriteMat('pickup-money', /** @type {any} */ (CollapseArt.pickup).money).emissiveTexture;
        coin.vScale = A.COIN_V;
        coin.vOffset = (1 - A.COIN_V) / 2;
        this.tints = CollapseStations.cfg().tints;
        /** @type {any[]} */
        this.parts = [];
        const gate = host.sprite('station-gate', 'station-gate', A.ARCH, A.GATE.w, A.GATE.h, false);
        this.parts.push({ mesh: gate, x: 0, y: 0, z: A.GATE.z });
        A.HEAPS.forEach(([x, z, size], i) => {
            const url = CollapseArt.brick[i % CollapseArt.brick.length];
            const mesh = host.sprite('station-heap', 'station-heap-' + i, url, size, size);
            this.parts.push({ mesh, x, y: 0, z });
        });
        /** @type {any[]} */
        this.digits = [];
        const P = A.PLATE, plate = host.sprite('station-plate', 'station-plate', A.PLATE_ART, P.w, P.h);
        this.parts.push({ mesh: plate, x: 0, y: P.y, z: P.z, beside: true });
        for (let i = 0; i < 2; i++) {
            const mesh = host.sprite('station-digit', 'station-digit-' + i, UI.DIGITS[0], P.digitW, P.digitH);
            const part = { mesh, x: 0, y: P.y + (P.h - P.digitH) / 2, z: P.z + 4, beside: true };
            this.digits.push(part);
            this.parts.push(part);
        }
        this.shown = '';
        this.lane = 1;
        this._place(null);
    }

    _place(run) {
        const S = CollapseScene, stop = run && run.stations ? run.stationAt : 0;
        // The last stop stays in sight behind a departing train.
        const at = run && run.stations && run.leftAt > 0 && run.pos - run.leftAt < S.BEHIND ? run.leftAt : stop;
        const z = run ? (at - run.pos) * S.SEG : 0;
        const on = !!run && !!run.stations && z < (S.AHEAD + 2) * S.SEG && z > -S.BEHIND * S.SEG;
        if (on && z >= 0) this.lane = run.lane;       // the plate stays where the train stopped
        const beside = S.laneX(this.lane) + (this.lane === 2 ? -1 : 1) * CollapseStationView.PLATE.side;
        for (const p of this.parts) {
            p.mesh.setEnabled(on);
            if (on) p.mesh.position.set(p.x + (p.beside ? beside : 0), p.y, z + p.z);
        }
        return on ? at : -1;
    }

    // One stop's number: the number of the station the train comes to, counted from 1.
    _number(run, at) {
        const n = String((run.track.stations.indexOf(at) + 1) % 100);
        if (n === this.shown) return;
        this.shown = n;
        this.digits.forEach((part, i) => {
            part.mesh.isVisible = i < n.length;
            part.x = (i - (n.length - 1) / 2) * CollapseStationView.PLATE.digitW;
            if (i < n.length) this.host._setSpriteTex(part.mesh.material, UI.DIGITS[Number(n[i])]);
        });
    }

    sync(run) {
        const at = this._place(run);
        if (at >= 0) this._number(run, at);
        const hue = run.stations ? run.stage + (run.atStation ? 1 : 0) : 0;
        if (hue === this.tint) return;
        this.tint = hue;
        const t = World3D.hexColor3(this.tints[hue % this.tints.length]), rig = this.rig;
        rig.air.copyFromFloats(this.air.r * t.r, this.air.g * t.g, this.air.b * t.b);
        for (const [col, base] of [[rig.torchCol, this.torch], [rig.lampCol, this.lamp]]) {
            col[0] = base[0] * t.r;
            col[1] = base[1] * t.g;
            col[2] = base[2] * t.b;
        }
    }
}

CollapseStationView.ARCH = 'assets/sprites/world/bg_02_arches.png';
CollapseStationView.COIN_V = 1.5;                                   // the sprite's height over its width, the coin's art is square
CollapseStationView.PLATE_ART = 'assets/ui/hud_v3/counter_socket.png';
CollapseStationView.GATE = { w: 1100, h: 430, z: -1250 };           // the arch, world units: three lanes under it, behind the stopped train
// The stop's number: the plate beside the loco on a side the frame shows, its digits.
CollapseStationView.PLATE = { w: 150, h: 96, y: 170, z: -240, side: 225, digitW: 52, digitH: 78 };
// The brick heaps at the feet of the arch: [x, z from the stop, size], world units.
CollapseStationView.HEAPS = [[-470, -1200, 220], [470, -1200, 240], [-430, -1500, 260], [430, -1500, 240], [-400, -1800, 200], [400, -1800, 220]];

// Money stands on the track as a pickup: the star of the ready interface art, only in this mode.
if (CollapseStations.on) /** @type {any} */ (CollapseArt.pickup).money = 'assets/px/ui/star_full.png';
