// Challenge.js — a race against a friend on the same tunnel. A run is defined by its seed, so a link with
// the seed and the distance gives the friend exactly that track, and the table's replay accepts the run
// as any other. The link is the whole of it: nothing is stored and no server is asked.

/** @satisfies {Record<string, any>} */
const Challenge = {
    // 'c<seed>_<meters>' of the link -> { seed, meters }, or null for anything else: the link is
    // the sender's text, and a broken one starts the game as usual.
    parse(param) {
        const m = /^c(\d{1,10})_(\d{1,7})$/.exec(String(param || ''));
        if (!m) return null;
        const seed = Number(m[1]), meters = Number(m[2]);
        return seed <= 0xffffffff ? { seed, meters } : null;
    },

    link(run) { return TELEGRAM_APP_URL + '?startapp=c' + run.seed + '_' + run.meters; },

    share(run) { TG.share(this.link(run), Lang.t('challengeShare', { meters: run.meters })); },

    // Portal links are versioned: a changed track generator must never promise the same route.
    fromPortal(params) {
        if (!params || params.rules !== String(COLLAPSE_RULES_VERSION)) return null;
        const race = this.parse(params.challenge);
        return race && race.meters > 0 ? race : null;
    },
    async sharePortal(run) {
        const token = 'c' + run.seed + '_' + run.meters;
        if (!this.fromPortal({ challenge: token, rules: String(COLLAPSE_RULES_VERSION) })) return 'failed';
        try {
            const url = CG.inviteLink({ challenge: token, rules: String(COLLAPSE_RULES_VERSION) });
            if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return 'failed';
            if (typeof navigator.share === 'function') {
                try {
                    await navigator.share({ url, text: Lang.t('challengeShare', { meters: run.meters }) });
                    return 'shared';
                } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
            }
            try {
                await navigator.clipboard.writeText(url);
                return 'copied';
            } catch (_) {
                // Some portal iframes disallow the Clipboard API. A temporary copy buffer is not HUD.
                const field = document.createElement('textarea'), focus = /** @type {HTMLElement | null} */ (document.activeElement);
                field.value = url;
                field.readOnly = true;
                field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
                document.body.appendChild(field);
                try {
                    field.select();
                    return document.execCommand('copy') ? 'copied' : 'failed';
                } finally {
                    field.remove();
                    if (focus && typeof focus.focus === 'function') focus.focus();
                }
            }
        } catch (e) { console.warn('Challenge:', e); return 'failed'; }
    },
};
