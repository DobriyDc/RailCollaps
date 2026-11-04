// Leaderboard.js — the shared table in the game: the end of a run goes to the function
// (server/leaderboard, it replays the journal and keeps the meters itself), the table screen shows
// what the function returns. While LEADERBOARD_URL is empty or the game runs outside Telegram there
// is nothing to sign a request with: no requests, no button, no screen. A request that fails leaves
// the run as it was; only the table screen, which the player opened, says so. Two tables: the season's
// and the daily run's (CollapseDaily), one switch between them on the screen.
// On CrazyGames the table is theirs and their site shows it (LEADERBOARD_CRAZYGAMES): the function replays
// the run of a player logged in there and hands the meters on; the game shows no table of its own there.

/** @satisfies {Record<string, any>} */
const Leaderboard = {
    /** @type {Promise<any> | null} */
    _sending: null,               // the last score on its way: the table waits for it
    /** @type {{ season: number, rows: any[], me: any } | null} */
    _data: null,
    _page: 0,
    _opened: 0,                   // counts openings: an answer to an earlier one is dropped
    _built: false,
    _status: '',
    _board: 'season',             // 'season' | 'daily': the table on the screen

    get url() { return typeof LEADERBOARD_URL !== 'undefined' ? LEADERBOARD_URL : ''; },
    get enabled() { return !!this.url && !!TG.initData; },
    get portal() { return !!this.url && CG.ready && (typeof LEADERBOARD_CRAZYGAMES !== 'undefined' ? LEADERBOARD_CRAZYGAMES : 0) > 0; },
    get pageRows() { return typeof LEADERBOARD_PAGE_ROWS !== 'undefined' ? LEADERBOARD_PAGE_ROWS : 10; },

    // The answer's JSON, or null on any failure: no network, a timeout, a refusal of the function.
    async _request(path, init) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), typeof LEADERBOARD_TIMEOUT_MS !== 'undefined' ? LEADERBOARD_TIMEOUT_MS : 6000);
        try {
            const res = await fetch(this.url + path, Object.assign({ signal: ctl.signal }, init));
            const body = await res.json();
            if (!res.ok) console.warn('Leaderboard:', path, res.status, body.error);
            return res.ok ? body : null;
        } catch (e) {
            console.warn('Leaderboard:', path, e);
            return null;
        } finally {
            clearTimeout(timer);
        }
    },

    _headers() { return { 'Authorization': 'tma ' + TG.initData, 'Content-Type': 'application/json' }; },

    // The end of a run: the journal is serialized here, before anything can touch the run.
    submit(run) {
        if (!this.enabled) { if (this.portal) this._toPortal(run); return; }
        // A run of the daily track names its day: the function puts it in that day's table as well.
        const body = JSON.stringify(Object.assign({ rules: COLLAPSE_RULES_VERSION, seed: run.seed, meters: run.meters, log: run.log },
            Number.isInteger(run.daily) ? { daily: run.daily } : {}));
        this._sending = this._request('/score', { method: 'POST', headers: this._headers(), body });
    },

    // The CrazyGames season of a moment: their seasons start on Mondays at 09:00 UTC (the first one after
    // the epoch — 1970-01-05).
    portalWeek(ms) { return Math.floor((ms / 1000 - 378000) / 604800); },

    // Only a better run of the player's week goes: their table keeps the best, the rest would be
    // requests for nothing. A guest is not in it: their table knows accounts only.
    async _toPortal(run) {
        const meters = run.meters, week = this.portalWeek(Date.now());
        const body = JSON.stringify({ rules: COLLAPSE_RULES_VERSION, seed: run.seed, meters, log: run.log });
        const id = meters > 0 ? await CG.userId() : null;
        if (!id) return;
        const key = 'collapse.crazygamesWeek.' + id, [was, best] = (Store.get(key) || '').split(':').map(Number);
        if (was === week && meters <= best) return;
        const token = await CG.userToken();
        if (!token) return;
        const headers = { 'Authorization': 'cg ' + token, 'Content-Type': 'application/json' };
        this._sending = this._request('/crazygames/score', { method: 'POST', headers, body });
        if (await this._sending) Store.set(key, week + ':' + meters);
    },

    // { season, day?, rows: [{ place, name, meters, me }], me: { place, meters } | null } or null.
    async top(board = 'season') {
        if (!this.enabled) return null;
        await this._sending;
        return this._request(board === 'daily' ? '/top?board=daily' : '/top', { headers: this._headers() });
    },

    // The date of a daily run's day, dd.mm.
    dayDate(day) {
        const d = new Date(day * 86400e3);
        return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0');
    },

    // The screen: one record per row is a template of UILayout.js, the copies stand a row of boardList
    // apart. Built on the first opening: without the table the game never spends a node on it.
    _build() {
        if (this._built) return;
        this._built = true;
        const list = UI.def('boardList'), row = UI.def('boardRow');
        if (!list || !row) return;
        const step = list.h / this.pageRows, parts = ['boardRowMark', 'boardRowPlace', 'boardRowClip', 'boardRowName', 'boardRowMeters'];
        for (let i = 0; i < this.pageRows; i++) {
            UI.add(Object.assign({}, row, { id: 'boardRow' + i, y: row.y + i * step }));
            for (const id of parts) {
                const def = UI.def(id);
                if (def) UI.add(Object.assign({}, def, { id: id + i, parent: def.parent + i }));
            }
        }
        const on = (id, fn) => { const b = UI.get(id); if (b) b.onClick(fn); };
        on('boardClose', () => this.close());
        on('boardPrev', () => this._turn(-1));
        on('boardNext', () => this._turn(1));
        on('boardSwitch', () => this.open(this._board === 'daily' ? 'season' : 'daily'));
    },

    _text(id, text) { const e = UI.get(id); if (e) e.setText(text); },
    _show(id, on) { const e = UI.get(id); if (e) e.show(on); },

    async open(board = 'season') {
        this._build();
        this._board = board;
        const opened = ++this._opened;
        this._data = null;
        this._render('loading');
        this._show('board', true);
        const data = await this.top(board);
        if (opened !== this._opened) return;
        this._data = data;
        const mine = data ? data.rows.findIndex(r => r.me) : -1;
        this._page = mine >= 0 ? Math.floor(mine / this.pageRows) : 0;
        this._render(!data ? 'boardError' : data.rows.length ? '' : 'boardEmpty');
    },

    refreshLanguage() { if (this._built) this._render(this._status); },

    close() {
        this._opened++;
        this._show('board', false);
    },

    _turn(by) {
        this._page += by;
        this._render('');
    },

    // Rows of the page, the player's line, the page switch; `status` — a word instead of the rows.
    _render(status) {
        const data = this._data, rows = data ? data.rows : [], n = this.pageRows;
        const pages = Math.max(1, Math.ceil(rows.length / n));
        this._status = status;
        this._text('boardStatus', status ? Lang.t(status) : '');
        this._show('boardStatus', !!status);
        for (let i = 0; i < n; i++) {
            const r = rows[this._page * n + i];
            this._show('boardRow' + i, !!r);
            if (!r) continue;
            this._show('boardRowMark' + i, !!r.me);
            this._text('boardRowPlace' + i, r.place);
            this._text('boardRowName' + i, r.name);
            this._text('boardRowMeters' + i, Lang.t('meters', { value: r.meters }));
        }
        if (data) this._text('boardSeason', Number.isInteger(data.day) ? Lang.t('dayOf', { date: this.dayDate(data.day) }) : Lang.t('season', { value: data.season }));
        else this._text('boardSeason', this._board === 'daily' ? Lang.t('daily') : '');
        this._text('boardSwitch', Lang.t(this._board === 'daily' ? 'toSeason' : 'toDaily'));
        this._text('boardMe', !data ? '' : data.me ? Lang.t('boardMe', data.me) : Lang.t('boardAbsent'));
        this._show('boardPrev', this._page > 0);
        this._show('boardNext', this._page < pages - 1);
        this._show('boardPage', pages > 1);
        this._text('boardPage', Lang.t('page', { value: this._page + 1, total: pages }));
    },
};
