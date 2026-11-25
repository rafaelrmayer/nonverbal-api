// CI only: real same-origin WASM + synthetic frames and Chromium fake camera.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {encodeWav} from '../app/demo/vocal-core.mjs';
const origin='http://127.0.0.1:8033';
let browser,server,videoFixture;
const clipPath=join(tmpdir(),'nonverbal-clip-'+process.pid+'.webm');
before(async()=>{
 const generated=spawnSync('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=320x240:r=10','-t','4','-c:v','libvpx','-an',clipPath],{encoding:'utf8'});
 assert.equal(generated.status,0,generated.stderr);videoFixture={name:'synthetic.webm',mimeType:'video/webm',buffer:readFileSync(clipPath)};
 server=spawn('python',['-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8033'],{stdio:'ignore'});
 let ready=false;
 for(let i=0;i<80;i++){try{if((await fetch(origin+'/health')).ok){ready=true;break;}}catch{}await delay(250);}
 assert.ok(ready);
 browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
});
after(async()=>{await browser?.close();server?.kill();try{unlinkSync(clipPath);}catch{}});
async function setup(init){
 const context=await browser.newContext({permissions:['camera'],viewport:{width:390,height:844}});
 const page=await context.newPage();const requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
 if(init)await page.addInitScript(init);
 await page.goto(origin+'/mirror');
 return {page,requests,errors,close:()=>context.close()};
}
test('real worker runs WASM on blank image, returns bitmap, and requests only same-origin assets',{timeout:120000},async()=>{
 const {page,requests,errors,close}=await setup();
 try{
  const result=await page.evaluate(async()=>{
   const config=await (await fetch('/mirror-config')).json();
   return await new Promise((resolve,reject)=>{
    const worker=new Worker('/demo-assets/mirror-worker.js');
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'));},90000);
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(new Error(e.message));};
    worker.onmessage=async({data})=>{
     if(data.type==='error'){clearTimeout(timer);worker.terminate();reject(new Error('WASM failed'));}
     if(data.type==='ready'){
      const source=new OffscreenCanvas(320,240);const ctx=source.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,320,240);
      const bitmap=source.transferToImageBitmap();worker.postMessage({type:'frame',bitmap,timestamp:1},[bitmap]);
     }
     if(data.type==='result'){const result={poses:data.poses,hands:data.hands,faces:data.faces,width:data.bitmap.width,height:data.bitmap.height};data.bitmap.close();clearTimeout(timer);worker.terminate();resolve(result);}
    };worker.postMessage({type:'init',config,face:true});
   });
  });
  assert.deepEqual(result,{poses:[],hands:[],faces:[],width:320,height:240});
  assert.ok(requests.some(r=>r.url.includes('.wasm')));
  assert.ok(requests.some(r=>r.url.includes('/mirror-model/')));
  assert.ok(requests.some(r=>r.url.includes('/mirror-hand-model/')));
  assert.ok(requests.some(r=>r.url.includes('/mirror-face-model/')));
  assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));
  assert.deepEqual(errors,[]);
 }finally{await close();}
});
test('real local camera loop stops tracks, supports points-only, and never uploads',{timeout:120000},async()=>{
 const {page,requests,errors,close}=await setup();
 try{
  await page.goto(origin);
  await page.locator('#mirrorModeTab').click();
  assert.ok(!requests.some(r=>r.url.includes('/mirror-model/')));
  await page.getByLabel('Detalhar mãos e dedos',{exact:true}).uncheck();
  await page.getByLabel('Rosto e contornos',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Iniciar espelho',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('mirrorCanvas').hidden,{},{timeout:90000});
  assert.equal(await page.locator('#mirrorVideo').evaluate(v=>v.srcObject.getAudioTracks().length),0);
  await page.getByLabel('Só pontinhos',{exact:true}).check();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{window.tracks=[...document.getElementById('mirrorVideo').srcObject.getTracks()];});
  await page.getByRole('button',{name:'Parar câmera',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')),true);
  assert.equal(await page.locator('#mirrorCanvas').isHidden(),true);
  const count=requests.length;await delay(400);assert.equal(requests.length,count);
  assert.ok(!requests.some(r=>r.url.includes('/mirror-hand-model/')));
  assert.ok(!requests.some(r=>r.url.includes('/mirror-face-model/')));
  assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));assert.deepEqual(errors,[]);
 }finally{await close();}
});
// Lifecycle tests replace only the heavy worker; media tracks remain native fake-device tracks.
function fakeWorker(){
 window.Worker=class{constructor(){this.active=true;}postMessage(data){if(data.type==='init')setTimeout(()=>{if(this.active)this.onmessage({data:{type:'ready'}});},10);}terminate(){this.active=false;}};
}
test('permission granted after stop is immediately released',async()=>{
 const {page,requests,errors,close}=await setup(fakeWorker);
 try{
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grant=()=>{const c=document.createElement('canvas');const s=c.captureStream(1);window.track=s.getTracks()[0];resolve(s);};});});
  await page.getByRole('button',{name:'Iniciar espelho',exact:true}).click();
  await page.getByText('Aguardando sua permissão para a câmera…',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Parar câmera',exact:true}).click();await page.evaluate(()=>window.grant());
  await page.waitForFunction(()=>window.track.readyState==='ended');
  assert.equal(await page.locator('#mirrorVideo').evaluate(v=>v.srcObject),null);
  assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);
 }finally{await close();}
});
test('leaving page releases camera even with a frame in flight',async()=>{
 const {page,errors,close}=await setup(fakeWorker);
 try{
  await page.getByRole('button',{name:'Iniciar espelho',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('mirrorVideo').srcObject!==null);
  await page.evaluate(()=>{window.tracks=[...document.getElementById('mirrorVideo').srcObject.getTracks()];window.dispatchEvent(new Event('pagehide'));});
  assert.equal(await page.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')),true);
  assert.equal(await page.locator('#startMirror').isEnabled(),true);assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('unified page releases photo camera before opening mirror and keeps source tabs independent',async()=>{
 const {page,requests,errors,close}=await setup(fakeWorker);
 try{
  await page.goto(origin);
  await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('cameraVideo').srcObject!==null);
  await page.evaluate(()=>{window.tracks=[...document.getElementById('cameraVideo').srcObject.getTracks()];});
  await page.getByRole('tab',{name:'Espelho de pontinhos',exact:false}).click();
  assert.equal(await page.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')),true);
  assert.equal(await page.locator('#photoExperience').isHidden(),true);
  assert.equal(await page.locator('#mirrorExperience').isVisible(),true);
  assert.equal(await page.locator('#mirrorVideo').evaluate(v=>v.srcObject),null);
  await page.locator('#mirrorModeTab').press('Home');
  assert.equal(await page.locator('#photoExperience').isVisible(),true);
  await page.locator('#cameraTab').press('End');
  assert.equal(await page.locator('#filePanel').isVisible(),true);
  assert.equal(await page.locator('#photoExperience').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('switching from mirror releases tracks and does not start photo camera',async()=>{
 const {page,requests,errors,close}=await setup(fakeWorker);
 try{
  await page.getByRole('button',{name:'Iniciar espelho',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('mirrorVideo').srcObject!==null);
  await page.evaluate(()=>{window.tracks=[...document.getElementById('mirrorVideo').srcObject.getTracks()];});
  await page.locator('#photoModeTab').click();
  assert.equal(await page.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')),true);
  assert.equal(await page.locator('#cameraVideo').evaluate(v=>v.srcObject),null);
  assert.equal(await page.locator('#mirrorCanvas').isHidden(),true);
  assert.equal(await page.locator('#startCamera').isEnabled(),true);
  await page.locator('#mirrorModeTab').click();
  assert.equal(await page.locator('#startMirror').isEnabled(),true);
  assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('switching mode cancels a pending mirror permission',async()=>{
 const {page,errors,close}=await setup(fakeWorker);
 try{
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grant=()=>{const c=document.createElement('canvas');const s=c.captureStream(1);window.track=s.getTracks()[0];resolve(s);};});});
  await page.getByRole('button',{name:'Iniciar espelho',exact:true}).click();
  await page.getByText('Aguardando sua permissão para a câmera…',{exact:true}).waitFor();
  await page.locator('#photoModeTab').click();await page.evaluate(()=>window.grant());
  await page.waitForFunction(()=>window.track.readyState==='ended');
  assert.equal(await page.locator('#mirrorVideo').evaluate(v=>v.srcObject),null);
  assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('switching mode cancels a pending photo permission',async()=>{
 const {page,errors,close}=await setup(fakeWorker);
 try{
  await page.locator('#photoModeTab').click();
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grant=()=>{const c=document.createElement('canvas');const s=c.captureStream(1);window.track=s.getTracks()[0];resolve(s);};});});
  await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
  await page.getByText('Aguardando permissão para a câmera…',{exact:true}).waitFor();
  await page.locator('#mirrorModeTab').click();await page.evaluate(()=>window.grant());
  await page.waitForFunction(()=>window.track.readyState==='ended');
  assert.equal(await page.locator('#cameraVideo').evaluate(v=>v.srcObject),null);
  assert.equal(await page.locator('#mirrorVideo').evaluate(v=>v.srcObject),null);
  assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('two-finger shape closes a triangle; option and lost detection clear it',async()=>{
 const {page,requests,errors,close}=await setup(()=>{
  const hand=Array.from({length:21},(_,id)=>({id,x:.5,y:.6}));
  const coordinates={0:[.5,.85],5:[.42,.6],6:[.38,.4],8:[.28,.15],9:[.5,.58],10:[.56,.38],12:[.68,.15],14:[.59,.5],16:[.57,.7],17:[.65,.65],18:[.68,.57],20:[.63,.75]};
  for(const [id,[x,y]]of Object.entries(coordinates))Object.assign(hand[id],{x,y});
  window.Worker=class{
   constructor(){this.active=true;}
   postMessage(data){
    if(data.type==='init')setTimeout(()=>{if(this.active)this.onmessage({data:{type:'ready'}});},10);
    if(data.type==='frame')setTimeout(()=>{if(this.active)this.onmessage({data:{type:'result',poses:[],hands:window.noHand?[]:[hand],bitmap:data.bitmap}});else data.bitmap.close();},10);
   }
   terminate(){this.active=false;}
  };
 });
 try{
  await page.getByLabel('Só pontinhos',{exact:true}).check();
  await page.getByRole('button',{name:'Iniciar espelho',exact:true}).click();
  const yellowAtBridge=()=>{
   const c=document.getElementById('mirrorCanvas');if(c.hidden)return false;
   const pixel=c.getContext('2d').getImageData(Math.round(c.width*.48),Math.round(c.height*.15),1,1).data;
   return pixel[0]>230&&pixel[1]>170&&pixel[1]<225&&pixel[2]<60;
  };
  await page.waitForFunction(yellowAtBridge);
  await page.getByLabel('Fechar triângulo com dois dedos',{exact:true}).uncheck();
  assert.equal(await page.evaluate(yellowAtBridge),false);
  await page.getByLabel('Fechar triângulo com dois dedos',{exact:true}).check();
  await page.waitForFunction(yellowAtBridge);
  await page.evaluate(()=>{window.noHand=true;});
  await page.waitForFunction(()=>{
   const c=document.getElementById('mirrorCanvas');const p=c.getContext('2d').getImageData(Math.round(c.width*.48),Math.round(c.height*.15),1,1).data;
   return p[0]===16&&p[1]===28&&p[2]===50;
  });
  assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('face-only worker processes locally without fetching body or hand weights',{timeout:120000},async()=>{
 const {page,requests,errors,close}=await setup();
 try{
  const result=await page.evaluate(async()=>{
   const config=await(await fetch('/mirror-config')).json();
   return await new Promise((resolve,reject)=>{
    const worker=new Worker('/demo-assets/mirror-worker.js');
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('face worker timeout'));},90000);
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(new Error(e.message));};
    worker.onmessage=({data})=>{
     if(data.type==='error'){clearTimeout(timer);worker.terminate();reject(new Error('face WASM failed'));}
     if(data.type==='ready'){
      const c=new OffscreenCanvas(320,240);const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,320,240);
      const bitmap=c.transferToImageBitmap();worker.postMessage({type:'frame',bitmap,timestamp:1},[bitmap]);
     }
     if(data.type==='result'){const output={poses:data.poses,hands:data.hands,faces:data.faces};data.bitmap.close();clearTimeout(timer);worker.terminate();resolve(output);}
    };
    worker.postMessage({type:'init',config,body:false,hands:false,face:true});
   });
  });
  assert.deepEqual(result,{poses:[],hands:[],faces:[]});
  assert.ok(requests.some(r=>r.url.includes('/mirror-face-model/')));
  assert.ok(!requests.some(r=>r.url.includes('/mirror-model/')||r.url.includes('/mirror-hand-model/')));
  assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('no selected module prevents starting camera or downloading any model',async()=>{
 const {page,requests,errors,close}=await setup();
 try{
  for(const id of ['detailBody','detailHands','detailFace'])await page.locator('#'+id).uncheck();
  await page.getByRole('button',{name:'Iniciar espelho',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(),/Selecione pelo menos um módulo/);
  assert.equal(await page.locator('#mirrorVideo').evaluate(v=>v.srcObject),null);
  assert.ok(!requests.some(r=>r.url.includes('/mirror-config')||r.url.includes('-model/')));
  assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('facial contours and ratios render and clear on lost detection, options and stop',async()=>{
 const {page,requests,errors,close}=await setup(()=>{
  const face=[
   {id:61,x:.3,y:.7},{id:291,x:.7,y:.7},{id:13,x:.5,y:.68},{id:14,x:.5,y:.76},
   {id:33,x:.2,y:.3},{id:133,x:.4,y:.3},{id:159,x:.26,y:.28},{id:145,x:.26,y:.32},{id:158,x:.34,y:.28},{id:153,x:.34,y:.32},
   {id:362,x:.6,y:.3},{id:263,x:.8,y:.3},{id:386,x:.66,y:.27},{id:374,x:.66,y:.33},{id:385,x:.74,y:.27},{id:380,x:.74,y:.33}];
  window.Worker=class{
   constructor(){this.active=true;}
   postMessage(data){
    if(data.type==='init'){window.selectedModules={body:data.body,hands:data.hands,face:data.face};setTimeout(()=>{if(this.active)this.onmessage({data:{type:'ready'}});},10);}
    if(data.type==='frame')setTimeout(()=>{if(this.active)this.onmessage({data:{type:'result',poses:[],hands:[],faces:window.noFace?[]:window.twoFaces?[face,face]:[face],bitmap:data.bitmap}});else data.bitmap.close();},10);
   }
   terminate(){this.active=false;}
  };
 });
 try{
  await page.locator('#detailBody').uncheck();await page.locator('#detailHands').uncheck();
  await page.getByLabel('Só pontinhos',{exact:true}).check();
  await page.getByRole('button',{name:'Iniciar espelho',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('mouthRatio').textContent==='0,15 ×');
  assert.deepEqual(await page.evaluate(()=>window.selectedModules),{body:false,hands:false,face:true});
  assert.equal(await page.locator('#detailFace').isDisabled(),true);
  assert.match(await page.locator('#leftEyeRatio').textContent(),/^0,2[23] ×$/);
  const point=await page.locator('#mirrorCanvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(Math.round(c.width*.5),Math.round(c.height*.68),1,1).data));
  assert.ok(point[1]>150&&point[0]>70,'Facial point should be drawn in green');
  await page.getByLabel('Mostrar medidas de abertura',{exact:true}).uncheck();
  assert.equal(await page.locator('#faceMeasures').isHidden(),true);
  await page.getByLabel('Mostrar medidas de abertura',{exact:true}).check();
  await page.evaluate(()=>{window.twoFaces=true;});
  await page.getByText('Enquadre um rosto por vez para ver as medidas.',{exact:true}).waitFor();
  assert.equal(await page.locator('#mouthRatio').textContent(),'—');
  await page.evaluate(()=>{window.noFace=true;});
  await page.waitForFunction(()=>document.getElementById('faceMeasureStatus').textContent.startsWith('Aguardando'));
  const cleared=await page.locator('#mirrorCanvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(Math.round(c.width*.5),Math.round(c.height*.68),1,1).data));
  assert.deepEqual(cleared,[16,28,50,255]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Parar câmera',exact:true}).click();
  assert.equal(await page.locator('#mouthRatio').textContent(),'—');
  assert.equal(await page.locator('#detailFace').isEnabled(),true);
  assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('local video runs real models without camera or uploads, pauses and clears blob',{timeout:120000},async()=>{
 const {page,requests,errors,close}=await setup(()=>{
  navigator.mediaDevices.getUserMedia=async()=>{throw new Error('Video file must not request camera');};
  const revoke=URL.revokeObjectURL.bind(URL);window.revoked=[];URL.revokeObjectURL=url=>{window.revoked.push(url);revoke(url);};
 });
 try{
  await page.locator('#mirrorSource').selectOption('file');
  await page.locator('#mirrorVideoFile').setInputFiles(videoFixture);
  assert.ok(!requests.some(r=>r.url.includes('/mirror-model/')));
  await page.getByRole('button',{name:'Iniciar vídeo',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('mirrorCanvas').hidden,null,{timeout:90000});
  assert.equal(await page.locator('#mirrorVideo').evaluate(v=>v.srcObject),null);
  assert.equal(await page.locator('#mirrorVideo').evaluate(v=>v.muted),true);
  await page.getByRole('button',{name:'Pausar vídeo',exact:true}).click();
  const time=await page.locator('#mirrorVideo').evaluate(v=>v.currentTime);await delay(200);
  assert.equal(await page.locator('#mirrorVideo').evaluate(v=>v.currentTime),time);
  await page.getByRole('button',{name:'Continuar vídeo',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('mirrorStatus').textContent.startsWith('Vídeo concluído'),null,{timeout:15000});
  assert.equal(await page.locator('#mirrorCanvas').isVisible(),true);
  assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));
  await page.getByRole('button',{name:'Parar vídeo',exact:true}).click();
  assert.equal(await page.locator('#mirrorVideo').getAttribute('src'),null);
  assert.equal(await page.locator('#mirrorVideoFile').evaluate(v=>v.files.length),0);
  assert.ok(await page.evaluate(()=>window.revoked.length>0));
  assert.equal(await page.locator('#mirrorCanvas').isHidden(),true);assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('corrupt video is rejected before models load and clears its object URL',async()=>{
 const {page,requests,errors,close}=await setup();
 try{
  await page.locator('#mirrorSource').selectOption('file');
  await page.locator('#mirrorVideoFile').setInputFiles({name:'broken.mp4',mimeType:'video/mp4',buffer:Buffer.from('not a video')});
  await page.getByRole('button',{name:'Iniciar vídeo',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(),/codec|inválido/);
  assert.ok(!requests.some(r=>r.url.includes('/mirror-config')));
  assert.equal(await page.locator('#mirrorVideo').getAttribute('src'),null);assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('motion uses bounded local samples and clears on ambiguous or lost pose',async()=>{
 const {page,requests,errors,close}=await setup(()=>{
  let frame=0;
  window.Worker=class{
   constructor(){this.active=true;}
   postMessage(data){
    if(data.type==='init')setTimeout(()=>{if(this.active)this.onmessage({data:{type:'ready'}});},10);
    if(data.type==='frame')setTimeout(()=>{
     if(!this.active){data.bitmap.close();return;}
     frame++;const pose=[{id:15,x:.2+(frame%20)*.01,y:.5}];
     this.onmessage({data:{type:'result',poses:window.noPose?[]:window.twoPoses?[pose,pose]:[pose],hands:[],faces:[],bitmap:data.bitmap,time:data.time}});
    },10);
   }
   terminate(){this.active=false;}
  };
 });
 try{
  await page.getByRole('button',{name:'Iniciar espelho',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#motionValues dd').textContent!=='—');
  await page.evaluate(()=>{window.twoPoses=true;});
  await page.getByText('Mais de uma pose detectada. Rastros interrompidos para não misturar pessoas.',{exact:true}).waitFor();
  assert.equal(await page.locator('#motionValues dd').first().textContent(),'—');
  await page.evaluate(()=>{window.noPose=true;});
  await page.getByText('Aguardando uma pose para acompanhar punhos e tornozelos.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Parar câmera',exact:true}).click();
  assert.equal(await page.locator('#motionValues dd').first().textContent(),'—');
  assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));assert.deepEqual(errors,[]);
 }finally{await close();}
});

function toneWav(){
 const samples=Float32Array.from({length:16000},(_,i)=>i<12000?.25*Math.sin(2*Math.PI*220*i/16000):0);
 return {name:'synthetic.wav',mimeType:'audio/wav',buffer:Buffer.from(encodeWav([samples],16000))};
}
test('WAV preview is local until explicit vocal analysis; real endpoint returns tone measurements',async()=>{
 const {page,requests,errors,close}=await setup();
 try{
  await page.locator('#vocalModeTab').click();await page.locator('#vocalFile').setInputFiles(toneWav());
  await page.waitForFunction(()=>!document.getElementById('vocalAnalyze').disabled);
  assert.equal(requests.filter(r=>r.method==='POST').length,0);
  await page.getByRole('button',{name:'Analisar áudio',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('vocalResults').hidden);
  assert.equal(requests.filter(r=>r.method==='POST'&&r.url.endsWith('/v1/vocal/analyze')).length,1);
  assert.match(await page.locator('#vocalPitch').textContent(),/220[,\.]0 Hz/);
  assert.match(await page.locator('#vocalIntervalNote').textContent(),/−40 dBFS/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Limpar áudio e resultados',exact:true}).click();
  assert.equal(await page.locator('#vocalPreview').getAttribute('src'),null);
  assert.equal(await page.locator('#vocalResults').isHidden(),true);assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('real AudioWorklet records synthetic microphone locally and stops every track before upload',async()=>{
 const {page,requests,errors,close}=await setup(()=>{
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async options=>{const s=await original(options);window.vocalTracks=s.getTracks();window.microphoneOptions=options;return s;};
 });
 try{
  await page.context().grantPermissions(['camera','microphone']);
  await page.locator('#vocalModeTab').click();await page.locator('#vocalSource').selectOption('microphone');
  await page.getByRole('button',{name:'Gravar até 30 s',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('vocalStatus').textContent.startsWith('Gravando localmente'),null,{timeout:15000});
  await delay(600);
  assert.equal(await page.evaluate(()=>window.microphoneOptions.video),false);
  assert.equal(requests.filter(r=>r.method==='POST').length,0);
  await page.getByRole('button',{name:'Parar gravação',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('vocalAnalyze').disabled);
  assert.equal(await page.evaluate(()=>window.vocalTracks.every(t=>t.readyState==='ended')),true);
  assert.equal(requests.filter(r=>r.method==='POST').length,0);
  await page.getByRole('button',{name:'Analisar áudio',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('vocalResults').hidden);
  assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('late microphone permission is released after switching experience',async()=>{
 const {page,requests,errors,close}=await setup(()=>{
  navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grantLateMic=()=>{const ctx=new AudioContext();window.syntheticMicContext=ctx;const out=ctx.createMediaStreamDestination();window.lateMicTrack=out.stream.getTracks()[0];resolve(out.stream);};});
 });
 try{
  await page.locator('#vocalModeTab').click();await page.locator('#vocalSource').selectOption('microphone');
  await page.getByRole('button',{name:'Gravar até 30 s',exact:true}).click();
  await page.getByText('Aguardando sua permissão para o microfone…',{exact:true}).waitFor();
  await page.locator('#photoModeTab').click();await page.evaluate(()=>window.grantLateMic());
  await page.waitForFunction(()=>window.lateMicTrack.readyState==='ended');
  await page.evaluate(()=>window.syntheticMicContext.close());
  assert.equal(await page.locator('#vocalPreview').getAttribute('src'),null);
  assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('leaving vocal experience stops an active synthetic microphone and discards recording',async()=>{
 const {page,requests,errors,close}=await setup(()=>{
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async options=>{const s=await original(options);window.micTracks=s.getTracks();return s;};
 });
 try{
  await page.context().grantPermissions(['microphone','camera']);await page.locator('#vocalModeTab').click();
  await page.locator('#vocalSource').selectOption('microphone');await page.locator('#vocalRecord').click();
  await page.waitForFunction(()=>document.getElementById('vocalStatus').textContent.startsWith('Gravando localmente'));
  await page.locator('#mirrorModeTab').click();
  assert.equal(await page.evaluate(()=>window.micTracks.every(t=>t.readyState==='ended')),true);
  assert.equal(await page.locator('#vocalPreview').getAttribute('src'),null);
  assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);
 }finally{await close();}
});

test('denied microphone permission and invalid WAV never send audio',async()=>{
 const {page,requests,errors,close}=await setup(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});
 try{
  await page.locator('#vocalModeTab').click();await page.locator('#vocalSource').selectOption('microphone');
  await page.locator('#vocalRecord').click();await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(),/Permissão do microfone recusada/);
  await page.locator('#vocalSource').selectOption('file');
  await page.locator('#vocalFile').setInputFiles({name:'bad.wav',mimeType:'audio/wav',buffer:Buffer.from('not WAV')});
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('#vocalAnalyze').isDisabled(),true);
  assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);
 }finally{await close();}
});
