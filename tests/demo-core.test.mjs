import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitSize, inspectImageBytes, validateResult, drawablePoints, describeArm, httpError} from '../app/demo/demo-core.mjs';
import {sampleResult} from './demo-fixtures.mjs';

test('fits frames without stretching or enlarging them', () => {
  assert.deepEqual(fitSize(1920,1080), {width:1280,height:720});
  assert.deepEqual(fitSize(600,1200), {width:600,height:1200});
  assert.deepEqual(fitSize(1200,2400), {width:640,height:1280});
  assert.throws(() => fitSize(0,40));
});

test('inspects file signatures and rejects animated PNG before upload', () => {
  assert.equal(inspectImageBytes(Uint8Array.from([255,216,255,0])), 'image/jpeg');
  assert.equal(inspectImageBytes(Uint8Array.from([137,80,78,71,13,10,26,10])), 'image/png');
  const animated = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,8,97,99,84,76]);
  assert.throws(() => inspectImageBytes(animated), /animado/);
  assert.throws(() => inspectImageBytes(new Uint8Array(8*1024*1024+1)), /8 MiB/);
  assert.throws(() => inspectImageBytes(Uint8Array.from([1,2,3])));
});

test('ties results to the current frame and validates every landmark', () => {
  const result=sampleResult();
  assert.equal(validateResult(result, {width:640,height:480}), result);
  assert.throws(() => validateResult(result, {width:480,height:640}));
  for (const change of [null,{...result,version:'unknown'},{...result,arms:[null,null]},
    {...result,landmarks:[]},{...result,landmarks:[null]},
    {...result,detected_poses_capped:0}]) assert.throws(() => validateResult(change, {width:640,height:480}));
  const bad=sampleResult();bad.landmarks[0].x=NaN;
  assert.throws(() => validateResult(bad, {width:640,height:480}));
});

test('does not draw points that are low visibility or outside the frame', () => {
  const result=sampleResult();
  result.landmarks[0].visibility=.3;
  result.landmarks[1].presence=.3;
  result.landmarks[2].x=-.1;result.landmarks[2].in_frame=false;
  assert.equal(drawablePoints(result).length,19);
});

test('explains abstention without turning it into a negative observation', () => {
  const description=describeArm({relation:'undetermined',reason:'low_visibility'});
  assert.equal(description.title,'Posição indeterminada');
  assert.match(description.reason,/visibilidade/);
  assert.match(httpError(429),/ocupada/);
  assert.match(httpError(503),/indisponível/);
});
