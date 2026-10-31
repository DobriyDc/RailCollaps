// CollapseScene.js — the tunnel of Rail Link: Collapse (GDD v3 §2), skill lowres-tunnel later:
// a real 3D scene rendered small (COLLAPSE_RENDER_HEIGHT px tall) and scaled up without smoothing,
// pixel textures (emissive, nearest sampling), the light and the palette of CollapseLook.js, linear fog for depth.
// The train stands still at z = 0 facing the camera (+Z); the world scrolls toward the camera as
// CollapseRun.pos grows: segment i is drawn at z = (i - pos) * SEG, the upcoming track is in the
// lower part of the frame, the passed track and the collapse go up into the vanishing point.
// The scene only draws CollapseRun; it decides nothing (CollapseRules.js).

/** @satisfies {Record<string, any>} */
const CollapseArt = {
    // Paths are LITERALS: the builder's asset scanner includes only what it sees in code.
    tex: {
        wall: 'assets/textures/tunnel/brick_wall.png',
        // Vault and rib v2 (card 14, art_src/tunnel_vault_v1): U runs the whole arc once, keystone at 0.5.
        vault: 'assets/textures/tunnel/vault_brick_v2.png',
        rib: 'assets/textures/tunnel/arch_rib_v2.png',
        track: 'assets/textures/tunnel/track.png',
        ballast: 'assets/textures/tunnel/floor_ballast.png',
    },
    lava: ['assets/textures/tunnel/lava_0.png', 'assets/textures/tunnel/lava_1.png',
        'assets/textures/tunnel/lava_2.png', 'assets/textures/tunnel/lava_3.png'],
    // The collapse (card 12, art_src/collapse_front_v1): the front cut through the tunnel section,
    // magma under the tunnel, glowing cracks ahead of the front, falling blocks and rail wreckage.
    front: ['assets/sprites/collapse/front_00.png', 'assets/sprites/collapse/front_01.png', 'assets/sprites/collapse/front_02.png',
        'assets/sprites/collapse/front_03.png', 'assets/sprites/collapse/front_04.png', 'assets/sprites/collapse/front_05.png'],
    magma: ['assets/textures/collapse/magma_00.png', 'assets/textures/collapse/magma_01.png',
        'assets/textures/collapse/magma_02.png', 'assets/textures/collapse/magma_03.png'],
    crackWall: ['assets/sprites/collapse/crack_wall_00.png', 'assets/sprites/collapse/crack_wall_01.png'],
    crackVault: ['assets/sprites/collapse/crack_vault_00.png', 'assets/sprites/collapse/crack_vault_01.png',
        'assets/textures/tunnel/vault_magma_crack_v2.png'],
    brick: ['assets/sprites/collapse/brick_debris_00.png', 'assets/sprites/collapse/brick_debris_01.png',
        'assets/sprites/collapse/brick_debris_02.png', 'assets/sprites/collapse/brick_debris_03.png',
        'assets/sprites/collapse/brick_debris_04.png', 'assets/sprites/collapse/brick_debris_05.png',
        'assets/sprites/collapse/brick_debris_06.png', 'assets/sprites/collapse/brick_debris_07.png'],
    railBits: ['assets/sprites/collapse/rail_debris_00.png', 'assets/sprites/collapse/rail_debris_01.png',
        'assets/sprites/collapse/rail_debris_02.png'],
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
    // Turnouts (card 07, art_src/switches_v1): a base with the through tracks and the curve, and one
    // overlay of switch points per state; canvas 384x640 = three lanes, the curve leaves the middle lane.
    switches: {
        right: { base: 'assets/textures/switches/switch_right_base.png',
            straight: 'assets/textures/switches/switch_right_points_straight.png',
            right: 'assets/textures/switches/switch_right_points_right.png' },
        left: { base: 'assets/textures/switches/switch_left_base.png',
            straight: 'assets/textures/switches/switch_left_points_straight.png',
            left: 'assets/textures/switches/switch_left_points_left.png' },
        both: { base: 'assets/textures/switches/switch_both_base.png',
            straight: 'assets/textures/switches/switch_both_points_straight.png',
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
        cam.fov = (typeof COLLAPSE_CAM_FOV_DEG !== U ? COLLAPSE_CAM_FOV_DEG : 50) * Math.PI / 180;
        cam.minZ = 10;
        cam.position.set(0, typeof COLLAPSE_CAM_Y !== U ? COLLAPSE_CAM_Y : 450, typeof COLLAPSE_CAM_Z !== U ? COLLAPSE_CAM_Z : 1467);
        cam.setTarget(BABYLON.Vector3.Zero());
        this.topGap = typeof COLLAPSE_CAM_TOP_GAP !== U ? COLLAPSE_CAM_TOP_GAP : 0.01;
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
        // The collapse: where the front plate stands behind the edge, the crack zone ahead of it, how
        // bright the cracks glow, how far ahead of the edge the vault starts to shed blocks.
        this.frontBack = typeof COLLAPSE_FRONT_BEHIND !== U ? COLLAPSE_FRONT_BEHIND : 0.4;
        this.signShift = typeof COLLAPSE_CAM_SIGN !== U ? COLLAPSE_CAM_SIGN : 0.3;        // where a fork sign stands between its two lanes
        this.frontLift = typeof COLLAPSE_CAM_FRONT_Y !== U ? COLLAPSE_CAM_FRONT_Y : -350;  // the close camera sees little of the height: the arch comes down to it
        this.crackZone = typeof COLLAPSE_CRACK_ZONE !== U ? COLLAPSE_CRACK_ZONE : 3;
        this.crackLevel = typeof COLLAPSE_CRACK_LEVEL !== U ? COLLAPSE_CRACK_LEVEL : 1.6;
        this.debrisLead = typeof COLLAPSE_DEBRIS_LEAD !== U ? COLLAPSE_DEBRIS_LEAD : 1;
        // Effects (card 16): the lean on a lane change, the camera shake of a demon hit, the glow of a
        // lava hit, the lean into a gap.
        this.rollMax = (typeof COLLAPSE_FX_ROLL_DEG !== U ? COLLAPSE_FX_ROLL_DEG : 8) * Math.PI / 180;
        this.shakeAmp = typeof COLLAPSE_FX_SHAKE !== U ? COLLAPSE_FX_SHAKE : 24;
        this.shakeSec = typeof COLLAPSE_FX_SHAKE_SEC !== U ? COLLAPSE_FX_SHAKE_SEC : 0.35;
        this.heatSec = typeof COLLAPSE_FX_HEAT_SEC !== U ? COLLAPSE_FX_HEAT_SEC : 0.5;
        this.fallTilt = (typeof COLLAPSE_FX_FALL_TILT_DEG !== U ? COLLAPSE_FX_FALL_TILT_DEG : 22) * Math.PI / 180;
        this.camY = cam.position.y;
        this._shakeAt = this._heatAt = -1e9;
        cam.maxZ = toTrain + CollapseScene.SEG * CollapseScene.BEHIND + 2000;
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

    // Every frame a material swaps to later is loaded with the scene: a texture made on its first show
    // is not ready in that frame, and the sprite blinks out (the first shot, the first effect).
    _preload() {
        const A = CollapseArt;
        for (const u of [...A.loco, ...Object.values(A.locoShot), ...Object.values(A.locoFall), A.locoDamaged, ...A.torch, ...A.flow,
            ...A.shield, A.shieldHit, ...A.demon, A.demonAsh, ...Object.values(A.sign), ...A.lava, ...A.magma]) this.texture(u);
        for (const u of [...A.front, ...Object.values(A.fx).flat(), ...Object.values(A.switches).flatMap(v => Object.values(v))]) this.texture(u, false);
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
        const BRICK = S.TILE * 2;   // wall and vault bricks read at the camera's distance; one tile per segment
        const mid = (top - 60) / 2; // where a wall breaks into its lower and upper piece

        // Magma under the whole floor: seen through gaps and where the floor falls at the collapse.
        const lava = BABYLON.MeshBuilder.CreateGround('lava', { width: W * 2, height: len }, scene);
        lava.position.set(0, -150, (zFar + zNear) / 2);
        lava.material = this.surface('lava', CollapseArt.magma[0], W * 2 / (2 * S.TILE), len / (2 * S.TILE), this.lavaLevel);
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
            // v2 art: U crosses the whole arc once (left foot 0, keystone 0.5, right foot 1), so each
            // half takes half of it; V repeats along the tunnel once per segment (one tile of 4 rows).
            vault.material = this._arcMat('vault-' + s, CollapseArt.tex.vault, side, false);
            piece(vault, side, 'vault', [side * W, top]);
            const ribShape = side < 0 ? [V(-(W - 40), -60), ...arc(R - 40, 0, 8)] : [...arc(R - 40, 8, 16), V(W - 40, -60)];
            const rib = extrude('rib-' + s, ribShape, ribPath);
            rib.material = this._arcMat('rib-' + s, CollapseArt.tex.rib, side, true);
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

    // A vault or rib half with the v2 arc art: half of U per side, clamped across the arc.
    _arcMat(key, url, side, clampV) {
        const m = this.surface(key, url, 0.5, 1, this.brickLevel);
        const t = m.emissiveTexture;
        t.uOffset = side > 0 ? 0.5 : 0;
        t.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        if (clampV) t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        return m;
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

    // The collapse (GDD v3 §3): the front plate — the cut of the tunnel section, animated — stands a
    // little behind the edge, so the first pieces of the falling tunnel are seen in front of it;
    // glowing cracks spread over walls and vault ahead of the edge; blocks and rail wreckage fall.
    _buildCollapse() {
        const S = CollapseScene, scene = this.scene;
        const plate = this.frontPlate = BABYLON.MeshBuilder.CreatePlane('collapse-front', { width: S.FRONT_W, height: S.FRONT_H }, scene);
        plate.bakeTransformIntoVertices(BABYLON.Matrix.RotationY(Math.PI).multiply(BABYLON.Matrix.Translation(0, S.FRONT_Y + S.FRONT_H / 2, 0)));
        plate.material = this.spriteMat('collapse-front', CollapseArt.front[0], false);
        for (const u of CollapseArt.front) this.texture(u, false).level = this.lavaLevel;   // the frames glow like the lava
        plate.isPickable = false;
        plate.position.y = this.frontLift;
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
        // The front plate: the section cut a little behind the edge, FRONT_FPS frames a second.
        this.frontPlate.position.z = (run.front - this.frontBack - pos) * S.SEG;
        this._setSpriteTex(this.frontPlate.material, CollapseArt.front[Math.floor(this.time * S.FRONT_FPS) % CollapseArt.front.length], false);

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
            const fallen = run.front - i, drop = fallen > 0 ? Math.min(900, fallen * fallen * 500) : 0;
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
        // rail wreckage thrown up where the floor goes. Each slot falls once; it is drawn only while
        // in front of the front plate (behind it the plate hides it anyway).
        const per = 8, base = Math.floor(run.front + this.debrisLead) + 1, plateZ = run.front - this.frontBack;
        for (let j = 0; j < S.DEBRIS; j++) {
            const i = base - Math.floor(j / per), h = k => S.hash(i, j % per * 5 + k);
            const zi = i + h(4);
            if (zi < plateZ) continue;
            if (j % 4 === 3) {
                const f = run.front - i - h(0) * 0.4;
                const y = f * 900 - f * f * 3200;
                if (f <= 0 || y < -170) continue;
                const size = 150 + h(3) * 80;
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
                const side = h(1) < 0.5 ? -1 : 1, size = 90 + h(3) * 90;
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

    _buildTrain() {
        this.train = this.sprite('loco', 'loco', CollapseArt.loco[0], 290, 418);
        this.train.position.set(0, 0, 0);
        // Not a billboard: the loco leans (rotation.z) and tips into a gap (rotation.x) about its
        // bottom center; turned to face the camera, which looks straight down the track.
        this.train.billboardMode = BABYLON.Mesh.BILLBOARDMODE_NONE;
        this.train.rotation.y = Math.PI;
        this.shieldFx = this.sprite('shield', 'shield', CollapseArt.shield[0], 460, 352);
        this.shieldFx.position.set(0, 10, 20);
        this._buildDemons();
        this._buildFx();
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
    }

    // Start an effect: `at` — offset from the loco's bottom center (follow) or a world point;
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

    _syncFx(trainX, trainY) {
        for (const fx of this.fx) {
            if (!fx.mesh.isEnabled()) continue;
            const t = this.time - fx.start;
            if (this.time >= fx.until || t < 0) { fx.mesh.setEnabled(false); continue; }
            const n = fx.frames.length, f = Math.floor(t * 1000 / fx.ms);
            this._setSpriteTex(fx.mesh.material, fx.frames[fx.loop ? f % n : Math.min(n - 1, f)], false);
            const bx = fx.follow ? trainX : 0, by = fx.follow ? trainY : 0;
            fx.mesh.position.set(bx + fx.at[0] + fx.v[0] * t, by + fx.at[1] + fx.v[1] * t - fx.g * t * t / 2, fx.at[2] + fx.v[2] * t);
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

    // One demon sprite per tunnel wall: a pair leaps from both walls at once. Each side has its
    // own material, so the two play their frames apart.
    _buildDemons() {
        /** @type {Map<number, any>} */
        this.demonViews = new Map();
        /** @type {Map<number, number>} */
        this._ashUntil = new Map();
        for (const side of [-1, 1]) {
            const d = this.sprite('demon', 'demon' + side, CollapseArt.demon[0], 360, 314);
            d.setEnabled(false);
            this.demonViews.set(side, d);
            this._ashUntil.set(side, -1);
        }
    }

    // --- Per-segment objects ----------------------------------------------------------------------

    static laneX(l) { return (l - 1) * CollapseScene.LANE_W; }

    // Red cross at fork boundary i on `lane` (GDD v3 §4): a fork leaves that lane here, and staying on
    // it is not safe — the same CollapseRun.forkSafe that colors the arrows, asked about the lane itself.
    static crossAt(run, i, lane) {
        return run.track.seg(i).forks.some(f => f.from === lane) && !run.forkSafe(i, lane);
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

    _segView(i, run) {
        const S = CollapseScene, scene = this.scene, seg = run.track.seg(i);
        /** @type {{ lanes: any[], forks: any[], signs: any[], crosses: any[], pickups: any[], flows: any[], set: any }} */
        const v = { lanes: [], forks: [], signs: [], crosses: [], pickups: [], flows: [], set: null };
        for (let l = 0; l < 3; l++) {
            if (seg.gap[l]) { v.lanes.push(null); continue; }
            const strip = BABYLON.MeshBuilder.CreateGround('strip', { width: S.LANE_W, height: S.SEG }, scene);
            strip.material = this.surface('track', CollapseArt.tex.track, 1, S.SEG / S.LANE_W);
            strip.position.x = S.laneX(l);
            v.lanes.push(strip);
        }
        for (const g of S.switchGroups(seg.forks)) {
            const art = CollapseArt.switches[g.variant];
            const y = g.flip ? 3 : 1;   // a boundary never mixes both kinds; if it did, no z-fighting
            const base = this._switchPlate('switch', this.spriteMat('sw:' + art.base, art.base, false), g.flip, y);
            const points = this._switchPlate('points', this.spriteMat('sw:' + art.straight, art.straight, false), g.flip, y + 1);
            v.forks.push({ g, base, points });
        }
        for (const f of seg.forks) {
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
        for (const m of [...v.lanes, ...v.forks.flatMap(f => [f.base, f.points]), ...v.signs, ...v.crosses, ...v.pickups, ...v.flows]) {
            if (m) { if (m.material && m.material.name.startsWith('sign-')) { this._mats.delete(m.material.name); m.material.dispose(); } m.dispose(); }
        }
    }

    // A new run (another seed, another track): drop the segment views and the accents of the last one.
    reset() {
        for (const v of this.segViews.values()) this._disposeSeg(v);
        this.segViews.clear();
        this._shotUntil = this._shieldHitUntil = -1;
        this._crashAt = null;
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
        this._setSpriteTexFrame(this.channelMat, CollapseArt.lava[Math.floor(this.time * 6) % 4], true);
        this._setSpriteTexFrame(this.magmaMat, CollapseArt.magma[Math.floor(this.time * S.MAGMA_FPS) % 4], true);
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
            if (run.armed && run.armed.at === i) v.set = run.armed;
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
                const url = !safe ? CollapseArt.sign.cross : md.to < md.from ? CollapseArt.sign.left : CollapseArt.sign.right;
                this._setSpriteTex(sign.material, url);
                const armed = run.armed && run.armed.at === md.at && run.armed.to === md.to;
                const actionable = next && next.at === md.at;
                sign.position.set(S.laneX(md.from) + (md.to - md.from) * S.LANE_W * this.signShift, armed ? 40 : 0, z);
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
                p.position.set(S.laneX(p.metadata.lane), S.PICKUP.y + Math.sin(this.time * 4 + i) * S.PICKUP.bob, z + S.SEG / 2);
            }
            for (const fl of v.flows) {
                fl.position.set(S.laneX(fl.metadata.lane), S.FLOW.y, z + S.SEG / 2);
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
        // Lane change: the loco leans toward the new lane while it crosses (run.prevLane, switchAt).
        const cross = (run.pos - run.switchAt) / CollapseRules.SWITCH_LEN;
        let roll = run.lane !== run.prevLane && cross >= 0 && cross < 1 ? Math.sign(run.lane - run.prevLane) * this.rollMax * Math.sin(Math.PI * cross) : 0;
        let tip = 0;
        if (run.state === 'over') {
            const k = Math.min(1, (this.time - (this._crashAt || this.time)) * 1.6);
            if (run.reason === 'gap' || run.reason === 'caught') {
                frame = run.lane === 0 ? CollapseArt.locoFall.left : CollapseArt.locoFall.right;
                this.train.position.y = -k * 260;
                roll = (run.lane === 0 ? -1 : 1) * this.fallTilt * k;   // it tips over the side it falls to
                tip = -0.45 * k;                                       // and its top comes toward the camera
            } else {
                frame = CollapseArt.locoDamaged;
            }
        }
        this.train.rotation.z = roll;
        this.train.rotation.x = tip;
        // A lava hit: the loco glows red-hot for heatSec (added to its unlit texture).
        const heat = Math.max(0, 1 - (this.time - this._heatAt) / this.heatSec);
        this.train.material.emissiveColor.set(heat * 0.9, heat * 0.3, heat * 0.05);
        this._setSpriteTex(this.train.material, frame);
        this._followCamera(x, dt);
        this.shieldFx.setEnabled(run.shield > 0 && run.state === 'run');
        this.shieldFx.position.x = x;
        this._setSpriteTex(this.shieldFx.material, this._shieldHitUntil > this.time ? CollapseArt.shieldHit : CollapseArt.shield[Math.floor(this.time * 6) % 3]);

        this._syncDemons(run, x);
        this._syncFx(x, this.train.position.y);
        this.rig.sync(run, pos, this.time, x, heat, this._shotUntil > this.time);
    }

    // Demons leap out of their wall toward the cab: at the start the sprite is half inside the
    // wall behind the nose (the stretch of wall the portrait frame shows), at the end of the leap (the
    // hit) it is in front of the train on its side.
    _syncDemons(run, trainX) {
        const S = CollapseScene;
        for (const [side, view] of this.demonViews) {
            const d = run.leaping().find(m => m.side === side);
            if (d) {
                const k = 1 - Math.max(0, d.t) / run.c.demonSec;
                const e = k * k * (3 - 2 * k);
                const z0 = -S.SEG * 2.5, z1 = 120;
                const x0 = this._inFrameX(side * (S.WALL_X - 40), z0), x1 = this._inFrameX(trainX + side * S.LANE_W * 0.45, z1);
                view.setEnabled(true);
                view.position.set(x0 + (x1 - x0) * e, 150 - 110 * e + Math.sin(k * Math.PI) * 120, z0 + (z1 - z0) * e);
                this._setSpriteTex(view.material, CollapseArt.demon[Math.min(3, Math.floor(k * 4))]);
            } else if (this._ashUntil.get(side) > this.time) {
                this._setSpriteTex(view.material, CollapseArt.demonAsh);
            } else {
                view.setEnabled(false);
            }
        }
    }

    // x clamped into the frame at depth z (with a sprite's margin): the camera follows the train, and
    // on a narrow phone the far wall leaves the frame — a demon from it enters at the frame edge.
    _inFrameX(x, z) {
        const cam = this.view.camera;
        const half = (cam.position.z - z) * Math.tan(cam.fov / 2) * this.engine.getAspectRatio(cam) * 0.8;
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
            this._ashUntil.set(e.side, this.time + 0.4);
        } else if (e.type === 'crash') {
            this._crashAt = this.time;
            this._hitFx(e.reason, run);
        }
    }

    // Tap targets in canvas CSS px: the next fork's signs and every leaping demon.
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
        for (const d of run.leaping()) {
            const view = this.demonViews.get(d.side);
            if (!view || !view.isEnabled()) continue;
            const p = this.view.projectToScreen(view.position.x, view.position.z, view.position.y + 140);
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
CollapseScene.LOCO_TOP = 414;     // world units: the top of the loco's art, its smoke included (loco_run_*.png: the sprite is 418 tall)
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
CollapseScene.DELAY = { vault: 0, torch: 0.05, rib: 0.1, 'wall-hi': 0.15, 'wall-lo': 0.3, floor: 0 };   // segments a piece waits past the edge
CollapseScene.LEAN = { vault: 0.75, torch: 0.45, rib: 0.55, 'wall-hi': 0.45, 'wall-lo': 0.25, floor: 0 };  // how far it leans in as it falls
CollapseScene.CRACK_ART = 3;      // world units per art pixel of the cracks (the loco: 2.1); walls are seen edge-on
CollapseScene.FRONT_W = 1400;     // the front plate: the arch of front_*.png over the tunnel section and its rim
CollapseScene.FRONT_H = 1080;
CollapseScene.FRONT_Y = -150;     // its bottom edge: on the magma
CollapseScene.FRONT_FPS = 10;     // front frames per second (art_src/collapse_front_v1: 6 frames, 600 ms)
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
CollapseScene.MAGMA_FPS = 1 / 0.12; // magma frames per second (120 ms a frame)
CollapseScene.AHEAD = 6;
CollapseScene.SW_PX = 640;        // turnout texture height, px (art_src/switches_v1/switches_manifest_v1.json)
CollapseScene.SW_ROWS = [96, 544]; // texture rows where the S curve ends and starts (travel: bottom to top)
CollapseScene.SW_LEN = CollapseRules.SWITCH_LEAD * CollapseScene.SEG;   // world units of a turnout plate from its fork boundary: the curve, then straight up to the hazard
