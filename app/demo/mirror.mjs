import {EDGES,frameSize} from './mirror-core.mjs';
const el=id=>document.getElementById(id);
const video=el('mirrorVideo'),canvas=el('mirrorCanvas'),ctx=canvas.getContext('2d');
const lastFrame=document.createElement('canvas'),lastCtx=lastFrame.getContext('2d');
let generation=0,worker,stream,timer,prepareTimer,frameTimer,rejectInit,abort,poses=[],lastTime=-1;
function status(text){if(el('mirrorStatus').textContent!==text)el('mirrorStatus').textContent=text;}
export function stopMirror(message='Câmera desligada.') {
  generation++;
  clearTimeout(timer);clearTimeout(prepareTimer);clearTimeout(frameTimer);
  abort?.abort();abort=null;
  rejectInit?.(new Error('cancelled'));rejectInit=null;
  worker?.terminate();worker=null;
  stream?.getTracks().forEach(track=>track.stop());stream=null;
  video.pause();video.srcObject=null;
  poses=[];lastTime=-1;canvas.width=1;canvas.height=1;lastFrame.width=1;lastFrame.height=1;
  canvas.hidden=true;el('mirrorPlaceholder').hidden=false;
  el('startMirror').disabled=false;el('stopMirror').disabled=true;el('facing').disabled=false;
  status(message);
}
function fail(message){stopMirror(message);el('mirrorError').textContent=message;el('mirrorError').hidden=false;}
function draw(){
  if(canvas.hidden)return;
  ctx.fillStyle='#101c32';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(!el('onlyPoints').checked)ctx.drawImage(lastFrame,0,0);
  poses.forEach((points,index)=>{
    const color=index===0?'#67e8f9':'#facc15';const byId=new Map(points.map(p=>[p.id,p]));
    ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,canvas.width/180);ctx.lineCap='round';
    for(const [a,b]of EDGES){const p=byId.get(a),q=byId.get(b);if(!p||!q)continue;ctx.beginPath();ctx.moveTo(p.x*canvas.width,p.y*canvas.height);ctx.lineTo(q.x*canvas.width,q.y*canvas.height);ctx.stroke();}
    for(const p of points){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,Math.max(3,canvas.width/130),0,2*Math.PI);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#101c32';ctx.lineWidth=1;ctx.stroke();}
  });
}
async function nextFrame(token){
  if(token!==generation||!worker)return;
  if(video.readyState<2||video.currentTime===lastTime){timer=setTimeout(()=>nextFrame(token),125);return;}
  lastTime=video.currentTime;
  let bitmap;
  try {
    const size=frameSize(video.videoWidth,video.videoHeight);
    bitmap=await createImageBitmap(video,{resizeWidth:size.width,resizeHeight:size.height});
    if(token!==generation){bitmap.close();return;}
    worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
    frameTimer=setTimeout(()=>{if(token===generation)fail('O processamento demorou demais. Tente iniciar novamente.');},20000);
  } catch {bitmap?.close();if(token===generation)fail('Este navegador não conseguiu processar a câmera localmente. Experimente a demonstração por foto.');}
}
el('startMirror').addEventListener('click',async()=>{
  stopMirror();const token=generation;el('mirrorError').hidden=true;
  el('startMirror').disabled=true;el('stopMirror').disabled=false;el('facing').disabled=true;
  status('Preparando o modelo local… Na primeira vez, o download pode demorar.');
  try {
    if(!navigator.mediaDevices?.getUserMedia||!window.Worker||!window.createImageBitmap)throw new Error('unsupported');
    prepareTimer=setTimeout(()=>{if(token===generation)fail('Não foi possível preparar o modelo a tempo. Confira a conexão e tente novamente.');},90000);
    abort=new AbortController();
    const response=await fetch('/mirror-config',{signal:abort.signal});if(!response.ok)throw new Error('config');
    const config=await response.json();if(token!==generation)return;
    worker=new Worker('/demo-assets/mirror-worker.js');
    await new Promise((resolve,reject)=>{
      rejectInit=reject;
      worker.onerror=()=>{reject(new Error('runtime'));if(token===generation)fail('O processamento local não está disponível neste navegador. Experimente a demonstração por foto.');};
      worker.onmessage=({data})=>{
        if(token!==generation){data.bitmap?.close();return;}
        if(data.type==='ready'){rejectInit=null;resolve();}
        if(data.type==='error'){reject(new Error('runtime'));fail('Não foi possível executar o modelo local. Tente novamente ou use a demonstração por foto.');}
        if(data.type==='result'){
          clearTimeout(frameTimer);
          const bitmap=data.bitmap;
          canvas.width=lastFrame.width=bitmap.width;canvas.height=lastFrame.height=bitmap.height;
          lastCtx.drawImage(bitmap,0,0);bitmap.close();poses=data.poses;
          canvas.hidden=false;el('mirrorPlaceholder').hidden=true;draw();
          status(poses.some(p=>p.length)?'Espelho ligado. Mexa-se no seu ritmo!':'Espelho ligado. Enquadre o corpo com boa iluminação.');
          timer=setTimeout(()=>nextFrame(token),125);
        }
      };
      worker.postMessage({type:'init',config});
    });
    clearTimeout(prepareTimer);if(token!==generation)return;
    status('Aguardando sua permissão para a câmera…');
    const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:el('facing').value},width:{ideal:640},height:{ideal:480}}});
    if(token!==generation){acquired.getTracks().forEach(track=>track.stop());return;}
    stream=acquired;
    for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{if(token===generation)stopMirror('A câmera foi desconectada.');},{once:true});
    video.srcObject=stream;await video.play();if(token!==generation)return;
    nextFrame(token);
  } catch(error){if(token===generation)fail(error.name==='NotAllowedError'?'A permissão da câmera foi recusada. Você pode tentar novamente ou usar a demonstração por foto.':'Não foi possível iniciar o espelho local. Confira a câmera e a conexão ou experimente outro navegador.');}
});
el('stopMirror').addEventListener('click',()=>stopMirror());
el('onlyPoints').addEventListener('change',draw);
el('flip').addEventListener('change',()=>canvas.classList.toggle('flipped',el('flip').checked));
canvas.classList.add('flipped');
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMirror('Câmera desligada ao sair da aba.');});
window.addEventListener('pagehide',()=>stopMirror());
