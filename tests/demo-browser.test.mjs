// Runs in CI with Chromium's fake camera, not with a person's webcam.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {sampleResult} from './demo-fixtures.mjs';

const origin = 'http://127.0.0.1:8032';
const image = {name:'synthetic.png', mimeType:'image/png', buffer:Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAKklEQVR4nO3NMQEAAAgDILV/51nBzwcK0Enqw7ysYrFYLBaLxWKxWCw+WROiAzmaldhuAAAAAElFTkSuQmCC','base64')};
let browser, server;
before(async () => {
  server = spawn('python', ['-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8032'], {stdio:'ignore'});
  let ready = false;
  for (let attempt=0; attempt<40; attempt++) {
    try { if ((await fetch(origin+'/health')).ok) {ready=true;break;} } catch {}
    await delay(250);
  }
  assert.ok(ready,'Test API did not start');
  browser = await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
});
after(async () => {await browser?.close();server?.kill();});

async function setup({ready=true, mobile=false, init}={}) {
  const context = await browser.newContext({permissions:['camera'],viewport:mobile?{width:390,height:844}:{width:1365,height:900}});
  const page = await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(init)await page.addInitScript(init);
  const posts=[];
  await page.route('**/health',route=>route.fulfill({json:{status:'ok',service:'nonverbal-api',body_model_ready:ready}}));
  await page.route('**/v1/body/analyze',async route=>{
    posts.push(route.request());
    const frame=await page.locator('#resultCanvas').evaluate(canvas=>({width:canvas.width,height:canvas.height}));
    await route.fulfill({json:sampleResult(frame.width,frame.height)});
  });
  await page.goto(origin);
  await page.waitForFunction(()=>document.getElementById('checkService').disabled===false);
  return {page,posts,errors,close:async()=>{await context.close();assert.deepEqual(errors,[]);}};
}

test('camera preview stays local; explicit click sends one JPEG; stop ends tracks',async()=>{
  const {page,posts,close}=await setup();
  try {
    assert.equal(posts.length,0);
    await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('capture').disabled);
    assert.equal(posts.length,0);
    assert.equal(await page.locator('#cameraVideo').evaluate(v=>v.srcObject.getAudioTracks().length),0);
    await page.getByRole('button',{name:'Capturar e analisar',exact:true}).click();
    await page.getByText('Punho acima do ombro',{exact:true}).waitFor();
    assert.equal(posts.length,1);
    assert.equal(posts[0].headers()['content-type'],'image/jpeg');
    assert.equal(posts[0].postDataBuffer()[0],255);
    await page.evaluate(()=>{window.testTracks=[...document.getElementById('cameraVideo').srcObject.getTracks()];});
    await page.getByRole('button',{name:'Desligar',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.testTracks.every(track=>track.readyState==='ended')),true);
    assert.match(await page.locator('#cameraState').textContent(),/desligada/);
  } finally {await close();}
});

test('upload previews without sending, analyzes on click, and fits a mobile viewport',async()=>{
  const {page,posts,close}=await setup({mobile:true});
  try {
    await page.getByRole('tab',{name:'Arquivo',exact:true}).click();
    await page.locator('#imageFile').setInputFiles(image);
    await page.waitForFunction(()=>!document.getElementById('analyzeFile').disabled);
    assert.equal(posts.length,0);
    await page.getByRole('button',{name:'Analisar imagem',exact:true}).click();
    await page.getByText('Duas relações observadas',{exact:true}).waitFor();
    assert.equal(posts.length,1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.getByRole('button',{name:'Limpar imagem e resultado',exact:true}).click();
    assert.equal(await page.locator('#resultCanvas').isHidden(),true);
    assert.equal(await page.locator('#leftRelation').textContent(),'Sem análise');
  } finally {await close();}
});

test('late camera permission is released after switching away from camera',async()=>{
  const {page,posts,close}=await setup({init:()=>{
    navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{
      window.resolveLateCamera=()=>{
        const source=document.createElement('canvas');source.width=64;source.height=48;
        const stream=source.captureStream(1);window.lateTrack=stream.getVideoTracks()[0];resolve(stream);
      };
    });
  }});
  try {
    await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
    await page.getByText('Aguardando permissão para a câmera…',{exact:true}).waitFor();
    await page.getByRole('tab',{name:'Arquivo',exact:true}).click();
    await page.evaluate(()=>window.resolveLateCamera());
    await page.waitForFunction(()=>window.lateTrack.readyState==='ended');
    assert.equal(posts.length,0);
    assert.equal(await page.locator('#cameraVideo').evaluate(v=>v.srcObject),null);
  } finally {await close();}
});

