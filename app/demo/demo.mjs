import {fitSize, inspectImageBytes, MAX_FILE_BYTES, MAX_SEND_BYTES, CONNECTIONS,
  validateResult, drawablePoints, describeArm, resultSummary, httpError} from './demo-core.mjs';
import {FACE_EDGES,validateFaceResult} from './face-core.mjs';

const byId = id => document.getElementById(id);
const video = byId('cameraVideo');
const canvas = byId('resultCanvas');
let serviceEpoch=0;
const state = {channel:'body',mode: 'camera', stream: null, cameraPending: false, cameraEpoch: 0,
  frame: null, blob: null, result: null, busy: false, version: 0, abort: null, service: 'checking'};
const text = (id, value) => { byId(id).textContent = value; };
const showError = message => { text('errorBox', message); byId('errorBox').hidden = !message; };

function refresh() {
  const live = !!state.stream;
  const canCapture = live && !state.frame && !video.paused && video.readyState >= 2 && video.videoWidth > 0;
  byId('photoChannel').disabled=state.busy;
  byId('startCamera').disabled = live || state.cameraPending;
  byId('stopCamera').disabled = !live && !state.cameraPending;
  byId('cameraFacing').disabled = live || state.cameraPending;
  byId('capture').disabled = !canCapture || state.busy || state.service !== 'ready';
  byId('analyzeFile').disabled = !state.blob || state.busy || state.service !== 'ready';
  byId('backToPreview').hidden = !(live && state.frame && state.mode === 'camera');
  byId('analysisPanel').setAttribute('aria-busy', String(state.busy));
  byId('busyLayer').hidden = !state.busy;
  canvas.hidden = !state.frame;
  video.hidden = !!state.frame || !live || state.mode !== 'camera';
  byId('placeholder').hidden = !!state.frame || live;
}

function resetResult() {
  state.result = null;
  byId('bodyPhotoResults').hidden=state.channel==='face';
  byId('facePhotoResults').hidden=state.channel!=='face';
  for(const id of ['photoMouth','photoLeftEye','photoRightEye'])text(id,'—');
  for (const side of ['left','right']) {
    text(side + 'Relation', 'Sem análise');
    text(side + 'Reason', 'O resultado aparecerá após o envio.');
  }
  text('responseJson', 'Nenhuma resposta recebida.');
  text('resultSummary', 'Aguardando uma imagem');
}

function clearFrame(clearFile = true) {
  state.version++;
  state.abort?.abort();
  state.abort = null;
  state.busy = false;
  if (state.frame) { state.frame.width = 1; state.frame.height = 1; }
  state.frame = null;
  state.blob = null;
  canvas.width = canvas.height = 1;
  resetResult();
  if (clearFile) { byId('imageFile').value = ''; text('fileName', 'Nenhum arquivo selecionado.'); }
  text('stageTitle', state.stream ? 'Prévia local da câmera' : 'Sua prévia aparece aqui');
  text('stageCaption', 'Sem captura ou envio automático. Câmera e resultado usam a mesma orientação, sem espelhamento.');
  refresh();
}

function stopCamera(message = 'Câmera desligada.') {
  state.cameraEpoch++;
  state.cameraPending = false;
  const stream = state.stream;
  state.stream = null;
  if (stream) stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
  video.pause();
  video.srcObject = null;
  text('cameraState', message);
  refresh();
}

async function startCamera() {
  showError('');
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showError('A câmera precisa de HTTPS ou localhost e de um navegador compatível. Você também pode usar um arquivo.');
    return;
  }
  clearFrame();
  const epoch = ++state.cameraEpoch;
  state.cameraPending = true;
  text('cameraState', 'Aguardando permissão para a câmera…');
  refresh();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {
      facingMode: {ideal: byId('cameraFacing').value}, width: {ideal: 1280}, height: {ideal: 720}
    }});
    if (epoch !== state.cameraEpoch || state.mode !== 'camera' || document.hidden) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    state.stream = stream;
    for (const track of stream.getTracks()) {
      track.onended = () => { if (state.stream === stream) stopCamera('A câmera foi desligada pelo dispositivo.'); };
    }
    video.srcObject = stream;
    refresh();
    await video.play();
    if (epoch !== state.cameraEpoch) return;
    text('cameraState', 'Câmera ativa, sem áudio. A prévia não é enviada.');
    text('stageTitle', 'Prévia local da câmera');
  } catch (error) {
    if (epoch !== state.cameraEpoch) return;
    stopCamera();
    const messages = {
      NotAllowedError: 'A permissão da câmera foi recusada. Libere o acesso no navegador ou use um arquivo.',
      NotFoundError: 'Nenhuma câmera foi encontrada. Você pode usar um arquivo.',
      NotReadableError: 'Não foi possível abrir a câmera. Ela pode estar em uso por outro aplicativo.',
      OverconstrainedError: 'Essa câmera não atende às opções solicitadas. Tente a outra câmera ou use um arquivo.'
    };
    showError(messages[error.name] ?? 'Não foi possível iniciar a câmera. Tente novamente ou use um arquivo.');
    if (stream) stream.getTracks().forEach(track => track.stop());
  } finally {
    if (epoch === state.cameraEpoch) state.cameraPending = false;
    refresh();
  }
}

