import * as THREE from './three.module.js';

const $ = id => document.getElementById(id);
const stage = $('cad-stage');
const componentButtons = [...document.querySelectorAll('[data-component]')];
const cameraButtons = [...document.querySelectorAll('[data-camera]')];
const workspaces = [...document.querySelectorAll('[data-workspace]')];
const fieldButton = $('field-mode');
const fieldHost = $('field-replay');
const fieldViewport = $('scene-viewport');
const fieldCard = fieldViewport.parentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const timeline = $('timeline');
$('replay-monitor').append($('monitor-card'));
$('replay-steps').append($('purification-steps'));
$('replay-review').append($('review-demo'));

let fieldMode = false;
function showField(show) {
  fieldMode = show;
  fieldButton.setAttribute('aria-pressed', String(show));
  stage.classList.toggle('show-field',show);
  fieldHost.hidden = !show;
  if (show) {
    fieldHost.append(fieldViewport);
    document.querySelector('[data-view=field]').click();
    for (const button of cameraButtons) button.setAttribute('aria-pressed','false');
  } else {
    fieldCard.insertBefore(fieldViewport,fieldCard.querySelector('.process'));
  }
}
fieldButton.addEventListener('click', () => showField(true));
const components = {
  Q0: ['田块量水槽', '300 × 180 × 150 mm', '三角薄壁口上游的水位用于换算流量。槽后设置独立的取样嘴，主水路靠落差进入调蓄箱。'],
  S1: ['原水留样', '450 × 350 × 350 mm · 8 瓶位', '原水在净化前取样。电动三通阀先隔离取样口，再将反转清管的残液导入独立废液罐。'],
  TK1: ['原水调蓄', '总容积 120 L · 有效容积 90 L', '先接纳径流，再由定量泵分批送入净化模块。台架容量用于验证，田间需按事件出流重新核算。'],
  F1: ['分批净化', '900 × 420 × 800 mm · 3 L/min', '沉降粗滤后依次通过沸石、硝态氮树脂和铁系介质。点击「净化剖切」可检查三根滤柱和填料床。'],
  TK2: ['出水待检', '总容积 40 L · 有效容积 30 L', '独立存放完成处理的单个批次。液位、出水复测和化验记录共同支持批次核验。'],
  V2: ['排放联锁', '常闭出水阀', '批次水质与现场排放条件通过核验后，控制器才允许打开排放阀。']
};

for (const button of workspaces) {
  button.addEventListener('click', () => {
    const selected = button.dataset.workspace;
    for (const tab of workspaces) {
      const active = tab.dataset.workspace === selected;
      tab.setAttribute('aria-pressed', String(active));
      $(tab.dataset.workspace).hidden = !active;
    }
    if (selected === 'monitoring') {
      fieldCard.insertBefore(fieldViewport,fieldCard.querySelector('.process'));
      $('record-timeline').append(timeline);
    } else {
      $('replay-timeline').append(timeline);
      if (fieldMode) showField(true);
    }
  });
}
$('sheet-zoom').addEventListener('click', () => $('engineering-dialog').showModal());
$('part-details').addEventListener('click', () => $('part-dialog').showModal());

function syncStatus() {
  $('cad-water-state').textContent = $('water-state').textContent;
  $('cad-water-valve').textContent = $('water-valve').textContent;
}
const statusObserver = new MutationObserver(syncStatus);
statusObserver.observe($('water-state'), {childList: true});
statusObserver.observe($('water-valve'), {childList: true});
syncStatus();

function groupFor(code) {
  if (code.startsWith('F1') || code === 'P1') return 'F1';
  if (code === 'VS') return 'S1';
  if (code === 'A1') return 'Q0';
  if (code === 'A2') return 'TK2';
  return code;
}

let selected = 'Q0';
let updateModel = () => {};
function inspect(code) {
  selected = groupFor(code);
  const item = components[selected];
  if (!item) return;
  $('component-title').textContent = selected + ' · ' + item[0];
  $('component-spec').textContent = item[1];
  $('component-description').textContent = item[2];
  for (const button of componentButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.component === selected));
  }
  updateModel();
}
for (const button of componentButtons) {
  button.addEventListener('click', () => {
    if (fieldMode) cameraButtons[0].click();
    inspect(button.dataset.component);
  });
}

