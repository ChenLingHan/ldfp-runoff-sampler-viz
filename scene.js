import * as T from './three.module.js';
import { mat, mesh, b, cy, pipe, host, valve } from './hardware.js';

const viewport = document.getElementById('scene-viewport');
const badge = document.getElementById('scene-state');
const help = document.getElementById('scene-help');
const resetView = document.getElementById('reset-view');
const buttons = [...document.querySelectorAll('[data-view]')];
const stages = ['待机', '正转预冲', '定量留样', '停泵隔离', '反转排液'];
const blue = mat(0x2cb2ba,{roughness:.25,emissive:0x16535b,emissiveIntensity:.45});
const amber = mat(0xdd863b,{roughness:.38,emissive:0x683014,emissiveIntensity:.35});
const vec = (...xyz) => new T.Vector3(...xyz);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let seed = 5827;
const random = () => ((seed = (Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);

function texture(base, marks, count, repeat) {
  const image = document.createElement('canvas');
  image.width = image.height = 256;
  const ctx = image.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0,0,256,256);
  for(let i=0;i<count;i++){
    ctx.fillStyle = marks[i%marks.length];
    const size = .4 + random()*2.6;
    ctx.fillRect(random()*256,random()*256,size,size*.63);
  }
  const map = new T.CanvasTexture(image);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(...repeat);
  map.anisotropy = 4;
  return map;
}

function daylight() {
  const scene = new T.Scene();
  scene.background = new T.Color(0xf0f5ed);
  scene.add(new T.HemisphereLight(0xf2fbff,0x8f8168,2));
  const sun = new T.DirectionalLight(0xfff2d7,2.55);
  sun.position.set(-5,10,5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:25});
  sun.shadow.bias=-.00045;
  sun.shadow.normalBias=.022;
  sun.shadow.radius=3;
  scene.add(sun);
  return scene;
}

function floor(scene, size, color) {
  const surface = mesh(scene,new T.PlaneGeometry(size,size),mat(color,{roughness:.96}),[0,-.16,0]);
  surface.rotation.x=-Math.PI/2;
  surface.castShadow=false;
}

function frameBox(min,max){
  const corners=[];
  for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]])corners.push(vec(x,y,z));
  return corners;
}

function crops(scene) {
  const coordinates=[];
  for(let row=0;row<12;row++)for(let plant=0;plant<12;plant++){
    coordinates.push([-4.48+row*.59+(random()-.5)*.06,.17,-2.16+plant*.385+(random()-.5)*.12]);
  }
  const leaf = new T.BufferGeometry();
  const positions=[], indices=[];
  for(let i=0;i<=7;i++){
    const t=i/7,w=.041*Math.sin(Math.PI*t)**.68+.001;
    const y=.47*t-.17*t*t,z=.28*t*t;
    positions.push(-w,y,z,0,y+.013*Math.sin(Math.PI*t),z,w,y,z);
    if(i<7){const n=i*3;indices.push(n,n+3,n+1,n+1,n+3,n+4,n+1,n+4,n+2,n+2,n+4,n+5);}
  }
  leaf.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  leaf.setIndex(indices);leaf.computeVertexNormals();
  const foliage = new T.InstancedMesh(leaf,mat(0xffffff,{roughness:.85,side:T.DoubleSide}),coordinates.length*7);
  const stem = new T.InstancedMesh(new T.CylinderGeometry(.012,.017,.26,5),mat(0x79994a),coordinates.length);
  foliage.castShadow=stem.castShadow=true;
  foliage.receiveShadow=true;
  const dummy=new T.Object3D();
  const colors=[0x385f2a,0x4b7831,0x648e3e,0x77993d,0x3d7034,0x8b9f48];
  coordinates.forEach(([x,y,z],i)=>{
    const height=.74+random()*.65;
    dummy.position.set(x,y+.11*height,z);dummy.rotation.set(0,0,(random()-.5)*.13);dummy.scale.set(1,height,1);
    dummy.updateMatrix();stem.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<7;j++){
      dummy.position.set(x,y+(j%3)*.047,z);
      dummy.rotation.set((random()-.5)*.3,j*Math.PI*2/7+random()*.65,(random()-.5)*.38);
      dummy.scale.setScalar(height*(.72+random()*.48));dummy.updateMatrix();
      foliage.setMatrixAt(i*7+j,dummy.matrix);
      foliage.setColorAt(i*7+j,new T.Color(colors[Math.floor(random()*colors.length)]));
    }
  });
  scene.add(stem,foliage);
}

