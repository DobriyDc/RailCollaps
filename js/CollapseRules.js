// CollapseRules.js — Rail Link: Collapse run rules (GDD v3 §3–§7): the seeded track generator and
// the run state. Pure logic without 3D and DOM: CollapseScene.js only draws what this file decides,
// so one seed and one list of taps replay the same run on every device (fixed time step, own PRNG).
//
// Distance is counted in SEGMENTS: segment i spans [i, i + 1). Three lanes, 0..2 left to right as
// the player sees the train on screen. A fork at BOUNDARY i links lane `from` to an adjacent lane
// `to`; the player arms it with a shot (one cartridge) and the train changes lane when it passes i.
// Hazards sit on one lane of one segment: `gap` (the track is gone) or `lava` (a stream from the
// vault). A pickup stands in the middle of a segment and is taken by the train on its lane.
// A demon segment releases one or two demons from the tunnel walls (side -1 left, +1 right); each
// one needs its own shot before its leap ends.

/** @satisfies {Record<string, any>} */
const CollapseRules = {
    LANES: 3,
    STEP: 1 / 60,          // s: the fixed simulation step
    LOOK: 6,               // segments a fork signal checks on its destination lane (the lead and two more)
    // The turnout at full size (debt-switch-scale, the owner 2026-10-30): the train crosses to the next
    // lane along the drawn curve — 448 px of art_src/switches_v1 at 128 px per lane of 300 units.
    SWITCH_LEN: 3.75,      // segments the train needs to cross to the next lane after a fork
    SWITCH_LEAD: 4,        // segments from an escape fork to its hazard: the crossing is over before it
    TRAIN_LEN: 0.35,       // segments: the collapse behind catches the train at this gap
    FORK_RANGE: 6,         // segments: how far ahead the next fork can be armed
    PICKUPS: ['ammo', 'boost', 'slow', 'shield', 'rescue'],
    PICKUP_DICE: ['ammo', 'boost', null, 'slow', 'shield', 'rescue', null],   // the faces of cfg().pickupOdds; null — nothing

    // All run numbers (Constants.js, GDD v3 §8) with defaults: Constants.js may be older than the code.
    cfg() {
        const U = 'undefined';
        return {
            segMeters: typeof COLLAPSE_SEG_METERS !== U ? COLLAPSE_SEG_METERS : 10,
            speed: typeof COLLAPSE_SPEED !== U ? COLLAPSE_SPEED : 2.2,
            speedGrowth: typeof COLLAPSE_SPEED_GROWTH !== U ? COLLAPSE_SPEED_GROWTH : 0.0025,
            speedMax: typeof COLLAPSE_SPEED_MAX !== U ? COLLAPSE_SPEED_MAX : 4.5,
            frontSpeed: typeof COLLAPSE_FRONT_SPEED !== U ? COLLAPSE_FRONT_SPEED : 1.8,
            frontGrowth: typeof COLLAPSE_FRONT_GROWTH !== U ? COLLAPSE_FRONT_GROWTH : 0.004,
            frontMax: typeof COLLAPSE_FRONT_MAX !== U ? COLLAPSE_FRONT_MAX : 4.8,
            frontStartGap: typeof COLLAPSE_FRONT_START_GAP !== U ? COLLAPSE_FRONT_START_GAP : 5,
            frontMaxGap: typeof COLLAPSE_FRONT_MAX_GAP !== U ? COLLAPSE_FRONT_MAX_GAP : 6,
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
            demonEvery: typeof COLLAPSE_DEMON_EVERY !== U ? COLLAPSE_DEMON_EVERY : 30,
            demonChance: typeof COLLAPSE_DEMON_CHANCE !== U ? COLLAPSE_DEMON_CHANCE : 0.2,
            demonStart: typeof COLLAPSE_DEMON_START !== U ? COLLAPSE_DEMON_START : 60,
            pairFrom: typeof COLLAPSE_DEMON_PAIR_FROM !== U ? COLLAPSE_DEMON_PAIR_FROM : 120,
            pairFull: typeof COLLAPSE_DEMON_PAIR_FULL !== U ? COLLAPSE_DEMON_PAIR_FULL : 350,
            pairMax: typeof COLLAPSE_DEMON_PAIR_MAX !== U ? COLLAPSE_DEMON_PAIR_MAX : 0.6,
            pairLag: typeof COLLAPSE_DEMON_PAIR_LAG !== U ? COLLAPSE_DEMON_PAIR_LAG : 0.35,
            gapMin: typeof COLLAPSE_GAP_MIN !== U ? COLLAPSE_GAP_MIN : 3,
            gapMinEnd: typeof COLLAPSE_GAP_MIN_END !== U ? COLLAPSE_GAP_MIN_END : 4,
            gapMax: typeof COLLAPSE_GAP_MAX !== U ? COLLAPSE_GAP_MAX : 8,
            gapOverlap: typeof COLLAPSE_GAP_OVERLAP !== U ? COLLAPSE_GAP_OVERLAP : 0.5,
            reactSec: typeof COLLAPSE_REACT_SEC !== U ? COLLAPSE_REACT_SEC : 0.6,
            continueGap: typeof COLLAPSE_CONTINUE_GAP !== U ? COLLAPSE_CONTINUE_GAP : 8,
            continueGrace: typeof COLLAPSE_CONTINUE_GRACE_SEC !== U ? COLLAPSE_CONTINUE_GRACE_SEC : 1.5,
            iconLead: typeof COLLAPSE_ICON_LEAD_SEC !== U ? COLLAPSE_ICON_LEAD_SEC : 1,
            // The generator's dice (the rest of a pattern roll is a detour for a pickup).
            difficultySegs: typeof COLLAPSE_DIFFICULTY_SEGS !== U ? COLLAPSE_DIFFICULTY_SEGS : 600,
            calmStart: typeof COLLAPSE_CALM_START !== U ? COLLAPSE_CALM_START : 4,
            calmEnd: typeof COLLAPSE_CALM_END !== U ? COLLAPSE_CALM_END : 1,
            gapShare: typeof COLLAPSE_GAP_SHARE !== U ? COLLAPSE_GAP_SHARE : 0.52,
            lavaShare: typeof COLLAPSE_LAVA_SHARE !== U ? COLLAPSE_LAVA_SHARE : 0.14,
            lavaGrowth: typeof COLLAPSE_LAVA_GROWTH !== U ? COLLAPSE_LAVA_GROWTH : 0.1,
            hazardMid: typeof COLLAPSE_HAZARD_MID !== U ? COLLAPSE_HAZARD_MID : 0.5,
            hazardReward: typeof COLLAPSE_HAZARD_REWARD !== U ? COLLAPSE_HAZARD_REWARD : 0.5,
            pickupOdds: [
                typeof COLLAPSE_ODDS_AMMO !== U ? COLLAPSE_ODDS_AMMO : 0.34,
                typeof COLLAPSE_ODDS_BOOST !== U ? COLLAPSE_ODDS_BOOST : 0.07,
                typeof COLLAPSE_ODDS_BOOST_EMPTY !== U ? COLLAPSE_ODDS_BOOST_EMPTY : 0.13,
                typeof COLLAPSE_ODDS_SLOW !== U ? COLLAPSE_ODDS_SLOW : 0.16,
                typeof COLLAPSE_ODDS_SHIELD !== U ? COLLAPSE_ODDS_SHIELD : 0.15,
                typeof COLLAPSE_ODDS_RESCUE !== U ? COLLAPSE_ODDS_RESCUE : 0.05,
                typeof COLLAPSE_ODDS_RESCUE_EMPTY !== U ? COLLAPSE_ODDS_RESCUE_EMPTY : 0.1,
            ],
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

    // The chance that a demon segment at segment `at` releases a pair: 0 before pairFrom, growing
    // linearly to pairMax at pairFull.
    pairChance(c, at) {
        if (at < c.pairFrom) return 0;
        return c.pairMax * Math.min(1, (at - c.pairFrom) / Math.max(1, c.pairFull - c.pairFrom));
    },

    neighbors(lane) {
        return [lane - 1, lane + 1].filter(l => l >= 0 && l < CollapseRules.LANES);
    },

    // No trap (the owner, 2026-10-30): a hazard on `lane` over segments [from, from + n) of `segs` may
    // stand only where no adjacent lane is a gap or lava from its escape fork segment (SWITCH_LEAD
    // before it) to its return fork segment — two neighbouring dead ends on one segment never happen,
    // and every hazard keeps a whole neighbour for its full length with a fork before and after it.
    trapFree(segs, lane, from, n) {
        for (let i = Math.max(0, from - CollapseRules.SWITCH_LEAD); i <= from + n && i < segs.length; i++) {
            const s = segs[i];
            if (CollapseRules.neighbors(lane).some(l => s.gap[l] || s.lava[l])) return false;
        }
        return true;
    },
};

// One track segment: per-lane hazards and pickups, forks at its start boundary.
function collapseSegment(kind) {
    /** @type {{ side: number, lag: number }[] | null} */
    const demon = null;
    return { kind, gap: [false, false, false], lava: [false, false, false], pickup: [null, null, null], forks: [], demon };
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

    // A pickup kind, or null: the dice left this place empty.
    _pickupKind() {
        const w = this.cfg.pickupOdds;
        let r = this.rand() * w.reduce((a, b) => a + b, 0);
        for (let i = 0; i < w.length; i++) {
            if ((r -= w[i]) < 0) return CollapseRules.PICKUP_DICE[i];
        }
        return null;
    }

    _pattern() {
        const R = CollapseRules, c = this.cfg;
        const at = this.segs.length;
        const d = Math.min(1, at / c.difficultySegs);           // difficulty 0..1
        let calm = Math.max(0, Math.round(c.calmStart + (c.calmEnd - c.calmStart) * d)) + this._int(2);
        // The decision window: the pattern's fork (at boundary at + calm) is far enough from the last one,
        // and never before the crossing of the last one is over.
        while ((at + calm - this.lastFork) / R.maxSpeedAt(c, at + calm) < c.reactSec || at + calm - this.lastFork < R.SWITCH_LEAD) calm++;
        this._calm(calm);
        const demonOk = at >= c.demonStart && at - this.lastDemon >= c.demonEvery;
        if (demonOk && this.rand() < c.demonChance) { this._demon(); return; }
        const roll = this.rand();
        if (roll < c.gapShare) this._gap(d);
        else if (roll < c.gapShare + c.lavaShare + c.lavaGrowth * d) this._hazard('lava', 1);
        else this._detour();
    }

    // Gap length at difficulty d: from gapMin at the start to gapMinEnd..gapMax at full difficulty.
    _gapLen(d) {
        const c = this.cfg;
        const lo = Math.round(c.gapMin + (c.gapMinEnd - c.gapMin) * d), hi = Math.round(c.gapMin + (c.gapMax - c.gapMin) * d);
        return lo + this._int(Math.max(0, hi - lo) + 1);
    }

    // A long gap, and with distance a second hazard overlapping it on another lane — only where
    // CollapseRules.trapFree allows it (in practice the far outer lane, the middle one stays whole).
    // Its escape fork stands a full reaction window after the first one.
    _gap(d) {
        const R = CollapseRules, c = this.cfg, at = this.segs.length;
        const len = this._gapLen(d);
        /** @type {ReturnType<typeof collapseSegment>[]} */
        const block = [];
        const lane = this._lay(block, 0, 'gap', this.rand() < c.hazardMid ? 1 : this._int(2) * 2, len);
        if (this.rand() < c.gapOverlap * d) {
            const off = Math.max(R.SWITCH_LEAD, Math.ceil(c.reactSec * R.maxSpeedAt(c, at + len) - 1e-9)) + this._int(2);
            const len2 = this._gapLen(d);
            const lanes = [0, 1, 2].filter(l => l !== lane && R.trapFree(block, l, off + R.SWITCH_LEAD, len2));
            if (off <= len && lanes.length) this._lay(block, off, 'gap', lanes[this._int(lanes.length)], len2);
        }
        for (const s of block) this._push(s);
    }

    // A hazard of `len` segments on one lane: escape forks before it, return forks after it.
    // The middle lane takes the hazardMid share: a train that never switches stays on it.
    _hazard(type, len) {
        const block = [];
        this._lay(block, 0, type, this.rand() < this.cfg.hazardMid ? 1 : this._int(2) * 2, len);
        for (const s of block) this._push(s);
    }

    // Lay a hazard into a pattern block: the escape forks at boundary `at`, the hazard over `len`
    // segments from SWITCH_LEAD later, the return forks right after it. Returns the lane.
    _lay(block, at, type, lane, len) {
        const L = CollapseRules.SWITCH_LEAD;
        while (block.length < at + L + len + 1) block.push(collapseSegment('calm'));
        const lead = block[at];
        lead.kind = type + '-lead';
        for (const to of CollapseRules.neighbors(lane)) lead.forks.push({ from: lane, to });
        for (let i = 1; i <= len; i++) {
            const s = block[at + L - 1 + i];
            if (!s.kind.endsWith('-lead')) s.kind = type;
            s[type][lane] = true;
            // A reward on a safe lane beside a long hazard: the escape is also a choice.
            if (i === 2 && this.rand() < this.cfg.hazardReward) {
                const side = CollapseRules.neighbors(lane).filter(l => !s.gap[l] && !s.lava[l]);
                if (side.length) s.pickup[side[this._int(side.length)]] = this._pickupKind();
            }
        }
        const back = block[at + L + len];
        if (back.kind === 'calm') back.kind = type + '-back';
        for (const from of CollapseRules.neighbors(lane)) back.forks.push({ from, to: lane });
        return lane;
    }

    // A side trip for a pickup on a calm stretch: fork out, the crossing, pickup, fork back. No pickup —
    // the same stretch without forks: a sign that leads to nothing is a dishonest signal.
    _detour() {
        const a = this._int(CollapseRules.LANES);
        const side = CollapseRules.neighbors(a);
        const b = side[this._int(side.length)];
        const kind = this._pickupKind();
        if (!kind) {
            this._calm(CollapseRules.SWITCH_LEAD + 2);
            this.lastFork = this.segs.length - 1;    // the rest of the track as if the detour stood here
            return;
        }
        const out = collapseSegment('detour');
        out.forks.push({ from: a, to: b });
        this._push(out);
        for (let i = 1; i < CollapseRules.SWITCH_LEAD; i++) this._push(collapseSegment('detour'));
        const mid = collapseSegment('detour');
        mid.pickup[b] = kind;
        this._push(mid);
        const back = collapseSegment('detour');
        back.forks.push({ from: b, to: a });
        this._push(back);
    }

    // One demon from a random wall, or a pair from both walls: the second leaps pairLag s later.
    _demon() {
        const c = this.cfg, at = this.segs.length;
        const s = collapseSegment('demon');
        const side = this.rand() < 0.5 ? -1 : 1;
        s.demon = [{ side, lag: 0 }];
        if (this.rand() < CollapseRules.pairChance(c, at)) s.demon.push({ side: -side, lag: c.pairLag });
        this.lastDemon = at;
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
        // Demons out of the walls: `wait` s before the leap starts, then `t` s to shoot it.
        /** @type {{ at: number, side: number, wait: number, t: number }[]} */
        this.demons = [];
        this.state = 'run';           // 'run' | 'over'
        this.reason = '';             // why the run ended: gap | lava | demon | caught
        this.continued = false;
        this.invuln = 0;              // s of grace after a continue
        this.time = 0;
        this.steps = 0;               // fixed steps done: the journal's clock
        // The player's actions, for the replay on the server: [step, 'f', at, to] a fork, [step, 'd', side]
        // a demon, [step, 'c'] the continue. The rules write it and never read it.
        /** @type {any[][]} */
        this.log = [];
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

    // What comes at the train from beyond the frame (card 21): the start of every hazard run, every
    // pickup and every demon no more than `sec` seconds short of the frame, nearest first. Seconds
    // count at the fastest the train may go there (maxSpeedAt, an accelerator included): an accelerator
    // taken later cannot eat the lead. The frame belongs to the camera, so it comes as arguments, by
    // body ('gap' | 'lava' | 'pickup') and lane, in segments ahead of the nose: enter — where the body
    // is in the frame now, reach — the farthest that can get with the camera following the train.
    // A demon needs no table: it is in the frame from its leap, when the nose enters its segment.
    // { kind, lane, side, at, dist }: lane -1 for a demon, side 0 for the rest.
    ahead(sec, enter, reach = enter) {
        const R = CollapseRules, c = this.c, pos = this.pos, track = this.track;
        const far = sec * R.maxSpeedAt(c, pos + sec * R.maxSpeedAt(c, pos));
        /** @type {{ kind: string, lane: number, side: number, at: number, dist: number }[]} */
        const out = [];
        const add = (kind, body, lane, at, itemPos) => {
            const dist = itemPos - pos;
            if (dist > enter[body][lane] && dist <= reach[body][lane] + far) out.push({ kind, lane, side: 0, at, dist });
        };
        const end = Math.ceil(pos + far + Math.max(...['gap', 'lava', 'pickup'].flatMap(b => reach[b])));
        for (let i = Math.max(1, Math.floor(pos)); i <= end; i++) {
            const s = track.seg(i), before = track.seg(i - 1);
            for (let l = 0; l < R.LANES; l++) {
                if (s.gap[l] && !before.gap[l]) add('gap', 'gap', l, i, i);
                if (s.lava[l] && !before.lava[l]) add('lava', 'lava', l, i, i + 0.5);
                if (s.pickup[l]) add(s.pickup[l], 'pickup', l, i, i + 0.5);
            }
            const dist = i - pos;
            if (dist > 0 && dist <= far) for (const d of s.demon || []) out.push({ kind: 'demon', lane: -1, side: d.side, at: i, dist });
        }
        return out.sort((a, b) => a.dist - b.dist);
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
        this.log.push([this.steps, 'f', at, to]);
        this.events.push({ type: 'shot', at, to });
        return 'ok';
    }

    // Leaping demons (out of the wall, not yet hit): the ones a tap can shoot.
    leaping() { return this.demons.filter(d => d.wait <= 0); }

    // Tap on a leaping demon: one shot drives off one demon — the one on `side`, or the nearest to
    // the cab when the side is not given.
    shootDemon(side) {
        if (this.state !== 'run') return 'invalid';
        const ds = this.leaping().filter(d => side === undefined || d.side === side);
        if (!ds.length) return 'invalid';
        if (this.ammo <= 0) { this.events.push({ type: 'no-ammo' }); return 'no-ammo'; }
        const d = ds.reduce((a, b) => (b.t < a.t ? b : a));
        this.ammo--;
        this.demons.splice(this.demons.indexOf(d), 1);
        this.log.push([this.steps, 'd', d.side]);
        this.events.push({ type: 'demon-killed', at: d.at, side: d.side });
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
        this.steps++;
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

        if (this.demons.length) for (const d of [...this.demons]) {    // no copy per step: the server replays them all
            if (this.state !== 'run') break;
            if (d.wait > 0) {
                d.wait -= h;
                if (d.wait <= 0) this.events.push({ type: 'demon', at: d.at, side: d.side });
                continue;
            }
            d.t -= h;
            if (d.t <= 0) { this.demons.splice(this.demons.indexOf(d), 1); this._hit('demon'); }
        }
    }

    _enter(i) {
        const s = this.track.seg(i);
        for (const d of s.demon || []) {
            this.demons.push({ at: i, side: d.side, wait: d.lag, t: this.c.demonSec });
            if (d.lag <= 0) this.events.push({ type: 'demon', at: i, side: d.side });
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
        this.log.push([this.steps, 'c']);
        this.state = 'run';
        this.invuln = this.c.continueGrace;
        this.front = Math.min(this.front, this.pos - this.c.continueGap);
        this.demons = [];
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

    // The run again from its seed and journal (run.log), on the server: the ended run, or null when
    // no run could have written that journal — an entry out of order or after the end, an action the
    // rules refuse, a run that has not ended by maxSteps.
    static replay(seed, log, maxSteps) {
        const run = new CollapseRun(seed);
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
                : act === 'c' && run.continueRun();
            if (!done) return null;
        }
        advance(maxSteps);
        return run.state === 'over' ? run : null;
    }
}
