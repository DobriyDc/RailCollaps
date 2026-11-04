// CollapseStationRules.js — the stations of the endless run: the rules, without 3D and DOM. The game
// plays them and the leaderboard function replays them (tools/build-worker.mjs takes this file whole).
// CollapseStations.js only shows what happens here.
//
// The loop: three passengers board at the depot, the train carries them to the next stop, each one
// who gets there pays in tokens, and a lost life puts one off the train unpaid. At the stop the tokens
// buy repairs, supplies and wagons. Tokens and wagons end with the run: nothing is stored.

/** @satisfies {Record<string, any>} */
const CollapseStationRules = {
    GOODS: ['repair', 'ammo', 'shield', 'rescue', 'wagon'],

    // All the numbers of Constants.js with defaults.
    cfg() {
        const U = 'undefined';
        return {
            first: typeof COLLAPSE_STATION_FIRST !== U ? COLLAPSE_STATION_FIRST : 130,
            stretch: typeof COLLAPSE_STATION_STRETCH !== U ? COLLAPSE_STATION_STRETCH : 125,
            stretchMax: typeof COLLAPSE_STATION_STRETCH_MAX !== U ? COLLAPSE_STATION_STRETCH_MAX : 225,
            approach: typeof COLLAPSE_STATION_APPROACH !== U ? COLLAPSE_STATION_APPROACH : 12,
            after: typeof COLLAPSE_STATION_AFTER !== U ? COLLAPSE_STATION_AFTER : 12,
            stopSec: typeof COLLAPSE_STATION_STOP_SEC !== U ? COLLAPSE_STATION_STOP_SEC : 8,
            respiteSec: typeof COLLAPSE_STATION_RESPITE_SEC !== U ? COLLAPSE_STATION_RESPITE_SEC : 10,
            brake: typeof COLLAPSE_STATION_BRAKE !== U ? COLLAPSE_STATION_BRAKE : 6,
            crawl: typeof COLLAPSE_STATION_CRAWL !== U ? COLLAPSE_STATION_CRAWL : 0.25,
            hardStep: typeof COLLAPSE_STATION_HARD_STEP !== U ? COLLAPSE_STATION_HARD_STEP : 0.4,
            demonStep: typeof COLLAPSE_STATION_DEMON_STEP !== U ? COLLAPSE_STATION_DEMON_STEP : 0.1,
            eventStep: typeof COLLAPSE_STATION_EVENT_STEP !== U ? COLLAPSE_STATION_EVENT_STEP : 0.04,
            frontStep: typeof COLLAPSE_STATION_FRONT_STEP !== U ? COLLAPSE_STATION_FRONT_STEP : 0.1,
            seats: typeof COLLAPSE_STATION_SEATS !== U ? COLLAPSE_STATION_SEATS : 3,
            wagonSeats: typeof COLLAPSE_WAGON_SEATS !== U ? COLLAPSE_WAGON_SEATS : 3,
            wagonSlow: typeof COLLAPSE_WAGON_SLOW !== U ? COLLAPSE_WAGON_SLOW : 0.02,
            fare: typeof COLLAPSE_STATION_FARE !== U ? COLLAPSE_STATION_FARE : 10,
            fareStep: typeof COLLAPSE_STATION_FARE_STEP !== U ? COLLAPSE_STATION_FARE_STEP : 2,
            price: {
                repair: typeof COLLAPSE_STATION_PRICE_REPAIR !== U ? COLLAPSE_STATION_PRICE_REPAIR : 20,
                ammo: typeof COLLAPSE_STATION_PRICE_AMMO !== U ? COLLAPSE_STATION_PRICE_AMMO : 15,
                shield: typeof COLLAPSE_STATION_PRICE_SHIELD !== U ? COLLAPSE_STATION_PRICE_SHIELD : 30,
                rescue: typeof COLLAPSE_STATION_PRICE_RESCUE !== U ? COLLAPSE_STATION_PRICE_RESCUE : 45,
                wagon: typeof COLLAPSE_STATION_PRICE_WAGON !== U ? COLLAPSE_STATION_PRICE_WAGON : 80,
            },
        };
    },
};

