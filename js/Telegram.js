// Telegram.js — the single wrapper over the Telegram Mini Apps SDK (libs/telegram-web-app.js),
// skill telegram-miniapp. No other file touches window.Telegram.WebApp. Every
// call is guarded: in a plain browser (TG.inside === false) or on an old client it does nothing.

/** @satisfies {Record<string, any>} */
const TG = {
    /** @type {any} */
    app: (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null,

    get inside() { return !!(this.app && this.app.initData); },
    at(v) { return this.inside && !!(this.app.isVersionAtLeast && this.app.isVersionAtLeast(v)); },
    get mobile() { return !!this.app && ['ios', 'android'].includes(this.app.platform); },
    // The string Telegram signed: the server checks it (skill telegram-miniapp); '' outside Telegram.
    get initData() { return this.inside ? this.app.initData : ''; },

    _call(fn) {
        try { fn(); } catch (e) { console.warn('TG:', e); }
    },

    // Launch sequence (skill telegram-miniapp §Launch sequence). onPause — minimized or hidden;
    // onActive(on) — the app went to the background (false) and came back (true).
    boot(onPause, onActive) {
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => { if (document.hidden && onPause) onPause(); });
        }
        if (!this.inside) return;
        const a = this.app;
        this._call(() => a.ready());
        this._call(() => a.expand());
        if (this.at('7.7')) this._call(() => a.disableVerticalSwipes());
        if (this.at('8.0') && this.mobile) this._call(() => a.requestFullscreen());
        if (this.at('8.0') && !IS_LAND) this._call(() => a.lockOrientation());
        if (this.at('6.1')) {
            this._call(() => a.setHeaderColor('#181419'));
            this._call(() => a.setBackgroundColor('#181419'));
        }
        if (this.at('8.0') && onPause) this._call(() => a.onEvent('deactivated', onPause));
        if (this.at('8.0') && onActive) {
            this._call(() => a.onEvent('deactivated', () => onActive(false)));
            this._call(() => a.onEvent('activated', () => onActive(true)));
        }
    },

    // lockOrientation holds the orientation the phone is in, no call asks for another: the lock comes
    // after the turn, the wrong orientation lets go so the player can turn the phone.
    holdOrientation(wide) {
        if (!this.at('8.0')) return;
        this._call(() => { if (wide) this.app.lockOrientation(); else this.app.unlockOrientation(); });
    },

    close() { if (this.inside && this.app.close) this._call(() => this.app.close()); },

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

    // The parameter of the link the game was opened by; '' without one.
    get startParam() { return (this.inside && this.app.initDataUnsafe && this.app.initDataUnsafe.start_param) || ''; },

    // Telegram's dialog that sends a link to a chat the player picks.
    share(url, text) {
        if (!this.at('6.1')) return;
        const address = TELEGRAM_SHARE_URL + '?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text);
        this._call(() => this.app.openTelegramLink(address));
    },

    // A Stars invoice over the game; onDone gets 'paid', 'cancelled', 'failed' or 'pending'.
    openInvoice(link, onDone) {
        if (!this.at('6.1')) { onDone('failed'); return; }
        this._call(() => this.app.openInvoice(link, onDone));
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