function trace(scene, points, color, radius=.018) {
  const group=new T.Group();
  scene.add(group);
  const route=new T.CatmullRomCurve3(points.map(p=>vec(...p)));
  const tube=new T.Mesh(new T.TubeGeometry(route,36,radius,6,false),color);
  group.add(tube);
  const beads=new T.InstancedMesh(new T.SphereGeometry(radius*1.35,8,5),color,7);
  beads.frustumCulled=false;
  group.add(beads);
  const transform=new T.Matrix4();
  return {
    group,
    animate(time,reverse=false){
      for(let i=0;i<7;i++){
        const progress=(time*.72+i/7)%1;
        const p=route.getPoint(reverse?1-progress:progress);
        beads.setMatrixAt(i,transform.makeTranslation(p.x,p.y,p.z));
      }
      beads.instanceMatrix.needsUpdate=true;
    }
  };
}

function field() {
  const scene=daylight();
  floor(scene,38,0xe2eadc);
  const earth=mat(0x9e774d,{map:texture('#af9478',['#746353','#dbc3a7','#a5896c','#93826e'],5900,[4,4]),roughness:.97});
  const bank=mat(0x8b8f59,{map:texture('#b0ac89',['#777952','#c9c3a0','#8f9874'],5300,[3,3]),roughness:.94});
  const ridge=mat(0x876640,{map:earth.map,roughness:.98});
  b(scene,-1.10,-.024,0,7.7,.24,5.4,earth);
  for(let x=-4.48;x<2.4;x+=.59){
    const row=cy(scene,x,.105,0,.135,4.82,ridge,14);
    row.rotation.x=Math.PI/2;
    row.scale.x=.83;row.scale.z=.37;
  }
  b(scene,-4.92,.20,0,.25,.35,5.54,bank);b(scene,2.74,.20,0,.26,.35,5.54,bank);
  b(scene,-1.10,.20,-2.66,7.65,.35,.28,bank);
  b(scene,-2.07,.18,2.67,5.68,.31,.30,bank);b(scene,1.96,.18,2.67,1.42,.31,.30,bank);
  crops(scene);
  const steel=mat(0xb0b8bc,{metalness:.55,roughness:.39});
  const concrete=mat(0xaab4ab,{roughness:.96});
  b(scene,1.02,.02,3.25,.70,.15,1.54,concrete);
  for(const x of [.71,1.33])b(scene,x,.17,3.25,.055,.31,1.54,steel);
  for(const x of [.71,1.33])for(const z of [2.58,3.93])cy(scene,x,.332,z,.024,.024,steel,6);
  const waterMap=texture('#92bac2',['#b9d9d7','#7fabb9','#accfd2'],2100,[1,2.2]);
  const water=mat(0x63a5b8,{map:waterMap,roughness:.16,metalness:.22});
  const trough=b(scene,1.02,.098,3.25,.54,.026,1.49,water);
  trough.castShadow=false;
  b(scene,1.02,.17,3.08,.57,.17,.038,steel);
  b(scene,.73,.43,2.98,.044,.63,.051,steel);
  b(scene,.92,.70,2.98,.39,.046,.057,steel);
  b(scene,1.07,.688,2.98,.11,.073,.095,mat(0x244c44));
  b(scene,3.48,-.075,3.17,2.32,.16,1.86,concrete);
  const cabinet=new T.Group();scene.add(cabinet);cabinet.position.set(3.48,.055,3.14);cabinet.scale.setScalar(.40);
  host(cabinet,'closed');
  const tap=new T.Group();scene.add(tap);tap.position.set(1.49,.19,3.48);tap.scale.setScalar(.25);
  valve(tap);
  const source=[[1.03,.135,3.41],[1.24,.24,3.46],[1.49,.255,3.48]];
  const supply=[[1.49,.255,3.48],[1.71,.27,3.49],[2.08,.44,3.46],[2.48,1.17,3.10],[2.57,1.19,2.91]];
  const waste=[[1.49,.24,3.64],[1.77,.20,3.92],[2.25,.28,4.03],[2.65,.58,4.10]];
  const sampleWaste=[[4.33,.86,3.34],[4.42,.40,3.82],[3.62,.58,4.12],[3.26,.58,4.12]];
  pipe(scene,supply,.024,mat(0x345957));
  pipe(scene,source,.024,mat(0x345957));
  pipe(scene,waste,.018,mat(0x9c5c2e));
  pipe(scene,sampleWaste,.018,mat(0x9c5c2e));
  for(const [x,cap] of [[2.65,0x6a5644],[3.26,0x486a60]]){
    b(scene,x,.245,4.11,.42,.54,.39,mat(0xe1e3d6,{roughness:.58}));
    cy(scene,x,.541,4.11,.084,.075,mat(cap),16);
    b(scene,x,.325,4.312,.24,.12,.013,mat(cap));
  }
  cy(scene,-4.30,.91,-2.22,.028,1.58,steel);
  cy(scene,-4.30,1.71,-2.22,.14,.15,steel);
  cy(scene,-4.30,1.793,-2.22,.11,.016,mat(0x485d52));
  const routes=[trace(scene,supply,blue,.028),trace(scene,waste,amber,.021),trace(scene,sampleWaste,amber,.021),trace(scene,source,blue,.028)];
  const outletFrame=frameBox([.62,-.17,2.24],[4.66,1.63,4.4]);
  const frame=[...frameBox([-5.06,-.17,-2.83],[2.88,.61,2.83]),...outletFrame,vec(-4.30,1.87,-2.22)];
  return {scene,routes,waterMap,frame,outletFrame,target:[-.38,.32,.55],
    eye:[9,7.8,12],labels:[['雨量计',[-4.3,1.85,-2.22]],['低位出口 · 短量水段',[1.04,.40,3.03],'outlet'],['留样主机',[3.48,1.48,3.17]]]};
}

