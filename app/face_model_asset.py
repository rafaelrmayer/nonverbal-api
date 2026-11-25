"""Fixed official MediaPipe Face Landmarker asset, used only by the local mirror."""
import hashlib
from pathlib import Path

MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
MAX_MODEL_BYTES = 16 * 1024 * 1024


def verify_model(path):
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_MODEL_BYTES:
        raise ValueError('Modelo de rosto ausente ou com tamanho inválido.')
    with path.open('rb') as file:
        checksum = hashlib.file_digest(file, 'sha256').hexdigest()
    if checksum != MODEL_SHA256:
        raise ValueError('Hash do modelo de rosto não corresponde à versão aprovada.')
    return path
