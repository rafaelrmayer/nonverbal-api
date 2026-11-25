// Classic worker: the WASM loader uses importScripts. Frames never leave this worker/page.
let landmarker,handLandmarker,faceLandmarker,selectBody,selectHands,selectFaces;
async function verifiedBytes(url,checksum){
  const response=await fetch(url);if(!response.ok)throw new Error('model');
  const bytes=await response.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==checksum)throw new Error('integrity');
  return new Uint8Array(bytes);
}
self.onmessage=async({data})=>{
  if(data.type==='init'){
    let stage='body';
    try{
      const config=data.config;
      const [{PoseLandmarker,HandLandmarker,FaceLandmarker,FilesetResolver},{bodyPoints,handPoints},{facePoints}]=await Promise.all([
        import(config.module_url),import('/demo-assets/mirror-core.mjs'),import('/demo-assets/face-core.mjs')]);
      const files=await FilesetResolver.forVisionTasks(config.wasm_root);
      if(data.body!==false)landmarker=await PoseLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetBuffer:await verifiedBytes(config.model_url,config.model_sha256),delegate:'CPU'},
        runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:0.5,
        minPosePresenceConfidence:0.5,minTrackingConfidence:0.5,canvas:new OffscreenCanvas(1,1)
      });
      if(data.hands!==false){
        stage='hands';
        handLandmarker=await HandLandmarker.createFromOptions(files,{
          baseOptions:{modelAssetBuffer:await verifiedBytes(config.hand_model_url,config.hand_model_sha256),delegate:'CPU'},
          runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:0.6,
          minHandPresenceConfidence:0.6,minTrackingConfidence:0.6,canvas:new OffscreenCanvas(1,1)
        });
      }
      if(data.face===true){
        stage='face';
        faceLandmarker=await FaceLandmarker.createFromOptions(files,{
          baseOptions:{modelAssetBuffer:await verifiedBytes(config.face_model_url,config.face_model_sha256),delegate:'CPU'},
          runningMode:'VIDEO',numFaces:2,minFaceDetectionConfidence:0.6,
          minFacePresenceConfidence:0.6,minTrackingConfidence:0.6,
          outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false,
          canvas:new OffscreenCanvas(1,1)
        });
      }
      selectBody=bodyPoints;selectHands=handPoints;selectFaces=facePoints;
      self.postMessage({type:'ready'});
    }catch{self.postMessage({type:'error',stage});}
  }else if(data.type==='frame'){
    const bitmap=data.bitmap;
    try{
      const poses=landmarker?selectBody(landmarker.detectForVideo(bitmap,data.timestamp).landmarks):[];
      const hands=handLandmarker?selectHands(handLandmarker.detectForVideo(bitmap,data.timestamp).landmarks):[];
      const faces=faceLandmarker?selectFaces(faceLandmarker.detectForVideo(bitmap,data.timestamp).faceLandmarks):[];
      self.postMessage({type:'result',poses,hands,faces,bitmap},[bitmap]);
    }catch{bitmap.close();self.postMessage({type:'error',stage:'frame'});}
  }
};
