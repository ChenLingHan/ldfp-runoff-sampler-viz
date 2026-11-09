import * as T from './three.module.js';
const v=(...x)=>new T.Vector3(...x);
const mat=(color,options={})=>new T.MeshStandardMaterial({color,roughness:.63,metalness:.06,...options});
const alloy=mat(0xaeb9bf,{metalness:.48,roughness:.38}), sheet=mat(0xe4e7e5), edge=mat(0x465654), housing=mat(0xe6e9e4);
const shell=mat(0xe1e7ec,{transparent:true,opacity:.48,depthWrite:false,roughness:.29}), grip=mat(0x34414b), water=mat(0x6da5c1), cable=mat(0x33454f);
const hose=mat(0x53778b), waste=mat(0xa16d47), pcb=mat(0x64746e), bodyMat=mat(0xafbbc2);
const clear=mat(0xe3e9ed,{transparent:true,opacity:.28,depthWrite:false,side:T.DoubleSide});
function mesh(parent,geom,material,p){
 const o=new T.Mesh(geom,material);o.position.set(...p);parent.add(o);
 o.castShadow=!material.transparent;o.receiveShadow=true;
 return o;
}
function b(p,x,y,z,dx,dy,dz,m=housing){return mesh(p,new T.BoxGeometry(dx,dy,dz),m,[x,y,z]);}
function cy(p,x,y,z,r,l,m=alloy,n=48,r2=r){
 return mesh(p,new T.CylinderGeometry(r,r2,l,n),m,[x,y,z]);
}
function around(p,x,y,z,r,t,m=edge,axis='y'){
 const o=mesh(p,new T.TorusGeometry(r,t,8,42),m,[x,y,z],false);
 if(axis==='y')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.y=Math.PI/2;return o;
}
function sleeve(p,x,y,z,outer,inner,length,m=alloy,axis='y'){
 const l=length/2;
 const profile=[[inner,-l],[outer,-l],[outer,l],[inner,l],[inner,-l]];
 const o=mesh(p,new T.LatheGeometry(profile.map(([r,t])=>new T.Vector2(r,t)),48),m,[x,y,z]);
 if(axis==='x')o.rotation.z=Math.PI/2;
 if(axis==='z')o.rotation.x=Math.PI/2;
 return o;
}
function pipe(p,pts,r,m=hose){
 const curve=new T.CatmullRomCurve3(pts.map(x=>v(...x)));
 return mesh(p,new T.TubeGeometry(curve,64,r,12,false),m,[0,0,0],false);
}
function bolt(p,x,y,z,r=.042,axis='y'){
 const o=cy(p,x,y,z,r,.042,edge,6);
 if(axis==='z')o.rotation.x=Math.PI/2;
 if(axis==='x')o.rotation.z=Math.PI/2;
 return o;
}
function bottle(parent,x,y,z,tag=false){
 const o=new T.Group();o.position.set(x,y,z);parent.add(o);
 const coords=[[0,0],[.32,0],[.366,.04],[.375,.10],[.375,1.30],[.34,1.42],[.20,1.52],[.164,1.58],[.164,1.67]];
 mesh(o,new T.LatheGeometry(coords.map(([a,b])=>new T.Vector2(a,b)),56),shell,[0,0,0]);
 for(const yy of [.075,.18,1.26,1.33])around(o,0,yy,0,.365,.007,alloy);
 sleeve(o,0,1.685,0,.181,.112,.123,grip);around(o,0,1.75,0,.149,.012,alloy);
 cy(o,0,1.634,0,.108,.016,edge);
 for(let k=0;k<16;k++){const a=k*Math.PI/8;b(o,.183*Math.cos(a),1.685,.183*Math.sin(a),.013,.082,.013,edge);}
 if(tag)b(o,0,.80,.37,.28,.18,.007,sheet);
 return o;
}
function tray(parent,y=.32){
 cy(parent,0,y,0,1.51,.11,alloy,96);
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4,x=1.10*Math.cos(a),z=1.10*Math.sin(a);
  cy(parent,x,y+.053,z,.388,.045,edge,56);
  bottle(parent,x,y+.071,z,true);
 }
}
function pump(parent,x,y,z){
 b(parent,x,y,z,.90,.68,.66,bodyMat);
 b(parent,x,y,z-.38,.78,.56,.14,edge);
 const face=z+.35;
 const pl=cy(parent,x,y,face,.331,.11,alloy);pl.rotation.x=Math.PI/2;
 const hub=cy(parent,x,y,face+.063,.093,.12,edge);hub.rotation.x=Math.PI/2;
 const points=[];
 for(let i=0;i<=38;i++){const a=-.1+i*(Math.PI+.2)/38;points.push([x+.275*Math.cos(a),y+.275*Math.sin(a),face+.095]);}
 pipe(parent,points,.029,hose);
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.2;
  const o=cy(parent,x+.176*Math.cos(a),y+.176*Math.sin(a),face+.10,.058,.070,alloy);o.rotation.x=Math.PI/2;
  bolt(parent,x+.176*Math.cos(a),y+.176*Math.sin(a),face+.151,.028,'z');
 }
 around(parent,x,y,face+.143,.330,.017,edge,'z');
 for(const xx of [-.38,.38])for(const yy of [-.28,.28])bolt(parent,x+xx,y+yy,face+.015,.036,'z');
 return [x,y,face];
}
function host(parent,kind='open'){
 b(parent,0,.08,0,4.5,.16,3.5,edge);
 for(const x of [-1.96,1.96])for(const z of [-1.44,1.44]){
  cy(parent,x,-.065,z,.12,.15,grip);
  b(parent,x,1.69,z,.078,3.14,.078,alloy);
  bolt(parent,x,.193,z);
 }
 b(parent,0,1.77,-1.711,4.4,3.20,.055,housing);
 b(parent,-2.21,1.77,0,.055,3.20,3.43,sheet);
 b(parent,0,2.48,0,4.34,.075,3.32,alloy);
 if(kind==='open'){
  for(const x of [-.86,.86])b(parent,x,.23,-.64,.32,.14,.38,edge);
  tray(parent,.36);
  cy(parent,0,2.74,0,.233,.42,edge);
  cy(parent,0,2.352,0,.078,.18,alloy);
  b(parent,0,2.246,.55,.106,.071,1.13,sheet);
  pipe(parent,[[0,2.78,0],[0,2.44,0],[0,2.275,.25],[0,2.275,1.1],[0,2.16,1.1]],.025);
  cy(parent,1.72,2.20,.15,.14,.14,waste);
  pipe(parent,[[1.72,2.13,.15],[1.93,2.02,.15],[2.20,2.00,.15]],.027,waste);
  pump(parent,-1.31,2.92,-.34);
  pipe(parent,[[-2.28,2.8,-.47],[-1.78,2.8,-.33],[-1.58,2.92,.113]],.028);
  pipe(parent,[[-1.04,2.92,.113],[-.77,3.14,.16],[-.21,3.15,.07],[0,2.76,0]],.028);
  b(parent,1.04,2.87,-.6,1.44,.65,1.09,bodyMat);
  b(parent,1.04,3.205,-.6,1.24,.033,.87,pcb);
  for(let i=0;i<5;i++){b(parent,.55+i*.24,3.264,-.78,.16,.079,.28,grip);bolt(parent,.55+i*.24,3.315,-.78,.027);}
  for(let i=0;i<3;i++)pipe(parent,[[.52+i*.13,3.258,-.46],[.53+i*.13,3.18,.20],[.17+i*.09,2.92,.27],[.06+i*.06,2.72,0]],.013,i===1?waste:cable);
 }else{
  b(parent,2.21,1.77,0,.055,3.20,3.43,sheet);
  b(parent,0,1.40,1.716,4.36,2.41,.088,housing);
  b(parent,0,2.91,1.721,4.37,.56,.12,mat(0x306b5d));
  b(parent,.57,2.93,1.789,1.18,.34,.035,edge);
  b(parent,.57,2.93,1.811,1.01,.22,.013,grip);
  for(const x of [1.41,1.58])around(parent,x,2.93,1.793,.045,.012,edge,'z');
  for(const x of [-1.82,1.82]){
   b(parent,x,2.34,1.792,.107,.35,.085,edge);
   bolt(parent,x,.33,1.782,.037,'z');
  }
  b(parent,0,3.335,0,4.52,.17,3.52,sheet);
  for(const x of [-.55,.55])b(parent,x,3.47,-.08,.12,.16,.18,grip);
  b(parent,0,3.57,-.08,1.21,.12,.19,grip);
 }
 for(const z of [-.73,-.53]){
  const g=cy(parent,-2.264,2.86,z,.070,.111,edge,6);g.rotation.z=Math.PI/2;
 }
}
function fitting(parent,x,y,z,axis='x',direction=1){
 const spin=o=>{if(axis==='x')o.rotation.z=Math.PI/2;else if(axis==='z')o.rotation.x=Math.PI/2;return o;};
 const shift=t=>axis==='x'?[x+t*direction,y,z]:[x,y,z+t*direction];
 spin(cy(parent,...shift(0),.162,.148,alloy,6));
 sleeve(parent,...shift(.125),.119,.071,.202,bodyMat,axis);
 for(let i=0;i<5;i++)around(parent,...shift(.047+i*.032),.122,.010,edge,axis);
}
function valve(parent,full=true){
 b(parent,0,.20,0,1,.44,.60,bodyMat);
 for(const x of [-.365,.365])for(const z of [-.23,.23])bolt(parent,x,.437,z,.055);
 fitting(parent,-.64,.215,0,'x',-1);fitting(parent,.64,.215,0);fitting(parent,0,.215,.45,'z');
 cy(parent,0,.482,0,.160,.13,alloy);
 if(full){
  cy(parent,0,.612,0,.073,.23,edge);
  b(parent,0,.80,0,.62,.092,.49,alloy);
  b(parent,0,1.03,0,.64,.42,.51,housing);
  b(parent,0,1.265,0,.67,.07,.55,alloy);
  for(const x of [-.246,.246])for(const z of [-.18,.18])bolt(parent,x,1.315,z,.046);
  b(parent,.234,.75,-.35,.24,.16,.13,edge);
  pipe(parent,[[.29,.81,-.37],[.45,.87,-.44],[.52,.99,-.5],[.62,1.20,-.58]],.027,cable);
 }
}

export { mat, mesh, b, cy, pipe, host, valve };
