// UILand.js — the HUD of the wide-screen prototype (?land, card 45): fields laid over the records of
// UILayout.js by id (UI.overlay), numbers in px of a screen UI_REF_HEIGHT_LAND tall. The top plate
// becomes the left one, the bottom plate the right one, the middle of the screen stays the game's.
// Not in the editor: its UI tab shows the portrait layout, this table is edited by hand.
const UI_LAND_PLATE = 156;
const UI_LAND = {
    frameTop: { w: UI_LAND_PLATE, h: 520, stretch: 'v' },
    frameBottom: { anchor: 'top-right', w: UI_LAND_PLATE, h: 520, stretch: 'v', bleedTop: 1 },
    distanceIcon: { x: 14, y: 26 },
    dist: { x: 40, y: 22, w: 98 },
    recordIcon: { x: 14, y: 74 },
    best: { x: 40, y: 70, w: 98 },
    stationMoneyIcon: { x: 14, y: 74 },
    stationMoney: { x: 40, y: 70, w: 98 },
    gauge: { parent: 'frameTop', x: 29, y: 138 },
    ammoIcon: { parent: 'frameTop', x: 44, y: 262 },
    ammo: { parent: 'frameTop', x: 70, y: 262 },
    pauseBtn: { parent: 'frameBottom', anchor: 'top-center', x: 0, y: 18, w: 72, h: 72 },
    portraitFrame: { y: 106 },
    portrait: { y: 116 },
    shieldSocket: { anchor: 'top-center', x: 0, y: 224 },
    rescueSocket: { anchor: 'top-center', x: 0, y: 274 },
    hint: { parent: '', anchor: 'top-center', x: 0, y: 8, fontSize: 15 },
    stationNext: { parent: '', anchor: 'top-center', x: 0, y: 8, fontSize: 15 },
    effect: { parent: '', anchor: 'top-center', x: 0, y: 30, fontSize: 15 },
    tutorialBox: { x: UI_LAND_PLATE, y: 0, h: 72 },
    iconStrip: { x: UI_LAND_PLATE, y: 0 },
    stationShop: { y: 100 },
    boardBox: { h: 510 },
    boardList: { h: 310 },
    boardRow: { h: 30 },
    boardMe: { y: 378 },
};
