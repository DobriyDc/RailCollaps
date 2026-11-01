// CollapseScene.js — the tunnel of Rail Link: Collapse (GDD v3 §2, the world of docs/STYLE.md):
// a real 3D scene rendered small (COLLAPSE_RENDER_HEIGHT px tall) and scaled up without smoothing,
// pixel textures (emissive, nearest sampling), the light and the palette of CollapseLook.js, linear fog for depth.
// The train stands still at z = 0 facing the camera (+Z); the world scrolls toward the camera as
// CollapseRun.pos grows: segment i is drawn at z = (i - pos) * SEG, the upcoming track is in the
// lower part of the frame, the passed track and the collapse go up into the vanishing point.
// The scene only draws CollapseRun; it decides nothing (CollapseRules.js).

/** @satisfies {Record<string, any>} */
const CollapseArt = {
    // Paths are LITERALS: the builder's asset scanner includes only what it sees in code.
    // The world of keyframe 1 (card 30, art_src/world_v3): tiles 128 x 128, one tile a lane or a segment.
    tex: {
        wall: 'assets/textures/world/brick_wall.png',
        vault: 'assets/textures/world/vault_brick.png',
        rib: 'assets/textures/world/arch_rib.png',
        track: 'assets/textures/world/track.png',
        ballast: 'assets/textures/world/floor_ballast.png',
    },
    lava: ['assets/textures/world/lava_0.png', 'assets/textures/world/lava_1.png',
        'assets/textures/world/lava_2.png', 'assets/textures/world/lava_3.png'],
    // The edges of a gap on the floor plane: the whole side of each matches track.png byte for byte.
    gap: { front: 'assets/sprites/world/gap_front.png', back: 'assets/sprites/world/gap_back.png' },
    // The collapse: four layers from the far one to the rubble on the floor; relative depths of the manifest.
    bg: [
        { key: 'bg-void', url: 'assets/sprites/world/bg_01_void.png', depth: 48 },
        { key: 'bg-arches', url: 'assets/sprites/world/bg_02_arches.png', depth: 36 },
        { key: 'bg-column', url: 'assets/sprites/world/bg_03_column.png', depth: 24 },
        { key: 'bg-rubble', url: 'assets/sprites/world/bg_04_rubble.png', depth: 12 },
    ],
    crackWall: ['assets/sprites/collapse/crack_wall_00.png', 'assets/sprites/collapse/crack_wall_01.png'],
    crackVault: ['assets/sprites/collapse/crack_vault_00.png', 'assets/sprites/collapse/crack_vault_01.png'],
    brick: ['assets/sprites/world/chunk_brick_01.png', 'assets/sprites/world/chunk_brick_02.png',
        'assets/sprites/world/chunk_brick_03.png', 'assets/sprites/world/chunk_brick_04.png',
        'assets/sprites/world/chunk_brick_05.png', 'assets/sprites/world/chunk_brick_06.png',
        'assets/sprites/world/chunk_vault_01.png'],
    railBits: ['assets/sprites/world/chunk_rail_sleepers.png'],
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
    // The demon (art_src/demon_v3): drawn for the right wall, the left one mirrors it.
    demon: {
        emerge: ['assets/sprites/demon_v3/emerge_00.png', 'assets/sprites/demon_v3/emerge_01.png', 'assets/sprites/demon_v3/emerge_02.png'],
        perch: ['assets/sprites/demon_v3/perch_00.png', 'assets/sprites/demon_v3/perch_01.png', 'assets/sprites/demon_v3/perch_02.png', 'assets/sprites/demon_v3/perch_03.png'],
        jump: ['assets/sprites/demon_v3/jump_00.png', 'assets/sprites/demon_v3/jump_01.png', 'assets/sprites/demon_v3/jump_02.png', 'assets/sprites/demon_v3/jump_03.png'],
        strike: ['assets/sprites/demon_v3/strike_00.png', 'assets/sprites/demon_v3/strike_01.png'],
        ash: ['assets/sprites/demon_v3/ash_00.png', 'assets/sprites/demon_v3/ash_01.png', 'assets/sprites/demon_v3/ash_02.png', 'assets/sprites/demon_v3/ash_03.png'],
    },
    sign: { left: 'assets/px/ui/sign_left.png', right: 'assets/px/ui/sign_right.png', cross: 'assets/px/ui/sign_cross.png' },
    hazard: 'assets/px/ui/hazard.png',
    sw: { waiting: 'assets/px/switch/waiting.png', hit: 'assets/px/switch/hit.png',
        left: 'assets/px/switch/set_left.png', right: 'assets/px/switch/set_right.png' },
    // Turnouts (card 07, art_src/switches_v1): one overlay of switch points per state, canvas 384x640 =
    // three lanes. The curve itself is geometry cut from the rails of track.png (_branchRails).
    switches: {
        right: { straight: 'assets/textures/switches/switch_right_points_straight.png',
            right: 'assets/textures/switches/switch_right_points_right.png' },
        left: { straight: 'assets/textures/switches/switch_left_points_straight.png',
            left: 'assets/textures/switches/switch_left_points_left.png' },
        both: { straight: 'assets/textures/switches/switch_both_points_straight.png',
            left: 'assets/textures/switches/switch_both_points_left.png',
            right: 'assets/textures/switches/switch_both_points_right.png' },
    },
    // Lane change and damage effects (card 15, art_src/fx_v1): frames of one-shot sprites.
    fx: {
        sparks: ['assets/sprites/fx/wheel_sparks_00_v1.png', 'assets/sprites/fx/wheel_sparks_01_v1.png', 'assets/sprites/fx/wheel_sparks_02_v1.png', 'assets/sprites/fx/wheel_sparks_03_v1.png', 'assets/sprites/fx/wheel_sparks_04_v1.png', 'assets/sprites/fx/wheel_sparks_05_v1.png'],
        smoke: ['assets/sprites/fx/lane_smoke_00_v1.png', 'assets/sprites/fx/lane_smoke_01_v1.png', 'assets/sprites/fx/lane_smoke_02_v1.png', 'assets/sprites/fx/lane_smoke_03_v1.png'],
        claw: ['assets/sprites/fx/demon_claw_00_v1.png', 'assets/sprites/fx/demon_claw_01_v1.png', 'assets/sprites/fx/demon_claw_02_v1.png', 'assets/sprites/fx/demon_claw_03_v1.png'],
        ash: ['assets/sprites/fx/impact_ash_00_v1.png', 'assets/sprites/fx/impact_ash_01_v1.png', 'assets/sprites/fx/impact_ash_02_v1.png', 'assets/sprites/fx/impact_ash_03_v1.png'],
        splash: ['assets/sprites/fx/lava_splash_00_v1.png', 'assets/sprites/fx/lava_splash_01_v1.png', 'assets/sprites/fx/lava_splash_02_v1.png', 'assets/sprites/fx/lava_splash_03_v1.png', 'assets/sprites/fx/lava_splash_04_v1.png', 'assets/sprites/fx/lava_splash_05_v1.png'],
        steam: ['assets/sprites/fx/hot_steam_00_v1.png', 'assets/sprites/fx/hot_steam_01_v1.png', 'assets/sprites/fx/hot_steam_02_v1.png', 'assets/sprites/fx/hot_steam_03_v1.png'],
        drops: ['assets/sprites/fx/lava_droplets_00_v1.png', 'assets/sprites/fx/lava_droplets_01_v1.png', 'assets/sprites/fx/lava_droplets_02_v1.png', 'assets/sprites/fx/lava_droplets_03_v1.png'],
        shieldBreak: ['assets/sprites/fx/shield_break_00_v1.png', 'assets/sprites/fx/shield_break_01_v1.png', 'assets/sprites/fx/shield_break_02_v1.png', 'assets/sprites/fx/shield_break_03_v1.png'],
        rail: ['assets/sprites/fx/rail_debris_00_v1.png', 'assets/sprites/fx/rail_debris_01_v1.png', 'assets/sprites/fx/rail_debris_02_v1.png', 'assets/sprites/fx/rail_debris_03_v1.png'],
    },
    pickup: { ammo: 'assets/px/pickups/ammo.png', boost: 'assets/px/pickups/boost.png', slow: 'assets/px/pickups/slow.png',
        shield: 'assets/px/pickups/shield.png', rescue: 'assets/px/pickups/rescue.png' },
};

