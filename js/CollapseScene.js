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
        scene.ambientColor = new BABYLON.Color3(0, 0, 0);

        const cam = this.view.camera;
        const U = 'undefined';
        cam.fov = (typeof COLLAPSE_CAM_FOV_DEG !== U ? COLLAPSE_CAM_FOV_DEG : 50) * Math.PI / 180;
        cam.minZ = 10;
        cam.position.set(0, typeof COLLAPSE_CAM_Y !== U ? COLLAPSE_CAM_Y : 650, typeof COLLAPSE_CAM_Z !== U ? COLLAPSE_CAM_Z : 3000);
        cam.setTarget(new BABYLON.Vector3(0, 0, typeof COLLAPSE_CAM_LOOK_Z !== U ? COLLAPSE_CAM_LOOK_Z : 920));
        // The camera follows the train sideways (GDD v3 §2): eye and look-at point shift together by a
        // share of the train's offset, so the view direction never turns; camX eases toward that goal.
        this.camFollow = typeof COLLAPSE_CAM_FOLLOW !== U ? COLLAPSE_CAM_FOLLOW : 0.5;
        this.camRate = typeof COLLAPSE_CAM_FOLLOW_RATE !== U ? COLLAPSE_CAM_FOLLOW_RATE : 5;
        this.camX = 0;
        // Fog and the far plane are counted from the train, so a camera moved farther away keeps the
        // same depth; the segment window reaches the camera, so the near track never pops in.
        const camZ = cam.position.z, toTrain = cam.position.length();
        scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
        scene.fogColor = dark;
        scene.fogStart = toTrain + (typeof COLLAPSE_FOG_START !== U ? COLLAPSE_FOG_START : 1200);
        scene.fogEnd = toTrain + (typeof COLLAPSE_FOG_END !== U ? COLLAPSE_FOG_END : 5600);
        // Brightness of the unlit pixel art (texture level): brick a bit above its file, lava glows.
        this.brickLevel = typeof COLLAPSE_BRICK_LEVEL !== U ? COLLAPSE_BRICK_LEVEL : 1.35;
        this.lavaLevel = typeof COLLAPSE_LAVA_LEVEL !== U ? COLLAPSE_LAVA_LEVEL : 1.5;
        cam.maxZ = toTrain + CollapseScene.SEG * CollapseScene.BEHIND + 2000;
        this.ahead = Math.max(CollapseScene.AHEAD, Math.ceil(camZ / CollapseScene.SEG) + 1);
        this.slots = CollapseScene.BEHIND + this.ahead + 2;   // tunnel pieces: one per segment of the window
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
    surface(key, url, uScale = 1, vScale = 1, level = 1) {
        let m = this._mats.get(key);
        if (m) return m;
        m = new BABYLON.StandardMaterial(key, this.scene);
        m.disableLighting = true;
        m.backFaceCulling = false;
        const t = this.texture(url).clone();
        t.uScale = uScale;
        t.vScale = vScale;
        t.level = level;
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

    // --- The tunnel --------------------------------------------------------------------------------
    // The lava is one static plane that scrolls with a period of two segments. Everything above it
    // (walls, vault, arch ribs, torches, ballast shoulders) is cut into per-segment PIECES, one mesh
    // per kind with a thin instance per segment of the window: behind CollapseRun.front each piece
    // leans in and falls into the lava (GDD v3 §3, §6), so nothing behind the collapse stays whole.

    _buildTunnel() {
        const S = CollapseScene, scene = this.scene;
        const root = this.tunnel = new BABYLON.TransformNode('tunnel', scene);
        const zFar = -S.SEG * S.BEHIND - S.PERIOD, zNear = S.SEG * this.ahead + S.PERIOD;
        const len = zNear - zFar;
        const W = S.WALL_X, top = S.WALL_TOP, R = S.WALL_X;
        const BRICK = S.TILE * 2;   // wall and vault bricks read at the camera's distance; one tile per segment
        const mid = (top - 60) / 2; // where a wall breaks into its lower and upper piece

        // Lava under the whole floor: seen through gaps, in the side channels and behind the collapse.
        const lava = BABYLON.MeshBuilder.CreateGround('lava', { width: W * 2, height: len }, scene);
        lava.position.set(0, -150, (zFar + zNear) / 2);
        lava.material = this.surface('lava', CollapseArt.lava[0], W * 2 / (2 * S.TILE), len / (2 * S.TILE), this.lavaLevel);
        lava.parent = root;
        // Ballast shoulders beside the outer lanes, then a lava channel up to the wall (the keyframe).
        const edge = S.LANE_W * 1.5, shoulder = 40, channel = W - edge - shoulder;
        for (const side of [-1, 1]) {
            const ch = BABYLON.MeshBuilder.CreateGround('lava-channel', { width: channel, height: len }, scene);
            ch.position.set(side * (W - channel / 2), -30, (zFar + zNear) / 2);
            ch.material = this.surface('lava-channel', CollapseArt.lava[0], channel / (2 * S.TILE), len / (2 * S.TILE), this.lavaLevel);
            ch.parent = root;
        }
        this.lavaMats = [this._mats.get('lava'), this._mats.get('lava-channel')];

        // Piece shapes in the segment's local space: z from 0 to SEG, x and y as in the tunnel.
        const V = (x, y) => new BABYLON.Vector3(x, y, 0);
        const path = [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, 0, S.SEG)];
        const extrude = (name, shape, p = path) => BABYLON.MeshBuilder.ExtrudeShape(name, { shape, path: p, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        const arc = (r, from, to) => {
            const pts = [];
            for (let k = from; k <= to; k++) { const a = Math.PI * k / 16; pts.push(V(-Math.cos(a) * r, top + Math.sin(a) * r * 0.75)); }
            return pts;
        };
        const wallLo = (mid + 60) / BRICK, wallHi = (top - mid) / BRICK, half = Math.PI * R / 2 / BRICK;
        const ribPath = [new BABYLON.Vector3(0, 0, -40), new BABYLON.Vector3(0, 0, 40)];
        this.torchMat = this.spriteMat('torch', CollapseArt.torch[0]);
        /** @type {{ mesh: any, side: number, kind: string, pivot: number[], buf: Float32Array }[]} */
        this.pieces = [];
        const piece = (mesh, side, kind, pivot) => {
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;   // instances move every frame: no stale bounds to cull by
            const buf = new Float32Array(16 * this.slots);
            mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
            this.pieces.push({ mesh, side, kind, pivot, buf });
        };
        for (const side of [-1, 1]) {
            const s = side < 0 ? 'L' : 'R';
            const lo = extrude('wall-lo', [V(side * W, -60), V(side * W, mid)]);
            lo.material = this.surface('wall-lo', CollapseArt.tex.wall, wallLo, 1, this.brickLevel);
            piece(lo, side, 'wall-lo', [side * W, -60]);
            const hi = extrude('wall-hi', [V(side * W, mid), V(side * W, top)]);
            const hiMat = this.surface('wall-hi', CollapseArt.tex.wall, wallHi, 1, this.brickLevel);
            hiMat.emissiveTexture.uOffset = wallLo;
            hi.material = hiMat;
            piece(hi, side, 'wall-hi', [side * W, mid]);
            const vault = extrude('vault-' + s, side < 0 ? arc(R, 0, 8) : arc(R, 8, 16));
            const vMat = this.surface('vault-' + s, CollapseArt.tex.vault, half, 1, this.brickLevel);
            if (side > 0) vMat.emissiveTexture.uOffset = half;
            vault.material = vMat;
            piece(vault, side, 'vault', [side * W, top]);
            const ribShape = side < 0 ? [V(-(W - 40), -60), ...arc(R - 40, 0, 8)] : [...arc(R - 40, 8, 16), V(W - 40, -60)];
            const rib = extrude('rib-' + s, ribShape, ribPath);
            rib.material = this.surface('rib', CollapseArt.tex.rib, 6, 1, this.brickLevel);
            piece(rib, side, 'rib', [side * W, -60]);
            const sh = BABYLON.MeshBuilder.CreateGround('shoulder', { width: shoulder, height: S.SEG }, scene);
            sh.bakeTransformIntoVertices(BABYLON.Matrix.Translation(side * (edge + shoulder / 2), -8, S.SEG / 2));
            sh.material = this.surface('ballast', CollapseArt.tex.ballast, shoulder / S.TILE, S.SEG / S.TILE);
            piece(sh, side, 'floor', [side * edge, -8]);
            // The flame faces the camera: a sprite flat on the wall is seen edge-on from the track.
            const torch = this.sprite('torch', 'torch', CollapseArt.torch[0], 105, 210, false);
            torch.bakeTransformIntoVertices(BABYLON.Matrix.Translation(side * (W - 60), 250, 0));
            piece(torch, side, 'torch', [side * W, mid]);
            const glow = BABYLON.MeshBuilder.CreatePlane('glow', { width: 400, height: 400 }, scene);
            glow.bakeTransformIntoVertices(BABYLON.Matrix.RotationY(side > 0 ? -Math.PI / 2 : Math.PI / 2).multiply(BABYLON.Matrix.Translation(side * (W - 4), 360, 0)));
            glow.material = this.spriteMat('glow', CollapseArt.tex.glow);
            piece(glow, side, 'torch', [side * W, mid]);
        }

        // Brick debris that rains from the vault into the lava along the collapse edge.
        const debris = this.debris = BABYLON.MeshBuilder.CreateBox('debris', { size: 1 }, scene);
        debris.material = this.surface('debris', CollapseArt.tex.wall, 0.5, 0.5, this.brickLevel);
        debris.isPickable = false;
        debris.alwaysSelectAsActiveMesh = true;
        this.debrisBuf = new Float32Array(16 * S.DEBRIS);
        debris.thinInstanceSetBuffer('matrix', this.debrisBuf, 16, false);
        this._m = [0, 1, 2, 3].map(() => new BABYLON.Matrix());
    }

    // A stable pseudo-random 0..1 per segment and slot: pieces of one segment do not fall in lockstep.
    static hash(i, k) {
        const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
        return x - Math.floor(x);
    }

    // A piece `f` segments past the moment it starts to go: [how far it has dropped, how far it leans 0..1].
    static fall(f) {
        if (f <= 0) return [0, 0];
        return [f * f * 700 + f * 120, Math.min(1, f / 1.2)];
    }

    _syncTunnel(run, pos) {
        const S = CollapseScene, m = this._m, first = Math.floor(pos) - S.BEHIND;
        // Pieces start at staggered moments: the vault and the torches go at the front, the upper walls
        // a little later, the lower walls last; the shoulders go with the floor.
        const delay = { vault: 0, torch: 0.05, rib: 0.1, 'wall-hi': 0.15, 'wall-lo': 0.3, floor: 0 };
        const lean = { vault: 0.75, torch: 0.45, rib: 0.55, 'wall-hi': 0.45, 'wall-lo': 0.25, floor: 0 };
        for (const p of this.pieces) {
            const buf = p.buf;
            for (let k = 0; k < this.slots; k++) {
                const i = first + k;
                const skip = (p.kind === 'rib' && (i & 1) === 0) || (p.kind === 'torch' && (i & 1) === 1);
                const f = run.front - i - delay[p.kind] - S.hash(i, p.side + 3) * 0.25;
                const [drop, k2] = S.fall(f);
                if (skip || drop > 1500) { buf.fill(0, k * 16, k * 16 + 16); continue; }
                const a = p.side * lean[p.kind] * k2 * (0.7 + 0.6 * S.hash(i, p.side + 7));
                BABYLON.Matrix.TranslationToRef(-p.pivot[0], -p.pivot[1], 0, m[0]);
                BABYLON.Matrix.RotationZToRef(a, m[1]);
                m[0].multiplyToRef(m[1], m[2]);
                BABYLON.Matrix.TranslationToRef(p.pivot[0] - p.side * drop * 0.15, p.pivot[1] - drop, (i - pos) * S.SEG, m[1]);
                m[2].multiplyToRef(m[1], m[3]);
                m[3].copyToArray(buf, k * 16);
            }
            p.mesh.thinInstanceBufferUpdated('matrix');
        }
        // Debris: DEBRIS bricks over the segments around the front, each falls once from the vault.
        const buf = this.debrisBuf, per = 8, base = Math.floor(run.front) + 1;
        for (let j = 0; j < S.DEBRIS; j++) {
            const i = base - Math.floor(j / per), h = k => S.hash(i, j % per * 5 + k);
            const f = run.front - i - h(0) * 0.9;
            const side = h(1) < 0.5 ? -1 : 1;
            const y = 300 + h(2) * 600 - (f > 0 ? f * f * 1400 + f * 200 : 0);
            if (f <= 0 || y < -260) { buf.fill(0, j * 16, j * 16 + 16); continue; }
            const size = 40 + h(3) * 70;
            BABYLON.Matrix.ScalingToRef(size, size * 0.6, size, m[0]);
            BABYLON.Matrix.RotationYawPitchRollToRef(f * 4 * (h(4) - 0.5), f * 5 * h(1), f * 3, m[1]);
            m[0].multiplyToRef(m[1], m[2]);
            BABYLON.Matrix.TranslationToRef(side * (S.WALL_X - 80 - h(3) * 360), y, (i + h(4) - pos) * S.SEG, m[1]);
            m[2].multiplyToRef(m[1], m[3]);
            m[3].copyToArray(buf, j * 16);
        }
        this.debris.thinInstanceBufferUpdated('matrix');
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

    // Red cross at fork boundary i on `lane` (GDD v3 §4): a fork leaves that lane here, and staying on
    // it is not safe — the same CollapseRun.forkSafe that colors the arrows, asked about the lane itself.
    static crossAt(run, i, lane) {
        return run.track.seg(i).forks.some(f => f.from === lane) && !run.forkSafe(i, lane);
    }

    _segView(i, run) {
        const S = CollapseScene, scene = this.scene, seg = run.track.seg(i);
        const v = { lanes: [], forks: [], signs: [], crosses: [], pickups: [], flows: [] };
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
        // A red cross on each lane a fork leaves from: shown when staying on that lane is a fall.
        for (const from of new Set(seg.forks.map(f => f.from))) {
            const cross = this.sprite('cross-sign', 'cross-sign', CollapseArt.sign.cross, 150, 128);
            cross.metadata = { lane: from };
            v.crosses.push(cross);
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
        for (const m of [...v.lanes, ...v.forks.map(f => f.mesh), ...v.signs, ...v.crosses, ...v.pickups, ...v.flows]) {
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
        this._camSnap = true;
    }

    // Sideways camera follow: dt = 0 (pause, the first frame) does not move it; a new run snaps it.
    _followCamera(trainX, dt) {
        const goal = trainX * this.camFollow;
        if (this._camSnap) { this.camX = goal; this._camSnap = false; }
        else this.camX += (goal - this.camX) * (1 - Math.exp(-this.camRate * dt));
        this.view.camera.position.x = this.camX;
    }

    // Everything follows the run: called every frame before the render.
    sync(run, dt) {
        const S = CollapseScene;
        this.time += dt;
        const pos = run.pos;
        // The lava goes away from the camera with the track; it wraps by whole periods, and every
        // texture tile divides PERIOD, so the wrap is invisible. The pieces above it follow the segments.
        this.tunnel.position.z = -(((pos * S.SEG) % S.PERIOD + S.PERIOD) % S.PERIOD);
        this._syncTunnel(run, pos);

        // Animated shared materials: lava surface, torches.
        const lf = Math.floor(this.time * 6) % 4;
        for (const m of this.lavaMats) this._setSpriteTexFrame(m, CollapseArt.lava[lf], true);
        this._setSpriteTex(this.torchMat, CollapseArt.torch[Math.floor(this.time * 8) % 4]);

        // Segment window: create what came into view, drop what left it.
        const lo = Math.floor(pos) - S.BEHIND, hi = Math.floor(pos) + this.ahead;
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
            for (const c of v.crosses) {
                const lane = c.metadata.lane;
                const visible = lane === run.lane && i > pos - 0.2 && drop === 0 && S.crossAt(run, i, lane);
                c.setEnabled(visible);
                if (!visible) continue;
                c.position.set(S.laneX(lane), 0, z);
                c.scaling.setAll(next && next.at === i ? 1 : 0.75);   // the size of the arrows beside it
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
        this._followCamera(x, dt);
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
        if (tiled && t) { c.uScale = t.uScale; c.vScale = t.vScale; c.level = t.level; }
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
CollapseScene.DEBRIS = 40;        // falling bricks along the collapse edge
CollapseScene.AHEAD = 6;          // at least this many segments drawn ahead of the train (up to the camera)