function makeFrame(source, width, height) {
  const size = fitSize(width, height);
  const frame = document.createElement('canvas');
  frame.width = size.width;
  frame.height = size.height;
  const context = frame.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, frame.width, frame.height);
  context.drawImage(source, 0, 0, frame.width, frame.height);
  return frame;
}

function encode(frame) {
  return new Promise((resolve, reject) => {
    frame.toBlob(blob => {
      if (!blob || blob.size > MAX_SEND_BYTES) reject(new Error('Não foi possível preparar uma imagem dentro do limite. Escolha outra imagem.'));
      else resolve(blob);
    }, 'image/jpeg', .85);
  });
}

function renderFrame() {
  if (!state.frame) return;
  canvas.width = state.frame.width;
  canvas.height = state.frame.height;
  const context = canvas.getContext('2d');
  context.drawImage(state.frame, 0, 0);
  if (state.result && byId('showPoints').checked) {
    const points = new Map((state.channel==='face'?state.result.landmarks:drawablePoints(state.result)).map(point => [point.id, point]));
    const position = point => [point.x * canvas.width, point.y * canvas.height];
    context.strokeStyle = '#80c4ff';
    context.lineWidth = Math.max(2, canvas.width / 330);
    context.lineCap = 'round';
    context.shadowColor = '#061633';
    context.shadowBlur = 3;
    for (const [a, b] of (state.channel==='face'?FACE_EDGES:CONNECTIONS)) {
      if (!points.has(a) || !points.has(b)) continue;
      context.beginPath();
      context.moveTo(...position(points.get(a)));
      context.lineTo(...position(points.get(b)));
      context.stroke();
    }
    for (const point of points.values()) {
      context.beginPath();
      context.arc(...position(point), Math.max(4, canvas.width / 180), 0, Math.PI * 2);
      context.fillStyle = '#fff';
      context.fill();
      context.strokeStyle = '#2458ce';
      context.stroke();
    }
    context.shadowBlur = 0;
  }
  refresh();
}

async function prepareFile(file) {
  clearFrame(false);
  showError('');
  if (!file) { text('fileName', 'Nenhum arquivo selecionado.'); return; }
  const version = state.version;
  state.busy = true;
  text('busyText', 'Preparando a prévia local…');
  text('fileName', file.name);
  refresh();
  let bitmap;
  try {
    if (file.size > MAX_FILE_BYTES) throw new Error('Escolha um arquivo de até 8 MiB.');
    inspectImageBytes(await file.arrayBuffer());
    if (typeof createImageBitmap !== 'function') throw new Error('Use um navegador atualizado para abrir a imagem.');
    bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Essa imagem tem resolução muito alta. Escolha uma imagem menor.');
    if (version !== state.version) return;
    const frame = makeFrame(bitmap, bitmap.width, bitmap.height);
    const blob = await encode(frame);
    if (version !== state.version) { frame.width = frame.height = 1; return; }
    state.frame = frame;
    state.blob = blob;
    text('stageTitle', 'Prévia local da imagem');
    text('stageCaption', 'A imagem está apenas no navegador. Clique em Analisar imagem para enviar uma cópia ajustada à API.');
    renderFrame();
  } catch (error) {
    if (version === state.version) showError(error.name === 'Error' ? error.message : 'Não foi possível ler esta imagem. Escolha outro JPEG ou PNG.');
  } finally {
    bitmap?.close();
    if (version === state.version) state.busy = false;
    refresh();
  }
}

async function analyze(version) {
  if (!state.blob || version !== state.version) return;
  const controller = new AbortController();
  state.abort = controller;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
  try {
    const response = await fetch('/v1/'+state.channel+'/analyze', {method: 'POST', body: state.blob,
      headers: {'Content-Type': 'image/jpeg'}, signal: controller.signal, cache: 'no-store'});
    if (!response.ok) throw new Error(httpError(response.status));
    const data = await response.json();
    if (version !== state.version) return;
    state.result = state.channel==='face'?validateFaceResult(data,state.frame):validateResult(data, state.frame);
    if(state.channel==='face'){
      for(const [id,key]of [['photoMouth','mouth'],['photoLeftEye','leftEye'],['photoRightEye','rightEye']]){const v=data.measures[key].value;text(id,v===null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:2,minimumFractionDigits:2})+' ×');}
      text('photoFaceNote',data.status==='multiple_faces'?'Mais de um rosto detectado. Nenhuma pessoa foi escolhida.':data.status==='no_face'?'Nenhum rosto detectado nesta imagem.':'Altura dividida pela largura; — indica pontos insuficientes ou região pequena. Não interpreta emoções ou intenções.');
    }
    for (const arm of (state.result.arms??[])) {
      const description = describeArm(arm);
      text(arm.side + 'Relation', description.title);
      text(arm.side + 'Reason', description.reason);
    }
    text('resultSummary',state.channel==='face'?({observed:'Medidas faciais observadas',partial:'Medidas faciais parciais',undetermined:'Medidas indeterminadas',no_face:'Nenhum rosto detectado',multiple_faces:'Mais de um rosto detectado'}[data.status]):resultSummary(state.result));
    text('responseJson', JSON.stringify(state.result, null, 2));
    text('stageTitle', 'Imagem analisada');
    text('stageCaption', state.stream ?
      'Esta é a imagem enviada, não uma análise ao vivo. A câmera continua ativa; desligue ao terminar ou volte à prévia.' :
      'Pontos sobre a imagem enviada. Somente os pontos dentro do quadro e com os escores mínimos do protótipo são exibidos.');
    renderFrame();
  } catch (error) {
    if (version !== state.version) return;
    if (error.name === 'AbortError' && !timedOut) return;
    text('resultSummary', 'Análise não concluída');
    showError(timedOut ? 'O serviço não respondeu a tempo. Nenhum reenvio automático foi feito; tente novamente quando estiver pronto.' :
      error instanceof TypeError ? 'Não foi possível acessar a API. Verifique sua conexão e o serviço.' :
      error.name === 'SyntaxError' ? 'O serviço respondeu em um formato inválido. Nenhum resultado foi exibido.' : error.message);
  } finally {
    clearTimeout(timer);
    if (version === state.version) { state.busy = false; state.abort = null; }
    refresh();
  }
}

