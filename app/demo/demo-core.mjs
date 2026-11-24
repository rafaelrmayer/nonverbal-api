export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_SEND_BYTES = 2 * 1024 * 1024;
export const MAX_SIDE = 1280;
export const CONNECTIONS = [[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],
  [12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],
  [23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]];

export function fitSize(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('Não foi possível ler as dimensões da imagem.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

export function inspectImageBytes(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Escolha um arquivo de até 8 MiB.');
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  const png = [137,80,78,71,13,10,26,10];
  if (png.every((value, i) => bytes[i] === value)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 8; offset + 8 <= bytes.length;) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (type === 'acTL') throw new Error('Escolha uma imagem estática. PNG animado não é aceito.');
      if (length > bytes.length - offset - 12) break;
      offset += length + 12;
    }
    return 'image/png';
  }
  throw new Error('Escolha uma imagem JPEG ou PNG válida.');
}

export function validateResult(data, frame) {
  const statuses = ['observed','partial','undetermined','no_pose','multiple_poses'];
  const relations = ['wrist_above_shoulder','wrist_not_above_shoulder','undetermined'];
  const reasons = ['geometry_observed','near_threshold','low_visibility','out_of_frame','missing_landmarks','no_pose','multiple_poses'];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const score = value => finite(value) && value >= 0 && value <= 1;
  if (!data || data.version !== '0.1.0' || data.experimental !== true || data.channel !== 'body' ||
      !statuses.includes(data.status) || data.frame?.width !== frame.width || data.frame?.height !== frame.height ||
      !Array.isArray(data.landmarks) || data.landmarks.length > 22 ||
      !Array.isArray(data.arms) || data.arms.length !== 2 ||
      data.arms.some(arm => !arm || typeof arm !== 'object') ||
      new Set(data.arms.map(arm => arm.side)).size !== 2 ||
      data.arms.some(arm => !['left','right'].includes(arm.side) || !relations.includes(arm.relation) || !reasons.includes(arm.reason))) {
    throw new Error('A API retornou uma resposta incompatível com esta imagem. Capture ou selecione a imagem novamente.');
  }
  const single = !['no_pose','multiple_poses'].includes(data.status);
  if (data.detected_poses_capped !== (single ? 1 : data.status === 'no_pose' ? 0 : 2) ||
      data.landmarks.length !== (single ? 22 : 0) ||
      data.landmarks.some(point => !point || typeof point !== 'object') ||
      new Set(data.landmarks.map(point => point.id)).size !== data.landmarks.length ||
      data.landmarks.some(point => !Number.isInteger(point.id) || point.id < 11 || point.id > 32 ||
        !finite(point.x) || !finite(point.y) || !finite(point.z) ||
        !score(point.visibility) || !score(point.presence) || typeof point.in_frame !== 'boolean' ||
        point.in_frame !== (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1))) {
    throw new Error('A API retornou pontos inválidos. Nenhuma interpretação foi exibida.');
  }
  return data;
}

export function drawablePoints(data) {
  return (data?.landmarks ?? []).filter(point => point.in_frame && point.visibility >= .7 && point.presence >= .7);
}

export function describeArm(arm) {
  const titles = {wrist_above_shoulder: 'Punho acima do ombro', wrist_not_above_shoulder: 'Punho abaixo do ombro', undetermined: 'Posição indeterminada'};
  const reasons = {
    geometry_observed: 'Relação observada no plano da imagem.',
    near_threshold: 'Punho e ombro estão próximos em altura. O protótipo se abstém.',
    low_visibility: 'Falta visibilidade suficiente do punho ou do ombro.',
    out_of_frame: 'O punho ou o ombro foi estimado fora do quadro.',
    missing_landmarks: 'Não há pontos suficientes para esta observação.',
    no_pose: 'O detector não encontrou uma pose nesta imagem.',
    multiple_poses: 'Mais de uma pose foi detectada. A API não escolhe uma pessoa.'
  };
  return {title: titles[arm.relation], reason: reasons[arm.reason]};
}

export function resultSummary(data) {
  return {observed: 'Duas relações observadas', partial: 'Observação parcial', undetermined: 'Resultado indeterminado',
    no_pose: 'Nenhuma pose detectada', multiple_poses: 'Mais de uma pose detectada'}[data.status];
}

export function httpError(status) {
  return ({
    408: 'O envio demorou demais. Tente novamente quando a conexão estiver estável.',
    413: 'A imagem ultrapassou o limite da API. Escolha outra imagem.',
    415: 'O serviço não aceitou o formato da imagem.',
    422: 'Não foi possível processar esta imagem. Escolha outro JPEG ou PNG estático.',
    429: 'A API está ocupada com outra análise. Aguarde e clique para tentar novamente.',
    503: 'O modelo corporal está indisponível. Verifique o serviço e tente novamente.'
  })[status] ?? 'A análise não foi concluída. Verifique o serviço e tente novamente.';
}
