// CollapseRules.js — Rail Link: Collapse run rules (GDD v3 §3–§7): the seeded track generator and
// the run state. Pure logic without 3D and DOM: CollapseScene.js only draws what this file decides,
// so one seed and one list of taps replay the same run on every device (fixed time step, own PRNG).
//
// Distance is counted in SEGMENTS: segment i spans [i, i + 1). Three lanes, 0..2 left to right as
// the player sees the train on screen. A fork at BOUNDARY i links lane `from` to an adjacent lane
// `to`; the player arms it with a shot (one cartridge) and the train changes lane when it passes i.
// Hazards sit on one lane of one segment: `gap` (the track is gone) or `lava` (a stream from the
// vault). A pickup stands in the middle of a segment and is taken by the train on its lane.

/** @satisfies {Record<string, any>} */
const CollapseRules = {
    LANES: 3,
    STEP: 1 / 60,          // s: the fixed simulation step
    LOOK: 3,               // segments a fork signal checks on its destination lane
    SWITCH_LEN: 0.8,       // segments the train needs to cross to the next lane after a fork
    TRAIN_LEN: 0.35,       // segments: the collapse behind catches the train at this gap
    FORK_RANGE: 6,         // segments: how far ahead the next fork can be armed
    DIFFICULTY_SEGS: 600,  // segments over which the generator goes from calm to dense
    // The generator's dice: pickups and the share of each pattern (the rest of a roll is a detour).
    PICKUPS: ['ammo', 'boost', 'slow', 'shield', 'rescue'],
    PICKUP_WEIGHTS: [0.34, 0.2, 0.16, 0.15, 0.15],
    DEMON_ROLL: 0.12,
    GAP_ROLL: 0.52,
    LAVA_ROLL: 0.66,       // + 0.1 × difficulty

    // All run numbers (Constants.js, GDD v3 §8) with defaults: Constants.js may be older than the code.
    cfg() {
        const U = 'undefined';
        return {
            segMeters: typeof COLLAPSE_SEG_METERS !== U ? COLLAPSE_SEG_METERS : 10,
            speed: typeof COLLAPSE_SPEED !== U ? COLLAPSE_SPEED : 2.2,
            speedGrowth: typeof COLLAPSE_SPEED_GROWTH !== U ? COLLAPSE_SPEED_GROWTH : 0.0025,
            speedMax: typeof COLLAPSE_SPEED_MAX !== U ? COLLAPSE_SPEED_MAX : 4.5,
            frontSpeed: typeof COLLAPSE_FRONT_SPEED !== U ? COLLAPSE_FRONT_SPEED : 1.5,
            frontGrowth: typeof COLLAPSE_FRONT_GROWTH !== U ? COLLAPSE_FRONT_GROWTH : 0.0035,
            frontMax: typeof COLLAPSE_FRONT_MAX !== U ? COLLAPSE_FRONT_MAX : 4.6,
            frontStartGap: typeof COLLAPSE_FRONT_START_GAP !== U ? COLLAPSE_FRONT_START_GAP : 8,
            frontMaxGap: typeof COLLAPSE_FRONT_MAX_GAP !== U ? COLLAPSE_FRONT_MAX_GAP : 14,
            boostMult: typeof COLLAPSE_BOOST_MULT !== U ? COLLAPSE_BOOST_MULT : 1.5,
            boostSec: typeof COLLAPSE_BOOST_SEC !== U ? COLLAPSE_BOOST_SEC : 4,
            slowMult: typeof COLLAPSE_SLOW_MULT !== U ? COLLAPSE_SLOW_MULT : 0.65,
            slowSec: typeof COLLAPSE_SLOW_SEC !== U ? COLLAPSE_SLOW_SEC : 3,
            startAmmo: typeof COLLAPSE_START_AMMO !== U ? COLLAPSE_START_AMMO : 8,
            ammoPickup: typeof COLLAPSE_AMMO_PICKUP !== U ? COLLAPSE_AMMO_PICKUP : 4,
            shieldMax: typeof COLLAPSE_SHIELD_MAX !== U ? COLLAPSE_SHIELD_MAX : 2,
            rescueMax: typeof COLLAPSE_RESCUE_MAX !== U ? COLLAPSE_RESCUE_MAX : 2,
            shieldGap: typeof COLLAPSE_SHIELD_GAP !== U ? COLLAPSE_SHIELD_GAP : 6,
            demonSec: typeof COLLAPSE_DEMON_SEC !== U ? COLLAPSE_DEMON_SEC : 1.6,
            demonEvery: typeof COLLAPSE_DEMON_EVERY !== U ? COLLAPSE_DEMON_EVERY : 60,
            gapMin: typeof COLLAPSE_GAP_MIN !== U ? COLLAPSE_GAP_MIN : 2,
            gapMax: typeof COLLAPSE_GAP_MAX !== U ? COLLAPSE_GAP_MAX : 4,
            reactSec: typeof COLLAPSE_REACT_SEC !== U ? COLLAPSE_REACT_SEC : 0.6,
            continueGap: typeof COLLAPSE_CONTINUE_GAP !== U ? COLLAPSE_CONTINUE_GAP : 8,
            continueGrace: typeof COLLAPSE_CONTINUE_GRACE_SEC !== U ? COLLAPSE_CONTINUE_GRACE_SEC : 1.5,
        };
    },

    // The fastest the train can go at segment `at`: its own speed there under an accelerator.
    // The generator spaces forks by it (GDD v3 §3, invariant 3).
    maxSpeedAt(c, at) {
        return Math.min(c.speedMax, c.speed + c.speedGrowth * at) * Math.max(1, c.boostMult);
    },

    // mulberry32: a tiny PRNG that is the same on every JS engine (Math.random is not seedable).
    rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    neighbors(lane) {
        return [lane - 1, lane + 1].filter(l => l >= 0 && l < CollapseRules.LANES);
    },
};