class CollapseScene {
    constructor(canvas) {
        this.canvas = canvas;
        this.rig = new CollapseLookRig();
        this.view = World3D.createView({});
        const scene = this.scene = this.view.scene;
        this.engine = this.view.engine;
        this.time = 0;

        const dark = new BABYLON.Color3(0.045, 0.032, 0.038);
        scene.clearColor = new BABYLON.Color4(dark.r, dark.g, dark.b, 1);
        scene.ambientColor = new BABYLON.Color3(0, 0, 0);

        const cam = this.view.camera;
        const U = 'undefined';
        cam.minZ = 10;
        scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
        scene.fogColor = dark;
        this.applyCamera();
        cam.setTarget(BABYLON.Vector3.Zero());
        this.camX = 0;
        // The segment window reaches the camera, so the near track never pops in.
        const camZ = cam.position.z;
        // Brightness of the unlit pixel art (texture level): brick a bit above its file, lava glows.
        this.brickLevel = typeof COLLAPSE_BRICK_LEVEL !== U ? COLLAPSE_BRICK_LEVEL : 1.35;
        this.lavaLevel = typeof COLLAPSE_LAVA_LEVEL !== U ? COLLAPSE_LAVA_LEVEL : 1.5;
        // The collapse: the crack zone ahead of it, how bright the cracks glow, how far ahead of the
        // edge the vault starts to shed blocks.
        this.crackZone = typeof COLLAPSE_CRACK_ZONE !== U ? COLLAPSE_CRACK_ZONE : 3;
        this.crackLevel = typeof COLLAPSE_CRACK_LEVEL !== U ? COLLAPSE_CRACK_LEVEL : 1.6;
        this.debrisLead = typeof COLLAPSE_DEBRIS_LEAD !== U ? COLLAPSE_DEBRIS_LEAD : 1;
        // Effects (card 16): the camera shake of a demon hit, the glow of a
        // lava hit, the lean into a gap.
        this.shakeAmp = typeof COLLAPSE_FX_SHAKE !== U ? COLLAPSE_FX_SHAKE : 24;
        this.shakeSec = typeof COLLAPSE_FX_SHAKE_SEC !== U ? COLLAPSE_FX_SHAKE_SEC : 0.35;
        this.heatSec = typeof COLLAPSE_FX_HEAT_SEC !== U ? COLLAPSE_FX_HEAT_SEC : 0.5;
        this.fallTilt = (typeof COLLAPSE_FX_FALL_TILT_DEG !== U ? COLLAPSE_FX_FALL_TILT_DEG : 22) * Math.PI / 180;
        // The lever of a fork after the driver's shot: sparks, then the throw.
        this.leverHit = typeof COLLAPSE_SWITCH_HIT_SEC !== U ? COLLAPSE_SWITCH_HIT_SEC : 0.14;
        this.leverThrow = typeof COLLAPSE_SWITCH_THROW_SEC !== U ? COLLAPSE_SWITCH_THROW_SEC : 0.12;
        // The layers of the collapse.
        this.bgDepth = typeof COLLAPSE_BG_DEPTH !== U ? COLLAPSE_BG_DEPTH : 90;
        this.bgPx = typeof COLLAPSE_BG_PX !== U ? COLLAPSE_BG_PX : 3.4;
        this.bgGap = typeof COLLAPSE_BG_REF_GAP !== U ? COLLAPSE_BG_REF_GAP : 5;
        this.bgSlope = (typeof COLLAPSE_BG_SLOPE_DEG !== U ? COLLAPSE_BG_SLOPE_DEG : 12) * Math.PI / 180;
        this.chunkArt = typeof COLLAPSE_CHUNK_ART !== U ? COLLAPSE_CHUNK_ART : 4;
        // The train at the steepest point of a fork: its lean, how far it swings out, how narrow it turns.
        this.rollMax = (typeof COLLAPSE_TRAIN_ROLL_DEG !== U ? COLLAPSE_TRAIN_ROLL_DEG : 8) * Math.PI / 180;
        this.trainShift = typeof COLLAPSE_TRAIN_SHIFT !== U ? COLLAPSE_TRAIN_SHIFT : 36;
        this.trainSqueeze = typeof COLLAPSE_TRAIN_SQUEEZE !== U ? COLLAPSE_TRAIN_SQUEEZE : 0.14;
        this._shakeAt = this._heatAt = -1e9;
        this.ahead = Math.max(CollapseScene.AHEAD, Math.ceil(camZ / CollapseScene.SEG) + 1);
        this.slots = CollapseScene.BEHIND + this.ahead + 2;   // tunnel pieces: one per segment of the window
        this.renderHeight = typeof COLLAPSE_RENDER_HEIGHT !== U ? COLLAPSE_RENDER_HEIGHT : 360;

        this._tex = new Map();
        this._mats = new Map();
        this._buildTunnel();
        this._buildTrain();
        this.rig.finish(this);
        this.fitFrame(1);
        /** @type {Map<number, any>} */
        this.segViews = new Map();
        /** @type {{ mesh: any, until: number }[]} */
        this._flashes = [];
        this.applyResolution();
        this._preload();
        this.ready = new Promise(resolve => scene.executeWhenReady(() => resolve(true)));
    }

    // Reads the COLLAPSE_CAM_* numbers into the camera: at construction and whenever they change
    // live (_utils/tuner). The tilt is fitFrame's. The segment window (ahead) stays as built, so a
    // camera moved farther than the one the scene was built with needs the larger one at construction.
    applyCamera() {
        const cam = this.view.camera, scene = this.scene, U = 'undefined';
        const y = typeof COLLAPSE_CAM_Y !== U ? COLLAPSE_CAM_Y : 450, z = typeof COLLAPSE_CAM_Z !== U ? COLLAPSE_CAM_Z : 1467;
        cam.fov = (typeof COLLAPSE_CAM_FOV_DEG !== U ? COLLAPSE_CAM_FOV_DEG : 50) * Math.PI / 180;
        cam.position.set(this.camX || 0, y, z);
        this.camY = y;
        this.topGap = typeof COLLAPSE_CAM_TOP_GAP !== U ? COLLAPSE_CAM_TOP_GAP : 0.01;
        // The camera follows the train sideways (GDD v3 §2): eye and look-at point shift together by a
        // share of the train's offset, so the view direction never turns; camX eases toward that goal.
        this.camFollow = typeof COLLAPSE_CAM_FOLLOW !== U ? COLLAPSE_CAM_FOLLOW : 0.5;
        this.camRate = typeof COLLAPSE_CAM_FOLLOW_RATE !== U ? COLLAPSE_CAM_FOLLOW_RATE : 5;
        this.signShift = typeof COLLAPSE_CAM_SIGN !== U ? COLLAPSE_CAM_SIGN : 0.3;        // where a fork sign stands between its two lanes
        this.signScale = typeof COLLAPSE_CAM_SIGN_SCALE !== U ? COLLAPSE_CAM_SIGN_SCALE : 1;
        this.frontLift = typeof COLLAPSE_CAM_FRONT_Y !== U ? COLLAPSE_CAM_FRONT_Y : -350;  // the close camera sees little of the height: the far layers of the collapse come down to it
        if (this.bgLayers) this._sinkLayers();
        // Fog and the far plane are counted from the train, so a camera moved farther away keeps the same depth.
        const toTrain = Math.sqrt(y * y + z * z);
        scene.fogStart = toTrain + (typeof COLLAPSE_FOG_START !== U ? COLLAPSE_FOG_START : 1200);
        scene.fogEnd = toTrain + (typeof COLLAPSE_FOG_END !== U ? COLLAPSE_FOG_END : 5600);
        cam.maxZ = toTrain + CollapseScene.SEG * CollapseScene.BEHIND + 2000;
    }

    // Every frame a material swaps to later is loaded with the scene: a texture made on its first show
    // is not ready in that frame, and the sprite blinks out (the first shot, the first effect).
    _preload() {
        const A = CollapseArt;
        for (const u of [...A.loco, ...Object.values(A.locoShot), ...Object.values(A.locoFall), A.locoDamaged, ...A.torch, ...A.flow, ...A.shield, A.shieldHit, ...Object.values(A.demon).flat(), ...Object.values(A.sign), ...Object.values(A.sw), ...A.lava, ...A.smoke]) this.texture(u);
        for (const u of [...Object.values(A.gap), ...A.bg.map(b => b.url),
            ...Object.values(A.fx).flat(), ...Object.values(A.switches).flatMap(v => Object.values(v))]) this.texture(u, false);
    }

    // Render COLLAPSE_RENDER_HEIGHT px tall whatever the screen; CSS scales it up pixelated.
    applyResolution() {
        const h = this.canvas.clientHeight || this.renderHeight;
        this.engine.setHardwareScalingLevel(h / this.renderHeight);
        World3D.resize();
    }

    // --- Materials ------------------------------------------------------------------------

