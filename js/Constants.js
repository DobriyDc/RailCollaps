// Constants.js — ALL the kit's numbers: location, camera, render. Loaded FIRST:
// the other modules read these globals. Edited by the editor (_utils/editor): the server
// patches only lines of the form `const NAME = <number>;` — keep values as numeric
// literals (colors — 0xRRGGBB); the editor won't touch a formula.
const GAME_VERSION = '0.1.0'; // build version: ?v= on scripts (tools/build.mjs) and the archive name

// localStorage shim: in a sandbox iframe and when site data is blocked, direct access throws SecurityError.
// All storage access goes through Store only.
/** @satisfies {Record<string, any>} */
const Store = {
    get(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* nothing to remove */ }
    },
    // JSON parsing that never throws: a broken value = as if there were no save.
    getJSON(key, fallback = null) {
        const raw = Store.get(key);
        if (raw === null) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : fallback;
        } catch (e) {
            console.warn('Store: повреждённое значение "' + key + '", сбрасываю.');
            Store.remove(key);
            return fallback;
        }
    }
};

// Phone or tablet: user agent, iPad posing as a Mac, touch on a small screen.
const IS_MOBILE = (() => {
    const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = Math.max(window.innerWidth, window.innerHeight) <= 1366 &&
        Math.min(window.innerWidth, window.innerHeight) <= 1024;
    const isiPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return userAgentMobile || isiPad || (hasTouchScreen && isSmallScreen);
})();

// The wide screen: the player's choice in the settings, or ?land in the address. Read once at load: camera
// COLLAPSE_LAND_*, plates at the sides (UILand.js).
const IS_LAND = Store.get('collapse.orientation') === 'land' || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('land'));

// --- LOCATION (Location3D.js, Terrain3D.js). World units are px: x to the right, y down
// the map, height up (skill world3d, §Coordinates). ---
const LOCATION_WIDTH = 2048;            // px: location width (the area the game camera stays within)
const LOCATION_HEIGHT = 2048;           // px: location height
const LOCATION_GROUND = 0;              // ground texture: 0 — grass, 1 — sand, 2 — snow (Location3D.GROUNDS)
const GROUND_TILE_SIZE = 512;           // world px per one repeat of the ground texture
const TERRAIN_NOISE_AMP = 66;           // px: hill amplitude (0 — flat ground)
const TERRAIN_NOISE_SCALE = 800;        // px: hill size
const TERRAIN_NOISE_SEED = 4;           // terrain noise seed
const TERRAIN_BASE = 0;                 // px: mean ground level
const TERRAIN_CELL = 8;                 // px: terrain grid step (mobile — no finer than 12)

// --- MODELS (Gltf3D.js) and UI (UI.js) ---
const MODEL_CLIP_BLEND_SEC = 0.2;       // s: cross-fade between animation clips of a .glb model (idle -> run); 0 — instant
const UI_REF_HEIGHT = 700;              // px: the screen height the UI layout (UILayout.js) is drawn for; the UI scales with the screen height, 0 — no scaling
const UI_REF_HEIGHT_LAND = 520;         // px: the same for ?land: a wide phone is low, the layout there is drawn for a lower screen

// --- SOUND (Sound3D.js): channel volumes; a sound with a place on the map is heard from where
// the CAMERA is — its audible region is a sphere of AUDIO_FALLOFF_MAX around it ---
const AUDIO_VOLUME_STEP = 0.1;        // settings buttons: one volume increment (0..1)
const AUDIO_MASTER_VOLUME = 0.8;        // 0..1: everything (0 — silence)
const AUDIO_MUSIC_VOLUME = 0.6;         // 0..1: the 'music' channel
const AUDIO_SFX_VOLUME = 1;             // 0..1: the 'sfx' channel — effects and object sounds
const AUDIO_FALLOFF_MIN = 150;          // px: full volume while the camera is this close to a sound (0 — it fades from the source itself)
const AUDIO_FALLOFF_MAX = 1024;         // px: from here on it is silent (fades linearly in between); an object may set its own pair. The camera stands ~800 px from its look-at point at zoom 1
const AUDIO_PAN = 0.7;                  // 0..1: how far a sound at the side of the screen goes into one ear (0 — mono)
const AUDIO_TRAIN_RATE_MIN = 0.85;      // wheels and steam: playback speed of a standing train
const AUDIO_TRAIN_RATE_MAX = 1.7;       // wheels and steam: playback speed at the top speed of the rules
const AUDIO_WHEELS_VOLUME = 0.5;        // 0..1: the wheels on the 'sfx' channel, at speed
const AUDIO_STEAM_VOLUME = 0.3;         // 0..1: the steam on the 'sfx' channel, at speed
const AUDIO_RUMBLE_VOLUME = 0.9;        // 0..1: the collapse on the 'sfx' channel, at the train's tail
const AUDIO_RUMBLE_FAR = 0.1;           // 0..1: share of that volume left at the farthest gap of the collapse
const AUDIO_RUMBLE_CURVE = 2;           // the rumble grows as nearness to this power: larger — it comes up later and harder

