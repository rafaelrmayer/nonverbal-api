"""Real model smoke test with a generated blank image; no human imagery needed in CI."""
import os
from PIL import Image
from app.pose import PoseEngine
from app.face import FaceEngine
from app.schemas import Frame


def main():
    engine = PoseEngine(os.environ.get('POSE_MODEL_PATH', 'models/pose_landmarker_lite.task'))
    try:
        with Image.new('RGB', (256, 256), 'white') as image:
            result = engine.analyze(image, Frame(width=256, height=256, processed_width=256, processed_height=256))
        assert result.status == 'no_pose'
        assert not result.landmarks
        facial = FaceEngine(os.environ.get('FACE_MODEL_PATH', 'models/face_landmarker.task'))
        try:
            with Image.new('RGB', (256, 256), 'white') as image:
                result = facial.analyze(image, Frame(width=256, height=256, processed_width=256, processed_height=256))
            assert result.status == 'no_face' and not result.landmarks
        finally:
            facial.close()
        print('Modelos corporal e facial simultâneos em CPU: imagem branca sem detecções ou medidas inventadas.')
    finally:
        engine.close()


if __name__ == '__main__':
    main()