    // mip = false: a texture squeezed along the track (the turnouts) would drop to a blurred mip level
    // and lose its thin rails; without mipmaps every screen pixel takes the nearest texel.
    texture(url, mip = true) {
        let t = this._tex.get(url);
        if (!t) {
            t = mip ? new BABYLON.Texture(url, this.scene, false, true, BABYLON.Texture.NEAREST_NEAREST_MIPLINEAR)
                : new BABYLON.Texture(url, this.scene, true, true, BABYLON.Texture.NEAREST_SAMPLINGMODE);
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
        m.metadata = { look: CollapseLook.kindOf(key) };
        this._mats.set(key, m);
        return m;
    }

    // A cut-out sprite material (alpha test); frames swap its textures.
    spriteMat(key, url, mip = true, blend = false) {
        let m = this._mats.get(key);
        if (m) return m;
        m = new BABYLON.StandardMaterial(key, this.scene);
        m.disableLighting = true;
        m.backFaceCulling = false;
        this._setSpriteTex(m, url, mip);
        m.diffuseColor = new BABYLON.Color3(0, 0, 0);
        m.specularColor = new BABYLON.Color3(0, 0, 0);
        // Blend: art with half-transparent pixels (decals, steam, sparks) — straight alpha blending.
        m.transparencyMode = blend ? BABYLON.Material.MATERIAL_ALPHABLEND : BABYLON.Material.MATERIAL_ALPHATEST;
        m.alphaCutOff = 0.5;
        m.metadata = { look: CollapseLook.kindOf(key) };
        this._mats.set(key, m);
        return m;
    }

    _setSpriteTex(m, url, mip = true) {
        const t = this.texture(url, mip);
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
        const BRICK = S.TILE * 2;   // one tile of brick per segment: 128 art px over 280 world units
        const mid = (top - 60) / 2; // where a wall breaks into its lower and upper piece

        // Magma under the whole floor: seen through gaps and where the floor falls at the collapse.
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
        this.magmaMat = this._mats.get('lava');
        this.channelMat = this._mats.get('lava-channel');

        // Piece shapes in the segment's local space: z from 0 to SEG, x and y as in the tunnel.
        const V = (x, y) => new BABYLON.Vector3(x, y, 0);
        const path = [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, 0, S.SEG)];
        const extrude = (name, shape, p = path) => BABYLON.MeshBuilder.ExtrudeShape(name, { shape, path: p, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        const arc = (r, from, to) => {
            const pts = [];
            for (let k = from; k <= to; k++) { const a = Math.PI * k / 16; pts.push(V(-Math.cos(a) * r, top + Math.sin(a) * r * 0.75)); }
            return pts;
        };
        const wallLo = (mid + 60) / BRICK, wallHi = (top - mid) / BRICK;
        // Length of an arc in tiles: the art repeats along it, the mesh makes the bend.
        const arcTiles = r => { let d = 0; const p = arc(r, 0, 8); for (let k = 1; k < p.length; k++) d += BABYLON.Vector3.Distance(p[k], p[k - 1]); return d / BRICK; };
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
            // Courses of the wall run along the tunnel: the extrusion's U goes up the wall, the art's X along z.
            const lo = extrude('wall-lo', [V(side * W, -60), V(side * W, mid)]);
            S._alongPath(lo, wallLo, 0);
            lo.material = this.surface('wall', CollapseArt.tex.wall, 1, 1, this.brickLevel);
            piece(lo, side, 'wall-lo', [side * W, -60]);
            const hi = extrude('wall-hi', [V(side * W, mid), V(side * W, top)]);
            S._alongPath(hi, wallHi, wallLo);
            hi.material = lo.material;
            piece(hi, side, 'wall-hi', [side * W, mid]);
            // The long side of the vault's bricks runs along the tunnel, the extrusion's V as drawn.
            const vault = extrude('vault-' + s, side < 0 ? arc(R, 0, 8) : arc(R, 8, 16));
            vault.material = this.surface('vault', CollapseArt.tex.vault, arcTiles(R), 1, this.brickLevel);
            piece(vault, side, 'vault', [side * W, top]);
            // The rib's art is a straight band (Y repeats): it follows the arc, its X crosses the rib.
            const ribShape = side < 0 ? [V(-(W - 40), -60), ...arc(R - 40, 0, 8)] : [...arc(R - 40, 8, 16), V(W - 40, -60)];
            const rib = extrude('rib-' + s, ribShape, ribPath);
            S._alongPath(rib, arcTiles(R - 40) + (top + 60) / BRICK, 0);
            const ribMat = rib.material = this.surface('rib', CollapseArt.tex.rib, 1, 1, this.brickLevel);
            ribMat.emissiveTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            piece(rib, side, 'rib', [side * W, -60]);
            const sh = BABYLON.MeshBuilder.CreateGround('shoulder', { width: shoulder, height: S.SEG }, scene);
            sh.bakeTransformIntoVertices(BABYLON.Matrix.Translation(side * (edge + shoulder / 2), -8, S.SEG / 2));
            sh.material = this.surface('ballast', CollapseArt.tex.ballast, shoulder / S.TILE, S.SEG / S.TILE);
            piece(sh, side, 'floor', [side * edge, -8]);
            // The flame faces the camera: a sprite flat on the wall is seen edge-on from the track.
            const torch = this.sprite('torch', 'torch', CollapseArt.torch[0], 105, 210, false);
            torch.bakeTransformIntoVertices(BABYLON.Matrix.Translation(side * (W - 60), 250, 0));
            piece(torch, side, 'torch', [side * W, mid]);
        }

        this._m = [0, 1, 2, 3, 4].map(() => new BABYLON.Matrix());
        this._buildCollapse();
    }

    // Swaps an extruded ribbon's UV: the art's X along the extrusion, its Y repeated along the shape.
    static _alongPath(mesh, tiles, offset) {
        const uv = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
        for (let k = 0; k < uv.length; k += 2) { const u = uv[k]; uv[k] = uv[k + 1]; uv[k + 1] = u * tiles + offset; }
        mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uv);
    }

    // A flat sprite with thin instances (one per placement), origin at its center, facing the camera.
    _instSprite(name, url, w, h, cap, blend) {
        const p = BABYLON.MeshBuilder.CreatePlane(name, { width: w, height: h }, this.scene);
        p.bakeTransformIntoVertices(BABYLON.Matrix.RotationY(Math.PI));   // the front side toward +Z
        p.material = this.spriteMat(name + ':' + url, url, false, blend);
        p.isPickable = false;
        p.alwaysSelectAsActiveMesh = true;
        const buf = new Float32Array(16 * cap);
        p.thinInstanceSetBuffer('matrix', buf, 16, false);
        p.thinInstanceCount = 0;
        return { mesh: p, buf, n: 0 };
    }

    // The collapse (GDD v3 §3, docs/STYLE.md): four layers of the wrecked tunnel on real depth behind the
    // edge, each as dense on screen as the others at the reference gap, so they part when the camera
    // moves and grow at their own rate as the edge comes. The rubble is folded: its top stands at the
    // edge and the rows under the broken rails lie down the floor toward the train, so the wreck ends on
    // the ballast and rails in its own torn outline. Cracks spread ahead of the edge; chunks fall apart.
    _buildCollapse() {
        const S = CollapseScene, scene = this.scene, cam = this.view.camera;
        const ref = cam.position.z + this.bgGap * S.SEG, last = CollapseArt.bg.length - 1, near = CollapseArt.bg[last].depth;
        /** @type {{ mesh: any, back: number }[]} */
        this.bgLayers = CollapseArt.bg.map((b, k) => {
            const back = (b.depth - near) * this.bgDepth, px = this.bgPx * (ref + back) / ref, w = S.BG_PX[0] * px, h = S.BG_PX[1] * px;
            const mesh = k === last ? this._rubble(b, w, h) : BABYLON.MeshBuilder.CreatePlane(b.key, { width: w, height: h }, scene);
            if (k !== last) mesh.bakeTransformIntoVertices(BABYLON.Matrix.RotationY(Math.PI).multiply(BABYLON.Matrix.Translation(0, h / 2, 0)));
            mesh.material = this.spriteMat(b.key, b.url, false);
            mesh.material.fogEnabled = false;   // the wreck glows through the dark of the tunnel
            mesh.isPickable = false;
            return { mesh, back, sink: k === last ? 0 : 1 + (last - 1 - k) * 0.5 };
        });
        this._sinkLayers();
        const cap = 4 * (Math.ceil(this.crackZone) + 2);   // per segment: two walls, two on the floor
        this.cracks = {
            wall: CollapseArt.crackWall.map(u => this._instSprite('crack-wall', u, 128 * S.CRACK_ART, 160 * S.CRACK_ART, cap, true)),
            vault: CollapseArt.crackVault.map(u => this._instSprite('crack-vault', u, 192 * S.CRACK_ART, 112 * S.CRACK_ART, cap, true)),
        };
        for (const c of [...this.cracks.wall, ...this.cracks.vault]) {
            c.mesh.material.emissiveTexture.level = this.crackLevel;
            c.mesh.material.zOffset = -2;
        }
        this.bricks = CollapseArt.brick.map(u => this._instSprite('brick', u, 1, 1, S.DEBRIS, false));
        for (const b of this.bricks) b.mesh.material.emissiveTexture.level = this.brickLevel;
        this.railBits = CollapseArt.railBits.map(u => this._instSprite('rail-bit', u, 1, 1, S.DEBRIS, false));
    }

    // The rubble stays on the floor; the layers behind it go down by shares of frontLift (applyCamera).
    _sinkLayers() {
        for (const l of this.bgLayers) l.mesh.position.y = this.frontLift * l.sink;
    }

    // The rubble layer: rows above the rails stand up from the fold, rows below it lie on a slope down
    // to the floor at +z. x spans the tunnel, the floor is y = 0, the fold stands at z = 0.
    _rubble(b, w, h) {
        const S = CollapseScene, row = S.RAIL_ROW / S.BG_PX[1], low = (1 - row) * h;
        const fold = low * Math.sin(this.bgSlope), out = low * Math.cos(this.bgSlope);
        const m = new BABYLON.Mesh(b.key, this.scene), d = new BABYLON.VertexData();
        const rows = [[fold + row * h, 0, 1], [fold, 0, 1 - row], [0, out, 0]];   // y, z, v
        d.positions = rows.flatMap(([y, z]) => [-w / 2, y, z, w / 2, y, z]);
        d.uvs = rows.flatMap(r => [0, r[2], 1, r[2]]);
        d.normals = rows.flatMap(() => [0, 0, 1, 0, 0, 1]);
        d.indices = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4];
        d.applyToMesh(m);
        return m;
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

