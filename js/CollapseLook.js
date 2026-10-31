// CollapseLook.js — the look of Rail Link: Collapse (docs/STYLE.md): a small render, one palette of 32
// colors with ordered dithering over the whole frame, and REAL light. Lava and torches are positions and
// colors the rig below moves every frame, and one material plugin turns them into light on the walls,
// the rails and the train. The plugin keeps its own light list instead of Babylon's: nineteen moving
// lights would not fit a material's light limit. The DOM interface lies over the canvas: no pass reaches it.

/** @satisfies {Record<string, any>} */
const CollapseLook = {
    LIGHTS: 19,             // the light list of the shader: 10 torches, 2 streams, 3 gaps, the front, the headlamp, a shot, the heat
    GLOW: 0, SOLID: 1, SPRITE: 2, FIRE: 3,   // how a material takes the light: lookMat.x
    // The one palette: the darks of the tunnel, brick, fire, iron, the signal colors.
    PALETTE: [0x0b0a10, 0x17121b, 0x241a24, 0x33232b, 0x47303a, 0x3a1010, 0x5c3a35, 0x7a4a3a,
        0x96604a, 0xb07a58, 0xcc9c74, 0xe8d0a8, 0x6a1410, 0x9c1e10, 0xd2340f, 0xf0601a,
        0xf8902a, 0xfcc048, 0xfff090, 0x2a3038, 0x465058, 0x6c7880, 0x9aa8ac, 0xd0d8d4,
        0x1f5a30, 0x2f9a44, 0x6cdc5c, 0x1f4a8c, 0x3a8ae0, 0x8cd4f0, 0x5a2a78, 0xfff8ec],
    LUT_SIDE: 32,           // levels per channel of the palette table
    LUT_TILES: [8, 4],      // the table's blue slices on a 256 x 128 texture
    /** @type {any} */
    SHADER: null,           // the shaders, below
    /** @type {any} */
    pluginClass: null,      // the material plugin, below
    /** @type {CollapseLookRig | null} */
    rig: null,              // the rig of this page: the plugin reads the light list from it

    // How a scene material takes the light, by the key it is made under (CollapseScene.surface,
    // spriteMat). Signs and pickups stay self-lit: the signal is never lost in the dark (GDD v3 §4).
    kindOf(key) {
        if (/^(wall|vault|rib|ballast|track|sw:)/.test(key)) return this.SOLID;
        if (/^(loco|demon|brick|rail-bit)/.test(key)) return this.SPRITE;
        if (/^(lava|flow|torch|collapse-front|crack)/.test(key)) return this.FIRE;
        return this.GLOW;
    },

    // The palette table, RGBA: the nearest palette color of every quantized color.
    lut() {
        const n = this.LUT_SIDE, [tx, ty] = this.LUT_TILES, w = n * tx, h = n * ty;
        const pal = this.PALETTE.map(c => [c >> 16 & 255, c >> 8 & 255, c & 255]);
        const data = new Uint8Array(w * h * 4);
        for (let b = 0; b < n; b++) {
            const ox = (b % tx) * n, oy = Math.floor(b / tx) * n;
            for (let g = 0; g < n; g++) {
                for (let r = 0; r < n; r++) {
                    const cr = r * 255 / (n - 1), cg = g * 255 / (n - 1), cb = b * 255 / (n - 1);
                    let best = pal[0], bestD = Infinity;
                    for (const p of pal) {
                        // Weighted by what the eye sees: green counts most.
                        const dr = p[0] - cr, dg = p[1] - cg, db = p[2] - cb;
                        const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
                        if (d < bestD) { bestD = d; best = p; }
                    }
                    const at = ((oy + g) * w + ox + r) * 4;
                    data[at] = best[0]; data[at + 1] = best[1]; data[at + 2] = best[2]; data[at + 3] = 255;
                }
            }
        }
        return { data, w, h };
    },

    cfg() {
        const U = 'undefined';
        return {
            dither: typeof COLLAPSE_LOOK_DITHER !== U ? COLLAPSE_LOOK_DITHER : 0.09,
            ambient: typeof COLLAPSE_LOOK_AMBIENT !== U ? COLLAPSE_LOOK_AMBIENT : 0.3,
            bounce: typeof COLLAPSE_LOOK_BOUNCE !== U ? COLLAPSE_LOOK_BOUNCE : 0.35,
            lampPower: typeof COLLAPSE_LOOK_LAMP_POWER !== U ? COLLAPSE_LOOK_LAMP_POWER : 1.2,
            lampY: typeof COLLAPSE_LOOK_LAMP_Y !== U ? COLLAPSE_LOOK_LAMP_Y : 300,
            lampZ: typeof COLLAPSE_LOOK_LAMP_Z !== U ? COLLAPSE_LOOK_LAMP_Z : 420,
            lampColor: typeof LOOK_LAMP_COLOR !== U ? LOOK_LAMP_COLOR : 0xfff2dc,
            lampRadius: typeof COLLAPSE_LOOK_LAMP_RADIUS !== U ? COLLAPSE_LOOK_LAMP_RADIUS : 2000,
            flicker: typeof COLLAPSE_LOOK_FLICKER !== U ? COLLAPSE_LOOK_FLICKER : 0.18,
            torchPower: typeof COLLAPSE_LOOK_TORCH_POWER !== U ? COLLAPSE_LOOK_TORCH_POWER : 1.4,
            torchRadius: typeof COLLAPSE_LOOK_TORCH_RADIUS !== U ? COLLAPSE_LOOK_TORCH_RADIUS : 900,
            torchColor: typeof LOOK_TORCH_COLOR !== U ? LOOK_TORCH_COLOR : 0xffa858,
            lavaPower: typeof COLLAPSE_LOOK_LAVA_POWER !== U ? COLLAPSE_LOOK_LAVA_POWER : 1.2,
            lavaRadius: typeof COLLAPSE_LOOK_LAVA_RADIUS !== U ? COLLAPSE_LOOK_LAVA_RADIUS : 620,
            lavaColor: typeof LOOK_LAVA_COLOR !== U ? LOOK_LAVA_COLOR : 0xff5a18,
            frontPower: typeof COLLAPSE_LOOK_FRONT_POWER !== U ? COLLAPSE_LOOK_FRONT_POWER : 1.6,
            frontRadius: typeof COLLAPSE_LOOK_FRONT_RADIUS !== U ? COLLAPSE_LOOK_FRONT_RADIUS : 1500,
            streamPower: typeof COLLAPSE_LOOK_STREAM_POWER !== U ? COLLAPSE_LOOK_STREAM_POWER : 1.3,
            streamRadius: typeof COLLAPSE_LOOK_STREAM_RADIUS !== U ? COLLAPSE_LOOK_STREAM_RADIUS : 760,
            gapPower: typeof COLLAPSE_LOOK_GAP_POWER !== U ? COLLAPSE_LOOK_GAP_POWER : 1.1,
            gapRadius: typeof COLLAPSE_LOOK_GAP_RADIUS !== U ? COLLAPSE_LOOK_GAP_RADIUS : 560,
        };
    },
};

