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
};
