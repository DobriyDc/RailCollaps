const params = new URL(location.href).searchParams;
const screen = params.get('qaScreen') || 'main';
const safeTop = Number(params.get('qaSafeTop') || '0');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const click = id => {
    const item = UI.get(id);
    if (!item || !item.el) throw new Error('missing UI element: ' + id);
    item.el.click();
};
const effective = id => {
    for (let item = UI.get(id); item; item = item.def.parent ? UI.get(item.def.parent) : null) {
        if (!item.visible) return false;
    }
    return true;
};
const opened = id => effective(id) && UI.get(id).el.getBoundingClientRect().width > 0;

document.documentElement.style.setProperty('--tg-safe-area-inset-top', safeTop + 'px');
document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', '0px');
UI.resize();
await pause(80);

// Exercise every real menu navigation route before placing the requested screen.
click('menuSettings');
if (!opened('settingsScreen')) throw new Error('settings did not open');
click('settingsBack');
click('menuShop');
if (!opened('shopScreen')) throw new Error('shop did not open');
click('shopBack');
click('menuStart');
if (!opened('modeScreen')) throw new Error('mode selector did not open');
click('modeBack');

const game = window.app && window.app.game;
if (!game || game.mode !== 'menu') throw new Error('game did not return to the menu');
let reload = null;
if (screen === 'modes') click('menuStart');
else if (screen === 'shop') click('menuShop');
else if (screen === 'settings') {
    click('menuSettings');
    click('musicMinus');
    click('sfxMinus');
    click('sfxMinus');
    click('languageEN');
    const expected = { language: Lang.code, music: game.volumes.music, sfx: game.volumes.sfx };
    const frame = document.createElement('iframe');
    frame.src = location.href;
    frame.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;border:0';
    document.body.appendChild(frame);
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('reload iframe timed out')), 12000);
        frame.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    for (let i = 0; i < 100 && !(frame.contentWindow && frame.contentWindow.app && frame.contentWindow.app.game); i++) await pause(50);
    const fresh = frame.contentWindow && frame.contentWindow.app && frame.contentWindow.app.game;
    if (!fresh) throw new Error('reload iframe did not start the game');
    const actual = frame.contentWindow.eval('({ language: Lang.code, music: app.game.volumes.music, sfx: app.game.volumes.sfx })');
    reload = { expected, actual };
    frame.remove();
    if (reload.actual.language !== expected.language || reload.actual.music !== expected.music || reload.actual.sfx !== expected.sfx) {
        throw new Error('settings did not persist after reload: ' + JSON.stringify(reload));
    }
} else if (screen !== 'main') throw new Error('unknown qaScreen: ' + screen);

const expectedScreen = { main: 'mainScreen', modes: 'modeScreen', settings: 'settingsScreen', shop: 'shopScreen' }[screen];
if (!opened(expectedScreen)) throw new Error('requested screen is not open: ' + expectedScreen);
const otherScreens = ['mainScreen', 'modeScreen', 'settingsScreen', 'shopScreen'].filter(id => id !== expectedScreen);
if (otherScreens.some(opened)) throw new Error('another menu screen remains open: ' + otherScreens.filter(opened).join(','));

const violations = [];
let minTap = Infinity;
let checks = 0;
for (const [id, item] of UI.elements) {
    if (!UI.isInside(item.def, 'menu') || !effective(id) || id === 'menu') continue;
    const rect = item.el.getBoundingClientRect();
    if (rect.left < -0.1 || rect.right > innerWidth + 0.1 || rect.top < safeTop - 0.1 || rect.bottom > innerHeight + 0.1) {
        violations.push(id + ': outside viewport ' + JSON.stringify({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }));
    }
    if ((item.def.kind === 'text' || item.def.kind === 'button') && item.el.scrollWidth > item.el.clientWidth + 1) {
        violations.push(id + ': horizontal text clipping');
    }
    if (item.def.kind === 'button') {
        minTap = Math.min(minTap, rect.width, rect.height);
        if (rect.width < 44 || rect.height < 44) violations.push(id + ': tap target ' + rect.width + 'x' + rect.height);
    }
    checks++;
}
if (violations.length) throw new Error(violations.join('; '));

return {
    screen,
    safeTop,
    viewport: [innerWidth, innerHeight],
    visibleChecks: checks,
    minimumTapCssPx: Number(minTap.toFixed(3)),
    language: Lang.code,
    reload,
};