// One track segment: per-lane hazards and pickups, forks at its start boundary.
function collapseSegment(kind) {
    return { kind, gap: [false, false, false], lava: [false, false, false], pickup: [null, null, null], forks: [], demon: false };
}

// The endless track, generated pattern by pattern on demand. Every hazard on a lane has a fork
// away from it at the boundary before it and a fork back at the boundary after it (GDD v3 §3,
// invariant 1); the destination of the escape fork is safe for the whole hazard. A pattern's first
// fork stands at least reactSec of the fastest allowed travel after the previous fork (invariant 3).
class CollapseTrack {
    constructor(seed) {
        this.seed = seed >>> 0;
        this.rand = CollapseRules.rng(this.seed);
        this.cfg = CollapseRules.cfg();
        /** @type {ReturnType<typeof collapseSegment>[]} */
        this.segs = [];
        this.lastDemon = -1e9;
        this.lastFork = -1e9;   // boundary of the last generated fork
        this._calm(5);          // the depot: a quiet start to read the screen
    }

    seg(i) {
        if (i < 0) return CollapseTrack.BEHIND;
        while (this.segs.length <= i) this._pattern();
        return this.segs[i];
    }

    // Is the lane free of gaps and lava over `n` segments from `from`?
    laneSafe(lane, from, n) {
        for (let i = from; i < from + n; i++) {
            const s = this.seg(i);
            if (s.gap[lane] || s.lava[lane]) return false;
        }
        return true;
    }

    _int(n) { return Math.floor(this.rand() * n); }

    _push(s) {
        if (s.forks.length) this.lastFork = this.segs.length;
        this.segs.push(s);
    }

    _calm(n) {
        for (let i = 0; i < n; i++) this._push(collapseSegment('calm'));
    }

    _pickupKind() {
        let r = this.rand();
        const w = CollapseRules.PICKUP_WEIGHTS;
        for (let i = 0; i < w.length; i++) {
            if ((r -= w[i]) < 0) return CollapseRules.PICKUPS[i];
        }
        return 'ammo';
    }

    _pattern() {
        const R = CollapseRules, c = this.cfg;
        const at = this.segs.length;
        const d = Math.min(1, at / R.DIFFICULTY_SEGS);          // difficulty 0..1
        let calm = Math.round(4 - 3 * d) + this._int(2);
        // The decision window: the pattern's fork (at boundary at + calm) is far enough from the last one.
        while ((at + calm - this.lastFork) / R.maxSpeedAt(c, at + calm) < c.reactSec) calm++;
        this._calm(calm);
        const roll = this.rand();
        if (at - this.lastDemon >= c.demonEvery && roll < R.DEMON_ROLL) this._demon();
        else if (roll < R.GAP_ROLL) this._hazard('gap', c.gapMin + this._int(1 + Math.round((c.gapMax - c.gapMin) * d)));
        else if (roll < R.LAVA_ROLL + 0.1 * d) this._hazard('lava', 1);
        else this._detour();
    }

    // A hazard of `len` segments on one lane: escape forks before it, return forks after it.
    _hazard(type, len) {
        const lane = this._int(CollapseRules.LANES);
        const lead = collapseSegment(type + '-lead');
        for (const to of CollapseRules.neighbors(lane)) lead.forks.push({ from: lane, to });
        this._push(lead);
        for (let i = 0; i < len; i++) {
            const s = collapseSegment(type);
            s[type][lane] = true;
            // A reward on a safe lane beside a long hazard: the escape is also a choice.
            if (i === 1 && this.rand() < 0.5) {
                const side = CollapseRules.neighbors(lane);
                s.pickup[side[this._int(side.length)]] = this._pickupKind();
            }
            this._push(s);
        }
        const back = collapseSegment(type + '-back');
        for (const from of CollapseRules.neighbors(lane)) back.forks.push({ from, to: lane });
        this._push(back);
    }