const fromModel = ([x,y,z]) => new THREE.Vector3(x/1000,z/1000,-y/1000);
const routeData = [
  {id:'inlet',color:0x51afe0,points:[[25,210,610],[297,210,610],[338,210,610],[418,210,563],[635,210,548],[635,210,516]]},
  {id:'sample',color:0xd59c56,points:[[239,185,635],[239,80,635],[239,-10,410],[246,-44,277],[246,-135,275],[246,-220,203]]},
  {id:'clean',color:0xde9460,points:[[246,-220,203],[246,-135,275],[246,-44,277],[246,-53,251],[246,-84,251]]},
  {id:'pump',color:0x29afab,points:[[1080,210,74],[1285,210,74],[1285,245,581],[1322,245,581]]},
  {id:'filter',color:0x29afab,points:[[1457,245,148],[1457,371,148],[1474,371,148],[1474,371,728],[1590,371,728],[1590,245,710],[1590,245,91],
   [1590,371,91],[1699,371,91],[1699,371,728],[1815,371,728],[1815,245,710],[1815,245,91],
   [1815,371,91],[1924,371,91],[1924,371,728],[2040,371,728],[2040,245,710],[2040,245,91]]},
  {id:'outlet',color:0x4acaa3,points:[[2040,245,91],[2040,378,91],[2291,378,91],[2291,250,207],[2410,250,207]]},
  {id:'release',color:0x4acaa3,points:[[2820,249,70],[2870,249,70],[3002,249,70],[3080,249,24]]}
];
const callouts = {
  Q0:[[116,200,804],'量水槽'],
  S1:[[222,-237,362],'原水留样'],
  TK1:[[790,190,535],'原水调蓄'],
  F1:[[1730,240,808],'净化模块'],
  TK2:[[2560,230,437],'待检箱'],
  V2:[[2895,250,175],'排放阀']
};

function geometry([vertices, faces]) {
  const positions = new Float32Array(vertices.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = vertices[i] / 1000;
    positions[i+1] = vertices[i+2] / 1000;
    positions[i+2] = -vertices[i+1] / 1000;
  }
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  mesh.setIndex(faces);
  mesh.computeVertexNormals();
  return mesh;
}

