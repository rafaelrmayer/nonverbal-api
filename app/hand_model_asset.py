"""Fixed official MediaPipe Hand Landmarker asset, used only by the local mirror."""
import hashlib
from pathlib import Path

MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
MODEL_SHA256 = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'
MAX_MODEL_BYTES = 16 * 1024 * 1024


def verify_model(path):
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_MODEL_BYTES:
        raise ValueError('Modelo de mãos ausente ou com tamanho inválido.')
    with path.open('rb') as file:
        checksum = hashlib.file_digest(file, 'sha256').hexdigest()
    if checksum != MODEL_SHA256:
        raise ValueError('Hash do modelo de mãos não corresponde à versão aprovada.')
    return path