    // A side trip for a pickup on a calm stretch: fork out, pickup, fork back.
    _detour() {
        const a = this._int(CollapseRules.LANES);
        const side = CollapseRules.neighbors(a);
        const b = side[this._int(side.length)];
        const out = collapseSegment('detour');
        out.forks.push({ from: a, to: b });
        this._push(out);
        const mid = collapseSegment('detour');
        mid.pickup[b] = this._pickupKind();
        this._push(mid);
        const back = collapseSegment('detour');
        back.forks.push({ from: b, to: a });
        this._push(back);
    }

    _demon() {
        const s = collapseSegment('demon');
        s.demon = true;
        this.lastDemon = this.segs.length;
        this._push(s);
    }
}
CollapseTrack.BEHIND = collapseSegment('behind');

// The run: position, lane, resources, the collapse behind, events for the scene and the HUD.
class CollapseRun {
    constructor(seed) {
        this.c = CollapseRules.cfg();
        this.seed = seed >>> 0;
        this.track = new CollapseTrack(this.seed);
        this.pos = 0;                 // segments travelled (the train nose)
        this.lane = 1;
        this.prevLane = 1;
        this.switchAt = -1e9;         // boundary of the last lane change (for the crossing animation)
        this.front = -this.c.frontStartGap;
        this.ammo = this.c.startAmmo;
        this.shield = 0;
        this.rescue = 0;
        this.boost = 0;               // s left
        this.slow = 0;                // s left
        /** @type {{ at: number, from: number, to: number } | null} */
        this.armed = null;
        /** @type {{ at: number, t: number } | null} */
        this.demon = null;
        this.state = 'run';           // 'run' | 'over'
        this.reason = '';             // why the run ended: gap | lava | demon | caught
        this.continued = false;
        this.invuln = 0;              // s of grace after a continue
        this.time = 0;
        this._acc = 0;
        this._seg = 0;                // the last segment the nose entered
        this._taken = new Set();      // segment indexes whose pickup is taken
        /** @type {{ type: string, [key: string]: any }[]} */
        this.events = [];
    }

    get meters() { return Math.floor(this.pos * this.c.segMeters); }

    speed() {
        const c = this.c;
        let v = Math.min(c.speedMax, c.speed + c.speedGrowth * this.pos);
        if (this.boost > 0) v *= c.boostMult;
        if (this.slow > 0) v *= c.slowMult;
        return v;
    }

    frontSpeed() {
        const c = this.c;
        return Math.min(c.frontMax, c.frontSpeed + c.frontGrowth * this.pos);
    }

    // The next fork the train can take from its lane: { at, to: [lanes], armed } or null within `range`.
    nextFork(range = CollapseRules.FORK_RANGE) {
        const from = this.lane;
        for (let b = Math.floor(this.pos) + 1; b <= this.pos + range; b++) {
            if (this.armed && this.armed.at === b) return { at: b, to: [this.armed.to], armed: true };
            const to = this.track.seg(b).forks.filter(f => f.from === from).map(f => f.to);
            if (to.length) return { at: b, to, armed: false };
        }
        return null;
    }

    // Is lane `to` safe after the fork at boundary `at`? Green or red sign (GDD v3 §4).
    forkSafe(at, to) { return this.track.laneSafe(to, at, CollapseRules.LOOK); }

    // Tap on a fork sign: the driver shoots the switch. 'ok' | 'no-ammo' | 'invalid'.
    // The switch already set that way costs nothing; setting it the other way costs a new shot.
    shoot(at, to) {
        if (this.state !== 'run') return 'invalid';
        const a = this.armed;
        if (a && a.at === at && a.to === to) return 'ok';
        const next = this.nextFork();
        if (!next || next.at !== at || !this.track.seg(at).forks.some(f => f.from === this.lane && f.to === to)) return 'invalid';
        if (this.ammo <= 0) { this.events.push({ type: 'no-ammo' }); return 'no-ammo'; }
        this.ammo--;
        this.armed = { at, from: this.lane, to };
        this.events.push({ type: 'shot', at, to });
        return 'ok';
    }

    // Tap on a leaping demon: a shot drives it off.
    shootDemon() {
        if (this.state !== 'run' || !this.demon) return 'invalid';
        if (this.ammo <= 0) { this.events.push({ type: 'no-ammo' }); return 'no-ammo'; }
        this.ammo--;
        this.events.push({ type: 'demon-killed', at: this.demon.at });
        this.demon = null;
        return 'ok';
    }

