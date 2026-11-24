"""CPU image inference. Facial landmarks are not returned by this body-only API."""
from threading import Lock
import math
from app.model_asset import MODEL_SHA256, verify_model
from app.schemas import Landmark, ArmObservation, BodyResponse
from app.geometry import observe_arms

BODY_NAMES = ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
              'left_pinky', 'right_pinky', 'left_index', 'right_index', 'left_thumb', 'right_thumb',
              'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
              'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index']


class InvalidModelResult(ValueError):
    pass


def describe_poses(poses, frame):
    count = len(poses)
    if count != 1:
        status = 'no_pose' if count == 0 else 'multiple_poses'
        return BodyResponse(model_sha256=MODEL_SHA256, status=status, frame=frame,
                            detected_poses_capped=min(count, 2), landmarks=[], arms=[
                                ArmObservation(side=side, relation='undetermined', reason=status)
                                for side in ['left', 'right']])
    if len(poses[0]) != 33:
        raise InvalidModelResult('Quantidade de pontos inesperada.')
    points = []
    for index, name in enumerate(BODY_NAMES, start=11):
        point = poses[0][index]
        values = [getattr(point, key, None) for key in ['x', 'y', 'z', 'visibility', 'presence']]
        if any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
            raise InvalidModelResult('Ponto não finito ou incompleto.')
        x, y, z, visibility, presence = values
        if not 0 <= visibility <= 1 or not 0 <= presence <= 1:
            raise InvalidModelResult('Escores inválidos.')
        points.append(Landmark(id=index, name=name, x=x, y=y, z=z, visibility=visibility,
                               presence=presence, in_frame=0 <= x <= 1 and 0 <= y <= 1))
    arms = observe_arms(points)
    determined = sum(arm.relation != 'undetermined' for arm in arms)
    status = 'observed' if determined == 2 else 'partial' if determined == 1 else 'undetermined'
    return BodyResponse(model_sha256=MODEL_SHA256, status=status, frame=frame,
                        detected_poses_capped=1, landmarks=points, arms=arms)


class PoseEngine:
    def __init__(self, model_path):
        path = verify_model(model_path)
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision
        self.mp = mp
        self.lock = Lock()
        self.model = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(path), delegate=python.BaseOptions.Delegate.CPU),
            running_mode=vision.RunningMode.IMAGE, num_poses=2,
            min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5,
            output_segmentation_masks=False))

    def analyze(self, image, frame):
        import numpy as np
        pixels = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.asarray(image))
        with self.lock:
            result = self.model.detect(pixels)
        return describe_poses(result.pose_landmarks, frame)

    def close(self):
        with self.lock:
            self.model.close()
