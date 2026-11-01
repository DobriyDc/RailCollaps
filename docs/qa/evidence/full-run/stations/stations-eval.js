const params = new URLSearchParams(location.search);
const targetStage = Number(params.get('stage') || '1');
if (!Number.isInteger(targetStage) || targetStage < 1 || targetStage > 3) throw new Error('stage must be 1..3');

const waitFor = async (check, label) => {
    const until = performance.now() + 10000;
    while (!check()) {
        if (performance.now() > until) throw new Error('timeout: ' + label);
        await new Promise(resolve => setTimeout(resolve, 25));
    }
};
await waitFor(() => window.app && window.app.game && typeof CollapseStationRun !== 'undefined', 'game boot');
await waitFor(() => {
    const loader = document.getElementById('loading-screen');
    return !loader || loader.style.display === 'none';
}, 'scene ready');

const game = window.app.game;
const run = new CollapseStationRun(7);
game.start(run);

const purchases = [];
const stops = [];
const dodge = () => {
    const next = run.nextFork();
    if (next && !next.armed) {
        const safe = next.to.filter(value => run.forkSafe(next.at, value));
        const moneyAhead = lane => {
            let count = 0;
            for (let i = next.at; i < Math.min(next.at + CollapseRules.LOOK, run.stationAt); i++) {
                if (run.track.seg(i).pickup[lane] === 'money') count++;
            }
            return count;
        };
        const lane = safe.sort((a, b) => moneyAhead(b) - moneyAhead(a))[0];
        if (lane !== undefined && (moneyAhead(lane) > moneyAhead(run.lane) || !run.track.laneSafe(run.lane, next.at, CollapseRules.LOOK))) run.shoot(next.at, lane);
    }
    for (const demon of run.shootable()) run.shootDemon(demon.side);
};
const click = id => {
    const button = UI.get(id);
    if (!button || !button._enabled) return false;
    const before = run.money;
    button.el.click();
    if (run.money < before) {
        purchases.push({ station: run.stage + 1, item: id, spent: before - run.money, money: run.money });
        return true;
    }
    return false;
};

for (let frame = 0; frame < 60 * 360 && run.state === 'run' && run.stage < targetStage; frame++) {
    if (!run.atStation) {
        dodge();
        game.update(1 / 60);
        continue;
    }
    const before = { money: run.money, ammo: run.ammo, shield: run.shield, rescue: run.rescue };
    for (const id of ['stationAmmo', 'stationShield', 'stationRescue']) click(id);
    stops.push({ station: run.stage + 1, before, after: { money: run.money, ammo: run.ammo, shield: run.shield, rescue: run.rescue }, purchases: purchases.filter(p => p.station === run.stage + 1) });
    if (run.stage + 1 === targetStage) break;
    UI.get('stationGo').el.click();
    game.update(1 / 60);
}

if (run.state !== 'run') throw new Error('run ended at ' + run.meters + ' m before station ' + targetStage);
if (!run.atStation || run.stage + 1 !== targetStage) throw new Error('did not reach station ' + targetStage + ': stage=' + run.stage + ', atStation=' + run.atStation);
if (!stops.length || stops.some(stop => stop.before.money <= 0)) throw new Error('money was not collected before every shop');
if (targetStage === 3 && !purchases.length) throw new Error('no shop purchase succeeded by station 3');

game.update(0);
return {
    path: 'stations-1-to-' + targetStage,
    passed: true,
    targetStation: targetStage,
    stationsReached: stops.length,
    moneyAtStops: stops.map(stop => stop.before.money),
    purchases,
    stage: run.stage + 1,
    atStation: run.atStation,
    shopVisible: UI.get('stationShop').visible,
    moneyHud: UI.get('stationMoney').el.getAttribute('aria-label'),
};