    // Pieces start at staggered moments (DELAY): the vault and the torches go at the front, the upper
    // walls a little later, the lower walls last; the shoulders go with the floor.
    // The matrix of piece `p` of segment i into `out`; false — not drawn (skipped or gone into the lava).
    _pieceMatrix(p, i, run, pos, out) {
        const S = CollapseScene, m = this._m;
        if ((p.kind === 'rib' && (i & 1) === 0) || (p.kind === 'torch' && (i & 1) === 1)) return false;
        const f = run.front - i - S.DELAY[p.kind] - S.hash(i, p.side + 3) * 0.25;
        const [drop, k2] = S.fall(f);
        if (drop > 1500) return false;
        const a = p.side * S.LEAN[p.kind] * k2 * (0.7 + 0.6 * S.hash(i, p.side + 7));
        BABYLON.Matrix.TranslationToRef(-p.pivot[0], -p.pivot[1], 0, m[0]);
        BABYLON.Matrix.RotationZToRef(a, m[1]);
        m[0].multiplyToRef(m[1], m[2]);
        BABYLON.Matrix.TranslationToRef(p.pivot[0] - p.side * drop * 0.15, p.pivot[1] - drop, (i - pos) * S.SEG, m[1]);
        m[2].multiplyToRef(m[1], out);
        return true;
    }

    _syncTunnel(run, pos) {
        const S = CollapseScene, m = this._m, first = Math.floor(pos) - S.BEHIND;
        for (const p of this.pieces) {
            const buf = p.buf;
            for (let k = 0; k < this.slots; k++) {
                if (this._pieceMatrix(p, first + k, run, pos, m[3])) m[3].copyToArray(buf, k * 16);
                else buf.fill(0, k * 16, k * 16 + 16);
            }
            p.mesh.thinInstanceBufferUpdated('matrix');
        }
        this._syncCollapse(run, pos);
    }

    // One more instance of a sprite set (_instSprite); _flush hands the counts to the meshes.
    static _put(set, mat) {
        if (set.n * 16 >= set.buf.length) return;
        mat.copyToArray(set.buf, set.n * 16);
        set.n++;
    }

    static _flush(sets) {
        for (const s of sets) {
            s.mesh.setEnabled(s.n > 0);     // an empty set costs no draw call
            s.mesh.thinInstanceCount = s.n;
            if (s.n) s.mesh.thinInstanceBufferUpdated('matrix');
            s.n = 0;
        }
    }

    _syncCollapse(run, pos) {
        const S = CollapseScene, m = this._m, W = S.WALL_X, R = S.WALL_X, top = S.WALL_TOP;
        for (const l of this.bgLayers) l.mesh.position.z = (run.front - pos) * S.SEG - l.back;

        // Cracks: segments from the edge to crackZone ahead of it; they grow as the edge comes and
        // ride the wall or vault piece they sit on when it starts to fall.
        const from = Math.floor(run.front - 1), to = Math.ceil(run.front + this.crackZone);
        for (let i = from; i <= to; i++) {
            const near = 1 - (i + 0.5 - run.front) / this.crackZone;
            if (near <= 0) continue;
            const grow = Math.min(1, 0.35 + 0.65 * near);
            for (const side of [-1, 1]) {
                const h = k => S.hash(i, side * 13 + k);
                const wp = this.pieces.find(p => p.side === side && p.kind === 'wall-hi');
                const vp = this.pieces.find(p => p.side === side && p.kind === 'vault');
                // Wall crack: on the inner face of the upper wall (segment-local z, then the piece's matrix).
                if (h(0) < 0.85 && this._pieceMatrix(wp, i, run, pos, m[4])) {
                    BABYLON.Matrix.ScalingToRef(grow, grow, grow, m[0]);
                    BABYLON.Matrix.RotationYToRef(-side * Math.PI / 2, m[1]);
                    m[0].multiplyToRef(m[1], m[2]);
                    BABYLON.Matrix.TranslationToRef(side * (W - 3), 200 + h(1) * 120, (0.2 + h(2) * 0.6) * S.SEG, m[1]);
                    m[2].multiplyToRef(m[1], m[0]);
                    m[0].multiplyToRef(m[4], m[3]);
                    S._put(this.cracks.wall[h(3) < 0.5 ? 0 : 1], m[3]);
                }
                // Vault crack: laid on the arc at angle a, its long side along the arc.
                if (h(4) < 0.9 && this._pieceMatrix(vp, i, run, pos, m[4])) {
                    const a = Math.PI * (0.2 + h(5) * 0.22);
                    const x = side * Math.cos(a) * (R - 4), y = top + Math.sin(a) * (R - 4) * 0.75;
                    const phi = Math.atan2(0.75 * Math.cos(a), Math.sin(a));
                    BABYLON.Matrix.ScalingToRef(grow, grow, grow, m[0]);
                    BABYLON.Matrix.RotationXToRef(Math.PI / 2, m[1]);
                    m[0].multiplyToRef(m[1], m[2]);
                    BABYLON.Matrix.RotationZToRef(-side * phi, m[1]);
                    m[2].multiplyToRef(m[1], m[0]);
                    BABYLON.Matrix.TranslationToRef(x, y, (0.2 + h(6) * 0.6) * S.SEG, m[1]);
                    m[0].multiplyToRef(m[1], m[2]);
                    m[2].multiplyToRef(m[4], m[3]);
                    S._put(this.cracks.vault[Math.floor(h(7) * this.cracks.vault.length)], m[3]);
                }
            }
            // Floor cracks: the camera sees the walls nearly edge-on, the track it sees whole —
            // the ground ahead of the edge splits too, and drops with the floor.
            const drop = S.floorDrop(run.front - i);
            for (let c = 0; c < 2 && drop < 880; c++) {
                const h = k => S.hash(i, 40 + c * 9 + k);
                if (h(0) > 0.75) continue;
                BABYLON.Matrix.ScalingToRef(grow, grow, grow, m[0]);
                BABYLON.Matrix.RotationYawPitchRollToRef(h(1) * Math.PI * 2, Math.PI / 2, 0, m[1]);
                m[0].multiplyToRef(m[1], m[2]);
                BABYLON.Matrix.TranslationToRef((h(2) - 0.5) * S.LANE_W * 3, 6 - drop, (i + 0.1 + h(3) * 0.8 - pos) * S.SEG, m[1]);
                m[2].multiplyToRef(m[1], m[3]);
                S._put(this.cracks.wall[h(4) < 0.5 ? 0 : 1], m[3]);
            }
        }
        S._flush([...this.cracks.wall, ...this.cracks.vault]);

        // Debris: blocks shed by the vault and walls from debrisLead segments ahead of the edge, and
        // rail wreckage thrown up where the floor goes. Each slot falls once, each chunk on its own; it
        // is drawn only ahead of the edge (behind it the wreck hides it anyway).
        const per = 8, base = Math.floor(run.front + this.debrisLead) + 1, art = this.chunkArt;
        for (let j = 0; j < S.DEBRIS; j++) {
            const i = base - Math.floor(j / per), h = k => S.hash(i, j % per * 5 + k);
            const zi = i + h(4);
            if (zi < run.front) continue;
            if (j % 4 === 3) {
                const f = run.front - i - h(0) * 0.4;
                const y = f * 900 - f * f * 3200;
                if (f <= 0 || y < -170) continue;
                const size = S.CHUNK_PX * art * (0.8 + h(3) * 0.5);
                BABYLON.Matrix.ScalingToRef(size, size, 1, m[0]);
                BABYLON.Matrix.RotationZToRef(f * 9 * (h(1) - 0.5), m[1]);
                m[0].multiplyToRef(m[1], m[2]);
                BABYLON.Matrix.TranslationToRef(S.laneX(Math.floor(h(2) * 3)) + (h(5) - 0.5) * 200, y, (zi - pos) * S.SEG, m[1]);
                m[2].multiplyToRef(m[1], m[3]);
                S._put(this.railBits[j % this.railBits.length], m[3]);
            } else {
                const f = run.front - i + this.debrisLead - h(0) * 0.9;
                const y = 300 + h(2) * 560 - (f > 0 ? f * f * 2000 + f * 200 : 0);
                if (f <= 0 || y < -200) continue;
                const side = h(1) < 0.5 ? -1 : 1, size = 0.67 * S.CHUNK_PX * art * (0.7 + h(3) * 0.8);
                BABYLON.Matrix.ScalingToRef(size, size, 1, m[0]);
                BABYLON.Matrix.RotationZToRef(f * 7 * (h(5) - 0.5), m[1]);
                m[0].multiplyToRef(m[1], m[2]);
                BABYLON.Matrix.TranslationToRef(side * (W - 80 - h(3) * 380), y, (zi - pos) * S.SEG, m[1]);
                m[2].multiplyToRef(m[1], m[3]);
                S._put(this.bricks[j % this.bricks.length], m[3]);
            }
        }
        S._flush([...this.bricks, ...this.railBits]);
    }

    // --- The train -------------------------------------------------------------------------------------
    // The drawn loco: frames of one sprite; at a fork it bends by movement alone (bendOf).

