// CollapseScene.js — the tunnel of Rail Link: Collapse (GDD v3 §2), skill lowres-tunnel later:
// a real 3D scene rendered small (COLLAPSE_RENDER_HEIGHT px tall) and scaled up without smoothing,
// pixel textures WITHOUT lighting (emissive, nearest sampling) and linear fog for depth.
// The train stands still at z = 0 facing the camera (+Z); the world scrolls toward the camera as
// CollapseRun.pos grows: segment i is drawn at z = (i - pos) * SEG, the upcoming track is in the
// lower part of the frame, the passed track and the collapse go up into the vanishing point.
// The scene only draws CollapseRun; it decides nothing (CollapseRules.js).

/** @satisfies {Record<string, any>} */
const CollapseArt = {
    // Paths are LITERALS: the builder's asset scanner includes only what it sees in code.
    tex: {
        wall: 'assets/textures/tunnel/brick_wall.png',
        vault: 'assets/textures/tunnel/vault_brick.png',
        rib: 'assets/textures/tunnel/arch_rib.png',
        track: 'assets/textures/tunnel/track.png',
        ballast: 'assets/textures/tunnel/floor_ballast.png',
        glow: 'assets/textures/tunnel/torch_glow.png',
    },
    lava: ['assets/textures/tunnel/lava_0.png', 'assets/textures/tunnel/lava_1.png',
        'assets/textures/tunnel/lava_2.png', 'assets/textures/tunnel/lava_3.png'],
    loco: ['assets/px/train/loco_run_0.png', 'assets/px/train/loco_run_1.png',
        'assets/px/train/loco_run_2.png', 'assets/px/train/loco_run_3.png'],
    locoShot: { left: 'assets/px/train/loco_shot_left.png', right: 'assets/px/train/loco_shot_right.png' },
    locoFall: { left: 'assets/px/train/loco_fall_left.png', right: 'assets/px/train/loco_fall_right.png' },
    locoDamaged: 'assets/px/train/loco_damaged.png',
    torch: ['assets/px/fx/torch_0.png', 'assets/px/fx/torch_1.png', 'assets/px/fx/torch_2.png', 'assets/px/fx/torch_3.png'],
    flow: ['assets/px/fx/lava_flow_0.png', 'assets/px/fx/lava_flow_1.png', 'assets/px/fx/lava_flow_2.png', 'assets/px/fx/lava_flow_3.png'],
    splash: ['assets/px/fx/lava_splash_0.png', 'assets/px/fx/lava_splash_1.png'],
    shield: ['assets/px/fx/shield_0.png', 'assets/px/fx/shield_1.png', 'assets/px/fx/shield_2.png'],
    shieldHit: 'assets/px/fx/shield_hit.png',
    demon: ['assets/px/demon/jump_0.png', 'assets/px/demon/jump_1.png', 'assets/px/demon/jump_2.png', 'assets/px/demon/jump_3.png'],
    demonAsh: 'assets/px/demon/ash.png',
    sign: { left: 'assets/px/ui/sign_left.png', right: 'assets/px/ui/sign_right.png', cross: 'assets/px/ui/sign_cross.png' },
    hazard: 'assets/px/ui/hazard.png',
    sw: { waiting: 'assets/px/switch/waiting.png', hit: 'assets/px/switch/hit.png',
        left: 'assets/px/switch/set_left.png', right: 'assets/px/switch/set_right.png' },
    pickup: { ammo: 'assets/px/pickups/ammo.png', boost: 'assets/px/pickups/boost.png', slow: 'assets/px/pickups/slow.png',
        shield: 'assets/px/pickups/shield.png', rescue: 'assets/px/pickups/rescue.png' },
};

