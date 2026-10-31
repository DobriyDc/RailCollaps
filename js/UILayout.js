// UILayout.js — the game's UI layout: every HUD element, placed and styled in the editor (UI tab).
// The editor rewrites the whole file (POST /api/save-ui) — keep the format. Drawn by js/UI.js;
// game code takes an element by id: UI.get('score').setText('10') — and never positions HUD itself.
//   kind — 'text' | 'panel' | 'bar' | 'button' | 'image'; anchor — one of 9 screen points ('top-left' …
//   'bottom-right'): x, y go from it to the same point of the element (inward from an edge,
//   signed from the center); w, h — px; numbers are px of a screen UI_REF_HEIGHT tall;
//   parent (optional) — id of the element this one sits in: anchor, x, y then count from the
//   parent's box, the parent clips it and hides it together with itself;
//   stretch (optional) — 'h' | 'v' | 'both': fills the container on that axis, x (y) — the inset
//   from both edges, w (h) is ignored;
//   colors — '#rrggbb', '' — none; visible: 0 — hidden until the game calls show().
//   Records go in drawing order: later — on top.
const UI_LAYOUT = [
    { id: 'hitFlash', kind: 'panel', anchor: 'top-left', x: 0, y: 0, w: 240, h: 80, stretch: 'both', fill: '#ff1e12', border: '', radius: 0, alpha: 0.38, visible: 0 },
    { id: 'frameLeft', kind: 'panel', anchor: 'top-left', x: 0, y: 0, w: 4, h: 80, stretch: 'v', fill: '#5b4a42', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'frameRight', kind: 'panel', anchor: 'top-right', x: 0, y: 0, w: 4, h: 80, stretch: 'v', fill: '#5b4a42', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'frameTop', kind: 'panel', anchor: 'top-left', x: 0, y: 0, w: 240, h: 66, stretch: 'h', fill: '#211c24', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'frameTopEdge', kind: 'panel', anchor: 'bottom-left', parent: 'frameTop', x: 0, y: 0, w: 240, h: 2, stretch: 'h', fill: '#5b4a42', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'frameBottom', kind: 'panel', anchor: 'bottom-left', x: 0, y: 0, w: 240, h: 96, stretch: 'h', fill: '#211c24', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'frameBottomEdge', kind: 'panel', anchor: 'top-left', parent: 'frameBottom', x: 0, y: 0, w: 240, h: 2, stretch: 'h', fill: '#5b4a42', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'dist', kind: 'text', anchor: 'top-left', parent: 'frameTop', x: 12, y: 8, text: "0 м", fontSize: 24, color: '#f7eed2', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'best', kind: 'text', anchor: 'top-left', parent: 'frameTop', x: 12, y: 38, text: "Рекорд 0 м", fontSize: 13, color: '#b5b9b4', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'ammo', kind: 'text', anchor: 'top-left', parent: 'frameBottom', x: 12, y: 14, text: "Патроны 8", fontSize: 14, color: '#ffd965', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'rescue', kind: 'text', anchor: 'top-right', parent: 'frameBottom', x: 12, y: 14, text: "Спасение 0", fontSize: 14, color: '#ff7f22', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'shield', kind: 'text', anchor: 'top-center', parent: 'frameBottom', x: 0, y: 14, text: "Щит 0", fontSize: 14, color: '#3ddeef', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'effect', kind: 'text', anchor: 'top-center', parent: 'frameBottom', x: 0, y: 40, text: "", fontSize: 13, color: '#ffd965', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'pauseBtn', kind: 'button', anchor: 'top-right', parent: 'frameTop', x: 12, y: 8, w: 50, h: 50, text: "II", fontSize: 20, color: '#f7eed2', fill: '#2a2224', border: '#5b6569', radius: 2, alpha: 1, visible: 1 },
    { id: 'hint', kind: 'text', anchor: 'top-center', parent: 'frameBottom', x: 0, y: 67, text: "Тап по табличке — выстрел по стрелке", fontSize: 14, color: '#f7eed2', shadow: '', alpha: 1, visible: 1 },
    { id: 'iconStrip', kind: 'panel', anchor: 'bottom-left', x: 4, y: 96, w: 240, h: 48, stretch: 'h', fill: '', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'iconWallLeft', kind: 'image', anchor: 'middle-left', parent: 'iconStrip', x: 2, y: 0, w: 32, h: 32, src: 'assets/px/demon/jump_1.png', fill: '#211c24', border: '#5b4a42', radius: 4, alpha: 1, visible: 0 },
    { id: 'iconLane0', kind: 'image', anchor: 'middle-center', parent: 'iconStrip', x: -78, y: 0, w: 36, h: 36, src: 'assets/px/ui/hazard.png', fill: '#211c24', border: '#5b4a42', radius: 4, alpha: 1, visible: 0 },
    { id: 'iconLane0Next', kind: 'image', anchor: 'middle-center', parent: 'iconStrip', x: -46, y: 0, w: 26, h: 26, src: 'assets/px/ui/hazard.png', fill: '#211c24', border: '#5b4a42', radius: 4, alpha: 1, visible: 0 },
    { id: 'iconLane1', kind: 'image', anchor: 'middle-center', parent: 'iconStrip', x: 0, y: 0, w: 36, h: 36, src: 'assets/px/ui/hazard.png', fill: '#211c24', border: '#5b4a42', radius: 4, alpha: 1, visible: 0 },
    { id: 'iconLane1Next', kind: 'image', anchor: 'middle-center', parent: 'iconStrip', x: 32, y: 0, w: 26, h: 26, src: 'assets/px/ui/hazard.png', fill: '#211c24', border: '#5b4a42', radius: 4, alpha: 1, visible: 0 },
    { id: 'iconLane2', kind: 'image', anchor: 'middle-center', parent: 'iconStrip', x: 78, y: 0, w: 36, h: 36, src: 'assets/px/ui/hazard.png', fill: '#211c24', border: '#5b4a42', radius: 4, alpha: 1, visible: 0 },
    { id: 'iconLane2Next', kind: 'image', anchor: 'middle-center', parent: 'iconStrip', x: 110, y: 0, w: 26, h: 26, src: 'assets/px/ui/hazard.png', fill: '#211c24', border: '#5b4a42', radius: 4, alpha: 1, visible: 0 },
    { id: 'iconWallRight', kind: 'image', anchor: 'middle-right', parent: 'iconStrip', x: 2, y: 0, w: 32, h: 32, src: 'assets/px/demon/jump_1.png', fill: '#211c24', border: '#5b4a42', radius: 4, alpha: 1, visible: 0 },
    { id: 'over', kind: 'panel', anchor: 'top-left', x: 0, y: 0, w: 240, h: 80, stretch: 'both', fill: '', border: '', radius: 0, alpha: 1, visible: 0 },
    { id: 'overDim', kind: 'panel', anchor: 'top-left', parent: 'over', x: 0, y: 0, w: 240, h: 80, stretch: 'both', fill: '#000000', border: '', radius: 0, alpha: 0.55, visible: 1 },
    { id: 'overBox', kind: 'panel', anchor: 'middle-center', parent: 'over', x: 0, y: 0, w: 300, h: 270, fill: '#211c24', border: '#ff7f22', radius: 10, alpha: 0.96, visible: 1 },
    { id: 'overTitle', kind: 'text', anchor: 'top-center', parent: 'overBox', x: 0, y: 18, text: "Обвал", fontSize: 24, color: '#ff7f22', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'overBody', kind: 'panel', anchor: 'top-left', parent: 'overBox', x: 12, y: 64, w: 240, h: 76, stretch: 'h', fill: '', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'overText', kind: 'text', anchor: 'top-center', parent: 'overBody', x: 0, y: 0, text: "", fontSize: 13, color: '#f7eed2', shadow: '', alpha: 1, visible: 1 },
    { id: 'continueBtn', kind: 'button', anchor: 'bottom-center', parent: 'overBox', x: 0, y: 84, w: 268, h: 50, text: "Продолжить за рекламу", fontSize: 15, color: '#181419', fill: '#ffd965', border: '', radius: 8, alpha: 1, visible: 1 },
    { id: 'restartBtn', kind: 'button', anchor: 'bottom-center', parent: 'overBox', x: 0, y: 22, w: 268, h: 50, text: "Заново", fontSize: 16, color: '#181419', fill: '#ff7f22', border: '', radius: 8, alpha: 1, visible: 1 },
    { id: 'boardBtn', kind: 'button', anchor: 'middle-center', parent: 'over', x: 0, y: 170, w: 268, h: 44, text: "Таблица лидеров", fontSize: 15, color: '#f7eed2', fill: '#2a2224', border: '#5b6569', radius: 8, alpha: 1, visible: 0 },
    { id: 'board', kind: 'panel', anchor: 'top-left', x: 0, y: 0, w: 240, h: 80, stretch: 'both', fill: '', border: '', radius: 0, alpha: 1, visible: 0 },
    { id: 'boardDim', kind: 'button', anchor: 'top-left', parent: 'board', x: 0, y: 0, w: 240, h: 80, stretch: 'both', text: "", fontSize: 16, color: '#000000', fill: '#000000', border: '', radius: 0, alpha: 0.7, visible: 1 },
    { id: 'boardBox', kind: 'panel', anchor: 'middle-center', parent: 'board', x: 0, y: 0, w: 308, h: 566, fill: '#211c24', border: '#ff7f22', radius: 10, alpha: 0.98, visible: 1 },
    { id: 'boardTitle', kind: 'text', anchor: 'top-center', parent: 'boardBox', x: 0, y: 12, text: "Таблица лидеров", fontSize: 20, color: '#ff7f22', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'boardSeason', kind: 'text', anchor: 'top-center', parent: 'boardBox', x: 0, y: 40, text: "Сезон 1", fontSize: 12, color: '#b5b9b4', shadow: '', alpha: 1, visible: 1 },
    { id: 'boardList', kind: 'panel', anchor: 'top-left', parent: 'boardBox', x: 10, y: 62, w: 240, h: 370, stretch: 'h', fill: '', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'boardRow', kind: 'panel', anchor: 'top-left', parent: 'boardList', x: 0, y: 0, w: 240, h: 34, stretch: 'h', fill: '#2a2224', border: '', radius: 4, alpha: 1, visible: 0 },
    { id: 'boardRowMark', kind: 'panel', anchor: 'top-left', parent: 'boardRow', x: 0, y: 0, w: 5, h: 34, stretch: 'v', fill: '#ffd965', border: '', radius: 0, alpha: 1, visible: 0 },
    { id: 'boardRowPlace', kind: 'text', anchor: 'middle-left', parent: 'boardRow', x: 12, y: 0, text: "100", fontSize: 14, color: '#b5b9b4', shadow: '', alpha: 1, visible: 1 },
    { id: 'boardRowClip', kind: 'panel', anchor: 'middle-left', parent: 'boardRow', x: 46, y: 0, w: 168, h: 18, fill: '', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'boardRowName', kind: 'text', anchor: 'top-left', parent: 'boardRowClip', x: 0, y: 0, text: "Имя игрока", fontSize: 14, color: '#f7eed2', shadow: '', alpha: 1, visible: 1 },
    { id: 'boardRowMeters', kind: 'text', anchor: 'middle-right', parent: 'boardRow', x: 8, y: 0, text: "0 м", fontSize: 14, color: '#ffd965', shadow: '', alpha: 1, visible: 1 },
    { id: 'boardStatus', kind: 'text', anchor: 'middle-center', parent: 'boardList', x: 0, y: 0, text: "Загрузка…", fontSize: 15, color: '#f7eed2', shadow: '', alpha: 1, visible: 0 },
    { id: 'boardMe', kind: 'text', anchor: 'top-center', parent: 'boardBox', x: 0, y: 438, text: "", fontSize: 14, color: '#ffd965', shadow: '', alpha: 1, visible: 1 },
    { id: 'boardPrev', kind: 'button', anchor: 'bottom-left', parent: 'boardBox', x: 12, y: 64, w: 76, h: 40, text: "‹", fontSize: 22, color: '#f7eed2', fill: '#2a2224', border: '#5b6569', radius: 8, alpha: 1, visible: 0 },
    { id: 'boardPage', kind: 'text', anchor: 'bottom-center', parent: 'boardBox', x: 0, y: 74, text: "1 / 1", fontSize: 14, color: '#b5b9b4', shadow: '', alpha: 1, visible: 0 },
    { id: 'boardNext', kind: 'button', anchor: 'bottom-right', parent: 'boardBox', x: 12, y: 64, w: 76, h: 40, text: "›", fontSize: 22, color: '#f7eed2', fill: '#2a2224', border: '#5b6569', radius: 8, alpha: 1, visible: 0 },
    { id: 'boardClose', kind: 'button', anchor: 'bottom-center', parent: 'boardBox', x: 0, y: 12, w: 268, h: 44, text: "Закрыть", fontSize: 16, color: '#181419', fill: '#ff7f22', border: '', radius: 8, alpha: 1, visible: 1 },
];
