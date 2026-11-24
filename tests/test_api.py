from io import BytesIO
import asyncio
import pytest
from PIL import Image
from fastapi.testclient import TestClient
import httpx
import app.main as main
from app.pose import describe_poses
from tests.test_geometry import pose
from app.images import MAX_BYTES


class FakeEngine:
    def __init__(self):
        self.calls = 0
        self.closed = False

    def analyze(self, image, frame):
        self.calls += 1
        return describe_poses([pose()], frame)

    def close(self):
        self.closed = True


def png():
    buffer = BytesIO()
    Image.new('RGB', (64, 48), 'white').save(buffer, format='PNG')
    return buffer.getvalue()


@pytest.fixture
def client(monkeypatch):
    engine = FakeEngine()
    monkeypatch.setattr(main, 'PoseEngine', lambda _: engine)
    with TestClient(main.app) as session:
        yield session, engine
    assert engine.closed


def test_health_model_status_and_openapi(client):
    session, _ = client
    assert session.get('/health').json()['body_model_ready'] is True
    assert session.get('/v1/models').json()['models'][0]['ready'] is True
    schema = session.get('/openapi.json').json()
    assert len(schema['paths']) == 3
    assert set(schema['paths']['/v1/body/analyze']['post']['requestBody']['content']) == {'image/jpeg', 'image/png'}
    assert session.get('/docs').status_code == 200


def test_real_image_bytes_injected_detector_contract_and_no_caching(client):
    session, engine = client
    response = session.post('/v1/body/analyze', content=png(), headers={'Content-Type': 'image/png'})
    assert response.status_code == 200
    assert response.json()['status'] == 'observed'
    assert len(response.json()['landmarks']) == 22
    assert response.headers['Cache-Control'] == 'no-store'
    assert engine.calls == 1


@pytest.mark.parametrize('media', ['application/json', 'application/octet-stream', 'multipart/form-data', 'video/mp4'])
def test_wrong_media_type_rejected_before_inference(client, media):
    session, engine = client
    response = session.post('/v1/body/analyze', content=png(), headers={'Content-Type': media})
    assert response.status_code == 415
    assert engine.calls == 0


def test_invalid_input_is_not_echoed_and_slot_is_released(client):
    session, engine = client
    response = session.post('/v1/body/analyze', content=b'private-sentinel-not-image', headers={'Content-Type': 'image/png'})
    assert response.status_code == 422
    assert 'private-sentinel' not in response.text
    assert engine.calls == 0
    assert session.post('/v1/body/analyze', content=png(), headers={'Content-Type': 'image/png'}).status_code == 200


def test_streamed_body_is_bounded_without_trusting_content_length(client):
    session, engine = client
    response = session.post('/v1/body/analyze', content=iter([b'x' * 1024] * 2049), headers={'Content-Type': 'image/png'})
    assert response.status_code == 413
    assert engine.calls == 0


def test_unavailable_model_is_explicit_but_service_health_still_works(monkeypatch):
    def fail(_):
        raise ValueError('path-should-not-be-disclosed')
    monkeypatch.setattr(main, 'PoseEngine', fail)
    with TestClient(main.app) as session:
        assert session.get('/health').json()['body_model_ready'] is False
        response = session.post('/v1/body/analyze', content=png(), headers={'Content-Type': 'image/png'})
        assert response.status_code == 503
        assert 'path-should-not-be-disclosed' not in response.text


def test_busy_service_rejects_extra_work_and_preserves_slot(client):
    # Use one async loop for lifespan, limiter ownership and the request.
    async def run():
        async with main.app.router.lifespan_context(main.app):
            main.app.state.slots.acquire_nowait()
            try:
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as session:
                    response = await session.post('/v1/body/analyze', content=png(), headers={'Content-Type': 'image/png'})
                    assert response.status_code == 429
                    assert response.headers['Retry-After'] == '1'
            finally:
                main.app.state.slots.release()
    asyncio.run(run())


def test_slow_upload_times_out_and_releases_capacity(monkeypatch):
    engine = FakeEngine()
    monkeypatch.setattr(main, 'PoseEngine', lambda _: engine)
    monkeypatch.setattr(main, 'MAX_UPLOAD_SECONDS', .01)
    async def slow():
        yield b'first bytes'
        await asyncio.sleep(.1)
        yield b'late bytes'
    async def run():
        async with main.app.router.lifespan_context(main.app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as session:
                response = await session.post('/v1/body/analyze', content=slow(), headers={'Content-Type': 'image/png'})
                assert response.status_code == 408
                response = await session.post('/v1/body/analyze', content=png(), headers={'Content-Type': 'image/png'})
                assert response.status_code == 200
    asyncio.run(run())
