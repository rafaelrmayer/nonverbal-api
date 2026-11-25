export const MAX_AUDIO_BYTES=8*1024*1024;
export function inspectWav(buffer){
 const view=new DataView(buffer),text=(offset,n)=>String.fromCharCode(...new Uint8Array(buffer,offset,n));
 if(buffer.byteLength>MAX_AUDIO_BYTES||buffer.byteLength<44||text(0,4)!=='RIFF'||text(8,4)!=='WAVE')throw new Error('Escolha um WAV PCM16 válido, de até 8 MiB.');
 let format=null,dataBytes=null;
 for(let i=12;i+8<=buffer.byteLength;){
  const name=text(i,4),length=view.getUint32(i+4,true);if(length>buffer.byteLength-i-8)throw new Error('WAV truncado.');
  if(name==='fmt '&&length>=16)format={code:view.getUint16(i+8,true),channels:view.getUint16(i+10,true),rate:view.getUint32(i+12,true),bits:view.getUint16(i+22,true)};
  if(name==='data')dataBytes=length;
  i+=8+length+(length%2);
 }
 if(!format||format.code!==1||format.bits!==16||![1,2].includes(format.channels)||format.rate<8000||format.rate>48000||!dataBytes||dataBytes%(format.channels*2)!==0)throw new Error('Use WAV PCM16 mono/estéreo, de 8 a 48 kHz.');
 const duration=dataBytes/(format.channels*2*format.rate);if(duration>30)throw new Error('O áudio precisa ter até 30 segundos.');
 return {...format,duration};
}
export function encodeWav(chunks,rate){
 const count=chunks.reduce((n,c)=>n+c.length,0);if(count<=0||count>rate*30||rate<8000||rate>48000)throw new Error('Gravação vazia ou incompatível com o limite de 30 segundos.');
 const buffer=new ArrayBuffer(44+count*2),v=new DataView(buffer);
 const text=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 text(0,'RIFF');v.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,count*2,true);
 let index=44;for(const chunk of chunks)for(const sample of chunk){v.setInt16(index,Math.round(Math.max(-1,Math.min(1,sample))*(sample<0?32768:32767)),true);index+=2;}
 return buffer;
}
export function validateVocal(data){
 const finite=Number.isFinite;
 if(!data||data.channel!=='vocal'||data.version!=='0.1.0'||data.experimental!==true||data.algorithm!=='pcm-autocorrelation-v1'||
 !finite(data.duration_seconds)||data.duration_seconds<=0||data.duration_seconds>30||
 ![data.rms_dbfs,data.peak_dbfs].every(x=>finite(x)&&x>=-120&&x<=0)||
 (data.pitch_median_hz!==null&&(!finite(data.pitch_median_hz)||data.pitch_median_hz<70||data.pitch_median_hz>800))||
 !finite(data.clipped_sample_fraction)||data.clipped_sample_fraction<0||data.clipped_sample_fraction>1||
 !['periodicity_estimated','insufficient_periodicity'].includes(data.pitch_reason)||!Number.isInteger(data.periodic_frame_count)||data.periodic_frame_count<0||data.periodic_frame_count>1500||
 (data.pitch_median_hz===null?(data.pitch_reason!=='insufficient_periodicity'||data.periodic_frame_count!==0):(data.pitch_reason!=='periodicity_estimated'||data.periodic_frame_count===0))||
 !Array.isArray(data.envelope)||data.envelope.length>1500||data.envelope.some(p=>!p||!finite(p.time_seconds)||p.time_seconds<0||p.time_seconds>data.duration_seconds||!finite(p.rms_dbfs)||p.rms_dbfs< -120||p.rms_dbfs>0)||
 !Array.isArray(data.low_energy_intervals)||data.low_energy_intervals.length>150||data.low_energy_intervals.some(p=>!p||!finite(p.start_seconds)||!finite(p.end_seconds)||p.start_seconds<0||p.end_seconds<=p.start_seconds||p.end_seconds>data.duration_seconds))throw new Error('A API retornou medidas acústicas inválidas.');
 return data;
}