async function capture() {
  if (byId('capture').disabled) return;
  clearFrame();
  showError('');
  const version = state.version;
  state.busy = true;
  text('busyText', 'Analisando uma imagem…');
  refresh();
  try {
    const frame = makeFrame(video, video.videoWidth, video.videoHeight);
    const blob = await encode(frame);
    if (version !== state.version) { frame.width = frame.height = 1; return; }
    state.frame = frame;
    state.blob = blob;
    text('stageTitle', 'Imagem capturada');
    resetResult();
    renderFrame();
    await analyze(version);
  } catch (error) {
    if (version === state.version) { showError(error.message); state.busy = false; }
  } finally { refresh(); }
}

function selectMode(mode) {
  if (mode === state.mode) return;
  stopCamera();
  clearFrame();
  state.mode = mode;
  showError('');
  for (const source of ['camera','file']) {
    const selected = source === mode;
    byId(source + 'Tab').setAttribute('aria-selected', String(selected));
    byId(source + 'Tab').tabIndex = selected ? 0 : -1;
    byId(source + 'Panel').hidden = !selected;
  }
  refresh();
}

async function checkService() {
  const epoch=++serviceEpoch;
  byId('checkService').disabled = true;
  state.service = 'checking';
  text('serviceState', 'Verificando o modelo…');
  refresh();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/health', {signal: controller.signal, cache: 'no-store'});
    const data = await response.json();
    if(epoch!==serviceEpoch)return;
    if (!response.ok || data.service !== 'nonverbal-api' || (state.channel==='face'?data.face_model_available!==true:data.body_model_ready!==true)) throw new Error();
    state.service = 'ready';
    text('serviceState', state.channel==='face'?'Modelo facial disponível; primeira análise pode demorar.':'Modelo corporal disponível');
  } catch {
    if(epoch!==serviceEpoch)return;
    state.service = 'unavailable';
    text('serviceState', 'Modelo indisponível no momento');
  } finally {
    clearTimeout(timer);
    if(epoch!==serviceEpoch)return;
    byId('checkService').disabled = false;
    refresh();
  }
}

byId('photoChannel').addEventListener('change',()=>{state.channel=byId('photoChannel').value;clearFrame();showError('');checkService();});
byId('startCamera').addEventListener('click', startCamera);
byId('stopCamera').addEventListener('click', () => stopCamera());
byId('capture').addEventListener('click', capture);
byId('backToPreview').addEventListener('click', async () => {
  clearFrame();
  showError('');
  try { await video.play(); }
  catch { stopCamera(); showError('Não foi possível retomar a prévia. Ative a câmera novamente.'); }
  refresh();
});
byId('imageFile').addEventListener('change', event => prepareFile(event.target.files[0]));
byId('analyzeFile').addEventListener('click', async () => {
  if (byId('analyzeFile').disabled) return;
  state.busy = true;
  showError('');
  resetResult();
  text('busyText', 'Analisando uma imagem…');
  renderFrame();
  await analyze(state.version);
});
byId('clear').addEventListener('click', () => { stopCamera(); clearFrame(); showError(''); });
byId('showPoints').addEventListener('change', renderFrame);
byId('checkService').addEventListener('click', checkService);
video.addEventListener('loadeddata', refresh);
video.addEventListener('playing', refresh);
video.addEventListener('pause', refresh);
for (const mode of ['camera','file']) byId(mode + 'Tab').addEventListener('click', () => selectMode(mode));
document.querySelector('.source-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const mode = event.key === 'Home' ? 'camera' : event.key === 'End' ? 'file' : state.mode === 'camera' ? 'file' : 'camera';
  selectMode(mode);
  byId(mode + 'Tab').focus();
});
export const releasePhoto = () => { stopCamera('Câmera desligada ao sair da página.'); clearFrame(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) releasePhoto(); });
window.addEventListener('pagehide', releasePhoto);
refresh();
checkService();
