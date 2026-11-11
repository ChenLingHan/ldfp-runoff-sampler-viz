'use strict';
// Set endpoint to a CORS-enabled HTTPS endpoint for field telemetry. See README.
const CONFIG={endpoint:'',intervalMs:15000,staleMs:60000};
const BOTTLE_CAPACITY_ML=500;
const $=id=>document.getElementById(id);
const states=[
 ['待机',''],
 ['预冲','源水 S → 主管 C → 正转泵 → 预冲罐'],
 ['留样','移臂前停泵，到位后正转，按瓶位定量留样'],
 ['隔离','停泵并切阀，关闭源水 S，确认 C—D 到位'],
 ['清管','源水 S 隔离，残液经 C → D 进入独立容器']
];
const stagePaths=[
 [],
 ['源水 S','主管 C','正转泵','预冲罐'],
 ['源水 S','主管 C','正转泵','目标样瓶'],
 ['停泵','隔离 S','确认 C—D'],
 ['出液臂进气','反转泵','主管 C','排液端 D','残液罐']
];
const limits={measureMin:.05,pumpMin:.8/60/.05,max:.90};
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
  let allowed=discharge(start)>=limits.pumpMin&&discharge(start+37.64)>=limits.pumpMin;
  for(let s=start;allowed&&s<=start+37.64;s+=timeStep){
   const f=discharge(s);allowed=f>=limits.pumpMin&&f<=limits.max;
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
  const sampledL=cycle<0?0:cycle*.44182+(Math.min(age,10.64)+[0,9,18].reduce((n,offset)=>n+Math.min(7.5,Math.max(0,age-10.64-offset)),0))*.8/60;
  return {minute:t/60,flowLs:discharge(t),rainMm:mm,rainTotalMm:depth,volumeL:v,stage,sampledL};
 });
 [{sscMgL:1060},{tnMgL:2.41},{tpMgL:.24},{sscMgL:710},{tnMgL:1.87},{tpMgL:.17}]
  .forEach((lab,i)=>{if(bottles[i].slots.length===3)bottles[i].lab={...lab,status:'released'};});
 return {eventId:'双峰径流',updatedAt:null,points,bottles,grouped:true};
}
const preview=fieldPreview();
let model=preview,pos=0,bottle=1,showBottle=false,pinned=null,timer=null,readStatus='preview',asOf=null;
const valid=(x,a=0,b=Infinity)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const num=(x,p=1)=>valid(x,-1000)?x.toFixed(p):'—';
const mm=x=>{const s=Math.round(x*60);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
const total=(b,key)=>b.slots.reduce((a,s)=>a+s[key],0);
function setText(id,v){
 const element=$(id);
 if(element.textContent!==v)element.textContent=v;
}
function svg(tag,props={},label){
 const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [k,v] of Object.entries(props))e.setAttribute(k,v);
 if(label!==undefined)e.textContent=label;return e;
}
let plotScale;
function nearestPoint(points,minute){
 let lo=0,hi=points.length-1;
 while(lo<hi){
  const mid=Math.floor((lo+hi)/2);
  if(points[mid].minute<minute)lo=mid+1;
  else hi=mid;
 }
 return lo>0&&minute-points[lo-1].minute<=points[lo].minute-minute?lo-1:lo;
}
function chartPoint(event){
 if(!plotScale)return null;
 const bounds=$('chart').getBoundingClientRect();
 const {x0,x1,y0,y1,width,height,maxT}=plotScale;
 const x=(event.clientX-bounds.left)*width/bounds.width;
 const y=(event.clientY-bounds.top)*height/bounds.height;
 if(x<x0||x>x1||y<y0||y>y1)return null;
 return nearestPoint(model.points,(x-x0)/(x1-x0)*maxT);
}
function hideChartTip(){
 $('chart-tip').hidden=true;
 $('chart-guide').setAttribute('hidden','');
}
function chart(points,samples){
 const canvas=$('chart'), data=$('chart-data'), width=Math.max(260,canvas.clientWidth),height=Math.max(94,canvas.clientHeight);
 if(!canvas.clientWidth||!canvas.clientHeight)return;
 canvas.setAttribute('viewBox',`0 0 ${width} ${height}`);
 const maxT=points.at(-1).minute||1,
       maxF=Math.max(.2,Math.ceil(Math.max(...points.map(p=>p.flowLs))*5)/5),
       maxR=Math.max(1,Math.ceil(Math.max(...points.map(p=>p.rainMm))));
 const x0=Math.max(43,num(maxF,2).length*7+9),x1=width-Math.max(43,num(maxR,1).length*7+9),y0=24,y1=height-37;
 plotScale={x0,x1,y0,y1,width,height,maxT};
 hideChartTip();
 const x=m=>x0+(x1-x0)*m/maxT,y=f=>y1-(y1-y0)*f/maxF, yr=r=>y1-(y1-y0)*r/maxR;
 const label=(x,y,t,anchor='start')=>svg('text',{x,y,'text-anchor':anchor},t);
 const divisions=y1-y0<70?2:4;
 data.replaceChildren();
 for(let i=0;i<=divisions;i++){
  const yy=y(i*maxF/divisions);
  data.append(svg('line',{x1:x0,y1:yy,x2:x1,y2:yy,class:i?'chart-gridline':'chart-baseline'}),
   label(x0-7,yy+4,num(i*maxF/divisions,2),'end'),label(x1+7,yy+4,num(i*maxR/divisions,1)));
 }
 data.append(label(x0,14,'流量（L/s）'),label(x1,14,'雨量（mm）','end'),label((x0+x1)/2,height-2,'事件时间（min）','middle'));
 const timeLabel=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:maxT<4?2:1});
 for(let i=0;i<=4;i++)data.append(label(x(maxT*i/4),y1+16,timeLabel.format(maxT*i/4),'middle'));
 const seen=points.slice(0,pos+1),barWidth=Math.min(12,(x1-x0)/43);
 const current=seen.at(-1);
 if(readStatus==='preview'&&pos<points.length-1){
  data.append(svg('polyline',{points:points.map(p=>x(p.minute)+','+y(p.flowLs)).join(' '),class:'chart-forecast'}));
 }
 if(showBottle)for(const slot of samples[bottle-1].slots){
  for(const [start,end] of sourceTimes(slot)){
   data.append(svg('rect',{x:x(start),y:y0,width:Math.max(1,x(end)-x(start)),height:y1-y0,class:'chart-source'}));
  }
 }
 const line=seen.map(p=>x(p.minute)+','+y(p.flowLs)).join(' ');
 if(seen.length>1)data.append(svg('polygon',{points:x(seen[0].minute)+','+y1+' '+line+' '+x(current.minute)+','+y1,fill:'url(#flow-fill)'}));
 for(const p of seen)if(p.rainMm>0)data.append(svg('rect',{x:x(p.minute)-barWidth/2,y:yr(p.rainMm),width:barWidth,height:y1-yr(p.rainMm),class:'chart-rain',rx:2}));
 if(seen.length>1)data.append(svg('polyline',{points:line,class:'chart-flow'}));
 for(const sample of samples)for(const slot of sample.slots){
  const m=slot.minute, at=seen[nearestPoint(seen,m)];
  const selected=showBottle&&sample.id===bottle;
  data.append(svg('circle',{cx:x(m),cy:y(at.flowLs),r:selected?5:2.8,class:selected?'chart-sample chart-sample-selected':'chart-sample'}));
 }
 if(pos<points.length-1){
  data.append(svg('line',{x1:x(current.minute),x2:x(current.minute),y1:y0,y2:y1,class:'chart-cursor'}),
   svg('circle',{cx:x(current.minute),cy:y(current.flowLs),r:3.5,class:'chart-cursor-dot'}));
 }
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
 window.dispatchEvent(new CustomEvent('runoff:water',{detail:{point:p,mode:readStatus,telemetry:model.treatment}}));
 setText('rain',num(p.rainTotalMm));setText('flow',num(p.flowLs,3));setText('volume',num(p.volumeL,2));
 const peak=model.points.slice(0,pos+1).reduce((a,point)=>point.flowLs>a.flowLs?point:a);
 setText('peak-flow',num(peak.flowLs,3)+' L/s · T+'+mm(peak.minute));
 setText('filled-count',filled.length+' / '+bs.length+' 瓶');
 const flowStatus=p.flowLs>limits.max?'超出拟测流上限，停采':p.flowLs<limits.measureMin?'低于拟测流下限':p.flowLs<limits.pumpMin?'处于拟测流范围内，低于启泵流量':'流量达到启泵范围，仍需核验浸没和设备状态';
 setText('flow-condition','当前流量 '+num(p.flowLs,3)+' L/s · '+flowStatus);
 $('sample-summary').hidden=showBottle;
 $('sample-detail').hidden=!showBottle;
 $('results-heading').hidden=showBottle;
 $('sample-title').hidden=!showBottle;
 $('coverage').hidden=showBottle;
 $('sample-actions').hidden=!showBottle;
 $('source-key').dataset.active=String(showBottle&&b.slots.length>0);
 $('bottles').classList.toggle('grouped',model.grouped);
 const update=asOf===null?'':new Date(asOf).toLocaleTimeString('zh-CN',{hour12:false})+' · ';
 setText('timestamp',update+model.eventId);
 const duration=mm(model.points.at(-1).minute);
 $('seek').max=model.points.length-1;$('seek').value=pos;
 setText('cursor','T+'+mm(p.minute));setText('duration',duration);
 $('seek').setAttribute('aria-valuetext','事件开始后 '+mm(p.minute)+'，总时长 '+duration);
 chart(model.points,bs);
 for(const n of bs){
  const k=$('b'+n.id), volume=total(n,'volumeMl'), last=n.slots.at(-1);
  k.setAttribute('aria-pressed',String(showBottle&&n.id===bottle));
  k.querySelector('.glass-liquid').style.height=(volume/BOTTLE_CAPACITY_ML*100)+'%';
  k.dataset.empty=String(!last);
  k.dataset.partial=String(model.grouped&&Boolean(last)&&n.slots.length<3);
  const amount=last?num(volume,0)+' mL':'空瓶';
  const purpose=n.analyte??'';
  const rounds=model.grouped&&last?' · 已入瓶 '+n.slots.length+' / 3 次':'';
  const bottleSummary=k.querySelector('strong').textContent+(purpose?' · '+purpose:'')+' · '+amount+rounds;
  k.querySelector('.bottle-purpose').textContent=purpose;
  k.querySelector('.bottle-volume').textContent=amount;
  k.title=bottleSummary;
  k.setAttribute('aria-label',bottleSummary);
 }
 const last=b.slots.at(-1), id='B'+String(b.id).padStart(2,'0');
 setText('sample-title',b.analyte?id+' · '+b.analyte:'样瓶 '+id);
 $('bottle-facts').hidden=!last;
 if(last){
  setText('bottle-amount',num(total(b,'volumeMl'),0)+' / '+BOTTLE_CAPACITY_ML+' mL');
  setText('bottle-arrival','T+'+mm(last.minute));
  setText('bottle-represented',num(total(b,'representedVolumeL'),0)+' L');
 }
 const probe=b.probe?.quality==='valid'?b.probe:null,lab=b.lab?.status==='released'?b.lab:null;
 const measures=assays.filter(([,key])=>valid(lab?.[key])).map(([,key,name])=>name+' '+num(lab[key],key==='sscMgL'?0:2)+' mg/L');
 const collecting=model.grouped&&last&&b.slots.length<3;
 const reserve=model.grouped&&b.id>=7;
 const assayStatus=measures.length?'已关联化验':collecting?'留样中':last?'待化验':'';
 const emptyStatus=reserve?'备用瓶当前未启用':'截至当前时刻尚未入瓶';
 setText('assay-state',assayStatus);
 setText('qc',measures.length?measures.join(' · '):collecting?'已留样 '+b.slots.length+' / 3 轮':last?'已入瓶，等待化验记录':emptyStatus);
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
 setText('coverage',coverage?(model.grouped?'共同覆盖 ':'总氮覆盖 ')+num(coverage,0)+' L':'暂无合格区间');
 const coverageRatio=p.volumeL>0?coverage/p.volumeL*100:0;
 $('coverage-fill').style.width=Math.min(100,coverageRatio)+'%';
 $('coverage-track').setAttribute('aria-valuenow',num(Math.min(100,coverageRatio),2));
 $('coverage-track').setAttribute('aria-valuetext',num(coverageRatio,2)+'%');
 setText('coverage-context',p.volumeL>0?'占当前累计出流 '+num(coverageRatio,2)+'%':'尚无累计出流');
 const windows=b.slots.map(s=>{
  const item=document.createElement('li');
  for(const [start,end] of sourceTimes(s)){
   const segment=document.createElement('span');
   segment.textContent='T+'+mm(start)+'–'+mm(end);
   item.append(segment);
  }
  return item;
 });
 $('source-windows').replaceChildren(...windows);
 $('sample-windows').hidden=!windows.length;
 $('csv').disabled=!filled.length;
 const stage=pinned??p.stage;
 $('steps').querySelectorAll('button').forEach((btn,i)=>btn.setAttribute('aria-pressed',String(i===stage)));
 $('follow').hidden=pinned===null;
 $('route-button').hidden=pinned===null||stage===0;
 setText('stage',states[stage][0]+'水路');setText('route',states[stage][1]);
 window.runoffSceneState={stage,bottle,levels:bs.map(n=>total(n,'volumeMl')),flow:p.flowLs};
 window.dispatchEvent(new CustomEvent('runoff:scene',{detail:window.runoffSceneState}));
}
function validate(v){
 if(!v||typeof v.eventId!=='string'||!v.eventId.trim()||v.eventId.length>60||!Number.isFinite(Date.parse(v.updatedAt))||!Array.isArray(v.points)||!v.points.length||v.points.length>1440||!Array.isArray(v.bottles)||v.bottles.length!==8)throw Error('invalid envelope');
 let t=-1,w=-1,r=-1;
 for(const p of v.points){if(!p||!valid(p.minute)||p.minute<=t||!valid(p.volumeL)||p.volumeL<w||!valid(p.rainTotalMm)||p.rainTotalMm<r||!valid(p.rainMm)||!valid(p.flowLs)||!Number.isInteger(p.stage)||!valid(p.stage,0,4))throw Error('invalid series');t=p.minute;w=p.volumeL;r=p.rainTotalMm;}
 v.bottles.forEach((b,i)=>{
  if(!b||b.id!==i+1||!Array.isArray(b.slots)||b.slots.length>3||b.slots.some((s,k)=>!s||!valid(s.minute,0,t)||!valid(s.sourceStartMinute,0,s.minute)||!valid(s.sourceEndMinute,s.sourceStartMinute,s.minute)||!valid(s.volumeMl,.01,BOTTLE_CAPACITY_ML)||!valid(s.representedVolumeL,.01)||(k>0&&s.minute<=b.slots[k-1].minute))||total(b,'volumeMl')>BOTTLE_CAPACITY_ML)throw Error('invalid bottle');
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
 }catch{connectStatus(asOf===null?'error':'stale');render();}
 finally{setTimeout(poll,CONFIG.intervalMs);}
}
function stop(){
 if(timer!==null)clearTimeout(timer);
 timer=null;setText('play','播放演示');
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
 const chartElement=$('chart');
 chartElement.toggleAttribute('data-seekable',!CONFIG.endpoint);
 chartElement.addEventListener('pointermove',event=>{
  const index=chartPoint(event);
  if(index===null||index>pos||timer!==null){hideChartTip();return;}
  const p=model.points[index],{x0,x1,y0,y1,maxT}=plotScale;
  const x=x0+(x1-x0)*p.minute/maxT;
  const guide=$('chart-guide');
  guide.setAttribute('x1',x);guide.setAttribute('x2',x);
  guide.setAttribute('y1',y0);guide.setAttribute('y2',y1);
  guide.removeAttribute('hidden');
  setText('chart-tip-time','T+'+mm(p.minute));
  setText('chart-tip-flow',num(p.flowLs,3)+' L/s');
  setText('chart-tip-rain',num(p.rainTotalMm)+' mm');
  $('chart-tip').style.setProperty('--tip-x',(x<plotScale.width-178?x+12:x-176)+'px');
  $('chart-tip').hidden=false;
 });
 chartElement.addEventListener('pointerleave',hideChartTip);
 chartElement.addEventListener('click',event=>{
  if(CONFIG.endpoint)return;
  const index=chartPoint(event);
  if(index===null)return;
  stop();pos=index;render();
 });
 const fullscreen=$('fullscreen');
 fullscreen.hidden=!document.fullscreenEnabled;
 fullscreen.addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{fullscreen.textContent='请使用浏览器全屏';}
 });
 document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'退出全屏':'全屏展示';});
 for(let i=1;i<=8;i++){
  const e=document.createElement('button');e.type='button';e.className='bottle';e.id='b'+i;
  e.setAttribute('aria-controls','sample-detail');
  e.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight Home End');
  e.innerHTML='<span class="glass" aria-hidden="true"><span class="glass-body"><span class="glass-liquid"></span></span></span><span class="bottle-name"><strong></strong><span class="bottle-purpose"></span></span><span class="bottle-volume"></span>';
  e.querySelector('strong').textContent='B'+String(i).padStart(2,'0');
  e.addEventListener('click',()=>selectBottle(i,true));
  $(i<=3?'rack-a':i<=6?'rack-b':'rack-spares').append(e);
 }
 $('bottles').addEventListener('keydown',event=>{
  const button=event.target.closest('.bottle');
  if(!button||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const current=Number(button.id.slice(1)),count=model.bottles.length;
  const next={ArrowLeft:(current+count-2)%count+1,ArrowRight:current%count+1,Home:1,End:count}[event.key];
  event.preventDefault();
  $('b'+next).focus();
  selectBottle(next,false);
 });
 const machineView=document.querySelector('[data-view="machine"]');
 const showRack=$('show-rack');
 showRack.addEventListener('click',()=>{
  if(machineView.disabled)return;
  machineView.click();
  machineView.focus({preventScroll:true});
  $('scene-viewport').scrollIntoView({block:'nearest'});
 });
 $('show-summary').addEventListener('click',()=>{
  showBottle=false;render();$('readout-body').scrollTop=0;
  $('results-heading').focus({preventScroll:true});
  setText('selection-status','显示检测汇总');
 });
 states.forEach((s,i)=>{
  const e=document.createElement('button');e.type='button';
  const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');
  e.append(number,s[0]);e.addEventListener('click',()=>{stop();pinned=i;render();});$('steps').append(e);
 });
 $('route-button').addEventListener('click',()=>{
  const nodes=stagePaths[pinned].map(label=>{
   const node=document.createElement('span');node.textContent=label;return node;
  });
  $('route-path').replaceChildren(...nodes);
  $('route-dialog').showModal();
 });
 $('flow-rule').addEventListener('click',()=>$('flow-dialog').showModal());
 $('follow').addEventListener('click',()=>{
  pinned=null;render();
  $('steps').querySelector('[aria-pressed=true]').focus();
 });
 $('seek').addEventListener('input',()=>{stop();pos=Number($('seek').value);render()});
 window.addEventListener('runoff:seek',event=>{
  if(CONFIG.endpoint||!Number.isFinite(event.detail))return;
  stop();pinned=null;
  pos=nearestPoint(model.points,event.detail);
  render();
 });
 $('restart').addEventListener('click',()=>{stop();pos=0;pinned=null;window.dispatchEvent(new Event('runoff:reset-water'));render();});
 $('play').addEventListener('click',()=>{
  if(timer!==null){stop();return;}
  if(pos===model.points.length-1){pos=0;window.dispatchEvent(new Event('runoff:reset-water'));}
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
 if(CONFIG.endpoint){$('timeline').hidden=true;$('timeline').style.display='none';connectStatus('loading');render();poll();}
 else {pos=preview.points.length-1;render();}
}
function selectBottle(id,reveal){
 stop();bottle=id;showBottle=true;render();
 $('readout-body').scrollTop=0;
 setText('selection-status','已选 '+$('sample-title').textContent);
 if(reveal&&matchMedia('(max-width: 960px)').matches)$('readout-body').parentElement.scrollIntoView({block:'nearest'});
}
init();
