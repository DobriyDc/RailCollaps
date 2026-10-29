// main.js — entry point of Rail Link: Collapse: 3D engine -> the tunnel (CollapseScene.js) ->
// UI (UILayout.js) -> game (Game.js) -> frame loop. window.app = { scene, game } — for the console
// and for Debug3D. The kit's Location3D (terrain and Objects.js) is not used by this game.

function updateLoadingProgress(percent) {
    const bar = /** @type {HTMLElement | null} */ (document.querySelector('.loading-progress'));
    if (bar) bar.style.width = percent + '%';
}

// The loading screen goes away when the tunnel's textures are ready.
function hideLoader() {
    updateLoadingProgress(100);
    setTimeout(() => {
        const screen = document.getElementById('loading-screen');
        if (screen) screen.style.display = 'none';
    }, 300);
}

function showBootError(text) {
    console.error(text);
    const el = document.querySelector('.loading-text');
    if (el) el.textContent = text;
}

function startGame() {
    if (window.app) return;                 // guard against a repeated start
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('world3d'));
    updateLoadingProgress(40);
    // Telegram first (skill telegram-miniapp, launch sequence): our loading screen replaces its
    // placeholder; minimizing the app pauses the run.
    TG.boot(() => { if (window.app && window.app.game) window.app.game.setPaused(true); });
    if (!World3D.init(canvas)) { showBootError('3D недоступен: нет libs/babylon.js или WebGL'); return; }

    const scene = new CollapseScene(canvas);
    UI.init(canvas);
    window.app = { scene, game: null };
    const game = window.app.game = new Game(window.app);
    updateLoadingProgress(70);

    let last = performance.now();
    World3D.engine.runRenderLoop(() => {
        const now = performance.now(), dt = (now - last) / 1000;
        last = now;
        game.update(Math.min(0.1, dt));
        World3D.renderFrame();
    });
    window.addEventListener('resize', () => scene.applyResolution());
    scene.ready.then(hideLoader);
}

window.onload = () => startGame();
