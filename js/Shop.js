// Shop.js — the trains of the shop. A train changes only how the run looks: the rules, the journal and
// the table do not know about it. The function (server/leaderboard) keeps what was bought: this file shows
// it, remembers it for the next start and asks Telegram for the invoice. While COLLAPSE_SHOP_OPEN is off or
// the function is not there (LEADERBOARD_URL empty or outside Telegram) the shop sells nothing. A donation
// is a sum of Stars the player types: it buys nothing, and COLLAPSE_DONATE_OPEN opens it apart from the trains.

/** @satisfies {Record<string, any>} */
const Shop = {
    TRAINS: ['base', 'hell', 'rune', 'bio'],   // the order of the cards, shopCard0..3
    FREE: 'base',
    owned: new Set(['base']),
    worn: 'base',
    /** @type {any} */
    scene: null,
    _buying: '',                  // the train whose invoice is open
    _note: 'shopTerms',           // the word under the cards

    get stars() { return typeof COLLAPSE_TRAIN_STARS !== 'undefined' ? COLLAPSE_TRAIN_STARS : 100; },
    get salesOpen() { return typeof COLLAPSE_SHOP_OPEN !== 'undefined' && COLLAPSE_SHOP_OPEN > 0; },
    get selling() { return this.salesOpen && Leaderboard.enabled; },
    get donating() { return typeof COLLAPSE_DONATE_OPEN !== 'undefined' && COLLAPSE_DONATE_OPEN > 0 && Leaderboard.enabled; },
    // A skin is sold once all its frames are drawn (CollapseArt.trains[id].full); till then its card says "soon".
    drawn(id) { return typeof CollapseArt === 'undefined' || !!(CollapseArt.trains[id] || {}).full; },
    get donateRange() {
        const U = 'undefined';
        return [typeof COLLAPSE_DONATE_MIN !== U ? COLLAPSE_DONATE_MIN : 1, typeof COLLAPSE_DONATE_MAX !== U ? COLLAPSE_DONATE_MAX : 10000];
    },

    // What the last start knew: the shop opens at once and the function corrects it.
    init(scene, on) {
        this.scene = scene;
        this.owned = new Set([this.FREE]);
        try {
            const saved = JSON.parse(Store.get('collapse.owned') || '[]');
            for (const id of saved) if (this.TRAINS.includes(id)) this.owned.add(id);
        } catch (e) { /* a spoiled record: only the free train */ }
        const worn = Store.get('collapse.train');
        this.worn = this.owned.has(worn) ? worn : this.FREE;
        scene.wearTrain(this.worn);
        this.TRAINS.forEach((id, i) => on('shopBuy' + i, () => this.press(id)));
        on('shopDonate', () => this.showDonate(true));
        on('donateCancel', () => this.showDonate(false));
        on('donateSend', () => this.donate());
        this.refresh();
    },

    open() {
        this._note = 'shopTerms';
        this.showDonate(false);
        this.render();
        this.refresh();
    },

    // The function's list replaces the remembered one: a refund takes the train back.
    async refresh() {
        if (!this.selling) return;
        const answer = await Leaderboard._request('/inventory', { headers: Leaderboard._headers() });
        if (!answer || !Array.isArray(answer.items)) return;
        this.owned = new Set([this.FREE, ...answer.items.filter(id => this.TRAINS.includes(id))]);
        this._save();
        if (!this.owned.has(this.worn)) this.wear(this.FREE);
        this.render();
    },

    _save() { Store.set('collapse.owned', JSON.stringify([...this.owned])); },

    press(id) { return this.owned.has(id) ? this.wear(id) : this.buy(id); },

    wear(id) {
        this.worn = id;
        Store.set('collapse.train', id);
        this.scene.wearTrain(id);
        this.render();
    },

    async buy(id) {
        if (this._buying || !this.selling || !this.drawn(id)) return;
        this._buying = id;
        this._note = 'shopTerms';
        this.render();
        const body = JSON.stringify({ item: id, lang: Lang.code });
        const answer = await Leaderboard._request('/invoice', { method: 'POST', headers: Leaderboard._headers(), body });
        if (!answer) { this._finish(id, 'failed'); return; }
        TG.openInvoice(answer.link, status => this._finish(id, status));
    },

    // Telegram says 'paid' when the player paid: the train goes on at once, the function's record of the
    // payment comes through the bot a moment later. Closing the invoice is no failure.
    _finish(id, status) {
        this._buying = '';
        if (status === 'paid' && id === 'donation') {
            this._note = 'donateThanks';
            this.showDonate(false);
            return;
        }
        if (status === 'paid') {
            this.owned.add(id);
            this._save();
            this._note = 'shopThanks';
            this.wear(id);
            return;
        }
        this._note = status === 'cancelled' ? 'shopTerms' : 'shopError';
        this.render();
    },

    showDonate(on) {
        const box = UI.get('donateBox');
        if (box) box.show(on && this.donating);
        this.render();
    },

    // The sum the player typed, whole Stars within the range, or 0.
    donateSum() {
        const field = UI.get('donateAmount'), [min, max] = this.donateRange;
        const n = Number(field ? field.getText() : '');
        return Number.isInteger(n) && n >= min && n <= max ? n : 0;
    },

    async donate() {
        if (this._buying || !this.donating) return;
        const stars = this.donateSum();
        if (!stars) { this._note = 'donateBad'; this.render(); return; }
        this._buying = 'donation';
        this.render();
        const body = JSON.stringify({ item: 'donation', stars, lang: Lang.code });
        const answer = await Leaderboard._request('/invoice', { method: 'POST', headers: Leaderboard._headers(), body });
        if (!answer) { this._finish('donation', 'failed'); return; }
        TG.openInvoice(answer.link, status => this._finish('donation', status));
    },

    // The label and the state of one card's button.
    label(id) {
        if (this._buying === id) return { text: Lang.t('shopWait'), on: false };
        if (this.worn === id) return { text: Lang.t('shopChosen'), on: false };
        if (this.owned.has(id)) return { text: Lang.t('shopChoose'), on: true };
        if (this.selling && this.drawn(id)) return { text: Lang.t('shopPrice', { value: this.stars }), on: !this._buying };
        return { text: Lang.t('soon'), on: false };
    },

    render() {
        this.TRAINS.forEach((id, i) => {
            const name = UI.get('shopName' + i), buy = UI.get('shopBuy' + i), { text, on } = this.label(id);
            if (name) name.setText(Lang.t('train.' + id));
            if (buy) buy.setText(text).setEnabled(on);
        });
        const note = UI.get('shopNote'), [min, max] = this.donateRange;
        if (note) note.setText(Lang.t(this._note, { min, max }));
        const donate = UI.get('shopDonate'), send = UI.get('donateSend'), hint = UI.get('donateHint');
        if (donate) donate.setText(Lang.t(this.donating ? 'shopDonate' : 'soon')).setEnabled(this.donating && !this._buying);
        if (send) send.setText(Lang.t(this._buying === 'donation' ? 'shopWait' : 'donateSend')).setEnabled(!this._buying);
        if (hint) hint.setText(Lang.t('donateHint', { min, max }));
    },
};