class CollapseScene {
    constructor(canvas) {
        this.canvas = canvas;
        this.view = World3D.createView({});
        const scene = this.scene = this.view.scene;
        this.engine = this.view.engine;
        this.time = 0;

        const dark = new BABYLON.Color3(0.045, 0.032, 0.038);
        scene.clearColor = new BABYLON.Color4(dark.r, dark.g, dark.b, 1);
        scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
        scene.fogColor = dark;
        scene.fogStart = 2200;
        scene.fogEnd = 7600;
        scene.ambientColor = new BABYLON.Color3(0, 0, 0);

        const cam = this.view.camera;
        const U = 'undefined';
        cam.fov = (typeof COLLAPSE_CAM_FOV_DEG !== U ? COLLAPSE_CAM_FOV_DEG : 50) * Math.PI / 180;
        cam.minZ = 10;
        cam.maxZ = 9000;
        cam.position.set(0, typeof COLLAPSE_CAM_Y !== U ? COLLAPSE_CAM_Y : 760, typeof COLLAPSE_CAM_Z !== U ? COLLAPSE_CAM_Z : 1500);
        cam.setTarget(new BABYLON.Vector3(0, 0, typeof COLLAPSE_CAM_LOOK_Z !== U ? COLLAPSE_CAM_LOOK_Z : -900));
        this.renderHeight = typeof COLLAPSE_RENDER_HEIGHT !== U ? COLLAPSE_RENDER_HEIGHT : 640;

        this._tex = new Map();
        this._mats = new Map();
        this._buildTunnel();
        this._buildTrain();
        /** @type {Map<number, any>} */
        this.segViews = new Map();
        /** @type {{ mesh: any, until: number }[]} */
        this._flashes = [];
        this.applyResolution();
        this.ready = new Promise(resolve => scene.executeWhenReady(() => resolve(true)));
    }

    // Render COLLAPSE_RENDER_HEIGHT px tall whatever the screen; CSS scales it up pixelated.
    applyResolution() {
        const h = this.canvas.clientHeight || this.renderHeight;
        this.engine.setHardwareScalingLevel(h / this.renderHeight);
        World3D.resize();
    }

    // --- Materials ------------------------------------------------------------------------

    texture(url) {
        let t = this._tex.get(url);
        if (!t) {
            t = new BABYLON.Texture(url, this.scene, false, true, BABYLON.Texture.NEAREST_NEAREST_MIPLINEAR);
            this._tex.set(url, t);
        }
        return t;
    }

    // Unlit pixel material: color = texture, fog applies, toon plugin skips unlit materials.
    surface(key, url, uScale = 1, vScale = 1) {
        let m = this._mats.get(key);
        if (m) return m;
        m = new BABYLON.StandardMaterial(key, this.scene);
        m.disableLighting = true;
        m.backFaceCulling = false;
        const t = this.texture(url).clone();
        t.uScale = uScale;
        t.vScale = vScale;
        m.emissiveTexture = t;
        m.diffuseColor = new BABYLON.Color3(0, 0, 0);
        m.specularColor = new BABYLON.Color3(0, 0, 0);
        this._mats.set(key, m);
        return m;
    }

    // A cut-out sprite material (alpha test); frames swap its textures.
    spriteMat(key, url) {
        let m = this._mats.get(key);
        if (m) return m;
        m = new BABYLON.StandardMaterial(key, this.scene);
        m.disableLighting = true;
        m.backFaceCulling = false;
        this._setSpriteTex(m, url);
        m.diffuseColor = new BABYLON.Color3(0, 0, 0);
        m.specularColor = new BABYLON.Color3(0, 0, 0);
        m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
        m.alphaCutOff = 0.5;
        this._mats.set(key, m);
        return m;
    }

    _setSpriteTex(m, url) {
        const t = this.texture(url);
        t.hasAlpha = true;
        t.wrapU = t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        m.emissiveTexture = t;
        m.opacityTexture = t;
    }

