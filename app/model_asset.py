"""Pinned public model asset; never download weights from an inference request."""
import hashlib
from pathlib import Path

MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
MODEL_SHA256 = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'
MAX_MODEL_BYTES = 16 * 1024 * 1024


def verify_model(path):
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_MODEL_BYTES:
        raise ValueError('Modelo ausente ou com tamanho inválido.')
    with path.open('rb') as file:
        checksum = hashlib.file_digest(file, 'sha256').hexdigest()
    if checksum != MODEL_SHA256:
        raise ValueError('Hash do modelo não corresponde à versão aprovada.')
    return path
