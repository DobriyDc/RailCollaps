// CollapseRuin.js — what the collapse has done to the world (card 46). While it runs, CollapseRun.front
// moves smoothly and stays near the train, so a picture tied to it rides behind the train. This class turns it into
// blows: whole sections go at once, with pauses between, and from then on everything is written down
// in world coordinates and never looks at the train again. The scene takes `pos * SEG` off at the end.
// The view only: the rules do not read it. Pure: the probes run it in node.

class CollapseRuin {
    constructor() {
        const U = 'undefined';
        this.c = {
            stepMax: typeof COLLAPSE_RUIN_STEP_MAX !== U ? COLLAPSE_RUIN_STEP_MAX : 3,
            breakChance: typeof COLLAPSE_RUIN_BREAK !== U ? COLLAPSE_RUIN_BREAK : 0.3,
            ripple: typeof COLLAPSE_RUIN_RIPPLE_SEC !== U ? COLLAPSE_RUIN_RIPPLE_SEC : 0.09,
            rate: typeof COLLAPSE_RUIN_FALL_RATE !== U ? COLLAPSE_RUIN_FALL_RATE : 2.4,
            sag: typeof COLLAPSE_RUIN_RIB_SAG !== U ? COLLAPSE_RUIN_RIB_SAG : 500,
            nearGap: typeof COLLAPSE_RUIN_NEAR_GAP !== U ? COLLAPSE_RUIN_NEAR_GAP : 6,
            nearChunks: typeof COLLAPSE_RUIN_NEAR_CHUNKS !== U ? COLLAPSE_RUIN_NEAR_CHUNKS : 5,
            jolt: typeof COLLAPSE_RUIN_JOLT !== U ? COLLAPSE_RUIN_JOLT : 30,
            joltSec: typeof COLLAPSE_RUIN_JOLT_SEC !== U ? COLLAPSE_RUIN_JOLT_SEC : 0.3,
            landSec: typeof COLLAPSE_RUIN_LAND_SEC !== U ? COLLAPSE_RUIN_LAND_SEC : 0.4,
            crackZone: typeof COLLAPSE_CRACK_ZONE !== U ? COLLAPSE_CRACK_ZONE : 3,
            lead: typeof COLLAPSE_DEBRIS_LEAD !== U ? COLLAPSE_DEBRIS_LEAD : 1,
            art: typeof COLLAPSE_CHUNK_ART !== U ? COLLAPSE_CHUNK_ART : 4,
        };
        this.begin(0);
    }

    // A new run or a new collapse: what lies behind `front` fell long ago, nothing of it is played.
    begin(front, time = -1e9) {
        this.edge = this.nextBreak(Math.ceil(front));
        this.front = front;
        /** @type {Map<number, number>} */
        this.struck = new Map();       // section -> the second it went
        this.blows = 0;
        // Stands of each layer, from the far one to the rubble: a place in the world, once and for all.
        /** @type {{ at: number, t: number }[][]} */
        this.stands = CollapseRuin.LAYER_EVERY.map(() => [{ at: this.edge, t: time }]);
        /** @type {any[]} */
        this.chunks = [];
        /** @type {any[]} */
        this.dust = [];
        /** @type {{ at: number, amp: number }[]} */
        this.jolts = [];
    }

    // A stable pseudo-random 0..1.
    static hash(i, k) {
        const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
        return x - Math.floor(x);
    }

    // The first section at or past i where a blow ends: a property of the place, not of the moment.
    nextBreak(i) {
        while (i % this.c.stepMax !== 0 && CollapseRuin.hash(i, 1) >= this.c.breakChance) i++;
        return i;
    }