    // An upright billboard with its origin at the bottom center (feet on the floor).
    sprite(name, key, url, width, height, billboard = true) {
        const p = BABYLON.MeshBuilder.CreatePlane(name, { width, height }, this.scene);
        p.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, height / 2, 0));
        p.material = this.spriteMat(key, url);
        if (billboard) p.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
        p.isPickable = false;
        return p;
    }

    // --- Static tunnel (scrolls with a period of two segments) ----------------------------------

    _buildTunnel() {
        const S = CollapseScene, scene = this.scene;
        const root = this.tunnel = new BABYLON.TransformNode('tunnel', scene);
        const zFar = -S.SEG * S.BEHIND - S.PERIOD, zNear = S.SEG * S.AHEAD + S.PERIOD;
        const len = zNear - zFar;
        const path = [new BABYLON.Vector3(0, 0, zFar), new BABYLON.Vector3(0, 0, zNear)];
        const W = S.WALL_X, top = S.WALL_TOP, R = S.WALL_X;

        const wallShape = side => [new BABYLON.Vector3(side * W, -60, 0), new BABYLON.Vector3(side * W, top, 0)];
        for (const side of [-1, 1]) {
            const wall = BABYLON.MeshBuilder.ExtrudeShape('wall', { shape: wallShape(side), path, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
            wall.material = this.surface('wall', CollapseArt.tex.wall, (top + 60) / S.TILE, len / S.TILE);
            wall.parent = root;
        }
        const arc = [];
        for (let k = 0; k <= 16; k++) {
            const a = Math.PI * k / 16;
            arc.push(new BABYLON.Vector3(-Math.cos(a) * R, top + Math.sin(a) * R * 0.75, 0));
        }
        const vault = BABYLON.MeshBuilder.ExtrudeShape('vault', { shape: arc, path, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        vault.material = this.surface('vault', CollapseArt.tex.vault, Math.PI * R / S.TILE, len / S.TILE);
        vault.parent = root;

        // Lava under the whole floor: seen through gaps, in the side channels and behind the collapse.
        const lava = BABYLON.MeshBuilder.CreateGround('lava', { width: W * 2, height: len }, scene);
        lava.position.set(0, -150, (zFar + zNear) / 2);
        this.lavaMat = this.surface('lava', CollapseArt.lava[0], W * 2 / (2 * S.TILE), len / (2 * S.TILE));
        lava.material = this.lavaMat;
        lava.parent = root;
        // Ballast shoulders between the outer lanes and the lava channels.
        for (const side of [-1, 1]) {
            const sh = BABYLON.MeshBuilder.CreateGround('shoulder', { width: 70, height: len }, scene);
            sh.position.set(side * (S.LANE_W * 1.5 + 35), -8, (zFar + zNear) / 2);
            sh.material = this.surface('ballast', CollapseArt.tex.ballast, 70 / S.TILE, len / S.TILE);
            sh.parent = root;
        }

        // Arch ribs and torches every PERIOD.
        const rib = [];
        for (let k = 0; k <= 16; k++) {
            const a = Math.PI * k / 16;
            rib.push(new BABYLON.Vector3(-Math.cos(a) * (R - 40), top + Math.sin(a) * (R - 40) * 0.75, 0));
        }
        const ribShape = [new BABYLON.Vector3(-(W - 40), -60, 0), ...rib, new BABYLON.Vector3(W - 40, -60, 0)];
        this.torchMat = this.spriteMat('torch', CollapseArt.torch[0]);
        for (let z = zFar + S.PERIOD / 2; z < zNear; z += S.PERIOD) {
            const ribMesh = BABYLON.MeshBuilder.ExtrudeShape('rib', {
                shape: ribShape, path: [new BABYLON.Vector3(0, 0, z - 40), new BABYLON.Vector3(0, 0, z + 40)],
                sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
            ribMesh.material = this.surface('rib', CollapseArt.tex.rib, 12, 1);
            ribMesh.parent = root;
            for (const side of [-1, 1]) {
                const t = this.sprite('torch', 'torch', CollapseArt.torch[0], 70, 140, false);
                t.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
                t.position.set(side * (W - 50), 330, z + S.PERIOD / 2);
                t.parent = root;
                const glow = BABYLON.MeshBuilder.CreatePlane('glow', { width: 260, height: 260 }, scene);
                glow.material = this.spriteMat('glow', CollapseArt.tex.glow);
                glow.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
                glow.position.set(side * (W - 4), 380, z + S.PERIOD / 2);
                glow.parent = root;
            }
        }
    }

    _buildTrain() {
        this.train = this.sprite('loco', 'loco', CollapseArt.loco[0], 290, 418);
        this.train.position.set(0, 0, 0);
        this.shieldFx = this.sprite('shield', 'shield', CollapseArt.shield[0], 460, 352);
        this.shieldFx.position.set(0, 10, 20);
        this.demon = this.sprite('demon', 'demon', CollapseArt.demon[0], 360, 314);
        this.demon.setEnabled(false);
    }

    // --- Per-segment objects ----------------------------------------------------------------------

    static laneX(l) { return (l - 1) * CollapseScene.LANE_W; }

    _segView(i, run) {
        const S = CollapseScene, scene = this.scene, seg = run.track.seg(i);
        const v = { lanes: [], forks: [], signs: [], pickups: [], flows: [] };
        for (let l = 0; l < 3; l++) {
            if (seg.gap[l]) { v.lanes.push(null); continue; }
            const strip = BABYLON.MeshBuilder.CreateGround('strip', { width: S.LANE_W, height: S.SEG }, scene);
            strip.material = this.surface('track', CollapseArt.tex.track, 1, S.SEG / S.LANE_W);
            strip.position.x = S.laneX(l);
            v.lanes.push(strip);
        }
        for (const f of seg.forks) {
            const dx = S.laneX(f.to) - S.laneX(f.from), dz = CollapseRules.SWITCH_LEN * S.SEG;
            const cross = BABYLON.MeshBuilder.CreateGround('cross', { width: S.LANE_W * 0.55, height: Math.hypot(dx, dz) }, scene);
            cross.material = this.surface('track', CollapseArt.tex.track, 1, S.SEG / S.LANE_W);
            cross.rotation.y = Math.atan2(dx, dz);
            cross.metadata = { dx, dz };
            v.forks.push({ f, mesh: cross });
            const sign = this.sprite('sign', 'sign-' + i + '-' + f.from + '-' + f.to, CollapseArt.sign.left, 150, 128);
            sign.metadata = { at: i, from: f.from, to: f.to };
            v.signs.push(sign);
        }
        for (let l = 0; l < 3; l++) {
            const kind = seg.pickup[l];
            if (kind) {
                const p = this.sprite('pickup', 'pickup-' + kind, CollapseArt.pickup[kind], 90, 135);
                p.metadata = { lane: l };
                v.pickups.push(p);
            }
            if (seg.lava[l]) {
                const flow = this.sprite('flow', 'flow', CollapseArt.flow[0], 170, 760, true);
                flow.metadata = { lane: l };
                v.flows.push(flow);
            }
        }
        return v;
    }

    _disposeSeg(v) {
        for (const m of [...v.lanes, ...v.forks.map(f => f.mesh), ...v.signs, ...v.pickups, ...v.flows]) {
            if (m) { if (m.material && m.material.name.startsWith('sign-')) { this._mats.delete(m.material.name); m.material.dispose(); } m.dispose(); }
        }
    }

    // A new run (another seed, another track): drop the segment views and the accents of the last one.
    reset() {
        for (const v of this.segViews.values()) this._disposeSeg(v);
        this.segViews.clear();
        this._shotUntil = this._shieldHitUntil = this._ashUntil = -1;
        this._crashAt = null;
        this.demon.setEnabled(false);
    }

    // Everything follows the run: called every frame before the render.
    sync(run, dt) {
        const S = CollapseScene;
        this.time += dt;
        const pos = run.pos;
        // The tunnel goes away from the camera with the track; it wraps by whole periods, and every
        // texture tile divides PERIOD, so the wrap is invisible.
        this.tunnel.position.z = -(((pos * S.SEG) % S.PERIOD + S.PERIOD) % S.PERIOD);

        // Animated shared materials: lava surface, torches.
        const lf = Math.floor(this.time * 6) % 4;
        this._setSpriteTexFrame(this.lavaMat, CollapseArt.lava[lf], true);
        this._setSpriteTex(this.torchMat, CollapseArt.torch[Math.floor(this.time * 8) % 4]);

        // Segment window: create what came into view, drop what left it.
        const lo = Math.floor(pos) - S.BEHIND, hi = Math.floor(pos) + S.AHEAD;
        for (const [i, v] of this.segViews) if (i < lo || i > hi) { this._disposeSeg(v); this.segViews.delete(i); }
        for (let i = Math.max(-S.BEHIND, lo); i <= hi; i++) if (!this.segViews.has(i)) this.segViews.set(i, this._segView(i, run));

        const next = run.nextFork();
        for (const [i, v] of this.segViews) {
            const z = (i - pos) * S.SEG;
            // Behind the collapse front the floor falls into the lava.
            const fallen = run.front - i;
            const drop = fallen > 0 ? Math.min(900, fallen * fallen * 500) : 0;
            v.lanes.forEach((m, l) => {
                if (!m) return;
                m.position.z = z + S.SEG / 2;
                m.position.y = -drop;
                m.setEnabled(drop < 880);
            });
            for (const { f, mesh } of v.forks) {
                const md = mesh.metadata;
                mesh.position.set(S.laneX(f.from) + md.dx / 2, 2 - drop, z + md.dz / 2);
                mesh.setEnabled(drop < 880);
            }
            for (const sign of v.signs) {
                const md = sign.metadata;
                const mine = md.from === run.lane || (run.armed && run.armed.at === md.at && md.from === run.armed.from);
                const visible = mine && i > pos - 0.2 && drop === 0;
                sign.setEnabled(visible);
                if (!visible) continue;
                const safe = run.forkSafe(md.at, md.to);
                const url = !safe ? CollapseArt.sign.cross : md.to < md.from ? CollapseArt.sign.left : CollapseArt.sign.right;
                this._setSpriteTex(sign.material, url);
                const armed = run.armed && run.armed.at === md.at && run.armed.to === md.to;
                const actionable = next && next.at === md.at;
                sign.position.set(S.laneX(md.from) + (md.to - md.from) * S.LANE_W * 0.5, armed ? 40 : 0, z);
                sign.scaling.setAll(armed ? 1.15 : actionable ? 1 : 0.75);
            }
            for (const p of v.pickups) {
                const taken = run.isTaken(i) && p.metadata.lane === run.lane;
                p.setEnabled(!taken && drop === 0);
                p.position.set(S.laneX(p.metadata.lane), 6 + Math.sin(this.time * 4 + i) * 10, z + S.SEG / 2);
            }
            for (const fl of v.flows) {
                fl.position.set(S.laneX(fl.metadata.lane), 120, z + S.SEG / 2);
                fl.setEnabled(drop === 0);
            }
        }
        this._setSpriteTex(this._mats.get('flow') || this.spriteMat('flow', CollapseArt.flow[0]), CollapseArt.flow[Math.floor(this.time * 10) % 4]);

        // The train: lane position, run frames, shot and crash frames.
        const x = S.laneX(run.laneX());
        this.train.position.x = x;
        let frame = CollapseArt.loco[Math.floor(this.time * (4 + run.speed() * 2)) % 4];
        if (this._shotUntil > this.time) frame = this._shotFrame;
        this.train.position.y = 0;
        this.train.rotation.z = 0;
        if (run.state === 'over') {
            const k = Math.min(1, (this.time - (this._crashAt || this.time)) * 1.6);
            if (run.reason === 'gap' || run.reason === 'caught') {
                frame = run.lane === 0 ? CollapseArt.locoFall.left : CollapseArt.locoFall.right;
                this.train.position.y = -k * 260;
            } else {
                frame = CollapseArt.locoDamaged;
            }
        }
        this._setSpriteTex(this.train.material, frame);
        this.shieldFx.setEnabled(run.shield > 0 && run.state === 'run');
        this.shieldFx.position.x = x;
        this._setSpriteTex(this.shieldFx.material, this._shieldHitUntil > this.time ? CollapseArt.shieldHit : CollapseArt.shield[Math.floor(this.time * 6) % 3]);

        // The demon leaps from the dark toward the train.
        if (run.demon) {
            const k = 1 - run.demon.t / run.c.demonSec;
            this.demon.setEnabled(true);
            this.demon.position.set(x + (run.lane === 2 ? -1 : 1) * S.LANE_W * 0.7 * (1 - k), 40 + Math.sin(k * Math.PI) * 220, (1 - k) * S.SEG * 2.2 + 120);
            this._setSpriteTex(this.demon.material, CollapseArt.demon[Math.min(3, Math.floor(k * 4))]);
        } else if (this._ashUntil > this.time) {
            this._setSpriteTex(this.demon.material, CollapseArt.demonAsh);
        } else {
            this.demon.setEnabled(false);
        }
    }

    _setSpriteTexFrame(m, url, tiled) {
        const base = this.texture(url);
        const t = m.emissiveTexture;
        if (t && t.url === base.url) return;
        const c = base.clone();
        if (tiled && t) { c.uScale = t.uScale; c.vScale = t.vScale; }
        if (t) t.dispose();
        m.emissiveTexture = c;
    }

    // React to run events (shots, pickups, crash) with short visual accents.
    onEvent(e, run) {
        if (e.type === 'shot') {
            this._shotFrame = e.to < run.lane ? CollapseArt.locoShot.left : CollapseArt.locoShot.right;
            this._shotUntil = this.time + 0.18;
        } else if (e.type === 'shielded') {
            this._shieldHitUntil = this.time + 0.3;
        } else if (e.type === 'demon-killed') {
            this._ashUntil = this.time + 0.4;
        } else if (e.type === 'crash') {
            this._crashAt = this.time;
        }
    }

    // Tap targets in canvas CSS px: the next fork's signs and the demon.
    tapTargets(run) {
        const out = [];
        const next = run.nextFork();
        if (next) {
            const v = this.segViews.get(next.at);
            for (const sign of v ? v.signs : []) {
                const md = sign.metadata;
                if (md.at !== next.at || md.from !== run.lane) continue;
                const p = this.view.projectToScreen(sign.position.x, sign.position.z, 70);
                if (!p.behind) out.push({ x: p.x, y: p.y, kind: 'fork', at: md.at, to: md.to });
            }
        }
        if (run.demon && this.demon.isEnabled()) {
            const d = this.demon.position;
            const p = this.view.projectToScreen(d.x, d.z, d.y + 140);
            if (!p.behind) out.push({ x: p.x, y: p.y, kind: 'demon' });
        }
        return out;
    }
}

CollapseScene.SEG = 280;          // world units per segment along the track
CollapseScene.LANE_W = 300;       // world units between lane centers
CollapseScene.PERIOD = 560;       // the static tunnel repeats every two segments (ribs, torches)
CollapseScene.TILE = 140;         // world units per texture tile along the tunnel: divides PERIOD
CollapseScene.WALL_X = 640;       // half width of the tunnel
CollapseScene.WALL_TOP = 430;     // where the walls meet the vault
CollapseScene.BEHIND = 16;        // segments drawn behind the train (into the vanishing point)
CollapseScene.AHEAD = 6;          // segments drawn ahead of the train (toward the camera)