function machine() {
  const scene=daylight();
  floor(scene,26,0xe2eadc);
  host(scene,'open');
  const fills=[];
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x=1.1*Math.cos(a),z=1.1*Math.sin(a);
    const ring=mesh(scene,new T.TorusGeometry(.402,.022,10,42),blue,[x,.445,z]);
    ring.rotation.x=-Math.PI/2;
    const liquid=cy(scene,x,.47,z,.352,1,mat(0x81b3ac,{roughness:.3,transparent:true,opacity:.76}),32);
    liquid.castShadow=false;
    fills.push({ring,liquid});
  }
  return {scene,fills,target:[0,1.61,0],size:4.58,width:6.3,eye:[5.3,3.35,9.5],
    labels:[['蠕动泵',[-1.31,3.15,.1]],['旋转出液臂',[0,2.34,1.05]],['固定瓶架',[.53,.76,1.38]]]};
}

function valves() {
  const scene=daylight();
  floor(scene,14,0xe2eadc);
  valve(scene);
  const supply=[[-1.22,.215,0],[-.95,.215,0],[.20,.215,0],[1.22,.215,0]];
  const discharge=[[1.22,.215,0],[.46,.215,0],[.04,.215,.10],[0,.215,.45],[0,.215,1.06]];
  const routes=[trace(scene,supply,blue,.032),trace(scene,discharge,amber,.032)];
  return {scene,routes,target:[0,.56,.10],size:1.88,width:2.72,eye:[2.9,2.0,4.3],
    labels:[['S 源水',[-.94,.26,0]],['C 公共端',[.97,.26,0]],['D 残液',[0,.24,.91]],['电动执行器',[0,1.35,0]]]};
}

