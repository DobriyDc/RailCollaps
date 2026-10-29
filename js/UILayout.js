// UILayout.js — the game's UI layout: every HUD element, placed and styled in the editor (UI tab).
// The editor rewrites the whole file (POST /api/save-ui) — keep the format. Drawn by js/UI.js;
// game code takes an element by id: UI.get('score').setText('10') — and never positions HUD itself.
//   kind — 'text' | 'panel' | 'bar' | 'button'; anchor — one of 9 screen points ('top-left' …
//   'bottom-right'): x, y go from it to the same point of the element (inward from an edge,
//   signed from the center); w, h — px; numbers are px of a screen UI_REF_HEIGHT tall;
//   parent (optional) — id of the element this one sits in: anchor, x, y then count from the
//   parent's box, the parent clips it and hides it together with itself;
//   stretch (optional) — 'h' | 'v' | 'both': fills the container on that axis, x (y) — the inset
//   from both edges, w (h) is ignored;
//   colors — '#rrggbb', '' — none; visible: 0 — hidden until the game calls show().
//   Records go in drawing order: later — on top.
const UI_LAYOUT = [
    { id: 'dist', kind: 'text', anchor: 'top-left', x: 12, y: 10, text: "0 м", fontSize: 28, color: '#f7eed2', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'best', kind: 'text', anchor: 'top-left', x: 12, y: 48, text: "Рекорд 0 м", fontSize: 14, color: '#b5b9b4', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'chase', kind: 'bar', anchor: 'top-center', x: 12, y: 136, w: 160, h: 8, stretch: 'h', value: 1, color: '#ff5a4b', fill: '#2a2224', border: '', radius: 3, alpha: 0.9, visible: 1 },
    { id: 'ammo', kind: 'text', anchor: 'top-left', x: 12, y: 82, text: "Патроны 8", fontSize: 14, color: '#ffd965', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'rescue', kind: 'text', anchor: 'top-right', x: 12, y: 82, text: "Спасение 0", fontSize: 14, color: '#ff7f22', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'shield', kind: 'text', anchor: 'top-left', x: 12, y: 108, text: "Щит 0", fontSize: 14, color: '#3ddeef', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'effect', kind: 'text', anchor: 'top-right', x: 12, y: 108, text: "", fontSize: 13, color: '#ffd965', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'pauseBtn', kind: 'button', anchor: 'top-right', x: 12, y: 12, w: 50, h: 50, text: "II", fontSize: 20, color: '#f7eed2', fill: '#2a2224', border: '#5b6569', radius: 6, alpha: 0.85, visible: 1 },
    { id: 'hint', kind: 'text', anchor: 'bottom-center', x: 0, y: 22, text: "Тап по табличке — выстрел по стрелке", fontSize: 14, color: '#f7eed2', shadow: '#0b0809', alpha: 0.85, visible: 1 },
    { id: 'over', kind: 'panel', anchor: 'top-left', x: 0, y: 0, w: 240, h: 80, stretch: 'both', fill: '', border: '', radius: 0, alpha: 1, visible: 0 },
    { id: 'overDim', kind: 'panel', anchor: 'top-left', parent: 'over', x: 0, y: 0, w: 240, h: 80, stretch: 'both', fill: '#000000', border: '', radius: 0, alpha: 0.55, visible: 1 },
    { id: 'overBox', kind: 'panel', anchor: 'middle-center', parent: 'over', x: 0, y: 0, w: 300, h: 270, fill: '#211c24', border: '#ff7f22', radius: 10, alpha: 0.96, visible: 1 },
    { id: 'overTitle', kind: 'text', anchor: 'top-center', parent: 'overBox', x: 0, y: 18, text: "Обвал", fontSize: 24, color: '#ff7f22', shadow: '#0b0809', alpha: 1, visible: 1 },
    { id: 'overBody', kind: 'panel', anchor: 'top-left', parent: 'overBox', x: 12, y: 64, w: 240, h: 76, stretch: 'h', fill: '', border: '', radius: 0, alpha: 1, visible: 1 },
    { id: 'overText', kind: 'text', anchor: 'top-center', parent: 'overBody', x: 0, y: 0, text: "", fontSize: 13, color: '#f7eed2', shadow: '', alpha: 1, visible: 1 },
    { id: 'continueBtn', kind: 'button', anchor: 'bottom-center', parent: 'overBox', x: 0, y: 84, w: 268, h: 50, text: "Продолжить за рекламу", fontSize: 15, color: '#181419', fill: '#ffd965', border: '', radius: 8, alpha: 1, visible: 1 },
    { id: 'restartBtn', kind: 'button', anchor: 'bottom-center', parent: 'overBox', x: 0, y: 22, w: 268, h: 50, text: "Заново", fontSize: 16, color: '#181419', fill: '#ff7f22', border: '', radius: 8, alpha: 1, visible: 1 },
];
