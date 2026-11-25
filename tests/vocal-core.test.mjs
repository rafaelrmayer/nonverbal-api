import {test} from 'node:test';import assert from 'node:assert/strict';
import {encodeWav,inspectWav,validateVocal} from '../app/demo/vocal-core.mjs';
test('local recording becomes bounded PCM16 WAV with accurate duration and clipped encoding',()=>{
 const bytes=encodeWav([new Float32Array(16000).fill(.5)],16000);
 assert.equal(bytes.byteLength,32044);assert.equal(inspectWav(bytes).duration,1);
 const extreme=encodeWav([Float32Array.from([-2,2])],16000);const v=new DataView(extreme);assert.equal(v.getInt16(44,true),-32768);assert.equal(v.getInt16(46,true),32767);
});
test('malformed, empty, unsupported or overlong audio is refused locally',()=>{
 assert.throws(()=>inspectWav(new ArrayBuffer(45)));assert.throws(()=>encodeWav([],16000));
 assert.throws(()=>encodeWav([new Float32Array(16000*31)],16000));
 const bytes=encodeWav([new Float32Array(160)],16000);new DataView(bytes).setUint16(34,24,true);assert.throws(()=>inspectWav(bytes));
});
test('invalid acoustic response cannot render invented or non-finite pitch',()=>{
 const valid={version:'0.1.0',experimental:true,channel:'vocal',algorithm:'pcm-autocorrelation-v1',duration_seconds:1,rms_dbfs:-20,peak_dbfs:-10,pitch_median_hz:null,pitch_reason:'insufficient_periodicity',periodic_frame_count:0,clipped_sample_fraction:0,envelope:[{time_seconds:0,rms_dbfs:-20}],low_energy_intervals:[]};
 assert.equal(validateVocal(valid),valid);
 for(const patch of [{pitch_median_hz:NaN},{pitch_median_hz:220},{rms_dbfs:1},{low_energy_intervals:[{start_seconds:0,end_seconds:2}]}])assert.throws(()=>validateVocal({...valid,...patch}));
});

import {runInNewContext} from 'node:vm';import {readFileSync} from 'node:fs';
test('recording worklet enforces sample cap, flushes and emits silent output',()=>{
 let Recorder;const messages=[];
 class Processor{constructor(){this.port={postMessage:message=>messages.push(message)};}}
 runInNewContext(readFileSync(new URL('../app/demo/vocal-worklet.js',import.meta.url),'utf8'),{AudioWorkletProcessor:Processor,Float32Array,sampleRate:16000,registerProcessor:(name,klass)=>{Recorder=klass;}});
 const recorder=new Recorder(),input=new Float32Array(128).fill(.2),output=new Float32Array(128).fill(1);
 for(let i=0;i<4000;i++)if(recorder.process([[input]],[[output]])===false)break;
 assert.equal(messages.filter(m=>m.type==='done').length,1);
 assert.equal(messages.filter(m=>m.type==='chunk').reduce((n,m)=>n+m.chunk.length,0),16000*30);
 assert.ok(output.every(x=>x===0));
});
