import {EDGES,HAND_EDGES,fingerTriangle,frameSize} from './mirror-core.mjs';
import {FACE_EDGES,faceMeasures} from './face-core.mjs';
const el=id=>document.getElementById(id);
const video=el('mirrorVideo'),canvas=el('mirrorCanvas'),ctx=canvas.getContext('2d');
const lastFrame=document.createElement('canvas'),lastCtx=lastFrame.getContext('2d');
let generation=0,worker,stream,timer,prepareTimer,frameTimer,rejectInit,abort,poses=[],hands=[],faces=[],lastTime=-1;
function status(text){if(el('mirrorStatus').textContent!==text)el('mirrorStatus').textContent=text;}
export function stopMirror(message='Câmera desligada.') {
  generation++;
  clearTimeout(timer);clearTimeout(prepareTimer);clearTimeout(frameTimer);
  abort?.abort();abort=null;
  rejectInit?.(new Error('cancelled'));rejectInit=null;
  worker?.terminate();worker=null;
  stream?.getTracks().forEach(track=>track.stop());stream=null;
  video.pause();video.srcObject=null;
  poses=[];hands=[];faces=[];lastTime=-1;canvas.width=1;canvas.height=1;lastFrame.width=1;lastFrame.height=1;
  canvas.hidden=true;el('mirrorPlaceholder').hidden=false;
  el('startMirror').disabled=false;el('stopMirror').disabled=true;el('facing').disabled=false;el('detailHands').disabled=false;el('detailFace').disabled=false;el('detailBody').disabled=false;
  updateFaceMeasures();
  status(message);
}
function fail(message){stopMirror(message);el('mirrorError').textContent=message;el('mirrorError').hidden=false;}
function drawPoints(points,edges,color,facial=false){
  const byId=new Map(points.map(p=>[p.id,p]));
  ctx.strokeStyle=color;ctx.lineWidth=facial?Math.max(1,canvas.width/400):Math.max(2,canvas.width/180);ctx.lineCap='round';
  for(const [a,b]of edges){const p=byId.get(a),q=byId.get(b);if(!p||!q)continue;ctx.beginPath();ctx.moveTo(p.x*canvas.width,p.y*canvas.height);ctx.lineTo(q.x*canvas.width,q.y*canvas.height);ctx.stroke();}
  for(const p of points){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,(facial?Math.max(1.2,canvas.width/400):Math.max(3,canvas.width/130)),0,2*Math.PI);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#101c32';ctx.lineWidth=1;ctx.stroke();}
}
function updateFaceMeasures(){
  const visible=el('detailFace').checked&&el('showFaceMeasures').checked;
  el('faceMeasures').hidden=!visible;
  const measures=faces.length===1?faceMeasures(faces[0],canvas.width,canvas.height):null;
  for(const [id,key]of [['mouthRatio','mouth'],['leftEyeRatio','leftEye'],['rightEyeRatio','rightEye']]){
    const value=measures?.[key];
    const label=value===null||value===undefined?'—':value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ×';
    if(el(id).textContent!==label)el(id).textContent=label;
  }
  const hasMeasures=measures&&Object.values(measures).some(value=>value!==null);
  const message=faces.length>1?'Enquadre um rosto por vez para ver as medidas.':hasMeasures?'Altura dividida pela largura da região. Não é porcentagem ou classificação.':'Aguardando um rosto com pontos suficientes no quadro.';
  if(el('faceMeasureStatus').textContent!==message)el('faceMeasureStatus').textContent=message;
}
function draw(){
  if(canvas.hidden)return;
  ctx.fillStyle='#101c32';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(!el('onlyPoints').checked)ctx.drawImage(lastFrame,0,0);
  poses.forEach((points,index)=>drawPoints(points,EDGES,index===0?'#67e8f9':'#facc15'));
  hands.forEach(points=>{
    drawPoints(points,HAND_EDGES,'#f9a8d4');
    const triangle=el('handTriangles').checked?fingerTriangle(points,canvas.width,canvas.height):null;
    if(!triangle)return;
    const byId=new Map(points.map(p=>[p.id,p]));
    ctx.beginPath();
    triangle.forEach((id,index)=>{const p=byId.get(id);ctx[index===0?'moveTo':'lineTo'](p.x*canvas.width,p.y*canvas.height);});
    ctx.closePath();ctx.fillStyle='rgba(250,204,21,0.15)';ctx.fill();
    ctx.strokeStyle='#facc15';ctx.lineWidth=Math.max(3,canvas.width/150);ctx.stroke();
  });
  faces.forEach(points=>drawPoints(points,FACE_EDGES,'#a7f3d0',true));
  updateFaceMeasures();
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
  if(!['detailBody','detailHands','detailFace'].some(id=>el(id).checked)){fail('Selecione pelo menos um módulo antes de iniciar o espelho.');return;}
  el('startMirror').disabled=true;el('stopMirror').disabled=false;el('facing').disabled=true;el('detailHands').disabled=true;el('detailFace').disabled=true;el('detailBody').disabled=true;
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
        if(data.type==='error'){reject(new Error('runtime'));fail(data.stage==='face'?'Não foi possível carregar o módulo facial. Desmarque Rosto e contornos e tente novamente, ou confira a conexão.':data.stage==='hands'?'Não foi possível carregar o detalhamento das mãos. Desmarque essa opção e tente novamente, ou confira a conexão.':'Não foi possível executar o modelo local. Tente novamente ou use a demonstração por foto.');}
        if(data.type==='result'){
          clearTimeout(frameTimer);
          const bitmap=data.bitmap;
          canvas.width=lastFrame.width=bitmap.width;canvas.height=lastFrame.height=bitmap.height;
          lastCtx.drawImage(bitmap,0,0);bitmap.close();poses=data.poses;hands=data.hands??[];faces=data.faces??[];
          canvas.hidden=false;el('mirrorPlaceholder').hidden=true;draw();
          status(poses.some(p=>p.length)||hands.some(p=>p.length)||faces.some(p=>p.length)?'Espelho ligado. Mexa-se no seu ritmo!':'Espelho ligado. Enquadre o corpo com boa iluminação.');
          timer=setTimeout(()=>nextFrame(token),125);
        }
      };
      worker.postMessage({type:'init',config,body:el('detailBody').checked,hands:el('detailHands').checked,face:el('detailFace').checked});
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
el('handTriangles').addEventListener('change',draw);
el('showFaceMeasures').addEventListener('change',updateFaceMeasures);
el('detailFace').addEventListener('change',()=>{el('showFaceMeasures').disabled=!el('detailFace').checked;updateFaceMeasures();});
el('detailHands').addEventListener('change',()=>{el('handTriangles').disabled=!el('detailHands').checked;});
el('flip').addEventListener('change',()=>canvas.classList.toggle('flipped',el('flip').checked));
canvas.classList.add('flipped');
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMirror('Câmera desligada ao sair da aba.');});
window.addEventListener('pagehide',()=>stopMirror());
