from types import SimpleNamespace
import math
import pytest
from fastapi.testclient import TestClient
from app.face import describe_faces, FACE_IDS
from app.schemas import Frame
from app.pose import InvalidModelResult
from tests.test_api import FakeEngine, png
import app.main as main


def points():
    result = [SimpleNamespace(x=.5, y=.5) for _ in range(478)]
    for id, x, y in [(61,.3,.7),(291,.7,.7),(13,.5,.68),(14,.5,.76),(33,.2,.3),(133,.4,.3),(159,.26,.28),(145,.26,.32),(158,.34,.28),(153,.34,.32),(362,.6,.3),(263,.8,.3),(386,.66,.27),(374,.66,.33),(385,.74,.27),(380,.74,.33)]:
        result[id] = SimpleNamespace(x=x, y=y)
    return result


FRAME = Frame(width=640, height=480, processed_width=640, processed_height=480)


def test_contours_only_and_pixel_ratios():
    result = describe_faces([points()], FRAME)
    assert result.status == 'observed'
    assert set(p.id for p in result.landmarks) == FACE_IDS
    assert result.measures['mouth'].value == pytest.approx(.15)
    assert result.measures['leftEye'].value == pytest.approx(.225)
    assert not {'z', 'presence', 'visibility'} & result.landmarks[0].model_dump().keys()


@pytest.mark.parametrize('faces,status', [([], 'no_face'), ([points(), points()], 'multiple_faces')])
def test_no_selection_or_invented_measurements(faces, status):
    result = describe_faces(faces, FRAME)
    assert result.status == status
    assert result.landmarks == []
    assert all(m.value is None and m.reason == status for m in result.measures.values())


def test_partial_missing_small_and_corrupt_landmarks():
    face = points()
    face[14].x = 2
    result = describe_faces([face], FRAME)
    assert result.status == 'partial'
    assert result.measures['mouth'].reason == 'missing_landmarks'
    assert describe_faces([points()], Frame(width=1,height=1,processed_width=1,processed_height=1)).status == 'undetermined'
    face[14].x = math.nan
    with pytest.raises(InvalidModelResult):
        describe_faces([face], FRAME)
    with pytest.raises(InvalidModelResult):
        describe_faces([face[:-1]], FRAME)


class FakeFace:
    def __init__(self):
        self.calls = 0
        self.closed = False
    def analyze(self, image, frame):
        self.calls += 1
        return describe_faces([points()], frame)
    def close(self):
        self.closed = True


@pytest.fixture
def face_client(monkeypatch):
    engine = FakeFace()
    loads = []
    monkeypatch.setattr(main, 'PoseEngine', lambda _: FakeEngine())
    monkeypatch.setattr(main.face_asset, 'verify_model', lambda path: path)
    monkeypatch.setattr(main, 'FaceEngine', lambda path: (loads.append(path) or engine))
    with TestClient(main.app) as session:
        yield session, engine, loads
    if loads:
        assert engine.closed


def test_face_api_lazily_loads_once_and_cleans_up(face_client):
    session, engine, loads = face_client
    assert session.get('/health').json()['face_model_available'] is True
    assert session.get('/health').json()['face_model_ready'] is False
    for _ in range(2):
        response = session.post('/v1/face/analyze', content=png(), headers={'Content-Type':'image/png'})
        assert response.status_code == 200
        assert response.json()['channel'] == 'face'
        assert response.headers['cache-control'] == 'no-store'
    assert len(loads) == 1 and engine.calls == 2
    assert session.get('/health').json()['face_model_ready'] is True


@pytest.mark.parametrize('content,media,status', [(b'private-invalid','image/png',422),(b'x'*(2*1024*1024+1),'image/png',413),(b'anything','video/mp4',415)])
def test_invalid_face_upload_never_loads_model(face_client,content,media,status):
    session, engine, loads = face_client
    response = session.post('/v1/face/analyze',content=content,headers={'Content-Type':media})
    assert response.status_code == status
    assert not loads and engine.calls == 0
    assert 'private-invalid' not in response.text


def test_face_model_failure_is_sanitized_and_releases_slot(face_client,monkeypatch):
    session, engine, loads = face_client
    def fail(path):
        raise ValueError('private-filesystem-path')
    monkeypatch.setattr(main,'FaceEngine',fail)
    response=session.post('/v1/face/analyze',content=png(),headers={'Content-Type':'image/png'})
    assert response.status_code == 503
    assert 'private-filesystem-path' not in response.text
    assert session.post('/v1/body/analyze',content=png(),headers={'Content-Type':'image/png'}).status_code == 200
