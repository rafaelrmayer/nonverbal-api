export const EDGES = [[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]];
export function bodyPoints(poses) {
  return poses.slice(0,2).map(pose => pose.flatMap((p,id) =>
    id >= 11 && id <= 32 && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1 && p.visibility>=0.7
      ? [{id,x:p.x,y:p.y}] : []));
}
export function frameSize(width,height) {
  const scale=Math.min(1,640/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
