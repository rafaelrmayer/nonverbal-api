"""CPU image face contours and dimensionless opening ratios; no identity or emotion."""
import json
import math
from pathlib import Path
from threading import Lock
from app.face_model_asset import MODEL_SHA256, verify_model
from app.schemas import FaceResponse, FacePoint, OpeningMeasure
from app.pose import InvalidModelResult

CONNECTIONS = json.loads((Path(__file__).parent / 'demo/face-connections.json').read_text())
FACE_IDS = set(p for edges in CONNECTIONS.values() for edge in edges for p in edge)


def describe_faces(faces, frame):
    count = min(len(faces), 2)
    if count != 1:
        status = 'no_face' if count == 0 else 'multiple_faces'
        return FaceResponse(model_sha256=MODEL_SHA256, status=status, frame=frame, detected_faces_capped=count,
                            landmarks=[], measures={key: OpeningMeasure(reason=status) for key in ['mouth', 'leftEye', 'rightEye']})
    if len(faces[0]) != 478:
        raise InvalidModelResult('Quantidade de pontos faciais inesperada.')
    points = []
    for id in sorted(FACE_IDS):
        p = faces[0][id]
        if any(not isinstance(v, (float, int)) or not math.isfinite(v) for v in [getattr(p, 'x', None), getattr(p, 'y', None)]):
            raise InvalidModelResult('Ponto facial não finito.')
        if 0 <= p.x <= 1 and 0 <= p.y <= 1:
            points.append(FacePoint(id=id, x=p.x, y=p.y))
    by_id = {p.id: (p.x * frame.processed_width, p.y * frame.processed_height) for p in points}

    def opening(corners, pairs, minimum):
        if any(id not in by_id for pair in [corners, *pairs] for id in pair):
            return OpeningMeasure(reason='missing_landmarks')
        span = math.dist(by_id[corners[0]], by_id[corners[1]])
        if span < minimum:
            return OpeningMeasure(reason='region_too_small')
        gap = sum(math.dist(by_id[a], by_id[b]) for a, b in pairs) / len(pairs)
        return OpeningMeasure(value=gap / span, reason='geometry_observed')

    measures = {'mouth': opening([61, 291], [[13, 14]], 8),
                'leftEye': opening([362, 263], [[386, 374], [385, 380]], 4),
                'rightEye': opening([33, 133], [[159, 145], [158, 153]], 4)}
    determined = sum(p.value is not None for p in measures.values())
    return FaceResponse(model_sha256=MODEL_SHA256, status='observed' if determined == 3 else 'partial' if determined else 'undetermined',
                        frame=frame, detected_faces_capped=1, landmarks=points, measures=measures)


class FaceEngine:
    def __init__(self, model_path):
        path = verify_model(model_path)
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision
        self.mp = mp
        self.lock = Lock()
        self.model = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(path), delegate=python.BaseOptions.Delegate.CPU),
            running_mode=vision.RunningMode.IMAGE, num_faces=2,
            min_face_detection_confidence=.6, min_face_presence_confidence=.6,
            output_face_blendshapes=False, output_facial_transformation_matrixes=False))

    def analyze(self, image, frame):
        import numpy as np
        pixels = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.asarray(image))
        with self.lock:
            result = self.model.detect(pixels)
        return describe_faces(result.face_landmarks, frame)

    def close(self):
        with self.lock:
            self.model.close()