async function loadAssembly() {
  const reply = await fetch('./station-cad.json?v=cad-1');
  if (!reply.ok) throw new Error('assembly unavailable');
  const parts = await reply.json();
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xeef4f6);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '台架三维装配，方向键旋转，加减键缩放');
  stage.prepend(canvas);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stage.classList.remove('ready');
    canvas.hidden = true;
    $('cad-reset').hidden = true;
    $('cad-help').textContent = '三维显示暂不可用，当前为总装图';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    canvas.hidden = false;
    stage.classList.add('ready');
    $('cad-reset').hidden = false;
    draw();
  });
  const scene = new THREE.Scene();
  const assembly = new THREE.Group();
  scene.add(assembly);
  scene.add(new THREE.HemisphereLight(0xf4fbff, 0xb1b9ba, 2.15));
  const light = new THREE.DirectionalLight(0xffffff, 2.6);
  light.position.set(-2, 4, 3);
  scene.add(light);
  const grid = new THREE.GridHelper(4.5, 30, 0xa2b8c0, 0xcbd9de);
  grid.position.set(1.5, -.002, 0);
  scene.add(grid);
  const dotCanvas=document.createElement('canvas');
  dotCanvas.width=dotCanvas.height=32;
  const dotPaint=dotCanvas.getContext('2d');
  const dotFill=dotPaint.createRadialGradient(16,16,5,16,16,16);
  dotFill.addColorStop(0,'#fff');
  dotFill.addColorStop(1,'#ffffff00');
  dotPaint.fillStyle=dotFill;
  dotPaint.fillRect(0,0,32,32);
  const dotTexture=new THREE.CanvasTexture(dotCanvas);
  const routes=routeData.map(({id,color,points})=>{
    const linePoints=points.map(fromModel);
    const path=new THREE.CurvePath();
    for(let i=1;i<linePoints.length;i++)path.add(new THREE.LineCurve3(linePoints[i-1],linePoints[i]));
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints),
      new THREE.LineBasicMaterial({color,transparent:true,opacity:.75,depthTest:false,depthWrite:false}));
    line.renderOrder=4;
    const dots=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(18),3)),
      new THREE.PointsMaterial({color,size:7,map:dotTexture,transparent:true,sizeAttenuation:false,depthTest:false,depthWrite:false}));
    dots.renderOrder=5;
    dots.frustumCulled=false;
    const group=new THREE.Group();
    group.add(line,dots);
    group.visible=false;
    scene.add(group);
    return {id,path,dots,group};
  });
  const cues=Object.entries(callouts).map(([code,[point,label]])=>{
    const el=document.createElement('span');
    el.textContent=label;
    el.hidden=true;
    $('scene-cues').append(el);
    return {code,point:fromModel(point),el};
  });
  const models = parts.map(part => {
    const base = new THREE.Color(part.color);
    const material = new THREE.MeshStandardMaterial({color: base, roughness: .67, metalness: .11});
    const item = new THREE.Mesh(geometry(part.geometry), material);
    const section = part.section ? new THREE.Mesh(geometry(part.section), material) : null;
    const code = groupFor(part.code);
    item.userData.code = code;
    assembly.add(item);
    if (section) {
      section.userData.code = code;
      assembly.add(section);
    }
    return {base, item, section, code, part};
  });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .02, 40);
  const activeCenter = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const cameraAngles = {
    iso: [-.37, 1.06],
    front: [0, Math.PI / 2],
    plan: [0, .003],
    cut: [-.27, 1.22]
  };
  let mode = 'iso';
  let focused = false;
  let treatment = window.runoffTreatmentState;
  let sampling = window.runoffSceneState;
  let [azimuth, polar] = cameraAngles.iso;
  let zoom = 1;
  let gesture = null;
  const ray = new THREE.Raycaster();
  const cursor = new THREE.Vector2();
  function draw() {
    if (fieldMode || !stage.clientWidth || !stage.clientHeight || renderer.getContext().isContextLost()) return;
    const aspect = stage.clientWidth / stage.clientHeight;
    bounds.getCenter(activeCenter);
    const size = bounds.getSize(new THREE.Vector3());
    camera.position.copy(activeCenter).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(8, polar, azimuth)));
    camera.lookAt(activeCenter);
    camera.updateMatrixWorld();
    let width = 0;
    let height = 0;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          width = Math.max(width, Math.abs(p.x));
          height = Math.max(height, Math.abs(p.y));
        }
      }
    }
    const extent = Math.max(height, width / aspect, size.y * .15) * 1.13 / zoom;
    camera.left = -extent * aspect;
    camera.right = extent * aspect;
    camera.bottom = -extent;
    camera.top = extent;
    camera.updateProjectionMatrix();
    updateRoutes();
    renderer.render(scene, camera);
  }
  function updateRoutes() {
    const online=treatment?.mode==='preview'||treatment?.mode==='live';
    const phase=treatment?.state;
    const showWater=online&&treatment.flow>=.05;
    const sampleStage=online?sampling?.stage:0;
    const routeActive={
      inlet:showWater, sample:sampleStage===1||sampleStage===2, clean:sampleStage===4,
      pump:phase==='treat', filter:phase==='treat', outlet:phase==='treat',
      release:phase==='release'&&treatment.valve==='open'
    };
    const time=reduceMotion.matches?0:performance.now()/2600;
    for(const {id,path,dots,group} of routes){
      group.visible=Boolean(routeActive[id])&&(mode!=='cut'||id==='filter');
      if(!group.visible)continue;
      const vertices=dots.geometry.getAttribute('position');
      for(let i=0;i<vertices.count;i++){
        const p=path.getPoint((time+i/vertices.count)%1);
        vertices.setXYZ(i,p.x,p.y,p.z);
      }
      vertices.needsUpdate=true;
    }
    const active=phase==='release'?['V2']:phase==='treat'?['F1','TK2']:phase==='hold'||phase==='fault'?['TK2']:showWater?['Q0','TK1']:[];
    if(sampleStage)active.push('S1');
    for(const {code,point,el} of cues){
      const p=point.clone().project(camera);
      const inView=Math.abs(p.x)<.84&&Math.abs(p.y)<.85;
      el.hidden=!inView||(mode==='cut'?code!=='F1':!(active.includes(code)||selected===code));
      if(el.hidden)continue;
      el.classList.toggle('is-active',active.includes(code));
      el.style.left=((p.x+1)*50)+'%';
      el.style.top=((1-p.y)*50)+'%';
    }
  }
  function paint() {
    bounds.makeEmpty();
    for (const {base, item, section, code, part} of models) {
      const shown = mode !== 'cut' || part.code.startsWith('F1');
      item.visible = shown && !(mode === 'cut' && section);
      if (section) section.visible = shown && mode === 'cut';
      const active = item.visible ? item : section;
      if (active?.visible && (!focused || code === selected)) bounds.expandByObject(active);
      item.material.color.copy(base);
      if (mode !== 'cut' && code === selected) item.material.color.lerp(new THREE.Color('#28a694'), .34);
    }
    draw();
  }
  function selectView(next) {
    if(fieldMode)showField(false);
    mode = next;
    focused = false;
    $('media-legend').hidden = next !== 'cut';
    [azimuth, polar] = cameraAngles[next];
    zoom = 1;
    for (const button of cameraButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.camera === mode));
    }
    if (next === 'cut') inspect('F1');
    else paint();
  }
  updateModel = () => {
    if (mode === 'cut' && selected !== 'F1') selectView('iso');
    else paint();
  };
  for (const button of cameraButtons) button.addEventListener('click', () => selectView(button.dataset.camera));
  $('cad-reset').addEventListener('click', () => selectView(mode));
  $('cad-focus').addEventListener('click', () => {
    $('part-dialog').close();
    if(fieldMode)selectView('iso');
    focused = true;
    zoom = 1;
    paint();
    stage.scrollIntoView({block:'nearest'});
  });
  function rotate(dx,dy) {
    azimuth -= dx;
    polar = THREE.MathUtils.clamp(polar-dy,.035,Math.PI*.88);
    draw();
  }
  function changeZoom(factor) {
    zoom = THREE.MathUtils.clamp(zoom*factor,.6,4);
    draw();
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    gesture = {x:event.clientX,y:event.clientY,moved:false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!gesture) return;
    const dx = event.clientX-gesture.x;
    const dy = event.clientY-gesture.y;
    if (!gesture.moved && Math.hypot(dx,dy)<4) return;
    gesture = {x:event.clientX,y:event.clientY,moved:true};
    rotate(dx*.008,dy*.008);
  });
  canvas.addEventListener('pointerup', event => {
    if (gesture && !gesture.moved) {
      const rect = canvas.getBoundingClientRect();
      cursor.set(2*(event.clientX-rect.left)/rect.width-1,1-2*(event.clientY-rect.top)/rect.height);
      ray.setFromCamera(cursor,camera);
      const hit = ray.intersectObjects(assembly.children).find(result => result.object.visible);
      if (hit) inspect(hit.object.userData.code);
    }
    gesture = null;
  });
  canvas.addEventListener('lostpointercapture', () => { gesture = null; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    changeZoom(Math.exp(-event.deltaY*.0012));
  }, {passive:false});
  canvas.addEventListener('keydown', event => {
    const changes = {ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.12],ArrowDown:[0,-.12]};
    if (changes[event.key]) rotate(...changes[event.key]);
    else if (event.key==='+' || event.key==='=') changeZoom(1.14);
    else if (event.key==='-') changeZoom(1/1.14);
    else return;
    event.preventDefault();
  });
  const observer = new ResizeObserver(() => {
    if (!stage.clientWidth || !stage.clientHeight) return;
    renderer.setSize(stage.clientWidth,stage.clientHeight,false);
    draw();
  });
  observer.observe(stage);
  window.addEventListener('runoff:treatment-state',event=>{treatment=event.detail;draw();});
  window.addEventListener('runoff:scene',event=>{sampling=event.detail;draw();});
  let lastFrame=0;
  renderer.setAnimationLoop(time=>{
    if(document.hidden||fieldMode||reduceMotion.matches||time-lastFrame<38||
       !routes.some(route=>route.group.visible))return;
    lastFrame=time;
    draw();
  });
  stage.classList.add('ready');
  $('cad-reset').hidden = false;
  $('cad-focus').hidden = false;
  paint();
}

loadAssembly().catch(error => {
  $('cad-help').textContent = '三维显示暂不可用，当前为总装图';
  $('cad-interaction').textContent = '工程图册含主视、俯视和剖视';
  for (const button of cameraButtons) button.disabled = true;
  console.warn('CAD preview:', error.message);
});
