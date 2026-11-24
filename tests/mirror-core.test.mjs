import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bodyPoints,frameSize,EDGES} from '../app/demo/mirror-core.mjs';
test('only visible in-frame body points survive, without facial IDs or fabricated presence',()=>{
 const pose=Array.from({length:33},()=>({x:.5,y:.5,visibility:.9}));
 pose[11].visibility=.69;pose[12].x=1.1;pose[13].y=NaN;delete pose[14].visibility;
 const result=bodyPoints([pose,pose,pose]);
 assert.equal(result.length,2);assert.equal(result[0].length,18);
 assert.deepEqual(result[0][0],{id:15,x:.5,y:.5});
 assert.ok(EDGES.flat().every(id=>id>=11&&id<=32));
 assert.deepEqual(bodyPoints([]),[]);
});
test('frame resizing preserves aspect ratio and caps work without enlarging',()=>{
 assert.deepEqual(frameSize(1920,1080),{width:640,height:360});
 assert.deepEqual(frameSize(320,480),{width:320,height:480});
});
