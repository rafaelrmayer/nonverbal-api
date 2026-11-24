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

// Hand Landmarker IDs: wrist 0, thumb 1–4, index 5–8, middle 9–12,
// ring 13–16, little 17–20. The palm outline is explicitly closed.
export const HAND_EDGES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[17,0]];
export function handPoints(hands) {
  return hands.slice(0,2).map(hand=>hand.slice(0,21).flatMap((p,id)=>
    Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1
      ?[{id,x:p.x,y:p.y}]:[]));
}
// A visual geometry rule, not a semantic gesture classifier. Distances are in
// image pixels so rotation, mirroring and non-square frames do not change ratios.
export function fingerTriangle(points,width,height) {
  const byId=new Map(points.map(p=>[p.id,{x:p.x*width,y:p.y*height}]));
  const ids=[0,5,6,8,9,10,12,14,16,17,18,20];
  if(!ids.every(id=>byId.has(id)))return null;
  const distance=(a,b)=>Math.hypot(byId.get(a).x-byId.get(b).x,byId.get(a).y-byId.get(b).y);
  const palm=distance(5,17);
  if(palm<8)return null;
  const extended=(tip,pip)=>distance(0,tip)>distance(0,pip)*1.15;
  const folded=(tip,pip)=>distance(0,tip)<distance(0,pip)*1.05;
  if(!extended(8,6)||!extended(12,10)||!folded(16,14)||!folded(20,18)||distance(8,12)<palm*.35)return null;
  const [a,b,c]=[0,8,12].map(id=>byId.get(id));
  const twiceArea=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
  return twiceArea>palm*palm*.25?[0,8,12]:null;
}
