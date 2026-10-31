// Leaderboard.js — the shared table in the game: the end of a run goes to the function
// (server/leaderboard, it replays the journal and keeps the meters itself), the table screen shows
// what the function returns. While LEADERBOARD_URL is empty or the game runs outside Telegram there
// is nothing to sign a request with: no requests, no button, no screen. A request that fails leaves
// the run as it was; only the table screen, which the player opened, says so.

/** @satisfies {Record<string, any>} */
const Leaderboard = {
    /** @type {Promise<any> | null} */
    _sending: null,               // the last score on its way: the table waits for it
    /** @type {{ season: number, rows: any[], me: any } | null} */
    _data: null,
    _page: 0,
    _opened: 0,                   // counts openings: an answer to an earlier one is dropped
    _built: false,

    get url() { return typeof LEADERBOARD_URL !== 'undefined' ? LEADERBOARD_URL : ''; },
    get enabled() { return !!this.url && !!TG.initData; },
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
        if (!this.enabled) return;
        const body = JSON.stringify({ rules: COLLAPSE_RULES_VERSION, seed: run.seed, meters: run.meters, log: run.log });
        this._sending = this._request('/score', { method: 'POST', headers: this._headers(), body });
    },

    // { season, rows: [{ place, name, meters, me }], me: { place, meters } | null } or null.
    async top() {
        if (!this.enabled) return null;
        await this._sending;
        return this._request('/top', { headers: this._headers() });
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
    },

    _text(id, text) { const e = UI.get(id); if (e) e.setText(text); },
    _show(id, on) { const e = UI.get(id); if (e) e.show(on); },

    async open() {
        this._build();
        const opened = ++this._opened;
        this._data = null;
        this._render('Загрузка…');
        this._show('board', true);
        const data = await this.top();
        if (opened !== this._opened) return;
        this._data = data;
        const mine = data ? data.rows.findIndex(r => r.me) : -1;
        this._page = mine >= 0 ? Math.floor(mine / this.pageRows) : 0;
        this._render(!data ? 'Таблица недоступна.\nПроверь связь.' : data.rows.length ? '' : 'Пока никого.\nПервый забег — твой.');
    },

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
        this._text('boardStatus', status);
        this._show('boardStatus', !!status);
        for (let i = 0; i < n; i++) {
            const r = rows[this._page * n + i];
            this._show('boardRow' + i, !!r);
            if (!r) continue;
            this._show('boardRowMark' + i, !!r.me);
            this._text('boardRowPlace' + i, r.place);
            this._text('boardRowName' + i, r.name);
            this._text('boardRowMeters' + i, r.meters + ' м');
        }
        if (data) this._text('boardSeason', 'Сезон ' + data.season);
        this._text('boardMe', !data ? '' : data.me ? 'Твоё место ' + data.me.place + ', ' + data.me.meters + ' м' : 'Тебя ещё нет в таблице');
        this._show('boardPrev', this._page > 0);
        this._show('boardNext', this._page < pages - 1);
        this._show('boardPage', pages > 1);
        this._text('boardPage', (this._page + 1) + ' / ' + pages);
    },
};
