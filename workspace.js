import * as THREE from './three.module.js';

const $ = id => document.getElementById(id);
const stage = $('cad-stage');
const componentButtons = [...document.querySelectorAll('[data-component]')];
const cameraButtons = [...document.querySelectorAll('[data-camera]')];
const workspaces = [...document.querySelectorAll('[data-workspace]')];
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
  });
}
$('sheet-zoom').addEventListener('click', () => $('engineering-dialog').showModal());

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
  button.addEventListener('click', () => inspect(button.dataset.component));
}

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
  let [azimuth, polar] = cameraAngles.iso;
  let zoom = 1;
  let gesture = null;
  const ray = new THREE.Raycaster();
  const cursor = new THREE.Vector2();
  function draw() {
    if (!stage.clientWidth || !stage.clientHeight) return;
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
    renderer.render(scene, camera);
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
