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

// The art of a stop (art_src/station_v1): the stops take two looks by turns, A — the furnace altar
// under ribs, B — the ruined cathedral; the passengers are the same in both. The paths stay literal:
// the build's scanner finds the files by them.
/** @satisfies {Record<string, any>} */
const CollapseStationArt = {
    LOOKS: ['A', 'B'],
    wall: { A: 'assets/sprites/station/wall_A.png', B: 'assets/sprites/station/wall_B.png' },
    top: { A: 'assets/sprites/station/platform_top_A.png', B: 'assets/sprites/station/platform_top_B.png' },
    edge: { A: 'assets/sprites/station/platform_edge_A.png', B: 'assets/sprites/station/platform_edge_B.png' },
    arch: 'assets/sprites/station/arch_A.png',
    cage: 'assets/sprites/station/cage_A.png',
    // The fire of the platforms, two frames: braziers in A, torch columns in B.
    fire: {
        A: ['assets/sprites/station/brazier_A_0.png', 'assets/sprites/station/brazier_A_1.png'],
        B: ['assets/sprites/station/column_B_0.png', 'assets/sprites/station/column_B_1.png'],
    },
    post: 'assets/sprites/station/plate_post.png',
    // Eight people: standing face on, and two steps to the right (the left is the same art mirrored).
    pax: [
        { stand: 'assets/sprites/station/passenger_1_stand.png', walk: ['assets/sprites/station/passenger_1_walk_0.png', 'assets/sprites/station/passenger_1_walk_1.png'] },
        { stand: 'assets/sprites/station/passenger_2_stand.png', walk: ['assets/sprites/station/passenger_2_walk_0.png', 'assets/sprites/station/passenger_2_walk_1.png'] },
        { stand: 'assets/sprites/station/passenger_3_stand.png', walk: ['assets/sprites/station/passenger_3_walk_0.png', 'assets/sprites/station/passenger_3_walk_1.png'] },
        { stand: 'assets/sprites/station/passenger_4_stand.png', walk: ['assets/sprites/station/passenger_4_walk_0.png', 'assets/sprites/station/passenger_4_walk_1.png'] },
        { stand: 'assets/sprites/station/passenger_5_stand.png', walk: ['assets/sprites/station/passenger_5_walk_0.png', 'assets/sprites/station/passenger_5_walk_1.png'] },
        { stand: 'assets/sprites/station/passenger_6_stand.png', walk: ['assets/sprites/station/passenger_6_walk_0.png', 'assets/sprites/station/passenger_6_walk_1.png'] },
        { stand: 'assets/sprites/station/passenger_7_stand.png', walk: ['assets/sprites/station/passenger_7_walk_0.png', 'assets/sprites/station/passenger_7_walk_1.png'] },
        { stand: 'assets/sprites/station/passenger_8_stand.png', walk: ['assets/sprites/station/passenger_8_walk_0.png', 'assets/sprites/station/passenger_8_walk_1.png'] },
    ],
    urls() {
        return [...Object.values(this.wall), ...Object.values(this.top), ...Object.values(this.edge), this.arch, this.cage,
            ...Object.values(this.fire).flat(), this.post, ...this.pax.flatMap(p => [p.stand, ...p.walk])];
    },
};

