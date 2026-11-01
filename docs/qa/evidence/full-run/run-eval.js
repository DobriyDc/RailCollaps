const g=app.game,s=app.scene; await s.ready; World3D.engine.stopRenderLoop();
const q=new URLSearchParams(location.search),phase=q.get('qa')||'tutorial';
document.documentElement.style.setProperty('--tg-content-safe-area-inset-top',(q.get('inset')||0)+'px');UI.resize();
const click=id=>UI.get(id).el.click();
const tick=(n=1)=>{for(let i=0;i<n;i++)g.update(1/60);};
const draw=()=>{g.update(0);World3D.renderFrame();};
const tap=t=>{const r=s.canvas.getBoundingClientRect();document.elementFromPoint(t.x+r.left,t.y+r.top).dispatchEvent(new PointerEvent('pointerdown',{clientX:t.x+r.left,clientY:t.y+r.top,bubbles:true}));};
const results=[]; const check=(name,ok,data)=>results.push({name,ok,...data});
if(phase==='tutorial'){
click('menuStart');click('modeTutorial');const seen=new Set(),shots=[];let last=-1;
for(let i=0;i<16000&&g.run.tutorial;i++){
const r=g.run;seen.add(r.index);draw();
for(const t of s.tapTargets(r)) { if(t.kind==='fork'&&!r.armed) {const before=r.ammo;tap(t);if(r.ammo<before)shots.push({index:r.index,kind:t.kind,to:t.to});} if(t.kind==='demon'){tap(t);shots.push({index:r.index,kind:t.kind});} }
tick();
}
check('tutorial-complete',g.tutorialPassed&&!g.run.tutorial,{steps:[...seen],shots,saved:Store.get('collapse.tutorial')});
g.setPaused(true);draw();
}else if(phase==='runs'){
for(const seed of [7,83,2026]){g.start(new CollapseRun(seed));for(let i=0;i<10000&&g.mode==='play';i++)tick();tick(100);check('run-'+seed,g.mode==='over',{meters:g.run.meters,reason:g.run.reason,steps:g.run.steps});}
click('restartBtn');tick(60);click('pauseBtn');const p=g.run.pos;tick(120);check('pause',g.mode==='pause'&&g.run.pos===p,{pos:p,after:g.run.pos});click('restartBtn');tick(60);check('resume',g.mode==='play'&&g.run.pos>p,{pos:g.run.pos});
while(g.mode==='play')tick();tick(100);const before=g.run.pos;click('continueBtn');await new Promise(r=>setTimeout(r,850));draw();check('ad-continue',g.mode==='play'&&g.run.continued,{stub:Ads.stub,mode:g.mode,pos:before,continued:g.run.continued});g.run._crash('lava');tick(100);check('ad-once',!g.run.canContinue&&!UI.get('continueBtn').visible,{canContinue:g.run.canContinue});draw();
}else if(phase==='demons'){
for(const pair of [false,true])for(const jump of [false,true]){
g.start(new CollapseRun(7));const r=g.run;r.pos=70;r._seg=70;r.front=65;r.demons=[{at:70,side:-1,wait:0,t:jump?r.c.demonSec/2:r.c.demonPerch+r.c.demonSec}];if(pair)r.demons.push({at:70,side:1,wait:0,t:jump?r.c.demonSec/2:r.c.demonPerch+r.c.demonSec});draw();const before=r.ammo,targets=s.tapTargets(r).filter(t=>t.kind==='demon');for(const t of targets)tap(t);check(`demons-${pair?'pair':'single'}-${jump?'jump':'appear'}`,r.demons.length===0,{targets,ammoBefore:before,ammoAfter:r.ammo,remaining:r.demons.length});}
g.start(new CollapseRun(7));g.run.pos=70;g.run._seg=70;g.run.front=65;g.run.demons=[{at:70,side:-1,wait:0,t:.35},{at:70,side:1,wait:0,t:.35}];draw();
}else if(phase==='hazards'){
for(const kind of ['gap','lava','caught','shield','rescue']){
g.start(new CollapseRun(7));const r=g.run;r.track.segs=Array.from({length:40},()=>collapseSegment('qa'));r.pos=.95;r.front=-5;
if(kind==='gap'||kind==='rescue')r.track.segs[1].gap[1]=true;
if(kind==='lava'||kind==='shield')r.track.segs[1].lava[1]=true;
if(kind==='shield')r.shield=1;if(kind==='rescue')r.rescue=1;if(kind==='caught')r.front=r.pos-.34;
tick(5);check(kind,['shield','rescue'].includes(kind)?r.state==='run'&&(kind==='shield'?r.shield===0:r.rescue===0&&r.lane!==1):r.state==='over'&&r.reason===kind,{state:r.state,reason:r.reason,lane:r.lane,shield:r.shield,rescue:r.rescue});}
draw();
}else if(phase==='lanes'){
for(const from of [0,1,2])for(const to of CollapseRules.neighbors(from)){
g.start(new CollapseRun(7));const r=g.run;r.track.segs=Array.from({length:40},()=>collapseSegment('qa'));r.track.segs[5].forks=[{from,to}];r.lane=r.prevLane=from;r.pos=2.2;r._seg=2;r.front=-3;draw();const target=s.tapTargets(r).find(t=>t.kind==='fork');const before=r.ammo;if(target)tap(target);tick(100);check(`lane-${from}-${to}`,r.lane===to,{target,ammoBefore:before,ammoAfter:r.ammo,lane:r.lane,armed:r.armed});}
draw();
}
return {phase,results,passed:results.filter(x=>x.ok).length,total:results.length,mode:g.mode,targets:s.tapTargets(g.run)};