    _buildTrain() {
        const S = CollapseScene;
        this.train = this.sprite('loco', 'loco', CollapseArt.loco[0], S.LOCO.w, S.LOCO.h);
        // Not a billboard: the loco leans (rotation.z) and tips into a gap (rotation.x) about its bottom
        // center. The camera sees the plane's back (no culling), which is the art as drawn: a half turn
        // to the front mirrors it, and the driver shoots out of the wrong side.
        this.train.billboardMode = BABYLON.Mesh.BILLBOARDMODE_NONE;
        this.shieldFx = this.sprite('shield', 'shield', CollapseArt.shield[0], 460, 352);
        this.shieldFx.position.set(0, 10, 20);
        this._buildDemons();
        this._buildFx();
    }

    // How deep the train at run.pos is in the bend of a fork, -1..1: 0 on the straight, 1 at the curve's
    // steepest point, + toward +x. The rules' own laneX is the curve, read a step further on. Pure: the
    // probes run it in node.
    static bendOf(run) {
        const step = 0.02, on = Object.create(run);
        on.pos = run.pos + step;
        return (on.laneX() - run.laneX()) / step * CollapseRules.SWITCH_LEN / 1.5;
    }

    // A point given from the sprite's bottom center (x to the screen right, +z toward the camera) in
    // the world, as the sprite stands now: rides its lean, squeeze, tip and fall.
    _onTrain(at, out) {
        const p = BABYLON.TmpVectors.Vector3[8];
        p.set(at[0], at[1], at[2]);
        BABYLON.Vector3.TransformCoordinatesToRef(p, this.train.getWorldMatrix(), out);
        return out;
    }

    // --- Effects (card 16) -------------------------------------------------------------------------
    // One plane per effect (two for the wheel sparks, four for the rail wreckage), each with its own
    // material: an effect plays its frames once (steam loops) and hides. They show the run's events
    // and state; they decide nothing.

    _buildFx() {
        const S = CollapseScene;
        /** @type {{ mesh: any, frames: string[], ms: number, loop: boolean, start: number, until: number, at: number[], v: number[], g: number, spin: number, follow: boolean }[]} */
        this.fx = [];
        const add = (kind, frames) => {
            const d = S.FX[kind], k = S.FX_ART * (d.scale || 1), w = d.size[0] * k, h = d.size[1] * k;
            const p = BABYLON.MeshBuilder.CreatePlane('fx-' + kind, { width: w, height: h }, this.scene);
            // Front side toward the camera, the art's pivot at the origin.
            p.bakeTransformIntoVertices(BABYLON.Matrix.RotationY(Math.PI).multiply(BABYLON.Matrix.Translation(-(d.pivot[0] - 0.5) * w, (d.pivot[1] - 0.5) * h, 0)));
            p.material = this.spriteMat('fx-' + kind + '-' + this.fx.length, frames[0], false, true);
            p.isPickable = false;
            p.setEnabled(false);
            const fx = { mesh: p, frames, ms: d.ms, loop: !!d.loop, start: -1, until: -1, at: [0, 0, 0], v: [0, 0, 0], g: 0, spin: 0, follow: true };
            this.fx.push(fx);
            return fx;
        };
        const A = CollapseArt.fx;
        this.fxSparks = [add('sparks', A.sparks), add('sparks', A.sparks)];
        this.fxSmoke = add('smoke', A.smoke);
        this.fxClaw = add('claw', A.claw);
        this.fxAsh = add('ash', A.ash);
        this.fxSplash = add('splash', A.splash);
        this.fxSteam = add('steam', A.steam);
        this.fxDrops = add('drops', A.drops);
        this.fxShield = add('shieldBreak', A.shieldBreak);
        this.fxRails = A.rail.map(u => add('rail', [u]));
        this._fxAt = new BABYLON.Vector3(0, 0, 0);
    }

    // Start an effect: `at` — a point on the sprite from its bottom center (follow, _onTrain) or a world point;
    // v — world units/s, g — fall acceleration, spin — rad/s, dur — s (default: its frames once).
    _fxPlay(fx, at, o = {}) {
        fx.start = this.time;
        fx.until = this.time + (o.dur || fx.frames.length * fx.ms / 1000);
        fx.at = at;
        fx.v = o.v || [0, 0, 0];
        fx.g = o.g || 0;
        fx.spin = o.spin || 0;
        fx.follow = o.follow !== false;
        // The art's mirror for the opposite side: its back face (no culling) — a negative scale
        // would turn the plane inside out.
        fx.mesh.rotation.y = o.flip ? Math.PI : 0;
        fx.mesh.setEnabled(true);
    }

    _syncFx() {
        const here = this._fxAt;
        for (const fx of this.fx) {
            if (!fx.mesh.isEnabled()) continue;
            const t = this.time - fx.start;
            if (this.time >= fx.until || t < 0) { fx.mesh.setEnabled(false); continue; }
            const n = fx.frames.length, f = Math.floor(t * 1000 / fx.ms);
            this._setSpriteTex(fx.mesh.material, fx.frames[fx.loop ? f % n : Math.min(n - 1, f)], false);
            if (fx.follow) this._onTrain(fx.at, here); else here.set(fx.at[0], fx.at[1], fx.at[2]);
            fx.mesh.position.set(here.x + fx.v[0] * t, here.y + fx.v[1] * t - fx.g * t * t / 2, here.z + fx.v[2] * t);
            fx.mesh.rotation.z = fx.spin * t;
        }
    }

    // A hit the run reports (its reason): what it looks like on the loco.
    _hitFx(reason, run) {
        if (reason === 'demon') {
            this._fxPlay(this.fxClaw, [0, 230, 70]);
            this._fxPlay(this.fxAsh, [0, 200, 60]);
            this._shakeAt = this.time;
        } else if (reason === 'lava') {
            this._fxPlay(this.fxSplash, [0, 300, 70]);
            this._fxPlay(this.fxDrops, [0, 330, 80]);
            this._fxPlay(this.fxSteam, [0, 380, 50], { dur: this.heatSec + 0.25 });
            this._heatAt = this.time;
        } else if (reason === 'gap' || reason === 'caught') {
            // The loco goes down into the magma: a splash where it meets it, the rails under it fly apart.
            const x = CollapseScene.laneX(run.laneX());
            this._fxPlay(this.fxSplash, [x, -60, 110], { follow: false });
            this.fxRails.forEach((fx, k) => {
                const dir = k < 2 ? -1 : 1;
                this._fxPlay(fx, [x + dir * (60 + 50 * (k & 1)), 10, 70 + 30 * k],
                    { follow: false, dur: 0.75, v: [dir * (260 + 120 * (k & 1)), 520 + 140 * (k & 1), 80], g: 2200, spin: dir * (6 + 3 * k) });
            });
        }
    }

    // One demon sprite per tunnel wall: a pair comes from both walls. Each side has its own material,
    // so the two play their frames apart. A demon is drawn over the train: it stands behind the nose,
    // and on the side of the train's lane the hull would hide it. A dark shape under the sprite cuts
    // it out of the rubble behind it, the same brick and fire as the demon.
    _buildDemons() {
        /** @type {Map<number, any>} */
        this.demonViews = new Map();
        /** @type {Map<number, number>} */
        this._ashUntil = new Map();
        const S = CollapseScene.DEMON, size = S.px * S.art;
        for (const side of [-1, 1]) {
            const d = this.sprite('demon', 'demon' + side, CollapseArt.demon.perch[0], size, size);
            d.renderingGroupId = 2;
            const shade = this.sprite('demon-shade', 'demon-shade' + side, CollapseArt.demon.perch[0], size * S.outline, size * S.outline, false);
            shade.parent = d;
            shade.position.y = -size * (S.outline - 1) / 2;
            shade.renderingGroupId = 1;
            shade.material.emissiveTexture = null;
            shade.material.emissiveColor = new BABYLON.Color3(0.03, 0.02, 0.03);
            d.metadata = { shade: shade.material };
            // The left wall mirrors the art in its UV: a negative scale would turn the sprite inside out.
            if (side < 0) for (const m of [d, shade]) m.setVerticesData(BABYLON.VertexBuffer.UVKind, m.getVerticesData(BABYLON.VertexBuffer.UVKind).map((v, i) => i % 2 ? v : 1 - v));
            d.setEnabled(false);
            this.demonViews.set(side, d);
            this._ashUntil.set(side, -1);
        }
    }

    // --- Per-segment objects ----------------------------------------------------------------------

    static laneX(l) { return (l - 1) * CollapseScene.LANE_W; }

    // The frame of a fork's lever: waiting; a shot lever shows the sparks for hitSec seconds (`shot` ago),
    // then stands over toward its exit. Armed without a shot seen (a restored run): already over.
    static leverFrame(md, armed, shot, hitSec) {
        if (!armed) return 'waiting';
        if (shot < hitSec) return 'hit';
        return md.to < md.from ? 'left' : 'right';
    }

    // 0..1 of the throw: the armed lever grows to its armed size once the sparks are done.
    static leverPop(armed, shot, hitSec, throwSec) {
        if (!armed) return 0;
        if (!Number.isFinite(shot)) return 1;
        return Math.max(0, Math.min(1, (shot - hitSec) / Math.max(throwSec, 1e-3)));
    }

    // True while the shot lever at fork i is still in its sparks: the points on the track wait for it.
    static leverHolds(lever, i, time, hitSec) {
        return !!lever && lever.at === i && time - lever.time < hitSec;
    }

