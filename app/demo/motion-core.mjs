export const MOTION_POINTS = [[15,'Punho esquerdo'],[16,'Punho direito'],[27,'Tornozelo esquerdo'],[28,'Tornozelo direito']];
export const MAX_VIDEO_BYTES=100*1024*1024;
export function checkVideo(file,metadata){
  if(!file||file.size>MAX_VIDEO_BYTES||file.size<=0)throw new Error('Escolha um vídeo de até 100 MiB.');
  if(!['video/mp4','video/webm','video/quicktime'].includes(file.type))throw new Error('Escolha um vídeo MP4, WebM ou MOV compatível com seu navegador.');
  if(metadata&&(!Number.isFinite(metadata.duration)||metadata.duration<=0||metadata.duration>60||!Number.isFinite(metadata.width)||!Number.isFinite(metadata.height)||metadata.width<=0||metadata.height<=0||metadata.width*metadata.height>4_000_000))throw new Error('O vídeo precisa ter até 60 segundos e 4 milhões de pixels por frame.');
}
export class MotionWindow{
  constructor(){this.clear();}
  clear(){this.tracks=new Map();}
  update(poses,time,width,height){
    if(poses.length!==1||!Number.isFinite(time)||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0){this.clear();return;}
    const points=new Map(poses[0].map(p=>[p.id,p]));
    for(const [id]of MOTION_POINTS){
      const p=points.get(id);if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1){this.tracks.delete(id);continue;}
      let samples=this.tracks.get(id)??[];const last=samples.at(-1);
      if(last&&(time<=last.time||time-last.time>.75))samples=[];
      samples=samples.filter(s=>time-s.time<=2);samples.push({x:p.x,y:p.y,time});this.tracks.set(id,samples.slice(-32));
    }
    this.width=width;this.height=height;
  }
  summary(id){
    const samples=this.tracks.get(id)??[];if(samples.length<2)return null;
    const diagonal=Math.hypot(this.width,this.height);
    if(!diagonal)return null;
    const distance=(a,b)=>Math.hypot((b.x-a.x)*this.width,(b.y-a.y)*this.height)/diagonal;
    let path=0;for(let i=1;i<samples.length;i++)path+=distance(samples[i-1],samples[i]);
    const a=samples.at(-2),b=samples.at(-1);
    return {path,speed:distance(a,b)/(b.time-a.time)};
  }
}