    // Every frame. The edge stands at or past the rules' front, so the picture never promises more
    // room than the run has, and stops short of the train's tail. It never goes back: a shield or a
    // continue pushes the front back, and what has fallen stays down until the front is here again.
    update(front, pos, time, trainX = 0) {
        if (front > this.edge + CollapseRuin.JUMP) this.begin(front, time);
        this.front = front;
        const to = Math.min(this.nextBreak(Math.ceil(front)), Math.max(Math.ceil(front), Math.ceil(pos - CollapseRuin.TAIL)));
        if (to > this.edge) this._blow(to, pos, time, trainX);
        this.chunks = this.chunks.filter(c => time < c.until);
        this.dust = this.dust.filter(d => time < d.t + d.dur);
        this.jolts = this.jolts.filter(j => time < j.at + this.c.joltSec);
    }

    // 0 far from the train .. 1 at its tail.
    close(gap) {
        return Math.max(0, Math.min(1, 1 - (gap - 1) / (this.c.nearGap - 1)));
    }

    _blow(to, pos, time, trainX) {
        const c = this.c, from = this.edge, H = CollapseRuin.hash, n = this.blows++;
        for (let i = from; i < to; i++) this.struck.set(i, time + (i - from) * c.ripple + H(i, 2) * 0.05);
        for (const i of this.struck.keys()) if (i < to - 24) this.struck.delete(i);
        this.edge = to;
        CollapseRuin.LAYER_EVERY.forEach((every, k) => {
            if (every && Math.floor(to / every) === Math.floor(from / every)) return;
            const list = this.stands[k];
            list.push({ at: to, t: time + 0.05 * k });
            if (list.length > CollapseRuin.STANDS) list.shift();
        });
        const near = this.close(pos - to);
        this.jolts.push({ at: time, amp: c.jolt * (0.1 + 0.9 * near * near) });
        this._edgeChunks(from, to, time, n);
        this._nearChunks(pos, near, time, trainX, n);
    }

    // Blocks off the arches and rails thrown up where the floor goes, in the sections of the blow and
    // COLLAPSE_DEBRIS_LEAD ahead of it; dust and sparks along the line.
    _edgeChunks(from, to, time, n) {
        const S = CollapseRuin, SEG = CollapseScene.SEG, H = (k, a) => S.hash(n * 7 + k, a), c = this.c;
        for (let k = 0; k < S.EDGE_CHUNKS; k++) {
            const rail = k % 4 === 3, at = from + H(k, 3) * (to - from + c.lead), size = 96 * c.art * (rail ? 0.8 + H(k, 4) * 0.5 : 0.5 + H(k, 4) * 0.5);
            this._chunk({ x: (H(k, 5) - 0.5) * 1040, y: rail ? 0 : 200 + H(k, 6) * 240, z: at * SEG, edge: true,
                vx: (H(k, 7) - 0.5) * 300, vy: rail ? 700 + H(k, 8) * 500 : 0, g: 3600, floor: -170, size, kind: rail ? 'rail' : Math.floor(H(k, 9) * 7), t: time + H(k, 10) * 0.2, n: n * 13 + k });
        }
        for (let k = 0; k < S.EDGE_DUST; k++) {
            this.dust.push({ kind: 'dust', x: (H(k, 11) - 0.5) * 900, y: 60 + H(k, 12) * 220, z: (to - 0.4 + H(k, 13) * 0.8) * SEG,
                vy: 90 + H(k, 14) * 120, size: 420 + H(k, 15) * 300, t: time + H(k, 16) * 0.12, dur: 0.55 });
        }
        for (let k = 0; k < S.EDGE_SPARKS; k++) {
            this.dust.push({ kind: 'spark', x: (H(k, 17) - 0.5) * 760, y: 30 + H(k, 18) * 160, z: (to + H(k, 19)) * SEG,
                vy: 240, size: 320, t: time + H(k, 20) * 0.1, dur: 0.4 });
        }
    }

