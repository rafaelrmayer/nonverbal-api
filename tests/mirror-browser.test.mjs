// CI only: real same-origin WASM + synthetic frames and Chromium fake camera.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:8033';
let browser,server;
before(async()=>{
 server=spawn('python',['-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8033'],{stdio:'ignore'});
 let ready=false;
 for(let i=0;i<80;i++){try{if((await fetch(origin+'/health')).ok){ready=true;break;}}catch{}await delay(250);}
 assert.ok(ready);
 browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
});
after(async()=>{await browser?.close();server?.kill();});
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
     if(data.type==='result'){const result={poses:data.poses,width:data.bitmap.width,height:data.bitmap.height};data.bitmap.close();clearTimeout(timer);worker.terminate();resolve(result);}
    };worker.postMessage({type:'init',config});
   });
  });
  assert.deepEqual(result,{poses:[],width:320,height:240});
  assert.ok(requests.some(r=>r.url.includes('.wasm')));
  assert.ok(requests.some(r=>r.url.includes('/mirror-model/')));
  assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));
  assert.deepEqual(errors,[]);
 }finally{await close();}
});
test('real local camera loop stops tracks, supports points-only, and never uploads',{timeout:120000},async()=>{
 const {page,requests,errors,close}=await setup();
 try{
  assert.ok(!requests.some(r=>r.url.includes('/mirror-model/')));
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
