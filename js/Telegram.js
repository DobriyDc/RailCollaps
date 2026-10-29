// Telegram.js — the single wrapper over the Telegram Mini Apps SDK (libs/telegram-web-app.js) and
// the rewarded-ad hook, skill telegram-miniapp. No other file touches window.Telegram.WebApp. Every
// call is guarded: in a plain browser (TG.inside === false) or on an old client it does nothing.

/** @satisfies {Record<string, any>} */
const TG = {
    /** @type {any} */
    app: (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null,

    get inside() { return !!(this.app && this.app.initData); },
    at(v) { return this.inside && !!(this.app.isVersionAtLeast && this.app.isVersionAtLeast(v)); },
    get mobile() { return !!this.app && ['ios', 'android'].includes(this.app.platform); },

    _call(fn) {
        try { fn(); } catch (e) { console.warn('TG:', e); }
    },

    // Launch sequence (skill telegram-miniapp §Launch sequence). onPause — minimized or hidden.
    boot(onPause) {
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => { if (document.hidden && onPause) onPause(); });
        }
        if (!this.inside) return;
        const a = this.app;
        this._call(() => a.ready());
        this._call(() => a.expand());
        if (this.at('7.7')) this._call(() => a.disableVerticalSwipes());
        if (this.at('8.0') && this.mobile) this._call(() => a.requestFullscreen());
        if (this.at('8.0')) this._call(() => a.lockOrientation());
        if (this.at('6.1')) {
            this._call(() => a.setHeaderColor('#181419'));
            this._call(() => a.setBackgroundColor('#181419'));
        }
        if (this.at('8.0') && onPause) this._call(() => a.onEvent('deactivated', onPause));
    },

    runStarted() { if (this.at('6.2')) this._call(() => this.app.enableClosingConfirmation()); },
    runEnded() { if (this.at('6.2')) this._call(() => this.app.disableClosingConfirmation()); },

    // Game events -> haptics (skill telegram-miniapp §Haptics). Never per frame.
    haptic(kind) {
        if (!this.at('6.1')) return;
        const h = this.app.HapticFeedback;
        this._call(() => {
            if (kind === 'shot') h.impactOccurred('light');
            else if (kind === 'pickup') h.impactOccurred('soft');
            else if (kind === 'shield') h.impactOccurred('heavy');
            else if (kind === 'crash') h.notificationOccurred('error');
            else if (kind === 'record') h.notificationOccurred('success');
            else if (kind === 'deny') h.notificationOccurred('warning');
        });
    },

    // Best distance mirrored to CloudStorage; Store stays the source of truth (invariant 7).
    loadBest(cb) {
        if (!this.at('6.9')) return;
        this._call(() => this.app.CloudStorage.getItem('best_m', (err, value) => {
            if (!err && value) cb(parseInt(value, 10) || 0);
        }));
    },
    saveBest(meters) {
        if (!this.at('6.9')) return;
        this._call(() => this.app.CloudStorage.setItem('best_m', String(meters)));
    },
};

// Rewarded ad to continue a run: resolves true when the viewer earned the reward. The network is
// the Producer's decision (GDD v3 §7); until then a stub that always grants after a short pause.
/** @satisfies {Record<string, any>} */
const Ads = {
    stub: true,
    rewarded() {
        return new Promise(resolve => setTimeout(() => resolve(this.stub), 700));
    },
};