// The track with stations: seeded spacing independent of obstacle generation; a station is a calm
// stretch at an exact planned position. Whole obstacle patterns fit before its approach.
class CollapseStationTrack extends CollapseTrack {
    constructor(seed) {
        super(seed);
        this.st = CollapseStationRules.cfg();
        /** @type {number[]} */
        this.stations = [];                // the boundary of each stop, in order
        this.demonBase = this.cfg.demonChance;
        this.stationDice = CollapseRules.rng(this.seed ^ 0x51ed270b);
        this.nextStation = this.st.first;
    }

    // Boundary of stop k. The generator goes as far as it takes: one seed, one place of every stop.
    station(k) {
        while (this.stations.length <= k) this._pattern();
        return this.stations[k];
    }

    _pattern() {
        const at = this.segs.length, approachAt = this.nextStation - this.st.approach;
        if (at >= approachAt) { this._station(at); return; }
        const saved = [this.lastFork, this.lastDemon, this.rescues];
        super._pattern();
        // Reject the entire last pattern if it crosses the station approach. Cutting a hazard in
        // half could leave its escape fork without a return. Fill the remaining distance safely.
        if (this.segs.length > approachAt) {
            this.segs.length = at;
            [this.lastFork, this.lastDemon, this.rescues] = saved;
            this._calm(approachAt - at);
        }
    }

    _station(at) {
        const s = this.st;
        for (let i = 0; i < s.approach + s.after; i++) this._push(collapseSegment('station'));
        this.stations.push(at + s.approach);
        this.nextStation = at + s.approach + s.stretch + Math.floor(this.stationDice() * (s.stretchMax - s.stretch + 1));
        // The next stretch: the generator is that much farther along; past every second stop demons are
        // demonStep likelier than at the depot (the owner, 2026-11-03: no more than 10 %).
        const k = 1 + s.hardStep, base = this.cfg, n = this.stations.length;
        this.cfg = Object.assign({}, base, { difficultySegs: base.difficultySegs / k, demonChance: Math.min(1, this.demonBase * (1 + s.demonStep * Math.floor(n / 2))) });
    }
}

// The run with stations. The train brakes into the stop and stands there; the collapse stands still
// from the approach on, so the gap grows by itself, and catches up over respiteSec after the stop.
// The journal gains [step, 'b', kind] a purchase and [step, 'n'] the "go on" button.
class CollapseStationRun extends CollapseRun {
    constructor(seed) {
        super(seed, new CollapseStationTrack(seed));
        this.st = CollapseStationRules.cfg();
        this.stations = true;
        /** @type {number | null} */
        this.daily = null;            // the day of a daily run (CollapseDaily), set by the game; the rules never read it
        this.gapBase = this.c.frontMaxGap;
        this.money = 0;               // tokens
        this.wagons = 0;              // bought for this run only
        this.passengers = this.st.seats;
        this.delivered = 0;           // passengers paid for over the run
        /** @type {{ riders: number, amount: number, seats: number } | null} */
        this.paid = null;             // what the last stop paid
        this.stage = 0;               // stations passed, the stretch the train is on
        this.stopLeft = 0;            // s of the stop left, 0 — on the way
        this.stationAt = /** @type {CollapseStationTrack} */ (this.track).station(0);
        this.leftAt = -1e9;           // the boundary of the last stop
        this.eventBase = this.c.eventChance;
    }

    get atStation() { return this.stopLeft > 0; }
    get seats() { return this.st.seats + this.wagons * this.st.wagonSeats; }
    get speedFactor() { return Math.pow(1 - this.st.wagonSlow, this.wagons); }

    // m to the next stop: the HUD's number.
    get toStation() { return Math.max(0, Math.ceil((this.stationAt - this.pos) * this.c.segMeters)); }

