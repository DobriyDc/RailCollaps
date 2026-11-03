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
    const run = CollapseStationRun.replay(body.seed, body.log, LEADERBOARD_MAX_STEPS);
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

// The bot's welcome. Telegram posts updates to /bot with the secret of setWebhook in a header. The answer
// to an update is the message itself: the token is needed only for the words of the menu button.
const GAME_URL = 'https://dobriydc.github.io/RailCollaps/';
const WELCOME_PHOTO = GAME_URL + 'server/leaderboard/welcome.png';
const WELCOME = {
    ru: {
        play: '▶ Играть',
        text: '<b>Машинист, на пост.</b>\n\nТоннель рушится за спиной, впереди лава, провалы и демоны. Тормозить нельзя.\n\n' +
            '• Стреляй по рычагам и переводи стрелки\n• Сбивай демонов, пока они не разнесли кабину\n• Уходи от обвала как можно дальше\n\n' +
            'Рейс длится около минуты. Сколько метров продержишься?',
    },
    en: {
        play: '▶ Play',
        text: '<b>Engineer, to your post.</b>\n\nThe tunnel is falling behind you. Ahead lie lava, gaps and demons. There is no stopping.\n\n' +
            '• Shoot the levers to switch tracks\n• Gun down demons before they wreck the cab\n• Outrun the collapse as far as you can\n\n' +
            'A trip takes about a minute. How many meters can you last?',
    },
};

// Compares through HMAC: the time does not tell how much of the secret matched.
async function sameSecret(secret, sent) {
    const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    return crypto.subtle.verify('HMAC', key, await crypto.subtle.sign('HMAC', key, bytes(sent)), bytes(secret));
}

const botCall = (token, method, params) => fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
});

// The menu button has no language_code, so its words are set chat by chat. A failure costs only the words:
// the button stays as it was and the welcome still goes out.
async function wordMenuButton(token, chatId, text) {
    try {
        await botCall(token, 'setChatMenuButton', { chat_id: chatId, menu_button: { type: 'web_app', text, web_app: { url: GAME_URL } } });
    } catch (e) { /* see above */ }
}

// The shop. /invoice asks Telegram for a link and the game opens it. Telegram then asks /bot whether the
// order stands, within ten seconds, and reports the payment there. Only that report gives the train; a
// refund takes it back by its charge id. A train changes only the look of a run, so the table ignores it.
// A donation is the same road with the sum the player typed: it gives nothing and is kept apart.
const TRAINS = ['hell', 'rune', 'bio'];
const DONATION = 'donation';
const donationSum = n => Number.isInteger(n) && n >= COLLAPSE_DONATE_MIN && n <= COLLAPSE_DONATE_MAX;
const STARS = 'XTR';
const TERMS_URL = GAME_URL + 'terms.html';
const SUPPORT_URL = 'https://t.me/PatrKir306';
const SHOP = {
    ru: {
        trains: { hell: 'Адский паровоз', rune: 'Рунный экспресс', bio: 'Хитиновый поезд' },
        about: 'Новый вид поезда в Rail Link: Collapse. Меняет только внешний вид. Спасибо за поддержку!',
        donation: 'Поддержка разработчика',
        donationAbout: 'Добровольная поддержка Rail Link: Collapse. Ничего не покупает, просто спасибо!',
        donationThanks: 'Спасибо за поддержку! Это очень помогает игре.',
        refused: 'Этот заказ уже не действует. Открой магазин заново.',
        thanks: 'Спасибо за поддержку! Поезд уже в депо.',
        terms: 'Условия покупки: ' + TERMS_URL,
        support: 'Вопрос по покупке? Напиши сюда: ' + SUPPORT_URL + '\n\nПоддержка Telegram не помогает с покупками в этом боте.',
    },
    en: {
        trains: { hell: 'Infernal Engine', rune: 'Rune Express', bio: 'Chitin Beast' },
        about: 'A new look for your train in Rail Link: Collapse. It changes only the appearance. Thank you for your support!',
        donation: 'Support the developer',
        donationAbout: 'A voluntary tip for Rail Link: Collapse. It buys nothing, it is just a thank-you!',
        donationThanks: 'Thank you for your support! It really helps the game.',
        refused: 'This order is no longer valid. Open the shop again.',
        thanks: 'Thank you for your support! The train is in the depot.',
        terms: 'Terms of purchase: ' + TERMS_URL,
        support: 'A question about a purchase? Write here: ' + SUPPORT_URL + '\n\nTelegram support cannot help with purchases in this bot.',
    },
};

const ownsTrain = (db, id, item) => db.prepare('SELECT 1 AS yes FROM purchases WHERE user_id = ?1 AND item = ?2').bind(id, item).first();

async function postInvoice(request, env, me) {
    let body = null;
    try { body = JSON.parse(await request.text()); } catch (e) { /* refused below */ }
    const words = body?.lang === 'ru' ? SHOP.ru : SHOP.en;
    let invoice = null;
    if (body?.item === DONATION) {
        if (!donationSum(body.stars)) return refuse(400, 'bad_sum');
        invoice = { title: words.donation, description: words.donationAbout, amount: body.stars };
    } else {
        if (!body || !TRAINS.includes(body.item)) return refuse(400, 'bad_item');
        if (await ownsTrain(env.DB, me.id, body.item)) return refuse(409, 'owned');
        invoice = { title: words.trains[body.item], description: words.about, amount: COLLAPSE_TRAIN_STARS };
    }
    const answer = await (await botCall(env.BOT_TOKEN, 'createInvoiceLink', {
        title: invoice.title, description: invoice.description, payload: body.item, provider_token: '', currency: STARS,
        prices: [{ label: invoice.title, amount: invoice.amount }],
    })).json();
    if (!answer.ok) return refuse(502, 'no_invoice');
    return reply(200, { link: answer.result });
}

