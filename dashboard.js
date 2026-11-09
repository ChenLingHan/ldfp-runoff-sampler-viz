'use strict';
// Set endpoint to a CORS-enabled HTTPS endpoint for field telemetry. See README.
const CONFIG={endpoint:'',intervalMs:15000,staleMs:60000};
const $=id=>document.getElementById(id);
const states=[
 ['待机','停泵，等待出流达到触发量','停靠位'],
 ['预冲','源水 S → 主管 C → 正转泵 → 预冲罐'],
 ['留样','移臂前停泵，到位后正转，按瓶位定量留样'],
 ['隔离','停泵并切阀，关闭源水 S，确认 C—D 到位'],
 ['清管','源水 S 隔离，残液经 C → D 进入独立容器']
];
function fieldPreview(){
 const timeStep=.25, end=2400, width=60;
 const g=(t,center,sigma)=>Math.exp(-.5*((t-center)/sigma)**2);
 const discharge=t=>.65*g(t,650,230)+.75*g(t,1650,320);
 const cumulative=[0], cycles=[];
 const bottles=Array.from({length:8},(_,i)=>({
  id:i+1, analyte:i<6?['悬沙','总氮','总磷'][i%3]:'备用', slots:[],probe:null,lab:null
 }));
 let last=discharge(0),next=width;
 for(let i=1;i<=end/timeStep;i++){
  const t=i*timeStep,q=discharge(t),v=cumulative.at(-1)+(last+q)*timeStep/2;
  last=q;cumulative.push(v);
  if(v<next||cycles.length>=6)continue;
  const start=t-timeStep+timeStep*(next-cumulative[i-1])/(v-cumulative[i-1]);
  next+=width;
  if(start+46>end||start-(cycles.at(-1)??-Infinity)<46)continue;
  let allowed=discharge(start)>=.8/60/.05&&discharge(start+37.64)>=.8/60/.05;
  for(let s=start;allowed&&s<=start+37.64;s+=timeStep){
   const f=discharge(s);allowed=f>=.8/60/.05&&f<=.90;
  }
  if(!allowed)continue;
  const group=Math.floor(cycles.length/3)*3;
  cycles.push(start);
  for(let j=0;j<3;j++){
   const t=start+9*j, a=(t+7.09)/60, b=(t+16.09)/60;
   bottles[group+j].slots.push({
    minute:(t+19.64)/60,sourceStartMinute:a,sourceEndMinute:b,
    sourceWindows:[[a,(t+10.64)/60],[(t+12.14)/60,b]],
    volumeMl:100,representedVolumeL:width
   });
  }
 }
 const rain=[0,.5,1.3,1.8,2.5,3.1,2.2,1.6,.8,.4,.2,0,.2,.6,1.2,1.3,.6,.2,0,0,0];
 const schedule=[0,10.64,37.64,42.14,46];
 const seconds=new Set(Array.from({length:601},(_,i)=>i*4));
 for(const t of cycles)for(const age of [...schedule,19.64,28.64])seconds.add(t+age);
 let depth=0, cycle=-1;
 const points=[...seconds].sort((a,b)=>a-b).map(t=>{
  while(cycle+1<cycles.length&&t>=cycles[cycle+1])cycle++;
  const age=cycle>=0?t-cycles[cycle]:Infinity;
  const stage=age<10.64-1e-8?1:age<37.64-1e-8?2:age<42.14-1e-8?3:age<46-1e-8?4:0;
  const mm=t%120===0?rain[t/120]||0:0;
  depth+=mm;
  const i=Math.floor(t/timeStep),v=cumulative[i]+(t-i*timeStep)*discharge(t);
  return {minute:t/60,flowLs:discharge(t),rainMm:mm,rainTotalMm:depth,volumeL:v,stage};
 });
 [{sscMgL:1060},{tnMgL:2.41},{tpMgL:.24},{sscMgL:710},{tnMgL:1.87},{tpMgL:.17}]
  .forEach((lab,i)=>{if(bottles[i].slots.length===3)bottles[i].lab={...lab,status:'released'};});
 return {eventId:'双峰径流',updatedAt:null,points,bottles,grouped:true};
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
 const canvas=$('chart'), width=Math.max(260,canvas.clientWidth),height=Math.max(94,canvas.clientHeight);
 canvas.setAttribute('viewBox',`0 0 ${width} ${height}`);
 const x0=36,x1=width-37,y0=18,y1=height-29, maxT=points.at(-1).minute||1,
       maxF=Math.max(.2,Math.ceil(Math.max(...points.map(p=>p.flowLs))*5)/5),
       maxR=Math.max(1,Math.ceil(Math.max(...points.map(p=>p.rainMm))));
 const x=m=>x0+(x1-x0)*m/maxT,y=f=>y1-(y1-y0)*f/maxF, yr=r=>y1-(y1-y0)*r/maxR;
 const label=(x,y,t,anchor='start',fill='#536961')=>svg('text',{x,y,fill,'font-size':11,'text-anchor':anchor},t);
 canvas.replaceChildren();
 for(let i=0;i<=4;i++){
  let yy=y(i*maxF/4);canvas.append(svg('line',{x1:x0,y1:yy,x2:x1,y2:yy,stroke:'#e1e9e1'}),label(x0-7,yy+4,num(i*maxF/4,2),'end'),label(x1+7,yy+4,num(i*maxR/4,1)));
 }
 canvas.append(label(x0,11,'流量 L/s'),label(x1,11,'降雨 mm','end'),label(x1,height-2,'事件时间 min','end'));
 for(let i=0;i<=4;i++)canvas.append(label(x(maxT*i/4),y1+13,String(Math.round(maxT*i/4)),'middle'));
 const seen=points.slice(0,pos+1),barWidth=5.5;
 for(const p of seen)if(p.rainMm>0)canvas.append(svg('rect',{x:x(p.minute)-barWidth/2,y:yr(p.rainMm),width:barWidth,height:y1-yr(p.rainMm),fill:'#8cb7d0',opacity:.55,rx:2}));
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
const assays=[['mass-s','sscMgL','悬沙'],['mass-n','tnMgL','总氮'],['mass-p','tpMgL','总磷']];
const sourceTimes=s=>model.grouped&&s.sourceWindows?s.sourceWindows:[[s.sourceStartMinute,s.sourceEndMinute]];
const formatWindows=s=>sourceTimes(s).map(([start,end])=>mm(start)+'–'+mm(end)).join(' + ');
function render(){
 const p=model.points[pos],bs=visibleBottles(),b=bs[bottle-1],filled=bs.filter(n=>n.slots.length);
 setText('rain',num(p.rainTotalMm));setText('flow',num(p.flowLs,2));setText('volume',num(p.volumeL,2));
 setText('samples','已留样 '+filled.length+' / 8 瓶');
 setText('plan',model.grouped?'60 L 触发 · 2 组联采 · 2 个备用瓶':'累计出流触发 · 8 个样瓶');
 const update=asOf===null?'':new Date(asOf).toLocaleTimeString('zh-CN',{hour12:false})+' · ';
 setText('timestamp',update+model.eventId);
 $('seek').max=model.points.length-1;$('seek').value=pos;setText('cursor','T+'+mm(p.minute));
 chart(model.points,bs);
 for(const n of bs){
  const k=$('b'+n.id), volume=total(n,'volumeMl'), last=n.slots.at(-1);
  k.setAttribute('aria-pressed',String(n.id===bottle));
  k.querySelector('b').style.height=(volume/5)+'%';
  k.querySelector('strong').textContent='B'+String(n.id).padStart(2,'0')+(n.analyte?' · '+n.analyte:'');
  k.querySelector('small').textContent=last?num(volume,0)+' mL':'未留样';
 }
 const last=b.slots.at(-1), id='B'+String(b.id).padStart(2,'0');
 setText('sample-title',id+' · '+(b.analyte??'样瓶')+' · '+(last?num(total(b,'volumeMl'),0)+' mL':'未留样'));
 setText('sample-note',last?'入瓶 T+'+mm(last.minute)+' · 代表 '+num(total(b,'representedVolumeL'),0)+' L':'');
 const probe=b.probe?.quality==='valid'?b.probe:null,lab=b.lab?.status==='released'?b.lab:null;
 const measures=assays.filter(([,key])=>valid(lab?.[key])).map(([,key,name])=>name+' '+num(lab[key],key==='sscMgL'?0:2)+' mg/L');
 setText('qc',measures.length?measures.join(' · '):last?'待关联化验结果':'该瓶尚无样品');
 setText('probe-readings',probe?'水温 '+num(probe.temperatureC)+' °C · 电导率 '+num(probe.conductivityUsCm,0)+' μS/cm':'');
 let coverage=0;
 for(const [element,key] of assays){
  const paired=filled.filter(n=>n.lab?.status==='released'&&valid(n.lab[key]));
  if(!model.grouped&&key==='tnMgL')coverage=paired.reduce((sum,n)=>sum+total(n,'representedVolumeL'),0);
  setText(element,paired.length?num(paired.reduce((sum,n)=>sum+n.lab[key]*total(n,'representedVolumeL')/1000,0),3):'—');
 }
 if(model.grouped)for(const offset of [0,3]){
  const group=bs.slice(offset,offset+3);
  if(group.every((n,i)=>n.lab?.status==='released'&&valid(n.lab[assays[i][1]]))){
   coverage+=total(group[0],'representedVolumeL');
  }
 }
 setText('coverage',coverage?(model.grouped?'共同覆盖 ':'化验覆盖 ')+num(coverage,0)+' L':'暂无合格区间');
 const windows=b.slots.map(s=>{
  const item=document.createElement('span');
  item.textContent='T+'+mm(s.sourceStartMinute)+'–'+mm(s.sourceEndMinute);
  item.title='有效取水时段 '+formatWindows(s);
  item.setAttribute('aria-label',item.title);
  return item;
 });
 $('source-windows').replaceChildren(...(windows.length?['取水窗',...windows]:[]));
 $('csv').disabled=!filled.length;
 const stage=pinned??p.stage;
 $('steps').querySelectorAll('button').forEach((btn,i)=>btn.setAttribute('aria-pressed',String(i===stage)));
 $('follow').disabled=pinned===null;
 setText('stage',states[stage][0]+'　');setText('route',states[stage][1]);
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
  if(b.lab!=null&&(typeof b.lab!=='object'||!['pending','released'].includes(b.lab.status)||(b.lab.status==='released'&&(!valid(b.lab.tnMgL)||!valid(b.lab.tpMgL)||(b.lab.sscMgL!=null&&!valid(b.lab.sscMgL))))))throw Error('invalid laboratory result');
 });return v;
}
function connectStatus(kind){
 readStatus=kind;$('status').classList.toggle('live',kind==='live');
 setText('status',({preview:'方案预览 · 设备未接入',loading:'正在读取设备',live:'已接入 · 15 秒刷新',stale:'最近读数 · 更新延迟',error:'设备数据不可用'})[kind]);
}
async function poll(){
 try{
  const url=new URL(CONFIG.endpoint,location.href);
  if(url.protocol!=='https:')throw Error('HTTPS required');
  const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Error('gateway unavailable');
  const data=validate(await response.json()), when=Date.parse(data.updatedAt);
  if(when>Date.now()+CONFIG.staleMs||(asOf!==null&&when<asOf))throw Error('timestamp out of order');
  model={...data,grouped:false};asOf=when;pos=model.points.length-1;
  connectStatus(Date.now()-when>CONFIG.staleMs?'stale':'live');render();
 }catch{connectStatus(asOf===null?'error':'stale');}
 finally{setTimeout(poll,CONFIG.intervalMs);}
}
function stop(){
 if(timer!==null)clearTimeout(timer);
 timer=null;setText('play','回放事件');
}
function nextFrame(enteredStage){
 if(pos>=model.points.length-1){stop();return;}
 const guide=$('pace').value==='guide',stage=model.points[pos].stage;
 const wait=enteredStage&&stage?(guide?950:270):(guide?145:65);
 timer=setTimeout(()=>{
  const stride=stage?(guide?2:4):(guide?12:22);
  const limit=Math.min(pos+stride,model.points.length-1);
  let next=pos+1;
  while(next<limit&&model.points[next].stage===stage)next++;
  pos=next;
  render();
  nextFrame(model.points[pos].stage!==stage);
 },wait);
}
function init(){
 new ResizeObserver(()=>chart(model.points,visibleBottles())).observe($('chart'));
 const fullscreen=$('fullscreen');
 fullscreen.hidden=!document.fullscreenEnabled;
 fullscreen.addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{fullscreen.textContent='请使用浏览器全屏';}
 });
 document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'退出全屏':'全屏展示';});
 for(let i=1;i<=8;i++){
  const e=document.createElement('button');e.type='button';e.className='bottle';e.id='b'+i;
  e.innerHTML='<span class="glass" aria-hidden="true"><b></b></span><span><strong></strong><small></small></span>';
  e.addEventListener('click',()=>{bottle=i;render();});$('bottles').append(e);
 }
 states.forEach((s,i)=>{
  const e=document.createElement('button');e.type='button';
  const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');
  e.append(number,s[0]);e.addEventListener('click',()=>{stop();pinned=i;render();});$('steps').append(e);
 });
 $('follow').addEventListener('click',()=>{pinned=null;render()});
 $('seek').addEventListener('input',()=>{stop();pos=Number($('seek').value);render()});
 $('play').addEventListener('click',()=>{
  if(timer!==null){stop();return;}
  if(pos===model.points.length-1)pos=0;
  pinned=null;render();setText('play','暂停');nextFrame(true);
 });
 $('csv').addEventListener('click',()=>{
  const escape=v=>'"'+String(v).replace(/^[=+@-]/,"'"+String(v)[0]).replaceAll('"','""')+'"';
  const lines=[['数据来源','事件','瓶号','最后留样时刻','源水时段','样量 mL','代表水量 L','用途','水温 °C','电导率 μS/cm','悬沙 mg/L','TN mg/L','TP mg/L','化验状态']];
  for(const b of visibleBottles().filter(b=>b.slots.length)){
   const p=b.probe?.quality==='valid'?b.probe:null,l=b.lab?.status==='released'?b.lab:null;
   lines.push([readStatus==='preview'?'方案预览（设备未接入）':'设备数据',model.eventId,b.id,mm(b.slots.at(-1).minute),b.slots.map(formatWindows).join(' / '),total(b,'volumeMl'),total(b,'representedVolumeL'),b.analyte??'',p?.temperatureC??'',p?.conductivityUsCm??'',l?.sscMgL??'',l?.tnMgL??'',l?.tpMgL??'',l?'已关联':'待关联']);
  }
  const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(l=>l.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='qingyang-bottles.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
 });
 if(CONFIG.endpoint){$('timeline').hidden=true;$('timeline').style.display='none';connectStatus('loading');poll();}
 else {pos=preview.points.length-1;render();}
}
init();
