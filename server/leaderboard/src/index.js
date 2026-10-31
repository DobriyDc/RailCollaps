// index.js — the leaderboard function (Cloudflare Worker + D1). POST /score replays the run with the
// game's own rules and keeps the player's best of the season; GET /top gives the top and the player's
// place. A request proves who sent it with the signed initData of Telegram, nothing else is trusted.
//
// tools/build-worker.mjs puts this file after the numbers of js/Constants.js and js/CollapseRules.js
// into dist/worker.js: COLLAPSE_RULES_VERSION, LEADERBOARD_* and CollapseRun are its neighbours there.
// Secret BOT_TOKEN (wrangler secret put), database DB (wrangler.toml, schema.sql).

const ORIGIN = 'https://dobriydc.github.io';
const CORS = { 'Access-Control-Allow-Origin': ORIGIN, 'Vary': 'Origin' };

const reply = (status, body, headers = {}) => new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...headers },
});
const refuse = (status, error, headers) => reply(status, { error }, headers);

const bytes = s => new TextEncoder().encode(s);
const hmacKey = (raw, use) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [use]);

// The check of Telegram (skill telegram-miniapp): secret_key = HMAC(key "WebAppData", message token),
// hash = HMAC(key secret_key, message data_check_string). verify compares in constant time.
async function signedBy(token, params, hash) {
    if (!/^[0-9a-f]{64}$/.test(hash)) return false;
    const secret = await crypto.subtle.sign('HMAC', await hmacKey(bytes('WebAppData'), 'sign'), bytes(token));
    const check = [...params].filter(([k]) => k !== 'hash').map(([k, v]) => k + '=' + v).sort().join('\n');
    const expected = Uint8Array.from(hash.match(/../g), b => parseInt(b, 16));
    return crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), expected, bytes(check));
}

const showName = user => {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return [...name].slice(0, LEADERBOARD_NAME_MAX).join('') || 'Игрок';
};

// Authorization: tma <initData> -> { id, name } of the player, or a refusal in `error`.
async function player(request, env) {
    const header = request.headers.get('Authorization') || '';
    if (!header.startsWith('tma ')) return { error: 'no_auth' };
    const params = new URLSearchParams(header.slice(4));
    if (!await signedBy(env.BOT_TOKEN, params, params.get('hash') || '')) return { error: 'bad_auth' };
    const age = Date.now() / 1000 - Number(params.get('auth_date'));
    if (!(age <= LEADERBOARD_AUTH_MAX_SEC)) return { error: 'expired' };
    let user = null;
    try { user = JSON.parse(params.get('user')); } catch (e) { /* a signed string without a user: below */ }
    if (!user || !Number.isSafeInteger(user.id)) return { error: 'bad_auth' };
    return { id: user.id, name: showName(user) };
}

// One row per player, the counter of the current window: true while the player is under the limit.
async function underLimit(db, id) {
    const win = Math.floor(Date.now() / 1000 / LEADERBOARD_RATE_WINDOW_SEC);
    const row = await db.prepare(
        'INSERT INTO rate (user_id, win, hits) VALUES (?1, ?2, 1) ON CONFLICT (user_id) DO UPDATE SET ' +
        'hits = CASE WHEN rate.win = excluded.win THEN rate.hits + 1 ELSE 1 END, win = excluded.win RETURNING hits',
    ).bind(id, win).first();
    return row.hits <= LEADERBOARD_RATE_MAX;
}

// The place of a row: the same order as the top (meters down, then the earlier, then the id).
const placeOf = (db, season, row, id) => db.prepare(
    'SELECT COUNT(*) + 1 AS place FROM scores WHERE season = ?1 AND ' +
    '(meters > ?2 OR (meters = ?2 AND (at < ?3 OR (at = ?3 AND user_id < ?4))))',
).bind(season, row.meters, row.at, id).first();

const scoreOf = (db, season, id) => db.prepare('SELECT meters, at FROM scores WHERE season = ?1 AND user_id = ?2').bind(season, id).first();

const isScore = b => !!b && Number.isInteger(b.rules) && Number.isInteger(b.meters) &&
    Number.isInteger(b.seed) && b.seed >= 0 && b.seed <= 0xffffffff &&
    Array.isArray(b.log) && b.log.length <= LEADERBOARD_MAX_LOG && b.log.every(Array.isArray);

async function postScore(request, env, me) {
    const text = await request.text();
    if (bytes(text).length > LEADERBOARD_MAX_BODY) return refuse(413, 'too_large');
    let body = null;
    try { body = JSON.parse(text); } catch (e) { /* refused below */ }
    if (!isScore(body)) return refuse(400, 'bad_request');
    const season = COLLAPSE_RULES_VERSION;
    if (body.rules !== season) return refuse(409, 'rules_version');
    const run = CollapseRun.replay(body.seed, body.log, LEADERBOARD_MAX_STEPS);
    if (!run) return refuse(422, 'bad_replay');
    if (run.meters !== body.meters) return refuse(422, 'meters_mismatch');
    await env.DB.prepare(
        'INSERT INTO scores (season, user_id, name, meters, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (season, user_id) ' +
        'DO UPDATE SET name = excluded.name, meters = excluded.meters, at = excluded.at WHERE excluded.meters > scores.meters',
    ).bind(season, me.id, me.name, run.meters, Math.floor(Date.now() / 1000)).run();
    const best = await scoreOf(env.DB, season, me.id);
    const { place } = await placeOf(env.DB, season, best, me.id);
    return reply(200, { season, meters: run.meters, best: best.meters, place });
}

async function getTop(env, me) {
    const season = COLLAPSE_RULES_VERSION;
    const { results } = await env.DB.prepare(
        'SELECT user_id, name, meters FROM scores WHERE season = ?1 ORDER BY meters DESC, at ASC, user_id ASC LIMIT ?2',
    ).bind(season, LEADERBOARD_TOP).all();
    const rows = results.map((r, i) => ({ place: i + 1, name: r.name, meters: r.meters, me: r.user_id === me.id }));
    const mine = await scoreOf(env.DB, season, me.id);
    const place = mine ? (await placeOf(env.DB, season, mine, me.id)).place : 0;
    return reply(200, { season, rows, me: mine ? { place, meters: mine.meters } : null });
}

export default {
    async fetch(request, env) {
        if (request.headers.get('Origin') !== ORIGIN) {
            return new Response(JSON.stringify({ error: 'bad_origin' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' } });
        }
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, POST',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' } });
        }
        const route = request.method + ' ' + new URL(request.url).pathname;
        if (route !== 'POST /score' && route !== 'GET /top') return refuse(404, 'not_found');
        if (!env.BOT_TOKEN || !env.DB) return refuse(500, 'not_configured');

        const me = await player(request, env);
        if (me.error) return refuse(401, me.error);
        if (!await underLimit(env.DB, me.id)) return refuse(429, 'rate_limited', { 'Retry-After': String(LEADERBOARD_RATE_WINDOW_SEC) });
        return route === 'GET /top' ? getTop(env, me) : postScore(request, env, me);
    },
};
