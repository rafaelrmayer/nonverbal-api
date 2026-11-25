import {inspectWav,encodeWav,validateVocal,MAX_AUDIO_BYTES} from './vocal-core.mjs';
const el=id=>document.getElementById(id);
let generation=0,wav=null,previewURL=null,stream=null,context=null,recorder=null,source=null,gain=null,chunks=[],recording=false,busy=false,abort=null,recordTimer=null,flushTimer=null;
const message=text=>{el('vocalStatus').textContent=text;};
function error(text){el('vocalError').textContent=text;el('vocalError').hidden=!text;}
function refresh(){
 const mic=el('vocalSource').value==='microphone';
 el('vocalFileGroup').hidden=mic;el('vocalMicGroup').hidden=!mic;
 el('vocalSource').disabled=recording||busy;el('vocalFile').disabled=recording||busy;
 el('vocalRecord').disabled=recording||busy;el('vocalStop').disabled=!recording;
 el('vocalAnalyze').disabled=!wav||recording||busy;
 el('vocalResults').setAttribute('aria-busy',String(busy));
}
function closeInput(){
 clearTimeout(recordTimer);clearTimeout(flushTimer);recordTimer=flushTimer=null;
 stream?.getTracks().forEach(t=>t.stop());stream=null;
 if(recorder){recorder.port.onmessage=null;recorder.port.close();recorder.disconnect();recorder=null;}
 source?.disconnect();source=null;gain?.disconnect();gain=null;
 context?.close().catch(()=>{});context=null;
}
function clearPreview(){
 const audio=el('vocalPreview');audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;
 if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;wav=null;
}
function clearResult(){
 el('vocalResults').hidden=true;el('vocalJson').textContent='Nenhuma análise recebida.';
 el('vocalIntervals').replaceChildren();const c=el('vocalChart');c.getContext('2d').clearRect(0,0,c.width,c.height);
 for(const id of ['vocalDuration','vocalRMS','vocalPeak','vocalPitch','vocalClipping'])el(id).textContent='—';
}
export function releaseVocal(){
 generation++;abort?.abort();abort=null;closeInput();chunks=[];recording=false;busy=false;
 clearPreview();clearResult();el('vocalFile').value='';error('');message('Escolha um WAV ou grave uma amostra local. Nada é enviado automaticamente.');refresh();
}
function setAudio(buffer){
 inspectWav(buffer);clearPreview();clearResult();
 wav=new Blob([buffer],{type:'audio/wav'});previewURL=URL.createObjectURL(wav);
 const audio=el('vocalPreview');audio.src=previewURL;audio.hidden=false;
 message('Prévia local pronta. Ouça se quiser; somente Analisar áudio envia uma cópia à API.');refresh();
}
function finishRecording(token){
 if(token!==generation||!recording)return;
 const rate=context.sampleRate,recorded=chunks;chunks=[];recording=false;closeInput();
 try{setAudio(encodeWav(recorded,rate));}catch(e){error(e.message);message('Gravação não concluída.');refresh();}
}
el('vocalRecord').addEventListener('click',async()=>{
 releaseVocal();const token=generation;recording=true;refresh();message('Aguardando sua permissão para o microfone…');
 let acquired,ctx;
 try{
  if(!navigator.mediaDevices?.getUserMedia||!window.AudioContext||!window.AudioWorkletNode)throw new Error('Use HTTPS e um navegador com AudioWorklet para gravar; você também pode escolher um arquivo WAV.');
  acquired=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;ctx=new AudioContext({sampleRate:16000});context=ctx;
  if(ctx.sampleRate<8000||ctx.sampleRate>48000)throw new Error('Taxa de amostragem incompatível. Use um arquivo WAV PCM16.');
  await ctx.audioWorklet.addModule('/demo-assets/vocal-worklet.js');
  if(token!==generation){ctx.close().catch(()=>{});return;}
  recorder=new AudioWorkletNode(ctx,'local-pcm-recorder',{numberOfInputs:1,numberOfOutputs:1,channelCount:1,channelCountMode:'explicit'});
  recorder.port.onmessage=({data})=>{
   if(token!==generation)return;
   if(data.type==='chunk')chunks.push(data.chunk);
   if(data.type==='done')finishRecording(token);
  };
  source=ctx.createMediaStreamSource(stream);gain=ctx.createGain();gain.gain.value=0;
  source.connect(recorder);recorder.connect(gain);gain.connect(ctx.destination);
  for(const track of stream.getTracks())track.onended=()=>{if(token===generation&&recording)finishRecording(token);};
  await ctx.resume();if(token!==generation)return;
  message('Gravando localmente, sem envio. A gravação para em até 30 segundos.');
  recordTimer=setTimeout(()=>{if(token===generation&&recording){recorder.port.postMessage({type:'stop'});flushTimer=setTimeout(()=>finishRecording(token),1000);}},30000);
 }catch(e){
  acquired?.getTracks().forEach(t=>t.stop());ctx?.close().catch(()=>{});
  if(token!==generation)return;
  closeInput();chunks=[];recording=false;error(e.name==='NotAllowedError'?'Permissão do microfone recusada. Você pode usar um arquivo WAV.':e.message||'Não foi possível gravar.');message('Microfone desligado.');refresh();
 }
});
el('vocalStop').addEventListener('click',()=>{
 if(!recording)return;
 if(!recorder){releaseVocal();return;}
 el('vocalStop').disabled=true;recorder.port.postMessage({type:'stop'});const token=generation;
 flushTimer=setTimeout(()=>finishRecording(token),1000);
});
el('vocalFile').addEventListener('change',async()=>{
 const file=el('vocalFile').files[0];releaseVocal();const token=generation;if(!file)return;
 try{if(file.size>MAX_AUDIO_BYTES)throw new Error('Escolha um WAV de até 8 MiB.');const bytes=await file.arrayBuffer();if(token===generation)setAudio(bytes);}
 catch(e){if(token===generation)error(e.message);}
});
function render(data){
 const number=(value,n=2)=>value.toLocaleString('pt-BR',{minimumFractionDigits:n,maximumFractionDigits:n});
 el('vocalDuration').textContent=number(data.duration_seconds)+' s';el('vocalRMS').textContent=number(data.rms_dbfs)+' dBFS';
 el('vocalPeak').textContent=number(data.peak_dbfs)+' dBFS';el('vocalPitch').textContent=data.pitch_median_hz===null?'Indeterminada':number(data.pitch_median_hz,1)+' Hz';
 el('vocalClipping').textContent=number(data.clipped_sample_fraction*100)+' %';
 el('vocalIntervals').replaceChildren(...data.low_energy_intervals.map(interval=>{const li=document.createElement('li');li.textContent=number(interval.start_seconds)+'–'+number(interval.end_seconds)+' s';return li;}));
 el('vocalIntervalNote').textContent=data.low_energy_intervals.length?'Intervalos com energia abaixo de −40 dBFS por pelo menos 0,20 s, incluindo bordas da gravação. Não é detecção de fala.':'Nenhum intervalo de baixa energia com pelo menos 0,20 s.';
 const c=el('vocalChart'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#f5f7fb';ctx.fillRect(0,0,c.width,c.height);
 ctx.font='14px sans-serif';ctx.fillStyle='#596981';for(const db of [0,-40,-80,-120])ctx.fillText(String(db),2,15+(-db/120)*(c.height-30));
 ctx.beginPath();data.envelope.forEach((point,i)=>ctx[i?'lineTo':'moveTo'](40+point.time_seconds/data.duration_seconds*(c.width-50),15-point.rms_dbfs/120*(c.height-30)));
 ctx.strokeStyle='#2458ce';ctx.lineWidth=2;ctx.stroke();el('vocalJson').textContent=JSON.stringify(data,null,2);el('vocalResults').hidden=false;
}
el('vocalAnalyze').addEventListener('click',async()=>{
 if(!wav||recording||busy)return;error('');clearResult();busy=true;refresh();const token=generation;
 abort=new AbortController();const controller=abort;const timer=setTimeout(()=>controller.abort(),45000);message('Enviando a amostra escolhida e calculando medidas acústicas…');
 try{
  const response=await fetch('/v1/vocal/analyze',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wav,signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw new Error(({413:'Áudio acima do limite de 8 MiB.',422:'Use WAV PCM16 de até 30 s, mono/estéreo, entre 8 e 48 kHz.',429:'A API está ocupada com outra análise. Aguarde e tente novamente.'})[response.status]??'A API não conseguiu analisar o áudio.');
  const result=validateVocal(await response.json());if(token!==generation)return;
  render(result);message('Medidas calculadas. O áudio não foi transcrito nem classificado por emoção.');
 }catch(e){if(token===generation){error(e.name==='AbortError'?'Análise interrompida ou tempo de resposta excedido. Não houve reenvio automático.':e.message);message('Análise não concluída.');}}
 finally{clearTimeout(timer);if(token===generation){busy=false;abort=null;refresh();}}
});
el('vocalSource').addEventListener('change',releaseVocal);el('vocalClear').addEventListener('click',releaseVocal);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseVocal();});window.addEventListener('pagehide',releaseVocal);
refresh();
