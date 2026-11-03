// CrazyGames.js — the single wrapper over the CrazyGames HTML5 SDK v3 (ADS_CRAZYGAMES_SCRIPT), skill
// telegram-miniapp §Portals. No other file touches window.CrazyGames. The SDK is an ad network's script:
// it loads through Ads._script, only when the page itself is served from a CrazyGames domain (their
// sitelock check) and never inside Telegram; ?useLocalSdk=true — the SDK's own switch to its local mode —
// loads it on any other host for a test. Until the SDK answers, and everywhere else, every call is a no-op.

/** @satisfies {Record<string, any>} */
const CG = {
    /** @type {any} */
    sdk: null,                    // window.CrazyGames.SDK once init() resolved in a working environment
    _loading: true,               // the loading screen is up: loadingStart is due when the SDK comes
    _want: false,                 // the game is in a run (gameplay)
    _sent: false,                 // what the portal was told last
    _ad: false,                   // an ad plays: the game is silent

    // The page is CrazyGames': its host is crazygames.com or under it. Pure: the tests run it.
    onPortal(hostname, search, inTelegram) {
        if (inTelegram) return false;
        if (new URLSearchParams(search || '').get('useLocalSdk') === 'true') return true;
        return hostname === 'crazygames.com' || String(hostname || '').endsWith('.crazygames.com');
    },
    get portal() {
        return typeof location !== 'undefined' && this.onPortal(location.hostname, location.search, TG.inside);
    },
    get ready() { return !!this.sdk; },

    _call(fn) {
        try { fn(); } catch (e) { console.warn('CG:', e); }
    },

    // From main.js at the start of loading. A script that fails or an environment the SDK calls
    // 'disabled' leaves the game as it is everywhere else.
    async boot() {
        if (!this.portal) return;
        try {
            await Ads._script(ADS_CRAZYGAMES_SCRIPT);
            const sdk = window.CrazyGames.SDK;
            await sdk.init();
            if (sdk.environment !== 'crazygames' && sdk.environment !== 'local') return;
            this.sdk = sdk;
        } catch (e) {
            console.warn('CG:', e);
            return;
        }
        const game = this.sdk.game;
        if (this._loading) this._call(() => game.loadingStart());
        this._language();
        this._call(() => game.addSettingsChangeListener(() => this._sound()));
        this._sound();
        this._send();
    },

    // The loading screen went away.
    loaded() {
        if (this._loading && this.sdk) this._call(() => this.sdk.game.loadingStop());
        this._loading = false;
    },

    // Gameplay start/stop: Game.update tells the state every frame, the portal hears only its changes.
    gameplay(on) {
        this._want = !!on;
        this._send();
    },
    _send() {
        if (!this.sdk || this._sent === this._want) return;
        this._sent = this._want;
        const game = this.sdk.game;
        this._call(() => { if (this._sent) game.gameplayStart(); else game.gameplayStop(); });
    },

    // The portal's celebration: a beaten record, nothing smaller.
    happytime() { if (this.sdk) this._call(() => this.sdk.game.happytime()); },

    // 'reward' — watched to the end; 'free' — this session has no ads at all (the basic launch, an ad
    // blocker), and the portal forbids a rewarded button that does nothing; 'empty' — no ad right now.
    // The sound stops only while an ad really plays.
    rewarded() {
        return new Promise(resolve => {
            const done = outcome => { this._ad = false; this._sound(); resolve(outcome); };
            try {
                this.sdk.ad.requestAd('rewarded', {
                    adStarted: () => { this._ad = true; this._sound(); },
                    adFinished: () => done('reward'),
                    adError: error => done(this.noAds(error) ? 'free' : 'empty'),
                });
            } catch (e) {
                console.warn('CG:', e);
                done('empty');
            }
        });
    },

    // An ad between runs; resolves when it is over or none came (the SDK's cooldown, no fill, no ads).
    midgame() {
        return new Promise(resolve => {
            const done = () => { this._ad = false; this._sound(); resolve(); };
            try {
                this.sdk.ad.requestAd('midgame', {
                    adStarted: () => { this._ad = true; this._sound(); },
                    adFinished: done,
                    adError: done,
                });
            } catch (e) {
                console.warn('CG:', e);
                done();
            }
        });
    },

    // An adError that means no ad comes in this session: 'adblock', or ads off — the SDK 3.8 answers
    // 'adsDisabledBasicLaunch' at once during the basic launch, their docs name it 'adsDisabled'.
    noAds(error) {
        const code = String((error && error.code) || '');
        return code === 'adblock' || code.startsWith('adsDisabled');
    },

    // The player logged in to CrazyGames: the id only names this device's records, the function trusts
    // nothing but the token. null for a guest, where accounts are unavailable, or on any failure.
    async userId() {
        if (!this.sdk) return null;
        try {
            const user = this.sdk.user;
            if (!user.isUserAccountAvailable) return null;
            const me = await user.getUser();
            return (me && String(me.__dangerousUserId || me.username || '')) || null;
        } catch (e) {
            console.warn('CG:', e);
            return null;
        }
    },
    async userToken() {
        if (!this.sdk) return null;
        try {
            return (await this.sdk.user.getUserToken({ signingKeyType: 'IN_GAME_AUTH' })) || null;
        } catch (e) {
            console.warn('CG:', e);
            return null;
        }
    },

    // The portal's mute switch overrules the game's own volumes; an ad silences the game too.
    _sound() {
        const settings = this.sdk && this.sdk.game.settings;
        Sound3D.setMuted(this._ad || !!(settings && settings.muteAudio));
    },

    // The portal knows the player's language; the choice in the settings stays above it.
    _language() {
        const saved = Store.get('collapse.language'), info = this.sdk.user && this.sdk.user.systemInfo;
        if (saved === 'ru' || saved === 'en' || !info || !info.locale) return;
        const code = Lang.of(info.locale);
        if (code !== Lang.code) Lang.set(code, false);
    },
};
