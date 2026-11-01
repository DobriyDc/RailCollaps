const g=app.game,s=app.scene;await s.ready;World3D.engine.stopRenderLoop();const kind=new URLSearchParams(location.search).get('hazard');g.start(new CollapseRun(7));const r=g.run;r.track.segs=Array.from({length:40},()=>collapseSegment('qa'));r.pos=.95;r.front=-5;
if(['gap','rescue'].includes(kind))r.track.segs[1].gap[1]=true;if(['lava','shield'].includes(kind))r.track.segs[1].lava[1]=true;if(kind==='shield')r.shield=1;if(kind==='rescue')r.rescue=1;if(kind==='caught')r.front=r.pos-.34;
for(let i=0;i<25;i++)g.update(1/60);for(let i=0;i<6;i++){World3D.renderFrame();await new Promise(r=>setTimeout(r,50));}
return{kind,state:r.state,reason:r.reason,lane:r.lane,shield:r.shield,rescue:r.rescue,pos:r.pos};