// --- SAMPLE GAME (Game.js): the "Run" button, the energy bar ---
const GAME_RUN_SEC = 8;                 // s: a full energy bar lasts this long while running
const GAME_REST_SEC = 4;                // s: an empty energy bar refills in this time while standing
const GAME_STEP_SEC = 0.35;             // s: between footstep sounds while the character runs

// --- RAIL LINK: COLLAPSE (CollapseRules.js — the run, CollapseScene.js — the tunnel). Distance is
// counted in track SEGMENTS; the first numbers of the prototype, tuned in playtests (GDD v3 §8) ---
const COLLAPSE_RULES_VERSION = 6;       // the version of the run rules, one season of the leaderboard: raise it when a replay of an old journal can end differently
const COLLAPSE_SEG_METERS = 10;         // m of distance shown per segment
const COLLAPSE_SPEED = 2.2;             // segments/s: train speed at the start
const COLLAPSE_SPEED_GROWTH = 0.0025;   // segments/s added per segment travelled
const COLLAPSE_SPEED_MAX = 4.5;         // segments/s: the train never goes faster on its own
const COLLAPSE_FRONT_SPEED = 1.8;       // segments/s: the collapse behind the train at the start
const COLLAPSE_FRONT_GROWTH = 0.004;    // segments/s added to the collapse per segment travelled (overtakes the train at ~2.7 km)
const COLLAPSE_FRONT_MAX = 4.8;         // segments/s: collapse speed cap (above the train's cap: boosts are needed late)
const COLLAPSE_FRONT_MAX_GAP = 6;       // segments: while it runs, the collapse never falls farther behind than this (a decelerator lets it reach the train)
const COLLAPSE_EVENT_FROM = 150;        // segments: no collapse before this point (1500 m), from here on it is a random event
const COLLAPSE_EVENT_EVERY = 50;        // segments: one roll per this stretch of the way (500 m)
const COLLAPSE_EVENT_CHANCE = 0.12;     // 0..1: chance that a stretch has a collapse
const COLLAPSE_EVENT_LEN = 50;          // segments the collapse runs before it stops (500 m)
const COLLAPSE_EVENT_GAP = 15;          // segments behind the train it starts at: out of the dark, under CollapseScene.BEHIND
const COLLAPSE_EVENT_RUSH_SEC = 4;      // s it takes to come in from that gap to COLLAPSE_FRONT_MAX_GAP: the player's warning
const COLLAPSE_EVENT_PACE = 1.12;       // at least this share of the train's own speed: a plain ride ends the event about 1.5 segments ahead of it
const COLLAPSE_BOOST_MULT = 1.5;        // accelerator: speed multiplier
const COLLAPSE_BOOST_SEC = 4;           // s: accelerator duration
const COLLAPSE_SLOW_MULT = 0.65;        // decelerator: speed multiplier
const COLLAPSE_SLOW_SEC = 3;            // s: decelerator duration
const COLLAPSE_START_AMMO = 8;          // cartridges at the start: one shot switches one fork
const COLLAPSE_AMMO_PICKUP = 4;         // cartridges per ammo pickup
const COLLAPSE_DEMON_WARN_SEC = 1;      // s: the wall icons warn of a demon before it shows on its wall
const COLLAPSE_DEMON_BLINK_HZ = 3;      // the wall icon of a demon in its warning blinks this many times a second
const COLLAPSE_DEMON_PERCH_SEC = 0.36;  // s a demon breaks out of its wall before it leaps (its three emerge frames); it can be shot from its first frame
const COLLAPSE_HP = 3;                  // lives of the train: lava and a demon's strike take one, a gap and the collapse end the run
const COLLAPSE_DEMON_STRIKE_SEC = 0.7;  // s between the strikes of a demon hanging on the train
const COLLAPSE_DEMON_SEC = 0.6;         // s of the leap: a demon not shot by its end lands on the train and hangs there
const COLLAPSE_DEMON_EVERY = 30;        // segments: a demon at most once per this distance
const COLLAPSE_DEMON_CHANCE = 0.2;      // chance that a pattern is a demon once the spacing above allows one
const COLLAPSE_DEMON_START = 60;        // segments: no demon before this distance (600 m)
const COLLAPSE_DEMON_PAIR_FROM = 120;   // segments: demons come in pairs (both walls) from this distance (1200 m)
const COLLAPSE_DEMON_PAIR_FULL = 350;   // segments: the chance of a pair grows until this distance
const COLLAPSE_DEMON_PAIR_MAX = 0.6;    // chance of a pair from DEMON_PAIR_FULL on
const COLLAPSE_DEMON_PAIR_LAG = 0.35;   // s: the second demon of a pair shows and leaps this much after the first
const COLLAPSE_SHIELD_MAX = 2;          // shields the train can carry
const COLLAPSE_RESCUE_MAX = 2;          // rescues from a fall the train can carry
const COLLAPSE_SHIELD_GAP = 6;          // segments: a shield that takes the collapse pushes it back this far
const COLLAPSE_GAP_MIN = 3;             // segments: every gap at the start; with distance the range grows to GAP_MIN_END..GAP_MAX
const COLLAPSE_GAP_MIN_END = 4;         // segments: the shortest gap at full difficulty
const COLLAPSE_GAP_MAX = 8;             // segments: the longest gap — gaps always end (GDD v3 §3)
const COLLAPSE_GAP_OVERLAP = 0.5;       // chance at full difficulty of a second gap overlapping a gap (never on a lane next to it)
const COLLAPSE_REACT_SEC = 0.6;         // s: forks stand at least this far apart at the fastest allowed speed
const COLLAPSE_CONTINUE_GAP = 8;        // segments: a continue pushes the collapse back to at least this gap
const COLLAPSE_CONTINUE_GRACE_SEC = 1.5; // s: no hazard hurts the train right after a continue
// The track generator's dice. Each pattern after a calm stretch is a demon, a gap, lava or a detour.
const COLLAPSE_DIFFICULTY_SEGS = 600;   // segments over which the generator goes from calm to dense
const COLLAPSE_CALM_START = 1;          // segments of calm between patterns at the start (+0..1 at random); a hazard has 4 more of lead
const COLLAPSE_CALM_END = 0;            // segments of calm between patterns at full difficulty (+0..1)
const COLLAPSE_GAP_SHARE = 0.52;        // share of patterns that are a gap
const COLLAPSE_LAVA_SHARE = 0.14;       // share of patterns that are a lava stream at the start
const COLLAPSE_LAVA_GROWTH = 0.1;       // lava share added at full difficulty; the rest of the patterns are detours
const COLLAPSE_HAZARD_MID = 0.5;        // share of hazards on the middle lane (1/3 — every lane alike); a train without taps stays there
const COLLAPSE_HAZARD_REWARD = 0.5;     // chance of a pickup on a safe lane beside a gap of 2+ segments
const COLLAPSE_ODDS_AMMO = 0.34;        // relative odds of each pickup kind
const COLLAPSE_ODDS_BOOST = 0.07;       // the shop sells accelerators and rescues (card 28): on the track 2.5–3 times rarer than before
const COLLAPSE_ODDS_BOOST_EMPTY = 0.13; // odds of nothing where an accelerator used to fall: the other kinds keep their places and their rate per km
const COLLAPSE_ODDS_SLOW = 0.16;
const COLLAPSE_ODDS_SHIELD = 0.15;
const COLLAPSE_ODDS_RESCUE = 0.05;
const COLLAPSE_ODDS_RESCUE_EMPTY = 0.1; // the same where a rescue used to fall
const COLLAPSE_TUTORIAL_FRONT_MULT = 0.7; // tutorial: the collapse's own speed, share of the usual one
const COLLAPSE_TUTORIAL_FRONT_GAP = 8;  // segments: tutorial: the collapse stays this far behind (softer than COLLAPSE_FRONT_MAX_GAP)
const COLLAPSE_TUTORIAL_RUSH = 4;       // segments/s: tutorial: the collapse on its step, until the accelerator is taken
const COLLAPSE_OVER_DELAY_SEC = 0.7;    // s: the fall plays before the end-of-run dialog
const COLLAPSE_ICON_PULSE_HZ = 2;       // 1/s: pulse of the icon of a hazard on the train's lane
const COLLAPSE_ICON_PULSE_AMP = 0.1;    // share of its size the icon of a hazard on the train's lane grows at the top of the pulse
const COLLAPSE_ICON_GAP = 4;            // layout px between icons lined up at the edge of the frame
const COLLAPSE_ICON_LEAD_SEC = 1;       // s: an icon over the bottom plate lights at least this long before its object enters the frame
const COLLAPSE_STATION_STRETCH = 100;   // ?stations: segments of a stretch between stations (100 — 1 km); the stop stands at the first pattern boundary after that
const COLLAPSE_STATION_APPROACH = 12;   // ?stations: segments before a stop free of hazards; the collapse stands still from here on: the gap grows by this much
const COLLAPSE_STATION_AFTER = 4;       // ?stations: segments free of hazards after a stop
const COLLAPSE_STATION_STOP_SEC = 8;    // ?stations: s the train stands at a station unless the player goes on earlier
const COLLAPSE_STATION_RESPITE_SEC = 10; // ?stations: s after the stop until the collapse is back at its usual farthest gap
const COLLAPSE_STATION_BRAKE = 6;       // ?stations: segments the train brakes before a stop and speeds up after it
const COLLAPSE_STATION_CRAWL = 0.25;    // ?stations: share of its speed the train keeps at the slowest of the brake
const COLLAPSE_STATION_HARD_STEP = 0.4; // ?stations: every station shortens the generator's way to full difficulty and raises the chance of demons by this share
const COLLAPSE_STATION_FRONT_STEP = 0.1;  // ?stations: segments/s the collapse gains with every station
const COLLAPSE_STATION_MONEY_EVERY = 2; // ?stations: a coin stands every this many segments
const COLLAPSE_STATION_MONEY_VALUE = 5; // ?stations: money per coin
const COLLAPSE_STATION_MONEY_SWITCH = 0.2; // ?stations: chance that the line of coins moves to another lane
const COLLAPSE_STATION_PRICE_AMMO = 30; // ?stations: price of an ammo crate (COLLAPSE_AMMO_PICKUP cartridges)
const COLLAPSE_STATION_PRICE_SHIELD = 50; // ?stations: price of a shield
const COLLAPSE_STATION_PRICE_RESCUE = 80; // ?stations: price of a rescue
const COLLAPSE_STATION_TINT_0 = 0xffffff; // ?stations: the light of the first stretch, then of every next one in turn
const COLLAPSE_STATION_TINT_1 = 0x9fd0ff;
const COLLAPSE_STATION_TINT_2 = 0xb8ff9a;
const COLLAPSE_STATION_TINT_3 = 0xe0a0ff;
const COLLAPSE_RENDER_HEIGHT = 360;     // px: the tunnel is rendered this tall and scaled up without smoothing (docs/STYLE.md)
const COLLAPSE_CAM_Y = 400;             // world units: camera height above the rails
const COLLAPSE_CAM_Z = 1482;            // world units: camera distance in front of the train
const COLLAPSE_CAM_TOP_GAP = 0.06;      // share of the frame's height between the top of the loco and the top plate; the camera tilts to this gap on every screen
const COLLAPSE_CAM_SIGN = 0.5;          // where a fork sign stands from its lane toward the next one, share of the lane step: the close camera sees a narrow strip of the track, and a sign out at the side enters late
const COLLAPSE_CAM_SIGN_SCALE = 0.95;      // multiplier of the fork signs' size
const COLLAPSE_CAM_FRONT_Y = -350;      // world units: the column layer of the collapse goes down this far, the farther ones more: the close camera sees little of the height, and their arches would stay above the frame
const COLLAPSE_CAM_FOV_DEG = 40;        // vertical field of view of the tunnel camera (narrow: the side lanes stay in a 9:19.5 frame)
const COLLAPSE_CAM_FOLLOW = 0.7;        // 0..1: share of the train's sideways offset the camera follows (0 — fixed on the center lane)
const COLLAPSE_CAM_FOLLOW_RATE = 8;     // 1/s: how fast the camera eases toward that offset (larger — stiffer)
const COLLAPSE_LAND_CAM_Y = 760;        // world units: camera height with ?land: higher and steeper, the low frame shows more track
const COLLAPSE_LAND_CAM_Z = 1500;       // world units: camera distance in front of the train with ?land
const COLLAPSE_LAND_CAM_FOV_DEG = 44;   // vertical field of view with ?land
const COLLAPSE_LAND_CAM_FOLLOW = 0.35;  // 0..1: share of the train's sideways offset the camera follows with ?land: all three lanes fit
const COLLAPSE_FOG_START = 1200;         // world units behind the train where the tunnel starts to fade into the dark
const COLLAPSE_FOG_END = 5600;          // world units behind the train where it is gone (the vanishing point stays dark)
const COLLAPSE_BRICK_LEVEL = 1.25;      // brightness of the walls, vault and arch ribs over their pixel art (1 — as drawn)
const COLLAPSE_LAVA_LEVEL = 1.3;        // brightness of the lava over its pixel art
const COLLAPSE_SWITCH_HIT_SEC = 0.14;   // s: the sparks of the driver's shot on a fork's lever; the lever and the points go over after them
const COLLAPSE_SWITCH_THROW_SEC = 0.12; // s: the thrown lever comes up to its armed size
const COLLAPSE_BG_DEPTH = 90;           // world units per unit of the layers' relative depth (48/36/24/12 of the manifest): the far layer stands 3240 behind the rubble
const COLLAPSE_BG_PX = 3.4;             // world units per art pixel of the rubble layer; the farther layers grow with depth, one pixel size on screen at COLLAPSE_BG_REF_GAP
const COLLAPSE_BG_REF_GAP = 5;          // segments: the gap between the train and the collapse where all the layers have the same pixel on screen
const COLLAPSE_BG_SLOPE_DEG = 12;       // degrees: how steeply the rows of the rubble under its broken rails lie down on the floor
const COLLAPSE_CHUNK_ART = 4;           // world units per art pixel of the falling chunks of the collapse
const COLLAPSE_TRAIN_ROLL_DEG = 3;      // degrees the loco leans toward the new lane at the steepest point of a fork: more lifts its wheels off the rails
const COLLAPSE_TRAIN_SQUEEZE = 0.14;    // share of the loco's width lost at the steepest point of a fork: it turns its side
const COLLAPSE_FLOW_FADE_FROM = 450;    // world units ahead of the train: a lava stream is fully drawn from here to the train
const COLLAPSE_FLOW_FADE_TO = 950;      // world units ahead of the train: from here to the camera a stream is not drawn
const COLLAPSE_TRAIN_TURN_FROM = 0.15;  // 0..1: share of a fork's steepest point from which the drawn turn frame replaces the run frames
const COLLAPSE_CRACK_ZONE = 5;          // segments ahead of the collapse with glowing cracks on walls and vault
const COLLAPSE_CRACK_LEVEL = 1.8;       // brightness of the cracks over their pixel art
const COLLAPSE_DEBRIS_LEAD = 1;         // segments ahead of the collapse where the vault starts to shed blocks
const COLLAPSE_RUIN_STEP_MAX = 3;       // sections one blow of the collapse takes at most (the view only: the rules' front is smooth)
const COLLAPSE_RUIN_BREAK = 0.3;        // 0..1: chance that a blow ends at a section: smaller — rarer, larger blows
const COLLAPSE_RUIN_RIPPLE_SEC = 0.09;  // s between the sections of one blow, the farthest first
const COLLAPSE_RUIN_FALL_RATE = 2.4;    // how fast what was struck falls: segments of the fall curve per s
const COLLAPSE_RUIN_RIB_SAG = 500;      // world units: an arch the collapse has reached comes down this far: the close camera sees no higher than the loco
const COLLAPSE_RUIN_NEAR_GAP = 6;       // segments: from this gap between the edge and the train the blows start to be felt on the train
const COLLAPSE_RUIN_NEAR_CHUNKS = 5;    // big pieces beside the train from a blow right behind it (one from a far blow)
const COLLAPSE_RUIN_JOLT = 30;          // world units: the camera's jolt from a blow right behind the train (a tenth of it from a far one)
const COLLAPSE_RUIN_JOLT_SEC = 0.3;     // s: the jolt fades out
const COLLAPSE_RUIN_LAND_SEC = 0.4;     // s a new stand of the wreck comes down
const COLLAPSE_FX_FALL_TILT_DEG = 22;   // degrees the loco tips over as it falls into a gap
const COLLAPSE_FX_SHAKE = 24;           // world units: camera shake of a demon hit (fades out)
const COLLAPSE_FX_SHAKE_SEC = 0.35;     // s: camera shake of a demon hit
const COLLAPSE_FX_FLASH_SEC = 0.15;     // s: the red screen flash of a demon hit (element hitFlash in UILayout.js)
const COLLAPSE_FX_HEAT_SEC = 0.5;       // s: the loco glows red-hot after lava from above
// The look (CollapseLook.js, docs/STYLE.md): light in the tunnel and the final palette pass.
const COLLAPSE_LOOK_DITHER = 0.09;      // 0..1: strength of the ordered dithering before the palette
const COLLAPSE_LOOK_AMBIENT = 0.3;      // light that reaches every surface (the rest comes from lava and torches)
const COLLAPSE_LOOK_BOUNCE = 0.35;      // share of the lava's light thrown back from below on what faces down or sideways
const COLLAPSE_LOOK_LAMP_POWER = 1.8;   // strength of the loco's headlamp on the track ahead
const COLLAPSE_LOOK_LAMP_RADIUS = 2400; // world units: where the headlamp's light ends
const COLLAPSE_LOOK_LAMP_Y = 600;       // world units: the headlamp's height above the rails
const COLLAPSE_LOOK_LAMP_Z = 700;       // world units: the headlamp's place on the track ahead of the train
const LOOK_LAMP_COLOR = 0xfff2dc;       // headlamp color: nearly white, it shows the iron of the loco as it is
const COLLAPSE_LOOK_FLICKER = 0.18;     // 0..1: how much the flames breathe
const COLLAPSE_LOOK_TORCH_POWER = 1.4;  // strength of a torch
const COLLAPSE_LOOK_TORCH_RADIUS = 900; // world units: where a torch's light ends
const LOOK_TORCH_COLOR = 0xffa858; // torch light color
const COLLAPSE_LOOK_LAVA_POWER = 1.2;   // strength of the lava channels along the walls
const COLLAPSE_LOOK_LAVA_RADIUS = 620;  // world units: where the channels' light ends
const LOOK_LAVA_COLOR = 0xff5a18; // lava light color
const COLLAPSE_LOOK_FRONT_POWER = 1.6;  // strength of the collapse front
const COLLAPSE_LOOK_FRONT_RADIUS = 1500; // world units: where the front's light ends
const COLLAPSE_LOOK_STREAM_POWER = 1.3; // strength of a lava stream from the vault
const COLLAPSE_LOOK_STREAM_RADIUS = 760; // world units: where a stream's light ends
const COLLAPSE_LOOK_GAP_POWER = 1.1;    // strength of the magma seen in a gap
const COLLAPSE_LOOK_GAP_RADIUS = 560;   // world units: where a gap's light ends

