const g=app.game,s=app.scene; await s.ready;World3D.engine.stopRenderLoop();g.start(new CollapseTutorial(8));
let n=0;while((!g.run.shootable().length||g.run.shootable()[0].t>g.run.c.demonSec+.4)&&n++<800)g.update(1/60);
for(let i=0;i<8;i++){World3D.renderFrame();await new Promise(r=>setTimeout(r,40));}
if(new URLSearchParams(location.search).has('hide')){for(const v of s.demonViews.values())v.setEnabled(false);World3D.renderFrame();} return {pos:g.run.pos,demons:g.run.demons,targets:s.tapTargets(g.run),views:[...s.demonViews].map(([side,v])=>({side,enabled:v.isEnabled(),visible:v.isVisible,visibility:v.visibility,pos:v.position.asArray(),scaling:v.scaling.asArray(),ready:v.isReady(),texture:v.material.emissiveTexture.url,texReady:v.material.emissiveTexture.isReady(),active:s.scene.getActiveMeshes().data.includes(v),backFaceCulling:v.material.backFaceCulling})),text:UI.get('tutorialText')._text};


