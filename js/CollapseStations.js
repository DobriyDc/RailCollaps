// CollapseStations.js — the stations of the endless run on screen: the frame, the shop of a stop, the
// stop in the tunnel. The rules are CollapseStationRules.js (the table's function replays them too); this
// file only shows what the run says. Loaded after Game.js.

/** @satisfies {Record<string, any>} */
const CollapseStations = {
    GOODS: ['repair', 'ammo', 'shield', 'rescue'],
    /** @type {CollapseStationView | null} */
    view: null,
    _bound: false,
    TIP_KEY: 'collapse.stationTip',

    tints() {
        const U = 'undefined';
        return [
            typeof COLLAPSE_STATION_TINT_0 !== U ? COLLAPSE_STATION_TINT_0 : 0xffffff,
            typeof COLLAPSE_STATION_TINT_1 !== U ? COLLAPSE_STATION_TINT_1 : 0x9fd0ff,
            typeof COLLAPSE_STATION_TINT_2 !== U ? COLLAPSE_STATION_TINT_2 : 0xb8ff9a,
            typeof COLLAPSE_STATION_TINT_3 !== U ? COLLAPSE_STATION_TINT_3 : 0xe0a0ff,
        ];
    },

    // Every run of Game.start: the frame of a station run, or the plain frame back (the tutorial).
    dress(game, run) {
        const on = !!run.stations;
        if (!this._bound) {
            this._bound = true;
            for (const kind of this.GOODS) {
                const b = UI.get('station' + this._id(kind));
                if (b) b.onClick(game._clicked(() => { if (game.run.stations) game.run.buy(kind); }));
            }
            const go = UI.get('stationGo');
            if (go) go.onClick(game._clicked(() => { if (game.run.stations) game.run.leave(); }));
        }
        game._show('stationNext', on);
        game._show('stationShop', false);
        if (!this.view) this.view = new CollapseStationView(game.scene);
        this.view.sync(run);
    },

    _id(kind) { return kind[0].toUpperCase() + kind.slice(1); },

    // The first station a player ever reaches explains itself once; leaving it is enough.
    get tipSeen() { return Store.get(this.TIP_KEY) === '1'; },
    onDeparted() { if (!this.tipSeen) Store.set(this.TIP_KEY, '1'); },

    // The way to the stop and the shop of a stop, every frame; the rules decide, this only shows.
    hud(game, run) {
        game._set('stationNext', Lang.t('stationNext', { value: run.toStation, riders: run.passengers }));
        game._show('stationNext', !run.atStation);
        game._show('stationShop', run.atStation);
        if (run.atStation) {
            game._set('stationTitle', Lang.t('stationTitle', { value: run.stage + 1, money: run.money }));
            const paid = run.paid;
            game._set('stationPaid', paid ? Lang.t('stationPaid', { riders: paid.riders, seats: run.st.seats, amount: paid.amount }) : '');
            game._set('stationTip', this.tipSeen ? '' : Lang.t('stationTip'));
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
        this.tints = CollapseStations.tints();
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
CollapseStationView.PLATE_ART = 'assets/ui/hud_v3/counter_socket.png';
CollapseStationView.GATE = { w: 1100, h: 430, z: -1250 };           // the arch, world units: three lanes under it, behind the stopped train
// The stop's number: the plate beside the loco on a side the frame shows, its digits.
CollapseStationView.PLATE = { w: 150, h: 96, y: 170, z: -240, side: 225, digitW: 52, digitH: 78 };
// The brick heaps at the feet of the arch: [x, z from the stop, size], world units.
CollapseStationView.HEAPS = [[-470, -1200, 220], [470, -1200, 240], [-430, -1500, 260], [430, -1500, 240], [-400, -1800, 200], [400, -1800, 220]];