// --- LEADERBOARD: the shared table on a Cloudflare Worker (js/Leaderboard.js — the game,
// server/leaderboard — the function; tools/build-worker.mjs bakes these numbers into it, so a change
// of a server number needs a new deploy). A season of the table is COLLAPSE_RULES_VERSION. ---
const LEADERBOARD_URL = '';             // address of the function without a trailing slash; '' — no requests, no table button
const LEADERBOARD_TIMEOUT_MS = 6000;    // ms: the game drops a request after this long
const LEADERBOARD_PAGE_ROWS = 10;       // rows on one page of the table screen
const LEADERBOARD_TOP = 100;            // rows the function returns
const LEADERBOARD_AUTH_MAX_SEC = 86400; // s: oldest initData the function accepts; Telegram signs it once when the app opens, so this outlives a session
const LEADERBOARD_RATE_MAX = 20;        // requests of one player per window
const LEADERBOARD_RATE_WINDOW_SEC = 60; // s: the window of that limit
const LEADERBOARD_MAX_STEPS = 36000;    // fixed steps a replay may take (10 min of run): the bound of the function's CPU
const LEADERBOARD_MAX_LOG = 4000;       // actions in one journal
const LEADERBOARD_MAX_BODY = 65536;     // bytes of one score request
const LEADERBOARD_NAME_MAX = 24;        // characters of a shown name
const COLLAPSE_TRAIN_STARS = 100;        // Telegram Stars one train of the shop costs: about 2 $ to a buyer (docs/monetization.md)
const COLLAPSE_SHOP_OPEN = 0;           // 1 — the shop sells trains; the table works without it (docs/monetization.md)
const TELEGRAM_APP_URL = 'https://t.me/railcollapsebot/play'; // the direct link of the Mini App: a challenge goes through it
const TELEGRAM_SHARE_URL = 'https://t.me/share/url';          // Telegram's dialog that sends a link to a chat