// A stop in the tunnel, built of the art above around the stopped train. The camera stands before the
// nose, so all of it lies behind the train: two stone platforms beside the train's lane over the next
// lanes (a stop has no hazards), fire on them, the stop's number on a post, people, in A ribs over the
// track with cages. They come in from the camera's side like the rest of the track. The far wall
// cannot: the train would have to pass through it, so it comes in behind the train as it brakes and
// stays where the stop is once the train has left. Passengers get off and board while it stands.
// Draws only: the place, the stage and the paid riders come from the run.
class CollapseStationView {
    /** @param {CollapseScene} host */
    constructor(host) {
        const V = CollapseStationView, Art = CollapseStationArt, P = V.PLATFORM, F = V.FIRE;
        this.host = host;
        this.rig = host.rig;
        this.air = host.rig.air.clone();
        this.torch = host.rig.torchCol.slice();
        this.lamp = host.rig.lampCol.slice();
        this.tint = -1;
        this.tints = CollapseStations.tints();
        for (const url of Art.urls()) host.texture(url);
        // rel: x from the middle of the train's lane, beside: on the side of the number post.
        /** @type {{ mesh: any, x: number, y: number, z: number, look: string, rel: boolean, dx: number, beside?: boolean, wall?: boolean }[]} */
        this.parts = [];
        const add = (mesh, x, y, z, look, rel, more = {}) => {
            mesh.isPickable = false;
            const part = Object.assign({ mesh, x, y, z, look, rel, dx: 0 }, more);
            this.parts.push(part);
            return part;
        };
        const len = P.near - P.far, zMid = (P.near + P.far) / 2;
        for (const look of Art.LOOKS) {
            const W = V.WALL;
            add(host.sprite('station-wall', 'station-wall-' + look, Art.wall[look], W.w, W.h), 0, 0, W.z, look, false, { wall: true });
            for (const side of [-1, 1]) {
                const mid = side * (P.inner + P.w / 2);
                const top = BABYLON.MeshBuilder.CreateGround('station-top', { width: P.w, height: len }, host.scene);
                top.material = host.surface('station-top-' + look, Art.top[look], P.w / P.tile, len / P.tile, P.level[look]);
                add(top, mid, P.h, zMid, look, true);
                const edge = BABYLON.MeshBuilder.CreatePlane('station-edge', { width: len, height: P.h }, host.scene);
                edge.rotation.y = Math.PI / 2;
                edge.material = host.surface('station-edge-' + look, Art.edge[look], len / P.tile, 1, P.level[look]);
                add(edge, side * P.inner, P.h / 2, zMid, look, true);
                const end = BABYLON.MeshBuilder.CreatePlane('station-end', { width: P.w, height: P.h }, host.scene);
                end.material = host.surface('station-end-' + look, Art.edge[look], P.w / P.tile, 1, P.level[look]);
                add(end, mid, P.h / 2, P.near, look, true);
                for (const z of F.z) add(host.sprite('station-fire', 'station-fire-' + look, Art.fire[look][0], F[look].w, F[look].h), side * F.x, P.h, z, look, true);
            }
        }
        const R = V.ARCH, C = V.CAGE;
        for (const z of R.z) {
            add(host.sprite('station-arch', 'station-arch', Art.arch, R.w, R.h), 0, 0, z, 'A', false);
            for (const side of [-1, 1]) add(host.sprite('station-cage', 'station-cage', Art.cage, C.w, C.h), side * C.x, C.y, z + 10, 'A', false);
        }
        const T = V.POST;
        add(host.sprite('station-post', 'station-post', Art.post, T.w, T.h), T.x, P.h, T.z, '', true, { beside: true });
        // The digits keep their order on either side: dx is not mirrored.
        this.digits = [0, 1].map(i => add(host.sprite('station-digit', 'station-digit-' + i, UI.DIGITS[0], T.digitW, T.digitH), T.x, P.h + T.plateY - T.digitH / 2, T.z + 4, '', true, { beside: true }));
        // Every person has a sprite facing right and one mirrored; a person walks one way at a time.
        /** @type {{ mat: any, meshes: any[], url: string }[]} */
        this.people = [];
        for (let n = 0; n < V.PEOPLE; n++) {
            const key = 'station-pax-' + n;
            const meshes = [0, 1].map(m => {
                const mesh = host.sprite('station-pax', key, Art.pax[0].stand, V.PAX.w, V.PAX.h);
                if (m) mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, mesh.getVerticesData(BABYLON.VertexBuffer.UVKind).map((v, i) => i % 2 ? v : 1 - v));
                mesh.isPickable = false;
                mesh.setEnabled(false);
                return mesh;
            });
            this.people.push({ mat: meshes[0].material, meshes, url: Art.pax[0].stand });
        }
        this.fireFrame = -1;
        this.shown = '';
        this.lane = 1;
        this.look = 'A';
        this._place(null);
    }

    // The look of stop k of a run: one seed, the same stops for the friend who takes the challenge.
    static lookOf(seed, k) {
        let h = Math.imul((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b);
        h ^= h >>> 15;
        return (h >>> 7) & 1 ? 'B' : 'A';
    }

    // Where the stop is against the train, world z of its boundary; -1 when no stop is in sight.
    _place(run) {
        const S = CollapseScene, V = CollapseStationView, stop = run && run.stations ? run.stationAt : 0;
        // The last stop stays in sight behind a departing train.
        const at = run && run.stations && run.leftAt > 0 && run.pos - run.leftAt < S.BEHIND ? run.leftAt : stop;
        const z = run ? (at - run.pos) * S.SEG : 0;
        const on = !!run && !!run.stations && z < (S.AHEAD + 2) * S.SEG && z > -S.BEHIND * S.SEG;
        if (on && z >= 0) this.lane = run.lane;       // the platforms and the post stay where the train stopped
        if (on) this.look = V.lookOf(run.seed, run.track.stations.indexOf(at));
        const x0 = S.laneX(this.lane), side = this.lane === 2 ? -1 : 1;
        const wall = Math.max(0, Math.min(1, 1 - z / V.WALL.fade));
        for (const p of this.parts) {
            const show = on && (!p.look || p.look === this.look) && (!p.wall || wall > 0);
            p.mesh.setEnabled(show);
            if (!show) continue;
            const x = p.rel ? x0 + (p.beside ? side : 1) * p.x + p.dx : p.x;
            p.mesh.position.set(x, p.y, (p.wall ? Math.min(z, 0) : z) + p.z);
            // Out of the dark: the tunnel behind it is all but black, and the look's palette takes no half alpha.
            if (p.wall) p.mesh.material.emissiveTexture.level = wall;
        }
        this._people(run, on ? at : -1, z, x0);
        return on ? at : -1;
    }

    // The people of stop `at`: a crowd waits on both platforms; when the train stands, those it brought
    // come out from behind it, then three of the crowd walk to it and are gone behind the loco.
    _people(run, at, z, x0) {
        const V = CollapseStationView, S = CollapseScene, Art = CollapseStationArt;
        let n = 0;
        if (at >= 0) {
            const k = run.track.stations.indexOf(at), salt = run.seed % 997;
            const here = run.atStation && run.stationAt === at, gone = !here && run.leftAt === at;
            const t = here ? run.st.stopSec - run.stopLeft : gone ? 1e9 : -1;
            const riders = (here || gone) && run.paid ? run.paid.riders : 0;
            const third = S.hash(k + salt, 3) < 0.5 ? -1 : 1, time = this.host.time;
            const show = (from, to, start, side, zz, type) => {
                const p = this.people[n++], walk = t >= start ? Math.min(1, (t - start) * V.WALK / Math.abs(to - from)) : 0;
                if (to < V.BEHIND_LOCO && walk >= 1) { for (const m of p.meshes) m.setEnabled(false); return; }
                const moving = walk > 0 && walk < 1, dx = from + (to - from) * walk;
                const left = moving && side * (to - from) < 0;
                const pax = Art.pax[type], url = moving ? pax.walk[Math.floor(time * V.STEP_FPS) % 2] : pax.stand;
                if (url !== p.url) { p.url = url; this.host._setSpriteTex(p.mat, url); }
                p.meshes.forEach((m, i) => {
                    m.setEnabled(i === (left ? 1 : 0));
                    m.position.set(x0 + side * dx, V.PLATFORM.h, z + zz);
                });
            };
            for (const side of [-1, 1]) {
                const crowd = S.hash(k + salt, side + 7) < 0.5 ? 3 : 4;
                V.SLOTS.slice(0, crowd).forEach(([x, zz], i) => {
                    const order = i === 0 ? (side < 0 ? 0 : 1) : i === 1 && side === third ? 2 : -1;
                    const type = Math.floor(S.hash(k * 31 + n + salt, 11) * Art.pax.length);
                    show(x, order < 0 ? x : V.BEHIND_LOCO - 1, order < 0 ? 1e9 : V.BOARD_AT + order * V.BOARD_STEP, side, zz, type);
                });
            }
            V.OFF.slice(0, riders).forEach(([x, zz], j) => {
                const side = j % 2 ? 1 : -1, type = Math.floor(S.hash(k * 31 + n + salt, 13) * Art.pax.length);
                show(V.BEHIND_LOCO, x, j * V.BOARD_STEP, side, zz, type);
            });
        }
        for (; n < this.people.length; n++) for (const m of this.people[n].meshes) m.setEnabled(false);
    }

    // One stop's number: the number of the station the train comes to, counted from 1.
    _number(run, at) {
        const n = String((run.track.stations.indexOf(at) + 1) % 100);
        if (n === this.shown) return;
        this.shown = n;
        this.digits.forEach((part, i) => {
            part.mesh.isVisible = i < n.length;
            part.dx = (i - (n.length - 1) / 2) * CollapseStationView.POST.digitW;
            if (i < n.length) this.host._setSpriteTex(part.mesh.material, UI.DIGITS[Number(n[i])]);
        });
    }

    sync(run) {
        const at = this._place(run);
        if (at >= 0) this._number(run, at);
        const frame = Math.floor(this.host.time * CollapseStationView.FIRE.fps) % 2;
        if (at >= 0 && frame !== this.fireFrame) {
            this.fireFrame = frame;
            for (const look of CollapseStationArt.LOOKS) this.host._setSpriteTex(this.host.spriteMat('station-fire-' + look, CollapseStationArt.fire[look][0]), CollapseStationArt.fire[look][frame]);
        }
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

// World units. The far wall comes out of the dark behind the train over its last `fade` before the stop.
CollapseStationView.WALL = { w: 1440, h: 720, z: -1600, fade: 840 };
// A platform: its inner edge from the middle of the lane, width, height, near and far end from the stop, one tile of its art,
// the brightness of its art by look (the cathedral's stone is drawn pale: in the tunnel it would shine like snow).
CollapseStationView.PLATFORM = { inner: 170, w: 330, h: 60, near: 80, far: -1500, tile: 240, level: { A: 1, B: 0.5 } };
CollapseStationView.ARCH = { w: 1280, h: 747, z: [-300, -900] };            // the ribs of A over all three lanes
CollapseStationView.CAGE = { w: 80, h: 120, x: 330, y: 480 };               // a cage under each rib, both sides
CollapseStationView.FIRE = { A: { w: 88, h: 123 }, B: { w: 80, h: 320 }, x: 215, z: [-150, -700, -1250], fps: 6 };
// The number post on the platform the frame shows: its art 40x120 px, the plate's middle above its foot, the digits.
CollapseStationView.POST = { w: 88, h: 264, x: 215, z: -40, plateY: 234, digitW: 30, digitH: 44 };
CollapseStationView.PAX = { w: 70, h: 141 };                                 // a person, 32x64 px of art
CollapseStationView.PEOPLE = 13;                                             // four on each platform at most, three riders who get off, two to spare
CollapseStationView.SLOTS = [[250, -330], [210, -480], [270, -880], [220, -1020]];   // the crowd's places: x from the lane's middle, z from the stop
CollapseStationView.OFF = [[300, -250], [320, -260], [280, -400]];          // where those who got off stop: the first goes left, the second right
CollapseStationView.BEHIND_LOCO = 100;                                       // x where a person is hidden by the loco
CollapseStationView.WALK = 150;                                              // world units a second on foot
CollapseStationView.STEP_FPS = 6;
CollapseStationView.BOARD_AT = 1.8;                                          // s after the arrival the first one boards
CollapseStationView.BOARD_STEP = 0.35;                                       // s between two people setting out
