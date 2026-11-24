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

import {handPoints,HAND_EDGES,fingerTriangle} from '../app/demo/mirror-core.mjs';
function twoFingers(){
 const hand=Array.from({length:21},()=>({x:.5,y:.6}));
 const points={0:[.5,.85],5:[.42,.6],6:[.38,.4],8:[.28,.15],9:[.5,.58],10:[.56,.38],12:[.68,.15],14:[.59,.5],16:[.57,.7],17:[.65,.65],18:[.68,.57],20:[.63,.75]};
 for(const [id,[x,y]]of Object.entries(points))hand[id]={x,y};
 return hand;
}
test('hand graph closes palm and includes all five fingertips without fabricating visibility',()=>{
 const points=handPoints([twoFingers(),twoFingers(),twoFingers()]);
 assert.equal(points.length,2);assert.equal(points[0].length,21);
 assert.ok(HAND_EDGES.some(([a,b])=>a===17&&b===0));
 for(const id of [4,8,12,16,20])assert.ok(HAND_EDGES.flat().includes(id));
 const hand=twoFingers();hand[8].x=NaN;hand[12].y=-.1;
 assert.equal(handPoints([hand])[0].length,19);
});
test('triangle follows two extended separated fingers under rotation and mirroring',()=>{
 const hand=handPoints([twoFingers()])[0];
 assert.deepEqual(fingerTriangle(hand,640,480),[0,8,12]);
 assert.deepEqual(fingerTriangle(hand.map(p=>({...p,x:1-p.x})),640,480),[0,8,12]);
 assert.deepEqual(fingerTriangle(hand.map(p=>({...p,x:p.y,y:1-p.x})),480,640),[0,8,12]);
});
test('no triangle for open hand, fist, missing required points or tiny hand',()=>{
 const open=twoFingers();open[16]={x:.75,y:.2};open[20]={x:.85,y:.3};
 assert.equal(fingerTriangle(handPoints([open])[0],640,480),null);
 const fist=twoFingers();fist[8]={x:.45,y:.75};fist[12]={x:.52,y:.75};
 assert.equal(fingerTriangle(handPoints([fist])[0],640,480),null);
 const hand=handPoints([twoFingers()])[0];
 assert.equal(fingerTriangle(hand.filter(p=>p.id!==12),640,480),null);
 assert.equal(fingerTriangle(hand,10,10),null);
});