// --- ADS: the rewarded ad that continues a run (js/Ads.js, docs/monetization.md). An empty id turns its
// network off; the ids are public, they go into the page. ---
const ADS_ADSGRAM_BLOCK = '';           // Adsgram: the id of the Reward block; 57499 goes here after its moderation
const ADS_ADSGRAM_SCRIPT = 'https://sad.adsgram.ai/js/sad.min.js';
const ADS_MONETAG_ZONE = '12172659';    // Monetag: the zone of the Rewarded Interstitial
const ADS_MONETAG_SCRIPT = 'https://libtl.com/sdk.js'; // Monetag: the address of sdk.js from the tag in its dashboard
const ADS_WAIT_MS = 8000;               // ms: a network's script or ad that takes longer passes the offer on

// --- CAMERA (CameraControl.js): target on the map, azimuth, pitch and zoom. Zoom is
// screen px per world px at the look-at point; distance is derived from it. Flight
// (WASD, Q/E) lifts the look-at point off the ground. ---
const CAMERA_FOV_DEG = 52;              // vertical field of view
const CAMERA_AZIMUTH_DEG = -90;         // where the camera looks on the map: −90 — north up, 0 — east up
const CAMERA_PITCH_DEG = 57;            // pitch toward the ground: 90 — straight from above, less — more perspective
const CAMERA_ZOOM = 1;                  // starting zoom: PC and tablets
const CAMERA_ZOOM_MOBILE = 0.7;         // starting zoom: phones (longer screen side < 1024)
const CAMERA_ZOOM_MIN = 0.5;            // wheel and pinch won't zoom out further (below this the ground edge gets into the frame)
const CAMERA_ZOOM_MAX = 3;              // won't zoom in closer
const CAMERA_ZOOM_WHEEL_STEP = 0.12;    // fraction of zoom per one wheel notch
const CAMERA_ZOOM_LERP = 0.18;          // zoom smoothing: fraction of the remainder per frame
const CAMERA_FOLLOW_LERP = 0.05;        // following an object (follow): fraction of the remainder per frame
const CAMERA_FLY_SPEED = 900;           // flight on WASD, arrows and Q/E: screen px/s (over the world — divided by zoom)
const CAMERA_LIMITS = 0;                // game camera limits: 0 — free flight, 1 — pitch within CAMERA_ORBIT_PITCH_*, target inside the location, flight ceiling; the ground edge stays out of the frame
const CAMERA_LIFT_MAX = 600;            // px, with limits: how high above the ground flight lifts the look-at point (higher — the ground edge gets into the frame)
const CAMERA_ORBIT = 1;                 // camera rotation by the player (RMB: look-around, orbit while following an object): 0 — orientation fixed, 1 — allowed
const CAMERA_ORBIT_DEG_PER_PX = 0.3;    // degrees of rotation per screen px of drag
const CAMERA_ORBIT_PITCH_MIN_DEG = 35;  // with limits: won't go lower toward the ground (the limit also rises on its own — ground edge stays out of the frame)
const CAMERA_ORBIT_PITCH_MAX_DEG = 88;  // with limits: higher — almost straight from above