test('denied camera permission has a usable file alternative and sends nothing',async()=>{
  const {page,posts,close}=await setup({init:()=>{
    navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};
  }});
  try {
    await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(),/permissão.*recusada/);
    assert.equal(posts.length,0);
    await page.getByRole('tab',{name:'Arquivo',exact:true}).click();
    assert.equal(await page.locator('#filePanel').isVisible(),true);
  } finally {await close();}
});

test('unavailable model prevents sending while local file preview remains usable',async()=>{
  const {page,posts,close}=await setup({ready:false});
  try {
    await page.getByRole('tab',{name:'Arquivo',exact:true}).click();
    await page.locator('#imageFile').setInputFiles(image);
    await page.getByText('Prévia local da imagem',{exact:true}).waitFor();
    assert.equal(await page.locator('#analyzeFile').isDisabled(),true);
    assert.equal(posts.length,0);
  } finally {await close();}
});

test('clear rejects a late API response instead of displaying a stale result',async()=>{
  const {page,posts,close}=await setup();
  let release;
  try {
    await page.route('**/v1/body/analyze',async route=>{
      posts.push(route.request());
      await new Promise(resolve=>{release=resolve;});
      await route.fulfill({json:sampleResult(40,30)}).catch(()=>{});
    });
    await page.getByRole('tab',{name:'Arquivo',exact:true}).click();
    await page.locator('#imageFile').setInputFiles(image);
    await page.waitForFunction(()=>!document.getElementById('analyzeFile').disabled);
    await page.getByRole('button',{name:'Analisar imagem',exact:true}).click();
    for(let i=0;i<50&&!release;i++)await delay(20);
    assert.ok(release);
    await page.getByRole('button',{name:'Limpar imagem e resultado',exact:true}).click();
    release();
    await delay(150);
    assert.equal(await page.locator('#leftRelation').textContent(),'Sem análise');
    assert.equal(await page.locator('#resultCanvas').isHidden(),true);
    assert.equal(posts.length,1);
  } finally {release?.();await close();}
});

test('leaving the page stops the preview and clears captured data',async()=>{
  const {page,posts,close}=await setup();
  try {
    await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('capture').disabled);
    await page.evaluate(()=>{
      window.testTracks=[...document.getElementById('cameraVideo').srcObject.getTracks()];
      window.dispatchEvent(new Event('pagehide'));
    });
    assert.equal(await page.evaluate(()=>window.testTracks.every(track=>track.readyState==='ended')),true);
    assert.equal(await page.locator('#resultCanvas').isHidden(),true);
    assert.equal(posts.length,0);
  } finally {await close();}
});

test('facial photo preview sends one explicit JPEG to the facial endpoint',async()=>{
 const {page,posts,close}=await setup({mobile:true});const facePosts=[];
 try{
  await page.route('**/health',r=>r.fulfill({json:{service:'nonverbal-api',body_model_ready:true,face_model_available:true}}));
  await page.route('**/v1/face/analyze',async r=>{
   facePosts.push(r.request());const frame=await page.locator('#resultCanvas').evaluate(c=>({width:c.width,height:c.height}));
   await r.fulfill({json:{version:'0.1.0',experimental:true,channel:'face',status:'observed',frame,detected_faces_capped:1,
    landmarks:[{id:13,x:.5,y:.4},{id:14,x:.5,y:.6}],measures:{mouth:{value:.2,reason:'geometry_observed'},leftEye:{value:.1,reason:'geometry_observed'},rightEye:{value:.1,reason:'geometry_observed'}}}});
  });
  await page.locator('#photoChannel').selectOption('face');
  await page.getByRole('tab',{name:'Arquivo',exact:true}).click();
  await page.locator('#imageFile').setInputFiles(image);
  await page.waitForFunction(()=>!document.getElementById('analyzeFile').disabled);
  assert.equal(facePosts.length,0);
  await page.getByRole('button',{name:'Analisar imagem',exact:true}).click();
  await page.getByText('Medidas faciais observadas',{exact:true}).waitFor();
  assert.equal(facePosts.length,1);assert.equal(posts.length,0);
  assert.equal(facePosts[0].headers()['content-type'],'image/jpeg');
  assert.equal(await page.locator('#photoMouth').textContent(),'0,20 ×');
  assert.equal(await page.locator('#bodyPhotoResults').isHidden(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Limpar imagem e resultado',exact:true}).click();
  assert.equal(await page.locator('#photoMouth').textContent(),'—');
 }finally{await close();}
});