    // Lateral position for drawing: lane index, fractional while crossing after a fork.
    laneX() {
        const t = (this.pos - this.switchAt) / CollapseRules.SWITCH_LEN;
        if (t >= 1 || t < 0) return this.lane;
        const k = t * t * (3 - 2 * t);
        return this.prevLane + (this.lane - this.prevLane) * k;
    }

    update(dt) {
        if (this.state !== 'run') return;
        this._acc += Math.min(dt, 0.25);
        while (this._acc >= CollapseRules.STEP && this.state === 'run') {
            this._acc -= CollapseRules.STEP;
            this._step(CollapseRules.STEP);
        }
    }

    _step(h) {
        this.time += h;
        this.boost = Math.max(0, this.boost - h);
        this.slow = Math.max(0, this.slow - h);
        this.invuln = Math.max(0, this.invuln - h);
        const prev = this.pos;
        this.pos += this.speed() * h;

        const a = this.armed;
        if (a && prev < a.at && this.pos >= a.at) {
            if (this.lane === a.from) {
                this.prevLane = this.lane;
                this.lane = a.to;
                this.switchAt = a.at;
                this.events.push({ type: 'switched', at: a.at, to: a.to });
            }
            this.armed = null;
        }
        while (this._seg < Math.floor(this.pos) && this.state === 'run') this._enter(++this._seg);
        if (this.state !== 'run') return;

        const mid = this._seg + 0.5;
        if (prev < mid && this.pos >= mid) this._collect(this._seg);

        this.front = Math.max(this.front + this.frontSpeed() * h, this.pos - this.c.frontMaxGap);
        if (this.pos - this.front <= CollapseRules.TRAIN_LEN) this._hit('caught');

        if (this.demon) {
            this.demon.t -= h;
            if (this.demon.t <= 0) { this.demon = null; this._hit('demon'); }
        }
    }

    _enter(i) {
        const s = this.track.seg(i);
        if (s.demon && !this.demon) {
            this.demon = { at: i, t: this.c.demonSec };
            this.events.push({ type: 'demon', at: i });
        }
        if (s.gap[this.lane]) this._fall(i);
        else if (s.lava[this.lane]) this._hit('lava');
    }

    _collect(i) {
        const kind = this.track.seg(i).pickup[this.lane];
        if (!kind || this._taken.has(i)) return;
        this._taken.add(i);
        const c = this.c;
        if (kind === 'ammo') this.ammo += c.ammoPickup;
        else if (kind === 'boost') { this.boost = c.boostSec; this.slow = 0; }
        else if (kind === 'slow') { this.slow = c.slowSec; this.boost = 0; }
        else if (kind === 'shield') this.shield = Math.min(c.shieldMax, this.shield + 1);
        else if (kind === 'rescue') this.rescue = Math.min(c.rescueMax, this.rescue + 1);
        this.events.push({ type: 'pickup', kind, at: i });
    }

    isTaken(i) { return this._taken.has(i); }

    // The safest lane at segment i: no hazard here and over the next LOOK segments, nearest first.
    _safeLane(i) {
        const order = [this.lane, ...CollapseRules.neighbors(this.lane), 0, 1, 2];
        for (const l of order) if (this.track.laneSafe(l, i, CollapseRules.LOOK)) return l;
        for (const l of order) if (!this.track.seg(i).gap[l] && !this.track.seg(i).lava[l]) return l;
        return this.lane;
    }

    _fall(i) {
        if (this.invuln > 0) return;
        if (this.rescue > 0) {
            this.rescue--;
            this.prevLane = this.lane = this._safeLane(i);
            this.armed = null;
            this.events.push({ type: 'rescued', at: i, lane: this.lane });
            return;
        }
        this._crash('gap');
    }

    _hit(reason) {
        if (this.invuln > 0) return;
        if (this.shield > 0) {
            this.shield--;
            if (reason === 'caught') this.front = this.pos - this.c.shieldGap;
            this.events.push({ type: 'shielded', reason });
            return;
        }
        this._crash(reason);
    }

    _crash(reason) {
        this.state = 'over';
        this.reason = reason;
        this.events.push({ type: 'crash', reason });
    }

    get canContinue() { return this.state === 'over' && !this.continued; }

    // One continue per run (for a rewarded ad): grace, the collapse pushed back, a safe lane.
    continueRun() {
        if (!this.canContinue) return false;
        this.continued = true;
        this.state = 'run';
        this.invuln = this.c.continueGrace;
        this.front = Math.min(this.front, this.pos - this.c.continueGap);
        this.demon = null;
        this.armed = null;
        this.prevLane = this.lane = this._safeLane(this._seg);
        this.events.push({ type: 'continued' });
        return true;
    }

    takeEvents() {
        const e = this.events;
        this.events = [];
        return e;
    }
}
