// Ads.js — the rewarded ad that continues a run, skill telegram-miniapp. The networks take turns: each
// offer starts from the next one, so all of them get the same chances and their dashboards compare
// directly (docs/monetization.md). A network with no ad passes to the next one, a player who closes the
// ad ends the offer. A network with an empty id in Constants.js is off. The scripts live on the networks'
// own hosts and load on the first offer, inside Telegram only; with no network on the reward is free.

/** @satisfies {Record<string, any>} */
const Ads = {
    NETWORKS: ['adsgram', 'monetag', 'adexium'],
    /** @type {Record<string, Promise<void>>} */
    _scripts: {},
    /** @type {any} */
    _adsgram: null,               // its controller lives as long as the page
    /** @type {any} */
    _adexium: null,               // one widget: its listeners stay, _adexiumEnd changes per offer
    /** @type {((outcome: string) => void) | null} */
    _adexiumEnd: null,

    _ids() {
        const U = 'undefined';
        return {
            adsgram: typeof ADS_ADSGRAM_BLOCK !== U ? ADS_ADSGRAM_BLOCK : '',
            monetag: typeof ADS_MONETAG_ZONE !== U ? ADS_MONETAG_ZONE : '',
            adexium: typeof ADS_ADEXIUM_WIDGET !== U ? ADS_ADEXIUM_WIDGET : '',
        };
    },
    _urls() {
        const U = 'undefined';
        return {
            adsgram: typeof ADS_ADSGRAM_SCRIPT !== U ? ADS_ADSGRAM_SCRIPT : '',
            monetag: typeof ADS_MONETAG_SCRIPT !== U ? ADS_MONETAG_SCRIPT : '',
            adexium: typeof ADS_ADEXIUM_SCRIPT !== U ? ADS_ADEXIUM_SCRIPT : '',
        };
    },
    get waitMs() { return typeof ADS_WAIT_MS !== 'undefined' ? ADS_WAIT_MS : 8000; },
    get active() { const ids = this._ids(); return this.NETWORKS.filter(n => ids[n]); },
    get live() { return TG.inside && this.active.length > 0; },

    // The networks for this offer, the next one first. The turn survives a reload.
    order() {
        const on = this.active, turn = parseInt(Store.get('collapse.adTurn') || '0', 10) || 0;
        Store.set('collapse.adTurn', String(turn + 1));
        const from = turn % on.length;
        return [...on.slice(from), ...on.slice(0, from)];
    },

    // true when the viewer earned the reward. Never rejects: a failed ad ends the run as usual.
    async rewarded() {
        if (!this.live) return new Promise(resolve => setTimeout(() => resolve(true), 700));
        for (const network of this.order()) {
            const outcome = await this._offer(network);
            if (outcome !== 'empty') return outcome === 'reward';
        }
        return false;
    },

    // 'reward', 'skip' or 'empty': no ad, or the network failed.
    async _offer(network) {
        const id = this._ids()[network];
        try {
            if (network === 'adsgram') return await this._showAdsgram(id);
            if (network === 'monetag') return await this._showMonetag(id);
            return await this._showAdexium(id);
        } catch (e) {
            console.warn('Ads:', network, e);
            return 'empty';
        }
    },

    _script(url, data = {}) {
        if (this._scripts[url]) return this._scripts[url];
        const loading = /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
            const tag = document.createElement('script');
            tag.src = url;
            tag.async = true;
            Object.assign(tag.dataset, data);
            const timer = setTimeout(() => reject(new Error('script timeout')), this.waitMs);
            tag.onload = () => { clearTimeout(timer); resolve(); };
            tag.onerror = () => { clearTimeout(timer); reject(new Error('script failed')); };
            document.head.appendChild(tag);
        }));
        this._scripts[url] = loading;
        loading.catch(() => { delete this._scripts[url]; });
        return loading;
    },

    // The promise resolves at the end of the video and rejects on a skip or an error, with one shape of result.
    async _showAdsgram(blockId) {
        await this._script(this._urls().adsgram);
        if (!this._adsgram) this._adsgram = window.Adsgram.init({ blockId });
        try {
            return (await this._adsgram.show()).done ? 'reward' : 'skip';
        } catch (result) {
            return result && result.error ? 'empty' : 'skip';
        }
    },

    // Rejects with no ad. Resolves even when the viewer closes the ad early: only 'valued' is a view.
    async _showMonetag(zone) {
        await this._script(this._urls().monetag, { zone, sdk: 'show_' + zone });
        const result = await window['show_' + zone]();
        return result && result.reward_event_type === 'valued' ? 'reward' : 'skip';
    },

    // Events, not a promise. Adexium keeps its rewarded format for large apps, so this is its interstitial:
    // adPlaybackCompleted says the ad was viewed, the first ending of an offer wins.
    async _showAdexium(wid) {
        await this._script(this._urls().adexium);
        if (!this._adexium) {
            const ads = new window.AdexiumWidget({ wid, adFormat: 'interstitial' });
            const end = outcome => { if (this._adexiumEnd) this._adexiumEnd(outcome); };
            ads.on('adReceived', ad => { end('received'); ads.displayAd(ad); });
            ads.on('noAdFound', () => end('empty'));
            ads.on('adPlaybackCompleted', () => end('reward'));
            ads.on('adClosed', () => end('skip'));
            this._adexium = ads;
        }
        return new Promise(resolve => {
            const timer = setTimeout(() => finish('empty'), this.waitMs);
            const finish = outcome => {
                clearTimeout(timer);
                if (outcome === 'received') return;
                this._adexiumEnd = null;
                resolve(outcome);
            };
            this._adexiumEnd = finish;
            this._adexium.requestAd('interstitial');
        });
    },
};
