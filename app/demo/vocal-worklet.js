class LocalPCMRecorder extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(1600);this.used=0;this.count=0;this.done=false;this.port.onmessage=({data})=>{if(data.type==='stop')this.finish();};}
 flush(){if(this.used){const chunk=this.buffer.slice(0,this.used);this.port.postMessage({type:'chunk',chunk},[chunk.buffer]);this.used=0;}}
 finish(){if(this.done)return;this.flush();this.done=true;this.port.postMessage({type:'done'});}
 process(inputs,outputs){
  for(const output of outputs)for(const channel of output)channel.fill(0);
  if(this.done)return false;
  const input=inputs[0]?.[0];if(!input)return true;
  for(const value of input){if(this.count>=sampleRate*30){this.finish();return false;}this.buffer[this.used++]=value;this.count++;if(this.used===this.buffer.length)this.flush();}
  return true;
 }
}
registerProcessor('local-pcm-recorder',LocalPCMRecorder);
