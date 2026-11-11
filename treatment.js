'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const rules={ntu:80,no3:3,po4:.25};
 const steps=['汇流监测','定量净化','出水待检','核验排放'];
 const names=['浊度','硝态氮','正磷酸盐磷'];
 const units=['NTU','mg N/L','mg P/L'];
 const keys=['ntu','no3','po4'];
 const sample=(ntu,no3,po4)=>({ntu,no3,po4});
 const retained=30, sampleUse=1, output=retained-sampleUse;
 const started=6, complete=16;
 let review='pending', last=null;
 const set=(id,v)=>{$(id).textContent=v;};
 const format=(x,n=1)=>Number.isFinite(x)?x.toFixed(n):'—';
 const amount=x=>Number.isFinite(x)?format(x,2)+' L':'—';
 function validate(w){
  if(!w||!['collect','treat','hold','release','fault'].includes(w.state)||!['closed','open','unknown'].includes(w.valve))return null;
  const volumeKeys=['storedL','processedL','dischargedL'];
  if(volumeKeys.some(k=>!Number.isFinite(w[k])||w[k]<0)||w.dischargedL>w.processedL)return null;
  const read=x=>x==null?null:(keys.every(k=>Number.isFinite(x[k])&&x[k]>=0)?x:null);
  const authorization=w.authorization==='verified'&&typeof w.batchId==='string'&&w.batchId.trim().length>0?'verified':'pending';
  const inlet=read(w.inlet),batchInlet=read(w.batchInlet),outlet=read(w.outlet);
  if(w.valve==='open'&&(!inlet||!outlet||authorization!=='verified'||w.state!=='release'))return {...w,state:'fault',valve:'unknown',inlet,batchInlet,outlet,authorization};
  return {...w,inlet,batchInlet,outlet,authorization};
 }
 function example(point){
  const t=point.minute;
  const rise=Math.exp(-.5*((t-10)/3.6)**2), pulse=Math.exp(-.5*((t-27)/4.6)**2);
  const inlet=sample(31+185*rise+89*pulse,1.25+3.65*rise+2.23*pulse,.09+.4*rise+.21*pulse);
  const processedL=Math.max(0,Math.min(retained,(t-started)*3));
  const state=t<started?'collect':t<complete?'treat':t>=40&&review==='approved'?'release':t>=40&&review==='fault'?'fault':'hold';
  return {state,valve:state==='release'?'open':'closed',storedL:Math.max(0,point.volumeL-processedL-(point.sampledL??0)),processedL,
   dischargedL:state==='release'?output:0,inlet,batchInlet:t>=complete?sample(150,3.6,.32):null,outlet:t>=complete?sample(21,2.41,.12):null,
   authorization:state==='release'?'verified':'pending',batchId:t>=started?'P01':'—'};
 }
 const notes={
  collect:'原水进入调蓄箱，在线指标越限且联锁通过后启动净化。',
  treat:'V1 进水；P1 以 3 L/min 送水，经沉降、粗滤和两级填料床。V2 保持关闭。',
  hold:'出水单独存放。在线复测可看趋势，等待本批总氮、总磷和现场许可核验。',
  release:'该批核验通过，V2 获准开启重力排水。',
  fault:'异常或复核未通过。V2 不获放行，留存本批水并报警。'
 };
 const stages={collect:0,treat:1,hold:2,release:3,fault:2};
 function paint(point,mode,telemetry){
  last={point,mode,telemetry};
  const preview=mode==='preview', w=preview?example(point):mode==='live'?validate(telemetry):null;
  const state=w?.state;
  $('water-panel').dataset.stage=state??'offline';
  const selected=stages[state]??-1;
  $('purification-steps').querySelectorAll('li').forEach((li,i)=>{
   li.classList.toggle('done',selected>i);
   li.classList.toggle('active',selected===i);
   if(selected===i)li.setAttribute('aria-current','step');
   else li.removeAttribute('aria-current');
  });
  set('water-state',state==='fault'?'留存告警':steps[selected]??'净化数据未接入');
  set('treatment-description',preview&&state==='release'?'次日核验通过 · 30 L 进水，1 L 取样与留存，29 L 排放':notes[state]??'等待本地控制器上传有效的水质和排放记录。');
  set('water-valve',w?.valve==='open'?'开启':w?.valve==='closed'?'关闭':'未确认');
  set('water-stored',amount(w?.storedL));
  set('water-processed',amount(w?.processedL));
  set('water-discharged',amount(w?.dischargedL));
  set('water-batch',w?.batchId??'—');
  keys.forEach((key,i)=>{
   const v=w?.inlet?.[key],before=w?.batchInlet?.[key],after=w?.outlet?.[key],precision=i===0?0:2;
   set('raw-'+key,format(v,precision));
   set('batch-'+key,format(before,precision));
   set('clean-'+key,format(after,precision));
   $('raw-'+key).classList.toggle('over',Number.isFinite(v)&&v>=rules[key]);
  });
  const scenario=$('review-demo');
  scenario.hidden=!preview;
  scenario.querySelectorAll('button').forEach(b=>{b.disabled=point.minute<40;b.setAttribute('aria-pressed',String(b.dataset.review===(point.minute<40?'pending':review)));});
  set('review-label',preview&&point.minute>=40?'雨后核验演示':'雨后核验');
 }
 keys.forEach((k,i)=>{
  set('test-'+k,names[i]);
  set('unit-'+k,units[i]);
  set('threshold-'+k,String(rules[k]));
 });
 const li=steps.map((label,i)=>{
  const row=document.createElement('li'), counter=document.createElement('span');
  counter.textContent='0'+(i+1);
  row.append(counter,label);
  return row;
 });
 $('purification-steps').append(...li);
 $('review-demo').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-review]');
  if(!btn||btn.disabled||last?.mode!=='preview')return;
  review=btn.dataset.review;
  paint(last.point,last.mode,last.telemetry);
 });
 window.addEventListener('runoff:reset-water',()=>{review='pending';});
 window.addEventListener('runoff:water',e=>paint(e.detail.point,e.detail.mode,e.detail.telemetry));
 const tabs=[...document.querySelectorAll('[data-monitor-tab]')];
 tabs.forEach(btn=>btn.addEventListener('click',()=>{
  const water=btn.dataset.monitorTab==='water';
  $('monitor-card').dataset.mode=water?'water':'flow';
  tabs.forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
 }));
 $('sheet-zoom').addEventListener('click',()=> $('engineering-dialog').showModal());
 $('treatment-rules').addEventListener('click',()=> $('treatment-dialog').showModal());
})();
