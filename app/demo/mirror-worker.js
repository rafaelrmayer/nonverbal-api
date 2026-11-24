// Classic worker: the WASM loader uses importScripts. Frames never leave this worker/page.
let landmarker, selectBody;
self.onmessage = async ({data}) => {
  if(data.type==='init') {
    try {
      const config=data.config;
      const [{PoseLandmarker,FilesetResolver},{bodyPoints}] = await Promise.all([
        import(config.module_url),import('/demo-assets/mirror-core.mjs')]);
      const response=await fetch(config.model_url);
      if(!response.ok)throw new Error('model');
      const bytes=await response.arrayBuffer();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==config.model_sha256)throw new Error('integrity');
      const files=await FilesetResolver.forVisionTasks(config.wasm_root);
      landmarker=await PoseLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetBuffer:new Uint8Array(bytes),delegate:'CPU'},
        runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:0.5,
        minPosePresenceConfidence:0.5,minTrackingConfidence:0.5,
        canvas:new OffscreenCanvas(1,1)
      });
      selectBody=bodyPoints;
      self.postMessage({type:'ready'});
    } catch {self.postMessage({type:'error'});}
  } else if(data.type==='frame') {
    const bitmap=data.bitmap;
    try {
      const result=landmarker.detectForVideo(bitmap,data.timestamp);
      self.postMessage({type:'result',poses:selectBody(result.landmarks),bitmap},[bitmap]);
    } catch {bitmap.close();self.postMessage({type:'error'});}
  }
};
