// Career.js — persistent progress on this browser/device. Run receipts live with the run object:
// a continued run only credits the extra distance, passengers and full 2 km milestones.
// A new run, even on the same seed, has its own receipt. There is no spending API yet.
/** @satisfies {Record<string, any>} */
const Career = {
    KEY: 'collapse.career.v1',
    state: { version: 1, meters: 0, passengers: 0, earned: 0, balance: 0 },
    receipts: new WeakMap(),
    requested: new WeakMap(),
    queue: Promise.resolve(),
    saveFailed: false,

    get pointMeters() { return typeof CAREER_POINT_METERS !== 'undefined' ? CAREER_POINT_METERS : 2000; },
    get thresholds() {
        return [0,
            typeof CAREER_RANK_1 !== 'undefined' ? CAREER_RANK_1 : 25000,
            typeof CAREER_RANK_2 !== 'undefined' ? CAREER_RANK_2 : 75000,
            typeof CAREER_RANK_3 !== 'undefined' ? CAREER_RANK_3 : 150000,
            typeof CAREER_RANK_4 !== 'undefined' ? CAREER_RANK_4 : 300000,
            typeof CAREER_RANK_5 !== 'undefined' ? CAREER_RANK_5 : 600000];
    },
    points(meters) { return Math.floor(Math.max(0, meters) / this.pointMeters); },
    get rank() { return this.thresholds.filter(m => this.state.meters >= m).length - 1; },
    get remaining() { return Math.max(0, (this.thresholds[this.rank + 1] || this.state.meters) - this.state.meters); },
    get progress() {
        const levels = this.thresholds, rank = this.rank;
        return rank === levels.length - 1 ? 1 : (this.state.meters - levels[rank]) / (levels[rank + 1] - levels[rank]);
    },
    read() {
        const raw = Store.get(this.KEY);
        if (raw === null) return { version: 1, meters: 0, passengers: 0, earned: 0, balance: 0 };
        const data = JSON.parse(raw);
        if (!data || data.version !== 1 || !['meters', 'passengers', 'earned', 'balance'].every(k => Number.isSafeInteger(data[k]) && data[k] >= 0) || data.balance > data.earned) {
            throw new Error('Invalid career save');
        }
        return data;
    },
    load() {
        try { this.state = this.read(); this.saveFailed = false; }
        catch (_) { this.saveFailed = true; } // Never overwrite a damaged or newer save with zeroes.
    },
    record(run) {
        if (!run || run.tutorial) return Promise.resolve();
        const meters = Math.floor(run.meters), passengers = Math.floor(run.delivered || 0);
        if (![meters, passengers].every(n => Number.isSafeInteger(n) && n >= 0)) return Promise.resolve();
        const points = this.points(meters);
        this.requested.set(run, points);
        const write = () => {
            const old = this.receipts.get(run) || { meters: 0, passengers: 0, points: 0 };
            const dm = Math.max(0, meters - old.meters), dp = Math.max(0, passengers - old.passengers), earned = Math.max(0, points - old.points);
            const data = this.read();
            const next = { version: 1, meters: data.meters + dm, passengers: data.passengers + dp, earned: data.earned + earned, balance: data.balance + earned };
            if (!Object.values(next).every(Number.isSafeInteger)) throw new Error('Career total out of range');
            if ((dm || dp || earned) && !Store.set(this.KEY, JSON.stringify(next))) throw new Error('Career save unavailable');
            this.state = next;
            this.receipts.set(run, { meters: Math.max(old.meters, meters), passengers: Math.max(old.passengers, passengers), points: Math.max(old.points, points) });
            this.saveFailed = false;
        };
        // Serialize same-origin tabs where Web Locks is supported, and all callbacks in this page.
        const work = () => navigator.locks && typeof navigator.locks.request === 'function'
            ? navigator.locks.request(this.KEY, write) : write();
        this.queue = this.queue.then(work).catch(() => { this.saveFailed = true; });
        return this.queue;
    },
    checkpointDue(run) {
        return run && !run.tutorial && this.points(run.meters) > (this.requested.get(run) || 0);
    },
};