try {
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFSoftShadowMap;
  const canvas=renderer.domElement;
  canvas.style.removeProperty('display');
  canvas.tabIndex=0;
  canvas.setAttribute('aria-label','三维设备场景，方向键旋转，加减键缩放');
  viewport.prepend(canvas);
  const camera=new T.OrthographicCamera(-1,1,1,-1,.05,100);
  const fieldView=field();
  const configs={
    field:fieldView,
    outlet:{...fieldView,frame:fieldView.outletFrame,target:[2.60,.55,3.38],eye:[6.0,3.5,9.7],
      labels:[['短量水段',[.89,.22,3.40],'outlet'],['近口三通阀',[1.49,.50,3.48],'valve-close'],
        ['残液罐',[2.65,.55,4.13],'tank-left'],['预冲罐',[3.26,.55,4.13],'tank-right'],['留样主机',[3.48,1.48,3.17]]]},
    machine:machine(),
    valve:valves()
  };
  const labelEls=[];
  const spherical=new T.Spherical();
  let view='field',config,zoom=1,drag=null,invalid=true,telemetry=window.runoffSceneState??{stage:0,bottle:1,levels:[],flow:0};

  function resetCamera(){
    zoom=1;
    spherical.setFromVector3(vec(...config.eye).sub(vec(...config.target)));
    invalid=true;
  }

  function select(key){
    view=key;config=configs[key];resetCamera();
    labelEls.splice(0).forEach(el=>el.remove());
    config.labels.forEach(([name,,anchor])=>{
      const el=document.createElement('span');el.className='model-label';el.textContent=name;
      if(anchor)el.dataset.anchor=anchor;
      viewport.append(el);labelEls.push(el);
    });
    buttons.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.view===key&&viewport.dataset.engineering!=='true')));
    invalid=true;
  }

  function draw(time){
    const w=viewport.clientWidth,h=viewport.clientHeight;
    if(!w||!h)return;
    const a=w/h;
    camera.position.copy(vec(...config.target).add(new T.Vector3().setFromSpherical(spherical)));
    camera.lookAt(...config.target);camera.updateMatrixWorld();
    let centerX=0,centerY=0,half;
    if(config.frame){
      let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
      const point=new T.Vector3();
      for(const corner of config.frame){
        point.copy(corner).applyMatrix4(camera.matrixWorldInverse);
        left=Math.min(left,point.x);right=Math.max(right,point.x);
        bottom=Math.min(bottom,point.y);top=Math.max(top,point.y);
      }
      centerX=(left+right)/2;centerY=(top+bottom)/2;
      half=Math.max((right-left)/a,top-bottom)*.57/zoom;
    }else half=Math.max(config.size,config.width/a)/(2*zoom);
    camera.left=centerX-half*a;camera.right=centerX+half*a;
    camera.top=centerY+half;camera.bottom=centerY-half;
    camera.updateProjectionMatrix();
    const active=telemetry.stage;
    if(view==='field'||view==='outlet'){
      const [incoming,drain,flush,source]=config.routes;
      incoming.group.visible=active===1||active===2||active===4;
      source.group.visible=active===1||active===2;
      drain.group.visible=active===4;
      flush.group.visible=active===1;
      incoming.animate(time,active===4);drain.animate(time);flush.animate(time);source.animate(time);
      config.waterMap.offset.y=-(time*.055*Math.min(1,telemetry.flow*2))%1;
    }else if(view==='valve'){
      config.routes[0].group.visible=active===1||active===2;
      config.routes[1].group.visible=active===4;
      config.routes[0].animate(time);
      config.routes[1].animate(time);
    }else{
      config.fills.forEach(({ring,liquid},i)=>{
        ring.visible=i+1===telemetry.bottle;
        const volume=telemetry.levels[i]??0;
        const height=volume/500*1.16;
        liquid.visible=height>0;liquid.scale.y=height;liquid.position.y=.46+height/2;
      });
    }
    renderer.render(config.scene,camera);
    config.labels.forEach(([,p],i)=>{
      const q=vec(...p).project(camera),el=labelEls[i];
      el.style.left=(q.x+1)*50+'%';el.style.top=Math.max(30,(1-q.y)*h/2)+'px';
      el.hidden=Math.abs(q.x)>.93||q.y>.95||q.y<-.91;
    });
    badge.textContent=view==='machine'?'已选样瓶 B'+String(telemetry.bottle).padStart(2,'0'):stages[active];
    badge.hidden=view!=='machine'&&active===0;
    invalid=false;
  }

  select('field');
  const resize=()=>{
    if(renderer.getContext().isContextLost())return;
    renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);
    draw(reduced?0:performance.now()/1000);
  };
  new ResizeObserver(resize).observe(viewport);resize();
  viewport.classList.add('ready');
  resetView.hidden=false;
  resetView.addEventListener('click',resetCamera);
  buttons.forEach(btn=>{btn.disabled=false;btn.addEventListener('click',()=>select(btn.dataset.view));});
  window.addEventListener('runoff:scene',event=>{telemetry=event.detail;invalid=true;});
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(drag?.id!==e.pointerId)return;
    spherical.theta-=(e.clientX-drag.x)*.008;
    spherical.phi=T.MathUtils.clamp(spherical.phi-(e.clientY-drag.y)*.007,.25,1.42);
    drag.x=e.clientX;drag.y=e.clientY;invalid=true;
  });
  canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.0012),.62,2.4);invalid=true;
  },{passive:false});
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='ArrowLeft'||e.key==='ArrowRight')spherical.theta+=(e.key==='ArrowLeft'?1:-1)*.14;
    else if(e.key==='ArrowUp'||e.key==='ArrowDown')spherical.phi=T.MathUtils.clamp(spherical.phi+(e.key==='ArrowUp'?-1:1)*.12,.25,1.42);
    else zoom=T.MathUtils.clamp(zoom*(e.key==='-'?.90:1.1),.62,2.4);
    invalid=true;
  });
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();viewport.classList.remove('ready');badge.hidden=true;resetView.hidden=true;help.textContent='三维暂不可用，当前显示布设图';
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    viewport.classList.add('ready');resetView.hidden=false;invalid=true;
  });
  let last=0;
  function loop(now){
    requestAnimationFrame(loop);
    if(document.hidden||!viewport.classList.contains('ready'))return;
    if(invalid||(!reduced&&view!=='machine'&&(telemetry.stage!==0||telemetry.flow>0)&&now-last>=32)){
      draw(reduced?0:now/1000);last=now;
    }
  }
  requestAnimationFrame(loop);
} catch {
  help.textContent='三维暂不可用，当前显示布设图';
}