// The shaders. lookLight: the sum at point p with normal n (either side of a surface:
// the lights are all inside the tunnel, and the walls are double-sided). A point light is
// lookPos = (x, y, z, 1 / radius²), lookCol = (r, g, b, 0); the two lava channels are lines along
// the tunnel, lookLava = (x of the channels, y, 1 / radius², 0).
CollapseLook.SHADER = {
    light: `
uniform vec4 lookPos[LOOK_N];
uniform vec4 lookCol[LOOK_N];
uniform vec4 lookAir;
uniform vec4 lookLava;
uniform vec4 lookLavaCol;
vec3 lookLight(vec3 p, vec3 n, float wrap) {
    // lookAir.a: the lava's light thrown back from below, on what faces down or sideways.
    vec3 sum = lookAir.rgb + lookLavaCol.rgb * lookAir.a * (1.0 - wrap * 0.5 - (1.0 - wrap) * 0.5 * (1.0 + n.y));
    for (int i = 0; i < LOOK_N; i++) {
        vec3 d = lookPos[i].xyz - p;
        float k = 1.0 - dot(d, d) * lookPos[i].w;
        if (k <= 0.0) continue;
        sum += lookCol[i].rgb * k * k * mix(abs(dot(n, normalize(d + vec3(0.0, 0.001, 0.0)))), 1.0, wrap);
    }
    vec3 c = vec3(sign(p.x) * (lookLava.x - abs(p.x)), lookLava.y - p.y, 0.0);
    float k = 1.0 - dot(c, c) * lookLava.z;
    if (k > 0.0) sum += lookLavaCol.rgb * k * k * mix(abs(dot(n, normalize(c + vec3(0.0, 0.001, 0.0)))), 1.0, wrap);
    return sum;
}
`,
    // The material's own numbers: lookMat = (kind, the most light it takes, 0 — no limit: a sprite keeps
    // the colors of its art).
    lit: `
float lookKind = lookMat.x + 0.5;
if (lookKind >= 1.0 && lookKind < 3.0) {
    vec3 lookL = lookLight(vPositionW, normalW, lookMat.x > 1.5 ? 1.0 : 0.0);
    color.rgb *= lookMat.y > 0.0 ? min(lookL, vec3(lookMat.y)) : lookL;
}
`,
    pixel: `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D lookLut;
uniform float lookDither;
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main(void) {
    vec3 c = texture2D(textureSampler, vUV).rgb;
    c = clamp(c + (bayer4(gl_FragCoord.xy) - 0.47) * lookDither, 0.0, 1.0);
    vec3 q = floor(c * 31.0 + 0.5);
    vec2 tile = vec2(mod(q.b, 8.0), floor(q.b / 8.0));
    gl_FragColor = vec4(texture2D(lookLut, (tile * 32.0 + q.rg + 0.5) / vec2(256.0, 128.0)).rgb, 1.0);
}
`,
};

