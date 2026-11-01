const g=app.game,s=app.scene;await s.ready;World3D.engine.stopRenderLoop();const q=new URLSearchParams(location.search),lane=Number(q.get('lane')||1),inset=Number(q.get('inset')||0),kind=q.get('kind')||'icons';
document.documentElement.style.setProperty('--tg-content-safe-area-inset-top',inset+'px');UI.resize();
g.start(new CollapseRun(7));const r=g.run;r.track.segs=Array.from({length:80},()=>collapseSegment('qa'));r.lane=r.prevLane=lane;r.pos=r._seg=20;r.front=15;
const draw=()=>{g.update(0);World3D.renderFrame();};
if(kind==='icons'){for(let l=0;l<3;l++){r.track.segs[25].gap[l]=l===0;r.track.segs[25].lava[l]=l===1;r.track.segs[25].pickup[l]=l===2?'ammo':null;}}
if(kind==='demons')r.demons=[{at:20,side:-1,wait:0,t:.35},{at:20,side:1,wait:0,t:.35}];
if(kind==='hint'){g.start(new CollapseTutorial());while(g.run.pos<20){g.update(1/60);const n=g.run.nextFork();if(n&&!n.armed)g.run.shoot(n.at,n.to[0]);} }
for(let i=0;i<30;i++){s.sync(g.run,1/60);}draw();await new Promise(r=>setTimeout(r,500));for(let i=0;i<5;i++)draw();
const rect=id=>{const e=UI.get(id),b=e.el.getBoundingClientRect();return{id,visible:e.visible,text:e._text,src:e._src,x:b.x,y:b.y,w:b.width,h:b.height};};
return {kind,lane,inset,pos:g.run.pos,index:g.run.index,hint:rect('tutorialText'),icons:Game.ICON_IDS.map(rect),targets:s.tapTargets(g.run).map(t=>({...t,hit:document.elementFromPoint(t.x,t.y)?.dataset.ui||document.elementFromPoint(t.x,t.y)?.id})),frameTop:rect('frameTop'),frameBottom:rect('frameBottom')};