    // Big pieces beside the train and ahead of it: chosen from where the train is now, but from that
    // moment each is a thing in the world, and the train leaves it behind. They land beside the
    // train's lane and burst, so nothing that reads as an obstacle stays on the track.
    _nearChunks(pos, near, time, trainX, n) {
        const S = CollapseRuin, SEG = CollapseScene.SEG, H = (k, a) => S.hash(n * 11 + k, a + 30);
        const m = 1 + Math.round(near * this.c.nearChunks);
        for (let k = 0; k < m; k++) {
            const side = H(k, 0) < 0.5 ? -1 : 1, x = trainX + side * (150 + H(k, 1) * 70), z = (pos - 0.5 + H(k, 2) * 3.5) * SEG;
            const y = 620 + H(k, 3) * 340, t = time + H(k, 4) * 0.45;
            const c = this._chunk({ x, y, z, vx: 0, vy: 0, g: 5200, floor: 14, size: 150 + H(k, 5) * 110, kind: Math.floor(H(k, 6) * 7), t, n: n * 17 + k + 500 });
            this.dust.push({ kind: 'dust', x, y: 40, z, vy: 120, size: 190 + H(k, 7) * 90, t: c.until, dur: 0.28 });
        }
    }

    _chunk(c) {
        c.until = c.t + (c.vy + Math.sqrt(c.vy * c.vy + 2 * c.g * (c.y - c.floor))) / c.g;
        if (this.chunks.length < CollapseRuin.CHUNKS) this.chunks.push(c);
        return c;
    }

    // Where chunk c is at `time`, world units; null — not yet let go.
    chunkAt(c, time) {
        const t = time - c.t;
        if (t < 0) return null;
        return [c.x + c.vx * t, c.y + c.vy * t - c.g * t * t / 2, c.z];
    }

    // How far past its blow section i is, in segments of the scene's fall curves: 0 or less — it stands.
    fallen(i, time) {
        const at = this.struck.get(i);
        if (at !== undefined) return (time - at) * this.c.rate;
        return i < this.edge ? 99 : -1;
    }

    // 0..1: how far the cracks have come in section i. They follow the smooth front: the stone gives
    // way all the time, and the blows only finish it.
    crack(i) {
        return Math.max(0, Math.min(1, 1 - (i + 0.5 - this.front) / this.c.crackZone));
    }

    // An arch comes down only under the collapse: the cracks bring it down into the frame (the camera
    // sees no higher than the loco's top), and a rib under or ahead of the train stays up, it has to
    // clear the loco. What has gone keeps the full sag whatever the train does.
    sag(i, pos) {
        if (i < this.edge) return this.c.sag;
        return this.c.sag * this.crack(i) * Math.max(0, Math.min(1, (pos - i - 0.1) / 0.5));
    }

    // How high above its place stand s still is: a layer comes down from above and stays.
    standDrop(s, time) {
        const u = Math.max(0, Math.min(1, (time - s.t) / this.c.landSec));
        return CollapseRuin.STAND_FALL * (1 - u * u);
    }

    // World units the camera is thrown by the blows now.
    jolt(time) {
        let a = 0;
        for (const j of this.jolts) {
            const k = (time - j.at) / this.c.joltSec;
            if (k >= 0 && k < 1) a = Math.max(a, j.amp * (1 - k) * (1 - k));
        }
        return a;
    }

    // 0..1: a blow flares the fire behind it.
    flash(time) {
        return this.jolts.some(j => time >= j.at) ? 1 : 0;
    }
}

CollapseRuin.TAIL = 1.6;                   // segments behind the train's position the edge stops
CollapseRuin.JUMP = 12;                    // segments: a front this far past the edge is a new collapse, not a blow
CollapseRuin.LAYER_EVERY = [5, 4, 3, 0];   // sections between stands of each layer; 0 — every blow
CollapseRuin.STANDS = 3;                   // stands of one layer kept in the world
CollapseRuin.STAND_FALL = 1100;            // world units a new stand comes down from
CollapseRuin.CHUNKS = 64;                  // falling pieces at once
CollapseRuin.EDGE_CHUNKS = 8;              // pieces of one blow along the edge, every 4th a rail
CollapseRuin.EDGE_DUST = 4;
CollapseRuin.EDGE_SPARKS = 2;
