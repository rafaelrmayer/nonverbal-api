// Contour connections from MediaPipe Tasks Vision 0.10.32 (Apache-2.0).
// Original SDK license/notice: /browser-runtime/0.10.32/NOTICE.txt
export const FACE_GROUPS = {
  LIPS:[[61,146],[146,91],[91,181],[181,84],[84,17],[17,314],[314,405],[405,321],[321,375],[375,291],[61,185],[185,40],[40,39],[39,37],[37,0],[0,267],[267,269],[269,270],[270,409],[409,291],[78,95],[95,88],[88,178],[178,87],[87,14],[14,317],[317,402],[402,318],[318,324],[324,308],[78,191],[191,80],[80,81],[81,82],[82,13],[13,312],[312,311],[311,310],[310,415],[415,308]],
  LEFT_EYE:[[263,249],[249,390],[390,373],[373,374],[374,380],[380,381],[381,382],[382,362],[263,466],[466,388],[388,387],[387,386],[386,385],[385,384],[384,398],[398,362]],
  RIGHT_EYE:[[33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],[155,133],[33,246],[246,161],[161,160],[160,159],[159,158],[158,157],[157,173],[173,133]],
  LEFT_EYEBROW:[[276,283],[283,282],[282,295],[295,285],[300,293],[293,334],[334,296],[296,336]],
  RIGHT_EYEBROW:[[46,53],[53,52],[52,65],[65,55],[70,63],[63,105],[105,66],[66,107]],
  FACE_OVAL:[[10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],[356,454],[454,323],[323,361],[361,288],[288,397],[397,365],[365,379],[379,378],[378,400],[400,377],[377,152],[152,148],[148,176],[176,149],[149,150],[150,136],[136,172],[172,58],[58,132],[132,93],[93,234],[234,127],[127,162],[162,21],[21,54],[54,103],[103,67],[67,109],[109,10]]
};
export const FACE_EDGES = Object.values(FACE_GROUPS).flat();
const FACE_IDS = new Set(FACE_EDGES.flat());
export function facePoints(faces){
  return faces.slice(0,2).map(face=>face.slice(0,478).flatMap((point,id)=>
    FACE_IDS.has(id)&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&
    point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1?[{id,x:point.x,y:point.y}]:[]));
}
// Dimensionless pixel-distance ratios, not probabilities or diagnostic thresholds.
export function faceMeasures(points,width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
  const byId=new Map(points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1).map(p=>[p.id,{x:p.x*width,y:p.y*height}]));
  const distance=(a,b)=>byId.has(a)&&byId.has(b)?Math.hypot(byId.get(a).x-byId.get(b).x,byId.get(a).y-byId.get(b).y):null;
  const ratio=(corners,pairs,minWidth)=>{
    const span=distance(...corners),gaps=pairs.map(pair=>distance(...pair));
    if(span===null||span<minWidth||gaps.some(gap=>gap===null))return null;
    return gaps.reduce((a,b)=>a+b,0)/gaps.length/span;
  };
  return {mouth:ratio([61,291],[[13,14]],8),
    leftEye:ratio([362,263],[[386,374],[385,380]],4),
    rightEye:ratio([33,133],[[159,145],[158,153]],4)};
}