    // Tokens one passenger pays at the end of this stretch.
    get fare() { return this.st.fare + this.st.fareStep * this.stage; }

    speed() {
        if (this.stopLeft > 0) return 0;
        const s = this.st, near = Math.min(this.stationAt - this.pos, this.pos - this.leftAt);
        return super.speed() * this.speedFactor * Math.max(s.crawl, Math.min(1, near / s.brake));
    }

    frontSpeed() {
        const s = this.st;
        return this.pos >= this.stationAt - s.approach ? 0 : super.frontSpeed() + s.frontStep * this.stage;
    }

    // A standing train has nothing coming at it.
    ahead(sec, enter, reach = enter) { return this.atStation ? [] : super.ahead(sec, enter, reach); }

    // A lost life costs a passenger; a shield saves both.
    _hit(reason) {
        const hp = this.hp;
        super._hit(reason);
        if (this.hp < hp && this.passengers > 0) this.passengers--;
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
            this._arrive();
        }
    }

    // Those who got here pay, the empty seats fill up for the next stretch.
    _arrive() {
        const riders = this.passengers, amount = riders * this.fare;
        this.money += amount;
        this.delivered += riders;
        this.paid = { riders, amount, seats: this.seats };
        this.passengers = this.seats;
        this.events.push({ type: 'station', at: this.stationAt });
        if (amount) this.events.push({ type: 'paid', riders, amount });
    }

    _depart() {
        this.stopLeft = 0;
        this.leftAt = this.stationAt;
        this.stage++;
        // Past every second stop a collapse is likelier (the owner, 2026-11-03).
        this.c.eventChance = Math.min(1, this.eventBase + this.st.eventStep * Math.floor(this.stage / 2));
        this.stationAt = /** @type {CollapseStationTrack} */ (this.track).station(this.stage);
        this.events.push({ type: 'departed', stage: this.stage });
    }

    // What one purchase gives.
    goods(kind) { return kind === 'ammo' ? this.c.ammoPickup : kind === 'wagon' ? this.st.wagonSeats : 1; }

    // Why `kind` cannot be bought now: '' — it can. The shop only shows this.
    refusal(kind) {
        const c = this.c, price = this.st.price[kind];
        if (price === undefined || !this.atStation) return 'closed';
        if ((kind === 'repair' && this.hp >= c.hpMax) || (kind === 'shield' && this.shield >= c.shieldMax) || (kind === 'rescue' && this.rescue >= c.rescueMax)) return 'full';
        return this.money < price ? 'no-money' : '';
    }

    buy(kind) {
        const why = this.refusal(kind);
        if (why) return why;
        this.money -= this.st.price[kind];
        if (kind === 'ammo') this.ammo += this.goods(kind);
        else if (kind === 'repair') this.hp++;
        else if (kind === 'shield') this.shield++;
        else if (kind === 'wagon') { this.wagons++; this.passengers += this.st.wagonSeats; }
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

// The daily run (owner, 2026-11-04): one track a day for everyone, with a table of its own. The day turns at
// midnight UTC + COLLAPSE_DAILY_SHIFT_H hours (Moscow), its seed is the day's number mixed. Pure: the game
// and the function count the same day and the same seed.
/** @satisfies {Record<string, any>} */
const CollapseDaily = {
    day(ms) {
        const shift = typeof COLLAPSE_DAILY_SHIFT_H !== 'undefined' ? COLLAPSE_DAILY_SHIFT_H : 3;
        return Math.floor((ms + shift * 3600e3) / 86400e3);
    },
    seed(day) {
        let h = Math.imul((day ^ 0x5bd1e995) >>> 0, 0x9e3779b1) >>> 0;
        h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
        return (h ^ (h >>> 13)) >>> 0 || 1;
    },
    // The day of a run's seed: today or yesterday (a run may cross midnight), otherwise -1.
    dayOf(seed, ms) {
        const today = CollapseDaily.day(ms);
        return [today, today - 1].find(d => CollapseDaily.seed(d) === seed) ?? -1;
    },
};
