// Synthetic response used only by automated interface tests, never by the demo.
export function sampleResult(width = 640, height = 480) {
  return {version:'0.1.0', experimental:true, channel:'body', status:'observed',
    frame:{width,height,processed_width:width,processed_height:height}, detected_poses_capped:1,
    landmarks:Array.from({length:22}, (_, i) => ({id:i+11,name:'test-point',x:.2+i*.025,y:.3,z:0,
      visibility:.99,presence:.99,in_frame:true})),
    arms:[{side:'left',relation:'wrist_above_shoulder',reason:'geometry_observed',vertical_gap:.2},
      {side:'right',relation:'wrist_not_above_shoulder',reason:'geometry_observed',vertical_gap:-.2}]};
}
