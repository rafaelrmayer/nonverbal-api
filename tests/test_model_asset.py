import hashlib
from io import BytesIO
import pytest
import app.model_asset as asset
import scripts.download_model as setup


def test_wrong_or_missing_weights_are_never_used(tmp_path):
    with pytest.raises(ValueError):
        asset.verify_model(tmp_path / 'missing.task')
    path = tmp_path / 'bad.task'
    path.write_bytes(b'corrupt')
    with pytest.raises(ValueError):
        asset.verify_model(path)


def test_download_hash_verified_before_atomic_publication(tmp_path, monkeypatch):
    data = b'unit-test-model-placeholder-not-real-weights'
    checksum = hashlib.sha256(data).hexdigest()
    monkeypatch.setattr(asset, 'MODEL_SHA256', checksum)
    monkeypatch.setattr(setup, 'MODEL_SHA256', checksum)
    monkeypatch.setattr(setup, 'urlopen', lambda *args, **kwargs: BytesIO(data))
    path = setup.download(tmp_path / 'nested/model.task')
    assert path.read_bytes() == data
    monkeypatch.setattr(setup, 'urlopen', lambda *args, **kwargs: pytest.fail('No new download for verified existing asset'))
    assert setup.download(path) == path


def test_corrupt_download_does_not_create_output(tmp_path, monkeypatch):
    monkeypatch.setattr(setup, 'urlopen', lambda *args, **kwargs: BytesIO(b'corrupt'))
    path = tmp_path / 'model.task'
    with pytest.raises(ValueError):
        setup.download(path)
    assert not path.exists()


def test_hand_model_missing_or_corrupt_is_rejected(tmp_path):
    from app import hand_model_asset
    for path in [tmp_path / 'missing.task', tmp_path / 'corrupt.task']:
        if path.name == 'corrupt.task':
            path.write_bytes(b'corrupt')
        with pytest.raises(ValueError):
            hand_model_asset.verify_model(path)


def test_face_asset_verifies_download_before_atomic_publication(tmp_path, monkeypatch):
    from app import face_model_asset as asset
    from scripts import download_face_model as setup
    with pytest.raises(ValueError):
        asset.verify_model(tmp_path / 'missing.task')
    monkeypatch.setattr(setup, 'urlopen', lambda *args, **kwargs: BytesIO(b'corrupt'))
    path = tmp_path / 'face.task'
    with pytest.raises(ValueError):
        setup.download(path)
    assert not path.exists()
    data = b'synthetic-face-asset-for-test'
    checksum = hashlib.sha256(data).hexdigest()
    monkeypatch.setattr(asset, 'MODEL_SHA256', checksum)
    monkeypatch.setattr(setup, 'MODEL_SHA256', checksum)
    monkeypatch.setattr(setup, 'urlopen', lambda *args, **kwargs: BytesIO(data))
    assert setup.download(path).read_bytes() == data
    monkeypatch.setattr(setup, 'urlopen', lambda *args, **kwargs: pytest.fail('Already verified'))
    assert setup.download(path) == path
