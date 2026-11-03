// clip-page.js — the page side of tools/make-clip.mjs: the game's frame loop stopped, every frame driven
// by hand at 30 fps, a scene from docs/video/scenes staged on a real run, captions and an end card over
// it in the game's font. window.__clip.step(i) makes frame i; the sounds are logged with their times
// instead of played, the driver mixes them. Not part of the game: it never ships (tools/ is not built).
(() => {
    const FPS = 30, cfg = window.__clipCfg, lang = cfg.lang;
    const g = app.game, sc = g.scene;
    World3D.engine.stopRenderLoop();
    sc.renderHeight = cfg.renderHeight || 384;    // 960 CSS px tall at dpr 2: whole pixels, 5 a texel
    sc.applyResolution();
    Lang.set(lang);
    const sounds = [];
    let T = 0;
    g._play = src => sounds.push([Math.round(T * 1000), src]);

    const css = document.createElement('style');
    css.textContent = `
      .clip-cap { position: fixed; left: 5%; right: 5%; top: 21%; text-align: center; font: 600 40px/1.15 "Alagard", sans-serif;
        color: #fff8ec; text-shadow: 0 0 2px #0b0a10, 3px 3px 0 #0b0a10, -3px 3px 0 #0b0a10, 3px -3px 0 #0b0a10, -3px -3px 0 #0b0a10;
        font-synthesis: none; pointer-events: none; z-index: 50; }
      .clip-cap b { color: #fcc048; font-weight: 600; }
      .clip-tap { position: fixed; width: 90px; height: 90px; margin: -45px 0 0 -45px; border: 6px solid #fff8ec; border-radius: 50%;
        box-shadow: 0 0 0 3px #0b0a10; z-index: 49; pointer-events: none; opacity: 0; }
      .clip-end { position: fixed; inset: 0; background: rgba(11, 10, 16, 0.86); z-index: 60; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 22px; opacity: 0; font-family: "Alagard", sans-serif; font-synthesis: none;
        color: #fff8ec; text-align: center; padding: 0 6%; }
      .clip-end img { width: 150px; height: 150px; image-rendering: pixelated; }
      .clip-end .t { font-size: 46px; } .clip-end .s { font-size: 28px; color: #e8d0a8; } .clip-end .b { font-size: 40px; color: #fcc048; }`;
    document.head.appendChild(css);
    const cap = document.createElement('div');
    cap.className = 'clip-cap';
    const tap = document.createElement('div');
    tap.className = 'clip-tap';
    const end = document.createElement('div');
    end.className = 'clip-end';
    const endLines = (cfg.endLines || {})[lang] || [];
    end.innerHTML = '<img src="assets/ui/hud_v3/portrait_calm.png" alt=""><div class="t">Rail Link: Collapse</div>' +
        endLines.map(l => '<div class="s">' + l + '</div>').join('') + '<div class="b">@railcollapsebot</div>';
    document.body.append(cap, tap, end);
    if (cfg.capTop) cap.style.top = cfg.capTop;    // a scene with a panel under the usual place of the captions

    // The run: a seed (one whose first stop has the asked look), the train where the scene starts,
    // a calm track from there on, hazards and pickups only where the scene lays them.
    let seed = cfg.seed || 1;
    if (cfg.look) while (CollapseStationView.lookOf(seed, 0) !== cfg.look) seed++;
    g.start(new CollapseStationRun(seed));
    const r = g.run, c = r.c, track = r.track, seg = track.seg.bind(track);
    const pos = cfg.station ? r.stationAt - cfg.station : cfg.pos;
    const calmFrom = Math.floor(pos) - 2, calm = collapseSegment('calm'), staged = new Map();
    track.seg = i => staged.get(i) || (i >= calmFrom && !cfg.station ? calm : seg(i));
    r.pos = pos;
    r._seg = Math.floor(pos);
    // A scene past a stop: the run counts that stop as passed, or its rules pull the train back to it.
    if (!cfg.station) while (r.stationAt < pos + 1) { r.stage++; r.leftAt = r.stationAt; r.stationAt = track.station(r.stage); }
    if (cfg.ammo != null) r.ammo = cfg.ammo;
    if (cfg.hp != null) r.hp = cfg.hp;

    let tapAt = -1;
    const ring = (x, y) => { tap.style.left = x + 'px'; tap.style.top = y + 'px'; tapAt = T; };
    const fronts = [];
    const act = {
        demon: a => r.demons.push({ at: Math.floor(r.pos) + 1, side: a.side, wait: a.wait, t: c.demonPerch + c.demonSec + (a.perch || 0), strike: c.demonStrikeSec, on: false }),
        shoot: a => {
            const t = sc.tapTargets(r).find(x => x.kind === 'demon' && x.side === a.side);
            if (t) ring(t.x, t.y);
            r.shootDemon(a.side);
        },
        // A hazard `ahead` segments in front of the nose on the train's lane, with its escape fork
        // (the generator's own laying) or without (fork: false — nothing to do but fall).
        hazard: a => {
            const block = [], at = Math.floor(r.pos) + a.ahead, lane = a.lane != null ? a.lane : r.lane;
            track._lay(block, 0, a.kind || 'gap', lane, a.len || 3);
            block.forEach((s, k) => {
                if (a.fork === false) s.forks = [];
                staged.set(at + k, s);
            });
        },
        pickup: a => {
            const s = collapseSegment('calm');
            s.pickup[r.lane] = a.kind;
            staged.set(Math.floor(r.pos) + a.ahead, s);
        },
        // The next fork, shot to a lane that is safe: what a player does at the last moment.
        fork: () => {
            const next = r.nextFork();
            if (!next) return;
            const to = next.to.find(l => r.forkSafe(next.at, l));
            const t = sc.tapTargets(r).find(x => x.kind === 'fork' && x.to === to);
            if (t) ring(t.x, t.y);
            r.shoot(next.at, to);
        },
        collapse: () => r.startCollapse(),
        front: a => fronts.push(a),
        buy: a => {
            const b = UI.get('station' + a.kind[0].toUpperCase() + a.kind.slice(1));
            if (b) { const q = b.el.getBoundingClientRect(); ring(q.left + q.width / 2, q.top + q.height / 2); }
            r.buy(a.kind);
        },
        leave: () => r.leave(),
        hp: a => { r.hp = a.value; },
    };
    const done = new Set();
    const captions = (cfg.captions || {})[lang] || [];

    window.__clip = {
        frames: Math.round(cfg.seconds * FPS),
        step(i) {
            T = i / FPS;
            cfg.actions.forEach((a, k) => { if (T >= a.at && !done.has(k)) { done.add(k); act[a.do](a); } });
            // The collapse held at a gap behind the train, eased in: the scene's "almost caught".
            for (const f of fronts) if (T >= f.at && T < f.till) {
                const k = Math.min(1, (T - f.at) / (f.ease || 1)), want = r.pos - (f.from + (f.gap - f.from) * k);
                r.front = Math.max(r.front, want);
            }
            const line = captions.find(k => T >= k.from && T < k.to);
            cap.innerHTML = line ? line.text.replace('{m}', String(r.meters)) : '';   // {m}: the meters of the run as it ended
            cap.style.opacity = line ? String(Math.min(1, line.from === 0 ? 1 : (T - line.from) * 6, (line.to - T) * 6)) : '0';
            const tk = tapAt < 0 ? 1 : (T - tapAt) / 0.35;
            tap.style.opacity = tk < 1 ? String(1 - tk) : '0';
            tap.style.transform = 'scale(' + (0.6 + tk * 0.7) + ')';
            end.style.opacity = String(Math.max(0, Math.min(1, (T - cfg.endAt) * 3)));
            g.update(1 / FPS);
            World3D.renderFrame();
            return { T, state: r.state, hp: r.hp, ammo: r.ammo, pos: Math.round(r.pos * 10) / 10, gap: r.collapsing ? Math.round((r.pos - r.front) * 10) / 10 : null };
        },
        sounds: () => sounds,
        collapsing: () => r.collapsing,
    };
})();