async function getInventory(env, me) {
    const { results } = await env.DB.prepare('SELECT item FROM purchases WHERE user_id = ?1').bind(me.id).all();
    return reply(200, { items: results.map(r => r.item) });
}

const asked = message => (/^\/(start|terms|paysupport)(\s|$)/.exec(message.text || '') || [])[1];

// The answer to an update is one Bot API call: Telegram makes it for us.
const botAnswer = call => new Response(JSON.stringify(call), { headers: { 'Content-Type': 'application/json' } });
const botQuiet = () => new Response(null, { status: 200 });

async function checkoutAnswer(env, query) {
    const stands = query.currency === STARS && (query.invoice_payload === DONATION ? donationSum(query.total_amount)
        : TRAINS.includes(query.invoice_payload) && query.total_amount === COLLAPSE_TRAIN_STARS && !await ownsTrain(env.DB, query.from.id, query.invoice_payload));
    const call = { method: 'answerPreCheckoutQuery', pre_checkout_query_id: query.id, ok: stands };
    if (!stands) call.error_message = (query.from.language_code === 'ru' ? SHOP.ru : SHOP.en).refused;
    return botAnswer(call);
}

// A retried report of one payment changes nothing: the row is already there.
async function paymentAnswer(env, message, shop) {
    const paid = message.successful_payment;
    if (paid.currency !== STARS) return botQuiet();
    if (paid.invoice_payload === DONATION) {
        await env.DB.prepare('INSERT INTO donations (charge_id, user_id, stars, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (charge_id) DO NOTHING')
            .bind(paid.telegram_payment_charge_id, message.from.id, paid.total_amount, Math.floor(Date.now() / 1000)).run();
        return botAnswer({ method: 'sendMessage', chat_id: message.chat.id, text: shop.donationThanks });
    }
    if (!TRAINS.includes(paid.invoice_payload)) return botQuiet();
    await env.DB.prepare(
        'INSERT INTO purchases (user_id, item, charge_id, stars, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (user_id, item) DO NOTHING',
    ).bind(message.from.id, paid.invoice_payload, paid.telegram_payment_charge_id, paid.total_amount, Math.floor(Date.now() / 1000)).run();
    return botAnswer({ method: 'sendMessage', chat_id: message.chat.id, text: shop.thanks });
}

async function botUpdate(request, env) {
    if (request.method !== 'POST' || !env.BOT_WEBHOOK_SECRET || !env.DB) return new Response(null, { status: 404 });
    const sent = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (!await sameSecret(env.BOT_WEBHOOK_SECRET, sent)) return new Response(null, { status: 403 });
    let update = null;
    try { update = JSON.parse(await request.text()); } catch (e) { /* nothing to answer: below */ }
    if (update?.pre_checkout_query) return checkoutAnswer(env, update.pre_checkout_query);
    const message = update?.message;
    if (message?.chat?.type !== 'private') return botQuiet();
    const russian = message.from?.language_code === 'ru', shop = russian ? SHOP.ru : SHOP.en, chat_id = message.chat.id;
    if (message.successful_payment) return paymentAnswer(env, message, shop);
    if (message.refunded_payment) {
        const charge = message.refunded_payment.telegram_payment_charge_id;
        await env.DB.prepare('DELETE FROM purchases WHERE charge_id = ?1').bind(charge).run();
        await env.DB.prepare('DELETE FROM donations WHERE charge_id = ?1').bind(charge).run();
        return botQuiet();
    }
    const command = asked(message);
    if (command === 'terms') return botAnswer({ method: 'sendMessage', chat_id, text: shop.terms });
    if (command === 'paysupport') return botAnswer({ method: 'sendMessage', chat_id, text: shop.support });
    if (command !== 'start') return botQuiet();
    const words = russian ? WELCOME.ru : WELCOME.en;
    if (env.BOT_TOKEN) await wordMenuButton(env.BOT_TOKEN, chat_id, words.play);
    return botAnswer({
        method: 'sendPhoto', chat_id, photo: WELCOME_PHOTO, caption: words.text, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: words.play, web_app: { url: GAME_URL } }]] },
    });
}

export default {
    async fetch(request, env) {
        if (new URL(request.url).pathname === '/bot') return botUpdate(request, env);
        if (request.headers.get('Origin') !== ORIGIN) {
            return new Response(JSON.stringify({ error: 'bad_origin' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' } });
        }
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, POST',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' } });
        }
        const route = request.method + ' ' + new URL(request.url).pathname;
        if (!['POST /score', 'GET /top', 'POST /invoice', 'GET /inventory'].includes(route)) return refuse(404, 'not_found');
        if (!env.BOT_TOKEN || !env.DB) return refuse(500, 'not_configured');

        const me = await player(request, env);
        if (me.error) return refuse(401, me.error);
        if (!await underLimit(env.DB, me.id)) return refuse(429, 'rate_limited', { 'Retry-After': String(LEADERBOARD_RATE_WINDOW_SEC) });
        if (route === 'GET /inventory') return getInventory(env, me);
        if (route === 'POST /invoice') return postInvoice(request, env, me);
        return route === 'GET /top' ? getTop(env, me) : postScore(request, env, me);
    },
};
