import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FaceLandmarker} from '@mediapipe/tasks-vision';
import {readFileSync} from 'node:fs';
import {FACE_GROUPS,FACE_EDGES,facePoints,faceMeasures} from '../app/demo/face-core.mjs';
const sample=()=>[
 {id:61,x:.3,y:.7},{id:291,x:.7,y:.7},{id:13,x:.5,y:.68},{id:14,x:.5,y:.76},
 {id:33,x:.2,y:.3},{id:133,x:.4,y:.3},{id:159,x:.26,y:.28},{id:145,x:.26,y:.32},{id:158,x:.34,y:.28},{id:153,x:.34,y:.32},
 {id:362,x:.6,y:.3},{id:263,x:.8,y:.3},{id:386,x:.66,y:.27},{id:374,x:.66,y:.33},{id:385,x:.74,y:.27},{id:380,x:.74,y:.33}];
test('face contours match pinned SDK and contain only requested regions',()=>{
 for(const [name,edges]of Object.entries(FACE_GROUPS))assert.deepEqual(edges,FaceLandmarker['FACE_LANDMARKS_'+name].map(({start,end})=>[start,end]));
 assert.equal(FACE_EDGES.length,124);
 assert.deepEqual(JSON.parse(readFileSync(new URL('../app/demo/face-connections.json',import.meta.url),'utf8')),FACE_GROUPS);
 const landmarks=Array.from({length:478},()=>({x:.5,y:.5}));
 const faces=facePoints([landmarks,landmarks,landmarks]);
 assert.equal(faces.length,2);
 assert.deepEqual(faces[0].map(p=>p.id),[...new Set(FACE_EDGES.flat())].sort((a,b)=>a-b));
 assert.ok(faces[0].every(p=>Object.keys(p).join(',')==='id,x,y'));
 landmarks[13].x=NaN;landmarks[14].y=1.1;
 assert.ok(!facePoints([landmarks])[0].some(p=>p.id===13||p.id===14));
});
test('opening ratios use pixel geometry and survive rotation, scaling and mirroring',()=>{
 const points=sample();const measure=faceMeasures(points,640,480);
 assert.ok(Math.abs(measure.mouth-.15)<1e-10);
 assert.ok(Math.abs(measure.leftEye-.225)<1e-10);
 assert.ok(Math.abs(measure.rightEye-.15)<1e-10);
 for(const transformed of [faceMeasures(points,1280,960),faceMeasures(points.map(p=>({...p,x:1-p.x})),640,480),faceMeasures(points.map(p=>({...p,x:p.y,y:1-p.x})),480,640)]){
  for(const key of Object.keys(measure))assert.ok(Math.abs(measure[key]-transformed[key])<1e-10);
 }
});
test('missing, invalid and tiny spans abstain without invented opening values',()=>{
 assert.equal(faceMeasures(sample().filter(p=>p.id!==14),640,480).mouth,null);
 assert.equal(faceMeasures(sample().map(p=>p.id===14?{...p,y:Infinity}:p),640,480).mouth,null);
 assert.deepEqual(faceMeasures([],640,480),{mouth:null,leftEye:null,rightEye:null});
 assert.deepEqual(faceMeasures(sample(),1,1),{mouth:null,leftEye:null,rightEye:null});
 assert.equal(faceMeasures(sample(),0,480),null);
 const closed=sample().map(p=>p.id===14?{...p,y:.68}:p);
 assert.equal(faceMeasures(closed,640,480).mouth,0);
});
