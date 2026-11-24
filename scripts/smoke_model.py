"""Real model smoke test with a generated blank image; no human imagery needed in CI."""
import os
from PIL import Image
from app.pose import PoseEngine
from app.schemas import Frame


def main():
    engine = PoseEngine(os.environ.get('POSE_MODEL_PATH', 'models/pose_landmarker_lite.task'))
    try:
        with Image.new('RGB', (256, 256), 'white') as image:
            result = engine.analyze(image, Frame(width=256, height=256, processed_width=256, processed_height=256))
        assert result.status == 'no_pose'
        assert not result.landmarks
        print('Modelo real em CPU: imagem sem pessoa resulta em no_pose, sem observação inventada.')
    finally:
        engine.close()


if __name__ == '__main__':
    main()