// The lit-tunnel plugin. Made on first use: BABYLON is not there when logic tests load this file.
CollapseLook.pluginClass = function () {
    return class CollapseLookPlugin extends BABYLON.MaterialPluginBase {
        constructor(material) {
            super(material, 'CollapseLook', 300, { COLLAPSELOOK: false }, true, true);
        }

        getClassName() { return 'CollapseLookPlugin'; }

        isCompatible(shaderLanguage) { return shaderLanguage === BABYLON.ShaderLanguage.GLSL; }

        // Before the attributes are chosen: the materials keep disableLighting, and Babylon would drop the normals.
        prepareDefinesBeforeAttributes(defines) {
            defines.COLLAPSELOOK = true;
            defines._needNormals = true;
        }

        getUniforms() {
            return { externalUniforms: ['lookPos', 'lookCol', 'lookAir', 'lookLava', 'lookLavaCol', 'lookMat'] };
        }

        bindForSubMesh(ubo, scene, engine, subMesh) {
            const fx = subMesh.effect, m = /** @type {any} */ (this._material);
            if (!fx) return;
            const rig = CollapseLook.rig, kind = m.metadata ? m.metadata.look || 0 : 0;
            fx.setFloat2('lookMat', kind, kind === CollapseLook.SPRITE ? 1 : 0);
            if (fx.lookFrame === rig.frame) return;
            fx.lookFrame = rig.frame;
            fx.setArray4('lookPos', rig.pos);
            fx.setArray4('lookCol', rig.col);
            fx.setFloat4('lookAir', rig.air.r, rig.air.g, rig.air.b, rig.c.bounce);
            fx.setFloat4('lookLava', rig.lava[0], rig.lava[1], rig.lava[2], 0);
            fx.setFloat4('lookLavaCol', rig.lavaCol[0], rig.lavaCol[1], rig.lavaCol[2], 0);
        }

        getCustomCode(shaderType) {
            if (shaderType === 'vertex') return null;
            return {
                CUSTOM_FRAGMENT_DEFINITIONS: 'uniform vec2 lookMat;\n' + CollapseLook.SHADER.light.replace(/LOOK_N/g, String(CollapseLook.LIGHTS)),
                CUSTOM_FRAGMENT_BEFORE_FOG: CollapseLook.SHADER.lit,
            };
        }
    };
};

// The light and the final pass for one CollapseScene. Created before the scene's first material;
// finish() runs when the tunnel exists; sync() moves the lights every frame.
class CollapseLookRig {
    constructor() {
        CollapseLook.rig = this;
        const c = this.c = CollapseLook.cfg();
        const n = CollapseLook.LIGHTS;
        this.pos = new Float32Array(4 * n);
        this.col = new Float32Array(4 * n);
        this.frame = 0;
        const air = new BABYLON.Color3(0.8, 0.8, 0.95).scale(c.ambient);
        this.air = air;
        const hex = (v, k) => { const h = World3D.hexColor3(v); return [h.r * k, h.g * k, h.b * k]; };
        this.torchCol = hex(c.torchColor, c.torchPower);
        this.lavaBase = hex(c.lavaColor, c.lavaPower);
        this.lavaCol = this.lavaBase.slice();
        this.frontCol = hex(c.lavaColor, c.frontPower);
        this.streamCol = hex(c.lavaColor, c.streamPower);
        this.gapCol = hex(c.lavaColor, c.gapPower);
        this.lampCol = hex(c.lampColor, c.lampPower);
        this.lava = [0, 0, 1 / (c.lavaRadius * c.lavaRadius)];
        const Plugin = CollapseLook.pluginClass();
        BABYLON.RegisterMaterialPlugin('CollapseLook', material => {
            if (!(material instanceof BABYLON.StandardMaterial)) return null;
            return new Plugin(material);
        });
    }

