import {test} from 'node:test';import assert from 'node:assert/strict';
import {MotionWindow,checkVideo,MAX_VIDEO_BYTES} from '../app/demo/motion-core.mjs';
const pose=x=>[[{id:15,x,y:.2}]];
test('bounded trajectories calculate image-diagonal distance per source second',()=>{
 const m=new MotionWindow();m.update(pose(.1),0,640,480);m.update(pose(.2),.2,640,480);
 assert.ok(Math.abs(m.summary(15).path-.08)<1e-10);assert.ok(Math.abs(m.summary(15).speed-.4)<1e-10);
 for(let i=0;i<100;i++)m.update(pose(.2),.21+i*.01,640,480);
 assert.ok(m.tracks.get(15).length<=32);
 m.update(pose(.3),5,640,480);assert.equal(m.summary(15),null);
 m.update(pose(.4),4,640,480);assert.equal(m.summary(15),null);
});
test('no bridges over lost points, multiple poses or cleared sessions',()=>{
 const m=new MotionWindow();m.update(pose(.1),0,640,480);m.update(pose(.2),.1,640,480);
 m.update([[],[]],.2,640,480);assert.equal(m.tracks.size,0);
 m.update(pose(.1),.3,640,480);m.update([[]],.4,640,480);assert.equal(m.tracks.size,0);
 m.update(pose(.1),.5,640,480);m.clear();assert.equal(m.tracks.size,0);
});
test('video limits and invalid metadata are rejected without trusting filename',()=>{
 const f={type:'video/webm',size:1024};checkVideo(f,{duration:3,width:640,height:480});
 for(const [file,metadata]of [[{...f,size:MAX_VIDEO_BYTES+1}], [{...f,type:'image/png'}],[f,{duration:61,width:640,height:480}],[f,{duration:Infinity,width:640,height:480}],[f,{duration:1,width:4000,height:2000}],[f,{duration:1,width:NaN,height:480}]])assert.throws(()=>checkVideo(file,metadata));
});
