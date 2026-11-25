"""Explicit, build-time download of the fixed MediaPipe Face Landmarker model."""
import argparse
import hashlib
import os
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen
from app.face_model_asset import MODEL_URL, MODEL_SHA256, MAX_MODEL_BYTES, verify_model


def download(target):
    target = Path(target)
    if target.exists():
        verify_model(target)
        return target
    request = Request(MODEL_URL, headers={'User-Agent': 'NonverbalAPI-ModelSetup/0.1'})
    with urlopen(request, timeout=60) as response:
        data = response.read(MAX_MODEL_BYTES + 1)
    if len(data) > MAX_MODEL_BYTES or hashlib.sha256(data).hexdigest() != MODEL_SHA256:
        raise ValueError('Download incompleto ou modelo com hash divergente.')
    target.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as file:
            name = file.name
            file.write(data)
        os.replace(name, target)
    finally:
        if name and Path(name).exists():
            Path(name).unlink()
    return verify_model(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='models/face_landmarker.task')
    args = parser.parse_args()
    try:
        print('Modelo verificado:', download(args.output))
    except (OSError, ValueError) as exc:
        parser.exit(1, f'Não foi possível preparar o modelo: {exc}\n')