    // Which edge art the hole's segment i of `lane` carries: the one the train meets first is 'front'
    // (whole side at the bottom of the art), the last one 'back'; null — not an end of a hole.
    static gapEdge(track, i, lane) {
        if (!track.seg(i).gap[lane]) return null;
        if (i > 0 && !track.seg(i - 1).gap[lane]) return 'front';
        return track.seg(i + 1).gap[lane] ? null : 'back';
    }

    // How far the floor, fallen segments behind the edge has dropped: it holds until the wreck stands
    // over it and hides the place where it goes.
    static floorDrop(fallen) {
        const f = fallen - CollapseScene.FLOOR_HOLD;
        return f > 0 ? Math.min(900, f * f * 500) : 0;
    }

    // The turnouts drawn at one fork boundary. Every fork touches the middle lane: forks out of it
    // use the texture as drawn (the curve leaves the middle lane), forks into it use it flipped along
    // the track — the same S curve run backwards, the points at the merge. 'left'/'right' is the side
    // lane: left = lane 0.
    static switchGroups(forks) {
        const out = [];
        for (const flip of [false, true]) {
            const side = new Set(forks.filter(f => (flip ? f.to : f.from) === 1).map(f => (flip ? f.from : f.to)));
            if (side.size) out.push({ variant: side.size === 2 ? 'both' : side.has(0) ? 'left' : 'right', flip });
        }
        return out;
    }

    // The points of a turnout group: 'straight' until the switch is shot, then toward the side lane
    // of the armed fork — the shot setting stays after the train has passed.
    static pointsState(group, set) {
        if (!set) return 'straight';
        const side = group.flip ? (set.to === 1 ? set.from : -1) : (set.from === 1 ? set.to : -1);
        return side === 0 ? 'left' : side === 2 ? 'right' : 'straight';
    }

    // A turnout plate over the three lanes: z from the fork boundary to SW_LEN, the curve (texture
    // rows SW_ROWS) over exactly SWITCH_LEN segments — the train's own crossing curve (laneX).
    // The texture row under a point `z` world units past the fork boundary.
    static switchRow(z, flip) {
        const S = CollapseScene, [top, bottom] = S.SW_ROWS;
        const pxPerUnit = (bottom - top) / (CollapseRules.SWITCH_LEN * S.SEG);
        return flip ? top + z * pxPerUnit : bottom - z * pxPerUnit;
    }

