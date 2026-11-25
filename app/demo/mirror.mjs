import {EDGES,HAND_EDGES,fingerTriangle,frameSize} from './mirror-core.mjs';
import {FACE_EDGES,faceMeasures} from './face-core.mjs';
import {MotionWindow,MOTION_POINTS,checkVideo} from './motion-core.mjs';
const el=id=>document.getElementById(id);
const video=el('mirrorVideo'),canvas=el('mirrorCanvas'),ctx=canvas.getContext('2d');
const motion=new MotionWindow();
let videoURL=null,rejectVideoLoad=null,processingFrame=false,videoFinished=false;
const lastFrame=document.createElement('canvas'),lastCtx=lastFrame.getContext('2d');
let generation=0,worker,stream,timer,prepareTimer,frameTimer,rejectInit,abort,poses=[],hands=[],faces=[],lastTime=-1;
function status(text){if(el('mirrorStatus').textContent!==text)el('mirrorStatus').textContent=text;}
export function stopMirror(message='Câmera desligada.',keepFile=false) {
  generation++;
  clearTimeout(timer);clearTimeout(prepareTimer);clearTimeout(frameTimer);
  rejectVideoLoad?.(new Error('cancelled'));rejectVideoLoad=null;
  abort?.abort();abort=null;
  rejectInit?.(new Error('cancelled'));rejectInit=null;
  worker?.terminate();worker=null;
  stream?.getTracks().forEach(track=>track.stop());stream=null;
  video.pause();video.srcObject=null;video.removeAttribute('src');video.load();
  if(videoURL){URL.revokeObjectURL(videoURL);videoURL=null;}
  if(!keepFile)el('mirrorVideoFile').value='';
  motion.clear();processingFrame=false;videoFinished=false;
  poses=[];hands=[];faces=[];lastTime=-1;canvas.width=1;canvas.height=1;lastFrame.width=1;lastFrame.height=1;
  canvas.hidden=true;el('mirrorPlaceholder').hidden=false;
  el('startMirror').disabled=false;el('stopMirror').disabled=true;el('facing').disabled=false;el('detailHands').disabled=false;el('detailFace').disabled=false;el('detailBody').disabled=false;
  el('pauseVideo').textContent='Pausar vídeo';
  el('mirrorSource').disabled=false;el('mirrorVideoFile').disabled=false;el('pauseVideo').hidden=true;el('pauseVideo').disabled=false;
  sourceUI();updateMotion();updateFaceMeasures();
  status(message);
}
function sourceUI(){
  const file=el('mirrorSource').value==='file';
  el('videoFileGroup').hidden=!file;el('facing').disabled=file;
  el('startMirror').textContent=file?'Iniciar vídeo':'Iniciar espelho';
  el('stopMirror').textContent=file?'Parar vídeo':'Parar câmera';
}
function updateMotion(){
  const active=el('showTrails').checked&&el('detailBody').checked;
  el('motionMeasures').hidden=!active;
  const message=poses.length>1?'Mais de uma pose detectada. Rastros interrompidos para não misturar pessoas.':poses.length===1?'Amostras recentes da pose detectada; sem identificação persistente.':'Aguardando uma pose para acompanhar punhos e tornozelos.';
  el('motionStatus').textContent=message;
  el('motionValues').replaceChildren(...MOTION_POINTS.map(([id,label])=>{
    const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd'),value=motion.summary(id);
    dt.textContent=label;dd.textContent=value?value.path.toFixed(3)+' · '+value.speed.toFixed(3)+'/s':'—';row.append(dt,dd);return row;
  }));
}
async function openVideo(file,token){
  checkVideo(file);videoURL=URL.createObjectURL(file);
  await new Promise((resolve,reject)=>{
    const finish=error=>{clearTimeout(timeout);video.onloadedmetadata=null;video.onerror=null;rejectVideoLoad=null;error?reject(error):resolve();};
    const timeout=setTimeout(()=>finish(new Error('Não foi possível abrir o vídeo a tempo.')),15000);
    rejectVideoLoad=finish;video.onloadedmetadata=()=>finish();video.onerror=()=>finish(new Error('Vídeo inválido ou codec não suportado pelo navegador.'));
    video.src=videoURL;video.load();
  });
  if(token!==generation)return;
  checkVideo(file,{duration:video.duration,width:video.videoWidth,height:video.videoHeight});
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
  if(el('showTrails').checked){
    for(const [id]of MOTION_POINTS){const samples=motion.tracks.get(id)??[];if(samples.length<2)continue;ctx.beginPath();samples.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*canvas.width,p.y*canvas.height));ctx.strokeStyle='#fb923c';ctx.lineWidth=3;ctx.stroke();}
  }
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
  updateMotion();updateFaceMeasures();
}
async function nextFrame(token){
  if(token!==generation||!worker)return;
  if(video.ended)return;
  if(video.readyState<2||video.paused||video.currentTime===lastTime){timer=setTimeout(()=>nextFrame(token),125);return;}
  lastTime=video.currentTime;
  const sampleTime=el('mirrorSource').value==='file'?video.currentTime:performance.now()/1000;
  let bitmap;
  try {
    const size=frameSize(video.videoWidth,video.videoHeight);
    processingFrame=true;
    bitmap=await createImageBitmap(video,{resizeWidth:size.width,resizeHeight:size.height});
    if(token!==generation){bitmap.close();return;}
    worker.postMessage({type:'frame',bitmap,timestamp:performance.now(),time:sampleTime},[bitmap]);
    frameTimer=setTimeout(()=>{if(token===generation)fail('O processamento demorou demais. Tente iniciar novamente.');},20000);
  } catch {bitmap?.close();if(token===generation)fail('Este navegador não conseguiu processar a câmera localmente. Experimente a demonstração por foto.');}
}
el('startMirror').addEventListener('click',async()=>{
  const source=el('mirrorSource').value,file=el('mirrorVideoFile').files[0];
  stopMirror('Preparando…',true);const token=generation;el('mirrorError').hidden=true;
  if(!['detailBody','detailHands','detailFace'].some(id=>el(id).checked)){fail('Selecione pelo menos um módulo antes de iniciar o espelho.');return;}
  el('startMirror').disabled=true;el('stopMirror').disabled=false;el('facing').disabled=true;el('detailHands').disabled=true;el('detailFace').disabled=true;el('detailBody').disabled=true;
  el('mirrorSource').disabled=true;el('mirrorVideoFile').disabled=true;
  status('Preparando o modelo local… Na primeira vez, o download pode demorar.');
  try {
    if((source==='camera'&&!navigator.mediaDevices?.getUserMedia)||!window.Worker||!window.createImageBitmap)throw new Error('unsupported');
    if(source==='file'){await openVideo(file,token);if(token!==generation)return;}
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
          processingFrame=false;clearTimeout(frameTimer);
          const bitmap=data.bitmap;
          canvas.width=lastFrame.width=bitmap.width;canvas.height=lastFrame.height=bitmap.height;
          lastCtx.drawImage(bitmap,0,0);bitmap.close();poses=data.poses;hands=data.hands??[];faces=data.faces??[];
          if(el('showTrails').checked)motion.update(poses,data.time,canvas.width,canvas.height);else motion.clear();
          canvas.hidden=false;el('mirrorPlaceholder').hidden=true;draw();
          status(poses.some(p=>p.length)||hands.some(p=>p.length)||faces.some(p=>p.length)?'Espelho ligado. Mexa-se no seu ritmo!':'Espelho ligado. Enquadre o corpo com boa iluminação.');
          if(videoFinished){finishVideo();return;}
          timer=setTimeout(()=>nextFrame(token),125);
        }
      };
      worker.postMessage({type:'init',config,body:el('detailBody').checked,hands:el('detailHands').checked,face:el('detailFace').checked});
    });
    clearTimeout(prepareTimer);if(token!==generation)return;
    if(source==='file'){el('pauseVideo').hidden=false;await video.play();if(token===generation)nextFrame(token);return;}
    status('Aguardando sua permissão para a câmera…');
    const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:el('facing').value},width:{ideal:640},height:{ideal:480}}});
    if(token!==generation){acquired.getTracks().forEach(track=>track.stop());return;}
    stream=acquired;
    for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{if(token===generation)stopMirror('A câmera foi desconectada.');},{once:true});
    video.srcObject=stream;await video.play();if(token!==generation)return;
    nextFrame(token);
  } catch(error){if(token===generation)fail(source==='file'?(error.message||'Não foi possível processar este vídeo localmente.'):error.name==='NotAllowedError'?'A permissão da câmera foi recusada. Você pode tentar novamente ou usar a demonstração por foto.':'Não foi possível iniciar o espelho local. Confira a câmera e a conexão ou experimente outro navegador.');}
});
el('mirrorSource').addEventListener('change',()=>{stopMirror();sourceUI();el('flip').checked=el('mirrorSource').value==='camera';canvas.classList.toggle('flipped',el('flip').checked);});
el('mirrorVideoFile').addEventListener('change',()=>{stopMirror('Vídeo selecionado. Clique em Iniciar vídeo para processar localmente.',true);});
el('showTrails').addEventListener('change',()=>{motion.clear();draw();updateMotion();});
el('detailBody').addEventListener('change',updateMotion);
el('pauseVideo').addEventListener('click',async()=>{if(video.paused){try{await video.play();el('pauseVideo').textContent='Pausar vídeo';}catch{fail('Não foi possível continuar o vídeo.');}}else{video.pause();el('pauseVideo').textContent='Continuar vídeo';}});
function finishVideo(){
  if(!worker)return;
  generation++;clearTimeout(timer);clearTimeout(frameTimer);worker.terminate();worker=null;
  for(const id of ['startMirror','mirrorSource','mirrorVideoFile','detailBody','detailHands','detailFace'])el(id).disabled=false;
  el('pauseVideo').disabled=true;status('Vídeo concluído. Exibindo o último frame processado; clique em Parar vídeo para limpar.');
}
video.addEventListener('error',()=>{if(videoURL&&worker)fail('Falha na decodificação do vídeo. Tente um arquivo compatível.');});
video.addEventListener('ended',()=>{if(el('mirrorSource').value==='file'&&worker){videoFinished=true;if(!processingFrame)finishVideo();}});
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

sourceUI();updateMotion();