    // The tunnel exists: the lava channels' place, and the final pass: everything the camera sees goes
    // through the palette.
    finish(host) {
        const Sc = CollapseScene, edge = Sc.LANE_W * 1.5 + 40;
        this.lava[0] = (Sc.WALL_X + edge) / 2;
        this.lava[1] = -30;
        const S = BABYLON.Effect.ShadersStore, t = CollapseLook.lut();
        S.collapseLookPixelFragmentShader = CollapseLook.SHADER.pixel;
        const near = BABYLON.Texture.NEAREST_SAMPLINGMODE;
        const lut = BABYLON.RawTexture.CreateRGBATexture(t.data, t.w, t.h, host.scene, false, false, near);
        lut.wrapU = lut.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const pass = new BABYLON.PostProcess('collapse-look-pixel', 'collapseLookPixel', ['lookDither'], ['lookLut'], 1, host.view.camera, near, host.engine);
        pass.onApply = fx => { fx.setTexture('lookLut', lut); fx.setFloat('lookDither', this.c.dither); };
        this.pass = pass;
    }

    // Every light of the frame, in place. A torch fades in and out at the ends of the list, so a
    // light never pops when the list moves on by two segments.
    sync(run, pos, time, trainX, heat, shot) {
        const S = CollapseScene, c = this.c;
        this.frame++;
        let n = 0;
        const put = (x, y, z, r, col, k) => {
            const a = n * 4;
            this.pos[a] = x; this.pos[a + 1] = y; this.pos[a + 2] = z; this.pos[a + 3] = 1 / (r * r);
            this.col[a] = col[0] * k; this.col[a + 1] = col[1] * k; this.col[a + 2] = col[2] * k;
            n++;
        };
        const wave = (t, i) => 1 + c.flicker * Math.sin(t * 11 + i * 2.3) * Math.sin(t * 7.1 + i);
        // Torches stand on even segments, on both walls (CollapseScene._pieceMatrix).
        const first = 2 * Math.floor((pos - 2) / 2);
        for (let k = 0; k < 5; k++) {
            const i = first + 2 * k, ahead = i - pos, z = ahead * S.SEG;
            const fade = Math.max(0, Math.min(1, ahead + 2, (8 - ahead) / 2)) * (i > run.front ? 1 : 0);
            for (const side of [-1, 1]) put(side * (S.WALL_X - 60), 340, z, c.torchRadius, this.torchCol, fade * wave(time, i + side));
        }
        // Lava streams and gaps ahead and just behind: the nearest of each.
        let streams = 0, gaps = 0;
        const from = Math.floor(pos) - 1, to = Math.floor(pos) + 8;
        for (let i = from; i <= to; i++) {
            const seg = run.track.seg(i), z = (i + 0.5 - pos) * S.SEG;
            if (i <= run.front) continue;
            for (let l = 0; l < 3; l++) {
                if (seg.lava[l] && streams < 2) { streams++; put(S.laneX(l), 240, z, c.streamRadius, this.streamCol, wave(time, i)); }
                if (seg.gap[l] && gaps < 3) { gaps++; put(S.laneX(l), -90, z, c.gapRadius, this.gapCol, wave(time, i * 3)); }
            }
        }
        while (streams++ < 2) put(0, 0, 0, 1, this.streamCol, 0);
        while (gaps++ < 3) put(0, 0, 0, 1, this.gapCol, 0);
        put(0, 160, (run.front - pos) * S.SEG + 60, c.frontRadius, this.frontCol, wave(time * 1.4, 5));
        put(trainX, c.lampY, c.lampZ, c.lampRadius, this.lampCol, 1);      // the headlamp on the track ahead
        put(trainX, 360, 80, 900, this.torchCol, shot ? 1.6 : 0);          // the driver's shot
        put(trainX, 240, 120, 620, [1, 0.3, 0.1], heat * 1.5);             // the loco red-hot after lava
        const w = 1 + c.flicker * 0.6 * Math.sin(time * 3.1);
        this.lavaCol[0] = this.lavaBase[0] * w; this.lavaCol[1] = this.lavaBase[1] * w; this.lavaCol[2] = this.lavaBase[2] * w;
    }
}