    _switchPlate(name, mat, flip, y) {
        const S = CollapseScene, len = S.SW_LEN;
        const m = BABYLON.MeshBuilder.CreateGround(name, { width: S.LANE_W * 3, height: len }, this.scene);
        m.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, y, len / 2));
        const pos = m.getVerticesData(BABYLON.VertexBuffer.PositionKind), uv = [];
        for (let k = 0; k < pos.length; k += 3) {
            uv.push((pos[k] + S.LANE_W * 1.5) / (S.LANE_W * 3), 1 - S.switchRow(pos[k + 2], flip) / S.SW_PX);
        }
        m.setVerticesData(BABYLON.VertexBuffer.UVKind, uv);
        m.material = mat;
        m.isPickable = false;
        return m;
    }

    // The branch of a turnout: both rails along the curve the train rides (the rules' own laneX over
    // SWITCH_LEN, nothing of its shape is kept here), over the ballast of the straight lanes. Each rail is a ribbon cut out of the rail
    // column of track.png, so it is the same iron as the lanes; a side lane of 'both' has its own pair.
    _branchRails(g, y) {
        const S = CollapseScene, len = CollapseRules.SWITCH_LEN * S.SEG, [from, to] = S.RAIL_U, half = (to - from) / 128 * S.LANE_W / 2;
        const sides = g.variant === 'both' ? [0, 2] : [g.variant === 'left' ? 0 : 2], run = { prevLane: 1, lane: 1, switchAt: 0, pos: 0, laneX: CollapseRun.prototype.laneX };
        const pos = [], uv = [], nor = [], idx = [];
        for (const lane of sides) {
            for (const rail of [-1, 1]) {
                const base = pos.length / 3, mid = rail * S.LANE_W / 4;
                for (let k = 0; k <= S.BRANCH_STEPS; k++) {
                    const t = k / S.BRANCH_STEPS, z = t * len;
                    run.lane = g.flip ? 1 : lane;
                    run.prevLane = g.flip ? lane : 1;
                    run.pos = t * CollapseRules.SWITCH_LEN;
                    const x = S.laneX(k === S.BRANCH_STEPS ? run.lane : run.laneX()) + mid;
                    pos.push(x - half, y, z, x + half, y, z);
                    uv.push(from / 128, z / S.SEG, to / 128, z / S.SEG);
                    nor.push(0, 1, 0, 0, 1, 0);
                    if (k) { const a = base + 2 * k; idx.push(a - 2, a - 1, a + 1, a - 2, a + 1, a); }
                }
            }
        }
        const m = new BABYLON.Mesh('branch', this.scene), d = new BABYLON.VertexData();
        d.positions = pos; d.uvs = uv; d.normals = nor; d.indices = idx;
        d.applyToMesh(m);
        m.material = this.surface('track', CollapseArt.tex.track, 1, 1);
        m.isPickable = false;
        return m;
    }

    // The signal on a lever's disc: the lit panel of the old sign art (green arrows or the red cross),
    // self-lit, so the safe and the deadly exit read as they did. A child of the stand: it stands and
    // scales with it.
    _leverBadge(stand) {
        const S = CollapseScene, b = S.LEVER.badge, m = BABYLON.MeshBuilder.CreatePlane('lever-badge', { width: b.w, height: b.w * b.crop[3] / b.crop[2] }, this.scene);
        const uv = m.getVerticesData(BABYLON.VertexBuffer.UVKind), [x, y, w, h] = b.crop;
        for (let k = 0; k < uv.length; k += 2) {
            uv[k] = x + uv[k] * w;
            uv[k + 1] = 1 - y - h + uv[k + 1] * h;
        }
        m.setVerticesData(BABYLON.VertexBuffer.UVKind, uv);
        m.position.y = b.y;
        m.parent = stand;
        m.isPickable = false;
        return m;
    }

    _segView(i, run) {
        const S = CollapseScene, scene = this.scene, seg = run.track.seg(i);
        /** @type {{ lanes: any[], forks: any[], signs: any[], pickups: any[], flows: any[], set: any }} */
        const v = { lanes: [], forks: [], signs: [], pickups: [], flows: [], set: null };
        for (let l = 0; l < 3; l++) {
            const edge = S.gapEdge(run.track, i, l);
            if (seg.gap[l] && !edge) { v.lanes.push(null); continue; }
            const strip = BABYLON.MeshBuilder.CreateGround('strip', { width: S.LANE_W, height: S.SEG }, scene);
            // Ground's V grows against +Z, so a tile's top is the end nearer the camera: the train
            // rides up the art, as it does on the turnouts.
            strip.material = edge ? this.spriteMat('track-gap-' + edge, CollapseArt.gap[edge], false) : this.surface('track', CollapseArt.tex.track, 1, 1);
            strip.position.x = S.laneX(l);
            v.lanes.push(strip);
        }
        for (const g of S.switchGroups(seg.forks)) {
            const art = CollapseArt.switches[g.variant];
            const y = g.flip ? 3 : 1;   // a boundary never mixes both kinds; if it did, no z-fighting
            const base = this._branchRails(g, y);
            const points = this._switchPlate('points', this.spriteMat('sw:' + art.straight, art.straight, false), g.flip, y + 1);
            v.forks.push({ g, base, points });
        }
        for (const f of seg.forks) {
            const sign = this.sprite('sign', 'sign-' + i + '-' + f.from + '-' + f.to, CollapseArt.sw.waiting, S.LEVER.w, S.LEVER.h);
            sign.metadata = { at: i, from: f.from, to: f.to, badge: this._leverBadge(sign) };
            v.signs.push(sign);
        }
        for (let l = 0; l < 3; l++) {
            const kind = seg.pickup[l];
            if (kind) {
                const p = this.sprite('pickup', 'pickup-' + kind, CollapseArt.pickup[kind], S.PICKUP.w, S.PICKUP.h);
                p.metadata = { lane: l };
                v.pickups.push(p);
            }
            if (seg.lava[l]) {
                const flow = this.sprite('flow', 'flow', CollapseArt.flow[0], S.FLOW.w, S.FLOW.h, true);
                flow.metadata = { lane: l };
                v.flows.push(flow);
            }
        }
        return v;
    }

    _disposeSeg(v) {
        for (const m of [...v.lanes, ...v.forks.flatMap(f => [f.base, f.points]), ...v.signs, ...v.pickups, ...v.flows]) {
            if (m) { if (m.material && m.material.name.startsWith('sign-')) { this._mats.delete(m.material.name); m.material.dispose(); } m.dispose(); }
        }
    }

    // A new run (another seed, another track): drop the segment views and the accents of the last one.
    reset() {
        for (const v of this.segViews.values()) this._disposeSeg(v);
        this.segViews.clear();
        this._shotUntil = this._shieldHitUntil = -1;
        this._crashAt = null;
        this._lever = null;
        this._shakeAt = this._heatAt = -1e9;
        for (const fx of this.fx) fx.mesh.setEnabled(false);
        for (const side of [-1, 1]) { this.demonViews.get(side).setEnabled(false); this._ashUntil.set(side, -1); }
        this._camSnap = true;
    }

    // The tilt that puts height h at distance z just at clip height `edge`: the eye stays where it is, so
    // the train keeps its size. Pure: the probes run it in node.
    static fitPitch(camY, camZ, fov, h, edge) {
        return Math.atan2(camY - h, camZ) + Math.atan(edge * Math.tan(fov / 2));
    }

    // The frame's top plate ends at clip height `edge`, safe area included: the camera tilts so the
    // whole loco stands under it. Game asks this whenever the plates may have moved.
    fitFrame(edge) {
        const S = CollapseScene, cam = this.view.camera;
        cam.rotation.x = -S.fitPitch(this.camY, cam.position.z, cam.fov, S.LOCO_TOP, edge - 2 * this.topGap);
    }

    // Sideways camera follow: dt = 0 (pause, the first frame) does not move it; a new run snaps it.
    // A demon hit shakes it for shakeSec: the eye moves, the view direction does not turn — the
    // frame and the tap targets (projected through the same camera) move together.
    _followCamera(trainX, dt) {
        const goal = trainX * this.camFollow;
        if (this._camSnap) { this.camX = goal; this._camSnap = false; }
        else this.camX += (goal - this.camX) * (1 - Math.exp(-this.camRate * dt));
        const k = (this.time - this._shakeAt) / this.shakeSec;
        const a = k >= 0 && k < 1 ? this.shakeAmp * (1 - k) * (1 - k) : 0;
        this.view.camera.position.x = this.camX + a * Math.sin(this.time * 71);
        this.view.camera.position.y = this.camY + a * 0.6 * Math.cos(this.time * 53);
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
        const lava = CollapseArt.lava[Math.floor(this.time * 1000 / S.LAVA_MS) % 4];
        this._setSpriteTexFrame(this.channelMat, lava, true);
        this._setSpriteTexFrame(this.magmaMat, lava, true);
        this._setSpriteTex(this.torchMat, CollapseArt.torch[Math.floor(this.time * 8) % 4]);

        // Segment window: create what came into view, drop what left it.
        const lo = Math.floor(pos) - S.BEHIND, hi = Math.floor(pos) + this.ahead;
        for (const [i, v] of this.segViews) if (i < lo || i > hi) { this._disposeSeg(v); this.segViews.delete(i); }
        for (let i = Math.max(-S.BEHIND, lo); i <= hi; i++) if (!this.segViews.has(i)) this.segViews.set(i, this._segView(i, run));

        const next = run.nextFork();
        const falling = run.state === 'over' && (run.reason === 'gap' || run.reason === 'caught');
        const sink = falling ? Math.min(1, (this.time - (this._crashAt || this.time)) * 1.6) * S.FALL_SINK : 0;
        for (const [i, v] of this.segViews) {
            const z = (i - pos) * S.SEG;
            // Behind the collapse front the floor falls into the lava.
            const drop = S.floorDrop(run.front - i);
            v.lanes.forEach((m, l) => {
                if (!m) return;
                m.position.z = z + S.SEG / 2;
                const under = l === run.lane && i <= pos + 1 && i >= pos - S.TRAIN_SEGS ? sink : 0;
                m.position.y = -drop - under;
                m.setEnabled(drop + under < 880);
            });
            // The points go over with the lever: not before the sparks are done.
            if (run.armed && run.armed.at === i && !S.leverHolds(this._lever, i, this.time, this.leverHit)) v.set = run.armed;
            for (const sw of v.forks) {
                const url = CollapseArt.switches[sw.g.variant][S.pointsState(sw.g, v.set)];
                sw.points.material = this.spriteMat('sw:' + url, url, false);
                for (const m of [sw.base, sw.points]) {
                    m.position.set(0, -drop, z);
                    m.setEnabled(drop < 880);
                }
            }
            for (const sign of v.signs) {
                const md = sign.metadata;
                const mine = md.from === run.lane || (run.armed && run.armed.at === md.at && md.from === run.armed.from);
                const visible = mine && i > pos - 0.2 && drop === 0;
                sign.setEnabled(visible);
                if (!visible) continue;
                const safe = run.forkSafe(md.at, md.to);
                const signal = !safe ? 'cross' : md.to < md.from ? 'left' : 'right';
                md.badge.material = this.spriteMat('badge-' + signal, CollapseArt.sign[signal]);
                md.badge.material.zOffset = -4;
                const armed = !!run.armed && run.armed.at === md.at && run.armed.to === md.to;
                const shot = this._lever && this._lever.at === md.at && this._lever.to === md.to ? this.time - this._lever.time : Infinity;
                const frame = S.leverFrame(md, armed, shot, this.leverHit);
                this._setSpriteTex(sign.material, CollapseArt.sw[frame]);
                const rest = next && next.at === md.at ? 1 : 0.75;
                const k = (rest + (1.15 - rest) * S.leverPop(armed, shot, this.leverHit, this.leverThrow)) * this.signScale;
                // The sparks and the lean of the hit frame are drawn to the left: a throw to the right mirrors them.
                const mirror = frame === 'hit' && md.to > md.from ? -1 : 1;
                sign.position.set(S.laneX(md.from) + (md.to - md.from) * S.LANE_W * this.signShift, 0, z);
                sign.scaling.set(k * mirror, k, k);
                md.badge.setEnabled(frame !== 'hit');   // the sparks land on the disc
            }
            for (const p of v.pickups) {
                const taken = run.isTaken(i) && p.metadata.lane === run.lane;
                p.setEnabled(!taken && drop === 0);
                p.position.set(S.laneX(p.metadata.lane), S.PICKUP.y + Math.sin(this.time * 4 + i) * S.PICKUP.bob, z + S.SEG / 2);
            }
            for (const fl of v.flows) {
                fl.position.set(S.laneX(fl.metadata.lane), S.FLOW.y, z + S.SEG / 2);
                fl.setEnabled(drop === 0);
            }
        }
        this._setSpriteTex(this._mats.get('flow') || this.spriteMat('flow', CollapseArt.flow[0]), CollapseArt.flow[Math.floor(this.time * 10) % 4]);

        // The train: on the rules' curve, run frames, shot and crash frames. At a fork it bends with the
        // curve: leans toward the new lane, swings out and turns narrow; a crash breaks it, a fall tips it.
        const x = S.laneX(run.laneX()), bend = S.bendOf(run);
        let frame = CollapseArt.loco[Math.floor(this.time * (4 + run.speed() * 2)) % 4];
        if (this._shotUntil > this.time) frame = this._shotFrame;
        let roll = bend * this.rollMax, tip = 0, fall = 0;
        if (run.state === 'over') {
            const k = Math.min(1, (this.time - (this._crashAt || this.time)) * 1.6);
            if (falling) {
                frame = run.lane === 0 ? CollapseArt.locoFall.left : CollapseArt.locoFall.right;
                fall = -k * 260;
                roll = (run.lane === 0 ? -1 : 1) * this.fallTilt * k;   // it tips over the side it falls to
                tip = 0.45 * k;                                        // and its top comes toward the camera
            } else {
                frame = CollapseArt.locoDamaged;
            }
        }
        this.train.position.set(x + bend * this.trainShift, fall, 0);
        this.train.rotation.z = -roll;
        this.train.rotation.x = tip;
        this.train.scaling.x = 1 - Math.abs(bend) * this.trainSqueeze;
        this.train.computeWorldMatrix(true);
        // A lava hit: the loco glows red-hot for heatSec (added to its unlit texture).
        const heat = Math.max(0, 1 - (this.time - this._heatAt) / this.heatSec);
        this.train.material.emissiveColor.set(heat * 0.9, heat * 0.3, heat * 0.05);
        this._setSpriteTex(this.train.material, frame);
        this._followCamera(x, dt);
        this.shieldFx.setEnabled(run.shield > 0 && run.state === 'run');
        this.shieldFx.position.x = this.train.position.x;
        this._setSpriteTex(this.shieldFx.material, this._shieldHitUntil > this.time ? CollapseArt.shieldHit : CollapseArt.shield[Math.floor(this.time * 6) % 3]);

        this._syncDemons(run, x);
        this._syncFx();
        this.rig.sync(run, pos, this.time, x, heat, this._shotUntil > this.time);
    }

    // A demon stands on its wall from its first frame in the rules, the sprite follows the phases: it
    // breaks out of the brick, stands, leaps at the train; at the end of the leap (the hit) it is in
    // front of the train on its side. Shot, it turns to ash where it was.
    _syncDemons(run, trainX) {
        const S = CollapseScene, D = S.DEMON, A = CollapseArt.demon;
        for (const [side, view] of this.demonViews) {
            const d = run.shootable().find(m => m.side === side);
            const ash = (this._ashUntil.get(side) - this.time) / D.ashSec;
            if (d) {
                const x = this._inFrameX(side * (S.WALL_X - D.wallGap - (D.contact[0] - D.px / 2) * D.art), D.z, D.frameShare);
                const y = D.footY + (D.contact[1] - D.px) * D.art;
                view.setEnabled(true);
                if (d.t > run.c.demonSec) {
                    view.position.set(x, y, D.z);
                    this._demonTex(view, S.demonFrame(A, run.c.demonPerch + run.c.demonSec - d.t));
                } else {
                    const k = 1 - Math.max(0, d.t) / run.c.demonSec, e = k * k * (3 - 2 * k);
                    const z1 = 120, x1 = this._inFrameX(trainX + side * S.LANE_W * 0.45, z1);
                    view.position.set(x + (x1 - x) * e, y + (D.hitY - y) * e + Math.sin(k * Math.PI) * 40, D.z + (z1 - D.z) * e);
                    this._demonTex(view, S.demonLeapFrame(A, k));
                }
            } else if (ash > 0) {
                this._demonTex(view, A.ash[Math.min(3, Math.floor((1 - ash) * 4))]);
            } else {
                view.setEnabled(false);
            }
        }
    }

    _demonTex(view, url) {
        this._setSpriteTex(view.material, url);
        view.metadata.shade.opacityTexture = view.material.opacityTexture;
    }

    // The frame of a demon `e` seconds after it showed, of its leap at share k.
    static demonFrame(A, e) {
        const D = CollapseScene.DEMON;
        const n = Math.floor(e * 1000 / D.emergeMs);
        return n < A.emerge.length ? A.emerge[Math.max(0, n)] : A.perch[Math.floor((e - A.emerge.length * D.emergeMs / 1000) * 1000 / D.perchMs) % A.perch.length];
    }

    static demonLeapFrame(A, k) {
        const frames = [...A.jump, ...A.strike];
        return frames[Math.min(frames.length - 1, Math.floor(k * frames.length))];
    }

    // x clamped into the frame at depth z (share of the half frame, a sprite's margin): the camera
    // follows the train, and on a narrow phone the wall at that depth is out of the frame: a demon
    // stands at its edge then.
    _inFrameX(x, z, share = 0.8) {
        const cam = this.view.camera;
        const half = (cam.position.z - z) * Math.tan(cam.fov / 2) * this.engine.getAspectRatio(cam) * share;
        return Math.max(this.camX - half, Math.min(this.camX + half, x));
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
            this._lever = { at: e.at, to: e.to, time: this.time };
            // The driver fires out of the cab, on the side of the fork: the frame draws the muzzle flash.
            this._shotFrame = e.to < run.lane ? CollapseArt.locoShot.left : CollapseArt.locoShot.right;
            this._shotUntil = this.time + 0.18;
        } else if (e.type === 'switched') {
            // Sparks under both wheel sets, the smoke blown against the move (the art drifts right).
            const dir = e.to > run.prevLane ? 1 : -1;
            this._fxPlay(this.fxSparks[0], [-95, 0, 40], { flip: dir < 0 });
            this._fxPlay(this.fxSparks[1], [95, 0, 40], { flip: dir < 0 });
            this._fxPlay(this.fxSmoke, [0, 380, 10], { flip: dir > 0, v: [-dir * 420, 140, 0] });
        } else if (e.type === 'shielded') {
            this._shieldHitUntil = this.time + 0.3;
            this._fxPlay(this.fxShield, [0, 200, 90]);
            if (e.reason !== 'caught') this._hitFx(e.reason, run);   // the shield pushed the collapse back: no fall
        } else if (e.type === 'demon-killed') {
            this._ashUntil.set(e.side, this.time + CollapseScene.DEMON.ashSec);
        } else if (e.type === 'crash') {
            this._crashAt = this.time;
            this._hitFx(e.reason, run);
        }
    }

    // Tap targets in canvas CSS px: the next fork's levers and every demon in the frame.
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
        for (const d of run.shootable()) {
            const view = this.demonViews.get(d.side);
            if (!view || !view.isEnabled()) continue;
            const p = this.view.projectToScreen(view.position.x, view.position.z, view.position.y + CollapseScene.DEMON.px * CollapseScene.DEMON.art / 2);
            if (!p.behind) out.push({ x: p.x, y: p.y, kind: 'demon', side: d.side });
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
CollapseScene.LOCO = { w: 290, h: 418 };   // the loco's sprite (assets/px/train), world units
CollapseScene.LOCO_TOP = 414;     // world units: the top of the loco's art, its smoke included
// The lever stand of a fork (assets/px/switch, 91 x 120 px) and its signal: the lit panel of the sign art
// as shares of that file, on the disc at height y.
CollapseScene.LEVER = { w: 150, h: 198, badge: { w: 84, y: 160, crop: [0.16, 0.13, 0.68, 0.56] } };
CollapseScene.PICKUP = { w: 90, h: 135, y: 6, bob: 10 };   // a pickup's sprite, world units
CollapseScene.FLOW = { w: 170, h: 760, y: 120 };           // a lava stream's sprite, world units
// What of each object the frame can catch (Game.frameEntry): half width and top, world units: a hole
// as wide as its lane, the lava flow, a pickup at the top of its bob.
CollapseScene.BODIES = {
    gap: { hw: CollapseScene.LANE_W / 2, top: 0 },
    lava: { hw: CollapseScene.FLOW.w / 2, top: CollapseScene.FLOW.y + CollapseScene.FLOW.h },
    pickup: { hw: CollapseScene.PICKUP.w / 2, top: CollapseScene.PICKUP.y + CollapseScene.PICKUP.h + CollapseScene.PICKUP.bob },
};
CollapseScene.BEHIND = 16;        // segments drawn behind the train (into the vanishing point)
CollapseScene.DEBRIS = 40;        // falling blocks and rail wreckage along the collapse edge (every 4th — a rail)
CollapseScene.DELAY = { vault: 0, torch: 0.05, rib: 0.1, 'wall-hi': 0.15, 'wall-lo': 0.3, floor: 1 };   // segments a piece waits past the edge
CollapseScene.LEAN = { vault: 0.75, torch: 0.45, rib: 0.55, 'wall-hi': 0.45, 'wall-lo': 0.25, floor: 0 };  // how far it leans in as it falls
CollapseScene.CRACK_ART = 3;      // world units per art pixel of the cracks (the loco: 2.1); walls are seen edge-on
CollapseScene.BG_PX = [384, 256]; // size of a layer of the collapse, art px (art_src/world_v3/world_manifest_v3.json)
CollapseScene.RAIL_ROW = 180;     // art row of bg_04_rubble.png: the fold, just under its broken rails
CollapseScene.FALL_SINK = 900;    // world units the lane under the train drops as the train falls: it never goes through whole floor
CollapseScene.TRAIN_SEGS = 3;     // segments of track under the train behind it
CollapseScene.FLOOR_HOLD = 1;     // segments behind the edge where the floor still holds, under the wreck
CollapseScene.CHUNK_PX = 96;      // size of a falling chunk's art, px (the biggest of them; 64 for a brick)
// The demon's art (art_src/demon_v3/demon_manifest_v3.json): canvas, px; the wall contact on it; ms per
// frame. World: units per art px, the gap of the contact to the wall, the height of the feet, the height
// of the sprite's foot at the hit, the share of the half frame a demon stays in, z of the perch, s of the ash, the size of the dark shape under it.
CollapseScene.DEMON = { px: 160, contact: [103, 134], emergeMs: 120, perchMs: 160, art: 2.4, wallGap: 20, footY: 100, hitY: 40, frameShare: 0.7, z: -700, ashSec: 0.47, outline: 1.09 };
CollapseScene.FX_ART = 2.1;       // world units per art pixel of the effects (the loco: 290 / 139 px)
// Effect art (art_src/fx_v1/fx_manifest_v1.json): frame size, px; pivot from the top left, 0..1;
// ms per frame; scale over FX_ART (the shield break covers the shield sprite).
CollapseScene.FX = {
    sparks: { size: [96, 64], pivot: [0.5, 0.90625], ms: 70 },
    smoke: { size: [128, 96], pivot: [0.5, 0.9375], ms: 100 },
    claw: { size: [128, 128], pivot: [0.5, 0.5], ms: 65 },
    ash: { size: [96, 96], pivot: [0.5, 0.5], ms: 85 },
    splash: { size: [160, 128], pivot: [0.5, 0.953125], ms: 90 },
    steam: { size: [128, 128], pivot: [0.5, 0.953125], ms: 120, loop: true },
    drops: { size: [96, 96], pivot: [0.5, 0.9375], ms: 90 },
    shieldBreak: { size: [160, 160], pivot: [0.5, 0.5], ms: 90, scale: 1.4 },
    rail: { size: [96, 96], pivot: [0.5, 0.5], ms: 350 },
};
CollapseScene.LAVA_MS = 180;      // ms a frame of the magma (art_src/world_v3: four frames, 720 ms)
CollapseScene.AHEAD = 6;
CollapseScene.SW_PX = 640;        // turnout texture height, px (art_src/switches_v1/switches_manifest_v1.json)
CollapseScene.SW_ROWS = [96, 544]; // texture rows where the S curve ends and starts (travel: bottom to top)
CollapseScene.RAIL_U = [30, 37];   // the rail's column in track.png, px (the left rail; the tile's rails are at 32 and 96)
CollapseScene.BRANCH_STEPS = 20;  // straight pieces of one rail of a turnout's curve
CollapseScene.SW_LEN = CollapseRules.SWITCH_LEAD * CollapseScene.SEG;   // world units of a turnout plate from its fork boundary: the curve, then straight up to the hazard
