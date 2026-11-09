'use strict';
// Set endpoint to a CORS-enabled HTTPS endpoint for field telemetry. See README.
const CONFIG={endpoint:'',intervalMs:15000,staleMs:60000};
const $=id=>document.getElementById(id);
const states=[
 ['待机','停泵，等待出流达到触发量','停靠位'],
 ['预冲','S—C 连通，D 关闭；泵正转，预冲水进预冲罐','预冲罐'],
 ['留样','S—C 连通，D 关闭；移臂到位后正转留样','目标瓶'],
 ['隔离','先停泵并回停靠位，再关闭 S、确认 C—D 到位','停靠位'],
 ['清管','S 隔离，C—D 连通；反转把残液送入独立容器','干态入口']
];
const rates=[0,0,0,.09,.17,.29,.43,.58,.64,.53,.41,.31,.28,.33,.46,.53,.43,.34,.26,.18,.11,.06,.03,.01,0];
const rain=[0,0.5,1.3,1.8,2.5,3.1,2.2,1.6,.8,.4,.2,0,.2,.6,1.2,1.3,.6,.2,0,0,0,0,0,0,0];
function fieldPreview(){
 const points=[],bottles=Array.from({length:8},(_,i)=>({id:i+1,slots:[],probe:null,lab:null}));
 let cum=0,depth=0,threshold=40,lastQ=0,lastStart=-Infinity,count=0;
 for(let i=0;i<=576;i++){
  const sec=i*5, k=Math.min(23,Math.floor(sec/120)), fraction=(sec-k*120)/120;
  const q=rates[k]+fraction*(rates[k+1]-rates[k]);
  const mm=sec&&sec%120===0?rain[sec/120]:0;
  depth+=mm;if(i)cum+=(q+lastQ)*2.5;lastQ=q;
  if(cum>=threshold){
   threshold+=40;
   if(q>=.267&&sec-lastStart>=30&&count<24&&sec+20<=2880){
    lastStart=sec;bottles[Math.floor(count++/3)].slots.push({minute:(sec+20)/60,sourceStartMinute:(sec+8)/60,sourceEndMinute:(sec+16)/60,volumeMl:100,representedVolumeL:40});
   }
  }
  const age=sec-lastStart;
  points.push({minute:sec/60,flowLs:q,rainMm:mm,rainTotalMm:depth,volumeL:cum,stage:age<11?1:age<20?2:age<25?3:age<30?4:0});
 }
 bottles[0].probe={temperatureC:20.6,conductivityUsCm:236,quality:'valid'};
 bottles[0].lab={tnMgL:2.41,tpMgL:.24,status:'released'};
 bottles[1].lab={tnMgL:1.87,tpMgL:.17,status:'released'};
 return {eventId:'PLOT-A / R01',updatedAt:null,points,bottles};
}
const preview=fieldPreview();
let model=preview,pos=0,bottle=1,pinned=null,timer=null,readStatus='preview',asOf=null;
const valid=(x,a=0,b=Infinity)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const num=(x,p=1)=>valid(x,-1000)?x.toFixed(p):'—';
const mm=x=>{const s=Math.round(x*60);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
const total=(b,key)=>b.slots.reduce((a,s)=>a+s[key],0);
function setText(id,v){$(id).textContent=v}
function svg(tag,props={},label){
 const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [k,v] of Object.entries(props))e.setAttribute(k,v);
 if(label!==undefined)e.textContent=label;return e;
}
function chart(points,samples){
 const canvas=$('chart'), x0=36,x1=322,y0=17,y1=150, maxT=points.at(-1).minute||1,
       maxF=Math.max(.2,Math.ceil(Math.max(...points.map(p=>p.flowLs))*5)/5),
       maxR=Math.max(1,Math.ceil(Math.max(...points.map(p=>p.rainMm))));
 const x=m=>x0+(x1-x0)*m/maxT,y=f=>y1-(y1-y0)*f/maxF, yr=r=>y1-(y1-y0)*r/maxR;
 const label=(x,y,t,anchor='start',fill='#536961')=>svg('text',{x,y,fill,'font-size':10,'text-anchor':anchor},t);
 canvas.replaceChildren();
 for(let i=0;i<=4;i++){
  let yy=y(i*maxF/4);canvas.append(svg('line',{x1:x0,y1:yy,x2:x1,y2:yy,stroke:'#e1e9e1'}),label(x0-7,yy+4,num(i*maxF/4,2),'end'),label(x1+7,yy+4,num(i*maxR/4,1)));
 }
 canvas.append(label(x0,11,'流量 L/s'),label(x1,11,'降雨 mm','end'),label(x1,179,'事件时间 min','end'));
 for(let i=0;i<=4;i++)canvas.append(label(x(maxT*i/4),165,String(Math.round(maxT*i/4)),'middle'));
 const seen=points.slice(0,pos+1), width=5.5;
 for(const p of seen)if(p.rainMm>0)canvas.append(svg('rect',{x:x(p.minute)-width/2,y:yr(p.rainMm),width,height:y1-yr(p.rainMm),fill:'#8cb7d0',opacity:.55,rx:2}));
 const line=seen.map(p=>x(p.minute)+','+y(p.flowLs)).join(' ');
 if(seen.length>1)canvas.append(svg('polygon',{points:x0+','+y1+' '+line+' '+x(seen.at(-1).minute)+','+y1,fill:'#d5ece2',opacity:.7}),svg('polyline',{points:line,fill:'none',stroke:'#238366','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'}));
 for(const m of samples.flatMap(b=>b.slots.map(s=>s.minute))){
  const at=seen.reduce((a,p)=>Math.abs(p.minute-m)<Math.abs(a.minute-m)?p:a,seen[0]);
  canvas.append(svg('circle',{cx:x(m),cy:y(at.flowLs),r:2.8,fill:'#a46b30',stroke:'#fff','stroke-width':1}));
 }
 const p=seen.at(-1);canvas.append(svg('line',{x1:x(p.minute),x2:x(p.minute),y1:y0,y2:y1,stroke:'#438776','stroke-dasharray':'4 4'}),svg('circle',{cx:x(p.minute),cy:y(p.flowLs),r:3,fill:'#17654e'}));
}
function visibleBottles(){
 const m=model.points[pos].minute;
 return model.bottles.map(b=>{const slots=b.slots.filter(s=>s.minute<=m);const full=slots.length>0&&slots.length===b.slots.length;
  return {...b,slots,probe:full?b.probe:null,lab:full?b.lab:null};});
}
function row(a){const tr=document.createElement('tr');for(const c of a){const td=document.createElement('td');td.textContent=c;tr.append(td);}return tr;}
function render(){
 const p=model.points[pos],bs=visibleBottles(),b=bs[bottle-1], filled=bs.filter(b=>b.slots.length);
 setText('rain',num(p.rainTotalMm));setText('flow',num(p.flowLs,2));setText('volume',num(p.volumeL,0));setText('samples',filled.length+' / 8');
 const update=asOf===null?'':new Date(asOf).toLocaleTimeString('zh-CN',{hour12:false})+' 更新 · ';
 setText('timestamp',update+model.eventId+' · T+'+mm(p.minute));
 $('seek').max=model.points.length-1;$('seek').value=pos;setText('cursor','T+'+mm(p.minute));
 chart(model.points,bs);
 for(const n of bs){const k=$('b'+n.id);k.setAttribute('aria-pressed',String(n.id===bottle));k.querySelector('b').style.height=(total(n,'volumeMl')/5)+'%';}
 setText('sample-title','B'+String(b.id).padStart(2,'0')+' · '+(b.slots.length?num(total(b,'volumeMl'),0)+' mL':'未留样'));
 setText('sample-note',b.slots.length?'对应 '+num(total(b,'representedVolumeL'),0)+' L 出流':'');
 const probe=b.probe?.quality==='valid'?b.probe:null,lab=b.lab?.status==='released'?b.lab:null;
 setText('temperature',num(probe?.temperatureC));setText('conductivity',num(probe?.conductivityUsCm,0));setText('tn',num(lab?.tnMgL,2));setText('tp',num(lab?.tpMgL,2));
 setText('qc',b.slots.length?((probe?'探头读数已关联':'无有效探头读数')+' · '+(lab?'化验结果已关联':'总氮、总磷待化验')):'样瓶达到浸没条件后，方可读取已安装的探头');
 const paired=filled.filter(n=>n.lab?.status==='released');
 const pairedL=paired.reduce((a,n)=>a+total(n,'representedVolumeL'),0);
 setText('coverage',paired.length?'化验已覆盖 '+num(pairedL,0)+' L':'暂无可计算区间');
 for(const [id,key] of [['mass-n','tnMgL'],['mass-p','tpMgL']]){
  setText(id,paired.length?num(paired.reduce((a,n)=>a+n.lab[key]*total(n,'representedVolumeL')/1000,0),3):'—');
 }
 const lines=bs.map(n=>{
  const has=n.slots.length>0,last=n.slots.at(-1);
  const el=row(['',has?'T+'+mm(last.minute):'—',has?num(total(n,'volumeMl'),0)+' mL':'—',has?num(total(n,'representedVolumeL'),0)+' L':'—',!has?'—':n.lab?.status==='released'?'已关联':'待关联']);
  const select=document.createElement('button');select.type='button';
  select.textContent='B'+String(n.id).padStart(2,'0');select.setAttribute('aria-pressed',String(n.id===bottle));
  select.addEventListener('click',()=>{bottle=n.id;render();$('b'+n.id).focus();});
  el.cells[0].append(select);
  if(n.id===bottle)el.className='selected';
  return el;
 });
 $('rows').replaceChildren(...lines);
 setText('aliquots',bs.reduce((count,n)=>count+n.slots.length,0)+' 次');
 const windows=b.slots.map((s,i)=>{
  const item=document.createElement('li');
  const time=document.createElement('strong');
  const amount=document.createElement('span');
  time.textContent='T+'+mm(s.sourceStartMinute)+'–'+mm(s.sourceEndMinute);
  amount.textContent=num(s.volumeMl,0)+' mL · '+num(s.representedVolumeL,0)+' L';
  item.append(String(i+1).padStart(2,'0'),time,amount);
  return item;
 });
 if(!windows.length){const item=document.createElement('li');item.textContent='所选瓶尚无留样';windows.push(item);}
 $('source-windows').replaceChildren(...windows);
 $('csv').disabled=!filled.length;
 const stage=pinned??p.stage;
 $('steps').querySelectorAll('button').forEach((btn,i)=>btn.setAttribute('aria-pressed',String(i===stage)));
 $('follow').disabled=pinned===null;setText('stage',states[stage][0]+'　');setText('route',states[stage][1]);setText('arm',states[stage][2]);
 const classes={sc:stage===1||stage===2?'wet':'',cd:stage>=3?'drain':'',cp:stage===1||stage===2?'wet':stage===4?'drain':'',po:stage===1||stage===2?'wet':stage===4?'drain':''};
 Object.entries(classes).forEach(([id,c])=>$(id).setAttribute('class',c));
 window.runoffSceneState={stage,bottle,levels:bs.map(n=>total(n,'volumeMl')),flow:p.flowLs};
 window.dispatchEvent(new CustomEvent('runoff:scene',{detail:window.runoffSceneState}));
}
function validate(v){
 if(!v||typeof v.eventId!=='string'||!v.eventId.trim()||v.eventId.length>60||!Number.isFinite(Date.parse(v.updatedAt))||!Array.isArray(v.points)||!v.points.length||v.points.length>1440||!Array.isArray(v.bottles)||v.bottles.length!==8)throw Error('invalid envelope');
 let t=-1,w=-1,r=-1;
 for(const p of v.points){if(!p||!valid(p.minute)||p.minute<=t||!valid(p.volumeL)||p.volumeL<w||!valid(p.rainTotalMm)||p.rainTotalMm<r||!valid(p.rainMm)||!valid(p.flowLs)||!Number.isInteger(p.stage)||!valid(p.stage,0,4))throw Error('invalid series');t=p.minute;w=p.volumeL;r=p.rainTotalMm;}
 v.bottles.forEach((b,i)=>{
  if(!b||b.id!==i+1||!Array.isArray(b.slots)||b.slots.length>3||b.slots.some((s,k)=>!s||!valid(s.minute,0,t)||!valid(s.sourceStartMinute,0,s.minute)||!valid(s.sourceEndMinute,s.sourceStartMinute,s.minute)||!valid(s.volumeMl,.01,500)||!valid(s.representedVolumeL,.01)||(k>0&&s.minute<=b.slots[k-1].minute))||total(b,'volumeMl')>500)throw Error('invalid bottle');
  if(b.probe!=null&&(typeof b.probe!=='object'||!['valid','invalid'].includes(b.probe.quality)||(b.probe.quality==='valid'&&(!valid(b.probe.temperatureC,-20,70)||!valid(b.probe.conductivityUsCm)))))throw Error('invalid probe');
  if(b.lab!=null&&(typeof b.lab!=='object'||!['pending','released'].includes(b.lab.status)||(b.lab.status==='released'&&(!valid(b.lab.tnMgL)||!valid(b.lab.tpMgL)))))throw Error('invalid laboratory result');
 });return v;
}
function connectStatus(kind){
 readStatus=kind;$('status').classList.toggle('live',kind==='live');
 setText('status',({preview:'功能预览 · 设备未接入',loading:'正在读取设备',live:'已接入 · 15 秒刷新',stale:'最近读数 · 更新延迟',error:'设备数据不可用'})[kind]);
}
async function poll(){
 try{
  const url=new URL(CONFIG.endpoint,location.href);
  if(url.protocol!=='https:')throw Error('HTTPS required');
  const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Error('gateway unavailable');
  const data=validate(await response.json()), when=Date.parse(data.updatedAt);
  if(when>Date.now()+CONFIG.staleMs||(asOf!==null&&when<asOf))throw Error('timestamp out of order');
  model=data;asOf=when;pos=model.points.length-1;
  connectStatus(Date.now()-when>CONFIG.staleMs?'stale':'live');render();
 }catch{connectStatus(asOf===null?'error':'stale');}
 finally{setTimeout(poll,CONFIG.intervalMs);}
}
function stop(){if(timer!==null)clearInterval(timer);timer=null;setText('play','播放过程')}
function init(){
 const fullscreen=$('fullscreen');
 fullscreen.hidden=!document.fullscreenEnabled;
 fullscreen.addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{fullscreen.textContent='请使用浏览器全屏';}
 });
 document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'退出全屏':'全屏展示';});
 for(let i=1;i<=8;i++){const e=document.createElement('button');e.type='button';e.className='bottle';e.id='b'+i;e.innerHTML='<span class="glass" aria-hidden="true"><b></b></span><span>B'+String(i).padStart(2,'0')+'</span>';e.addEventListener('click',()=>{bottle=i;render()});$('bottles').append(e);}
 states.forEach((s,i)=>{const e=document.createElement('button');e.type='button';e.textContent=s[0];e.addEventListener('click',()=>{pinned=i;render()});$('steps').append(e);});
 $('follow').addEventListener('click',()=>{pinned=null;render()});
 $('seek').addEventListener('input',()=>{stop();pos=Number($('seek').value);render()});
 $('play').addEventListener('click',()=>{if(timer!==null){stop();return;}if(pos===model.points.length-1)pos=0;pinned=null;render();setText('play','暂停');timer=setInterval(()=>{if(pos<model.points.length-1){pos=Math.min(model.points.length-1,pos+4);render()}else stop()},120)});
 $('csv').addEventListener('click',()=>{
  const escape=v=>'"'+String(v).replace(/^[=+@-]/,"'"+String(v)[0]).replaceAll('"','""')+'"';
  const lines=[['数据来源','事件','瓶号','最后留样时刻','源水时段','样量 mL','代表水量 L','水温 °C','电导率 μS/cm','TN mg/L','TP mg/L','化验状态']];
  for(const b of visibleBottles().filter(b=>b.slots.length)){
   const p=b.probe?.quality==='valid'?b.probe:null,l=b.lab?.status==='released'?b.lab:null;
   lines.push([readStatus==='preview'?'功能预览（设备未接入）':'设备数据',model.eventId,b.id,mm(b.slots.at(-1).minute),b.slots.map(s=>mm(s.sourceStartMinute)+'—'+mm(s.sourceEndMinute)).join(' / '),total(b,'volumeMl'),total(b,'representedVolumeL'),p?.temperatureC??'',p?.conductivityUsCm??'',l?.tnMgL??'',l?.tpMgL??'',l?'已关联':'待关联']);
  }
  const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(l=>l.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='qingyang-bottles.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
 });
 if(CONFIG.endpoint){$('timeline').hidden=true;$('timeline').style.display='none';connectStatus('loading');poll();}
 else {pos=preview.points.length-1;render();}
}
init();