// --- RENDER (World3D.js): light, shadows, sky, materials, toon and ink edges. Read by
// World3D.cfg(); the editor applies edits to the live scene. ---
// One sun for the whole world. Azimuth — WHERE the shadow falls on the map (0 — right, 90 — down).
const WORLD3D_SUN_AZIMUTH_DEG = 32;
const WORLD3D_SUN_ELEVATION_DEG = 41;   // sun elevation above the horizon
const WORLD3D_SUN_INTENSITY = 0.8;      // sun strength (with the sky it sums to ~1.0 on flat ground — texture colors unchanged)
const WORLD3D_SUN_COLOR = 0xffedc7;     // sun color
const WORLD3D_SKYLIGHT_INTENSITY = 0.45; // diffuse sky light (hemispheric light source)
const WORLD3D_SKYLIGHT_COLOR = 0xb1d8f7; // sky light color (faces looking up)
const WORLD3D_GROUNDLIGHT_COLOR = 0xc2c7ad; // fill light from below (reflection off the ground)
const WORLD3D_SKY_COLOR = 0x8fc3e0;     // sky and fog color
const WORLD3D_FOG_DENSITY = 0.00032;    // exponential fog toward the horizon (0 — off)
// Shadows: one color for all (painted by the toon plugin, Babylon only provides sun visibility)
const WORLD3D_SHADOW_COLOR = 0x0f3a4d;  // shadow color
const WORLD3D_SHADOW_STRENGTH = 0.52;    // shadow strength 0..1: a surface in shadow is multiplied by a blend of white and the shadow color
const WORLD3D_SHADOW_SOFT = 2;          // edge: 0 — hard (for toon), 1..3 — PCF low/medium/high (mobile — no higher than 1)
const WORLD3D_SHADOW_MAP = 1024;        // shadow map size (mobile — half as large); takes effect with a new scene
const WORLD3D_SHADOW_RADIUS = 840;      // px: LIMIT of the shadow ortho frustum half-size; the frustum itself shrinks to the objects in the frame
const WORLD3D_SHADOW_BIAS = 0.001;     // depth bias against shadow acne (shadow stripes on lit faces)
const WORLD3D_SHADOW_NORMAL_BIAS = 0.8; // bias along the normal against shadow acne (stripes and sawtooth on faces at an acute angle to the sun), in shadow map texels on top of the edge smoothing radius (the engine adds it)
// Materials by group (specular highlight — fraction 0..1, size — exponent: larger — smaller highlight)
const WORLD3D_GROUND_SPECULAR = 0;      // ground specular highlight (0 — matte)
const WORLD3D_GROUND_SPEC_POWER = 1;    // ground specular highlight size
const WORLD3D_OUTER_TINT = 1;           // ground brightness BEYOND the location edge (less than 1 — the location boundary is visible)
const WORLD3D_PROP_SPECULAR = 0.05;     // environment specular highlight (group 'prop')
const WORLD3D_PROP_SPEC_POWER = 7;     // environment specular highlight size
const WORLD3D_ACTOR_SPECULAR = 0;       // main objects specular highlight (group 'actor'); with toon — toon glint brightness
const WORLD3D_ACTOR_SPEC_POWER = 23;    // main objects specular highlight size
// Toon shader (ArcToonPlugin): light from all sources (sun + sky, with shadow) is quantized into bands
const WORLD3D_TOON = 1;                 // 1 — toon shading with the silhouette outline and the edge lines, 0 — regular smooth shading without them
const WORLD3D_TOON_BANDS = 4;           // number of light bands (2..6)
const WORLD3D_TOON_SOFT = 0.02;         // band boundary softness (0 — sharp, 0.5 — almost smooth)
const WORLD3D_TOON_LOW = 0.48;          // brightness of the darkest band (fraction of full)
const WORLD3D_TOON_GROUND = 1;          // 1 — bands on the ground too, 0 — ground is shaded smoothly
const WORLD3D_TOON_SPEC = 0.25;            // toon glint highlight strength (0 — no highlight)
const WORLD3D_TOON_SPEC_SIZE = 0.075;    // highlight threshold (smaller — larger spot)
const WORLD3D_TOON_RIM = 0.28;           // bright rim light along the objects' silhouette edge (0 — none)
const WORLD3D_TOON_RIM_WIDTH = 0.24;    // rim light width
// Ink edges (EdgesRenderer): edges creased more sharply than the threshold — on every object of
// the scene, a skinned character too (its lines follow the bones). Only when WORLD3D_TOON = 1
const WORLD3D_TOON_INK = 2;             // 0 — none, 1 — main objects, 2 — environment too (only when WORLD3D_TOON = 1)
const WORLD3D_TOON_INK_WIDTH = 20;      // line thickness (≈ world px × 100; thinner as the camera moves away)
const WORLD3D_TOON_INK_COLOR = 0x171717; // ink color: ink edges and silhouette outline
const WORLD3D_TOON_INK_ANGLE = 40;      // °: an edge is drawn if the faces are creased more sharply
// Outer silhouette outline: post-effect (HighlightLayer, isStroke), thickness — in screen px
const WORLD3D_TOON_OUTLINE = 2;         // 0 — none, 1 — main objects, 2 — environment too (only when WORLD3D_TOON = 1)
const WORLD3D_TOON_OUTLINE_ACTOR_WIDTH = 1;   // screen px: main objects outline
const WORLD3D_TOON_OUTLINE_PROP_WIDTH = 1;  // screen px: environment outline (there is a lot of it in the frame — thinner)

// Dashboard reaction hold, in seconds of active run time.
const UI_PORTRAIT_SEC = 0.9;
const UI_PORTRAIT_TENSE_GAP = 0.5;
