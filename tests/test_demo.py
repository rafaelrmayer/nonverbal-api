from tests.test_api import client


def test_demo_is_same_origin_without_changing_the_api_contract(client):
    session, engine = client
    response = session.get('/')
    assert response.status_code == 200
    assert 'text/html' in response.headers['content-type']
    assert 'Capturar e analisar' in response.text
    assert 'Analisar imagem' in response.text
    assert 'role="alert"' in response.text
    assert engine.calls == 0
    assert len(session.get('/openapi.json').json()['paths']) == 3


def test_demo_security_policy_limits_media_and_network(client):
    session, _ = client
    response = session.get('/')
    assert response.headers['Cache-Control'] == 'no-store'
    assert response.headers['Permissions-Policy'] == 'camera=(self), microphone=(), geolocation=()'
    assert "connect-src 'self'" in response.headers['Content-Security-Policy']
    assert "frame-ancestors 'none'" in response.headers['Content-Security-Policy']
    assert response.headers['Referrer-Policy'] == 'no-referrer'


def test_static_assets_are_available_but_not_arbitrary_source_files(client):
    session, _ = client
    for asset in ['demo.mjs', 'demo-core.mjs', 'demo.css', 'modes.mjs']:
        response = session.get('/demo-assets/' + asset)
        assert response.status_code == 200
        assert response.headers['X-Content-Type-Options'] == 'nosniff'
    assert session.get('/demo-assets/main.py').status_code == 404
    assert session.get('/demo-assets/%2e%2e/main.py').status_code == 404


def test_both_entrypoints_serve_unified_modes_with_same_origin_wasm(client):
    session, engine = client
    response = session.get('/mirror')
    assert response.status_code == 200
    assert response.content == session.get('/').content
    assert 'Iniciar espelho' in response.text
    assert 'Capturar e analisar' in response.text
    assert 'id="mirrorExperience"' in response.text
    assert 'id="photoExperience"' in response.text
    assert "'wasm-unsafe-eval'" in response.headers['Content-Security-Policy']
    assert "worker-src 'self'" in response.headers['Content-Security-Policy']
    assert "'unsafe-eval'" not in response.headers['Content-Security-Policy']
    assert response.headers['Cache-Control'] == 'no-store'
    assert engine.calls == 0
    for asset in ['mirror.mjs', 'mirror-worker.js', 'mirror-core.mjs', 'mirror.css']:
        assert session.get('/demo-assets/' + asset).status_code == 200
    assert len(session.get('/openapi.json').json()['paths']) == 3


def test_runtime_allowlist_missing_assets_and_model_integrity(client, monkeypatch, tmp_path):
    from app import main
    session, _ = client
    config = session.get('/mirror-config').json()
    monkeypatch.setattr(main, 'RUNTIME_DIR', tmp_path)
    assert session.get(config['module_url']).status_code == 503
    assert session.get('/browser-runtime/0.10.32/main.py').status_code == 404
    assert session.get('/browser-runtime/other/vision_bundle.mjs').status_code == 404
    folder = tmp_path / '0.10.32'
    folder.mkdir()
    (folder / 'vision_bundle.mjs').write_text('// synthetic runtime')
    response = session.get(config['module_url'])
    assert response.status_code == 200
    assert 'immutable' in response.headers['Cache-Control']
    model = tmp_path / 'invalid.task'
    model.write_bytes(b'corrupt model')
    monkeypatch.setenv('POSE_MODEL_PATH', str(model))
    response = session.get(config['model_url'])
    assert response.status_code == 503
    assert response.headers['Cache-Control'] == 'no-store'
    assert session.get('/mirror-model/wrong.task').status_code == 404


def test_hand_asset_is_separate_hash_checked_and_not_part_of_api(client, monkeypatch, tmp_path):
    from app import main
    session, engine = client
    config = session.get('/mirror-config').json()
    model = tmp_path / 'hands.task'
    model.write_bytes(b'corrupt hand model')
    monkeypatch.setenv('HAND_MODEL_PATH', str(model))
    assert session.get(config['hand_model_url']).status_code == 503
    assert session.get('/mirror-hand-model/wrong.task').status_code == 404
    monkeypatch.setattr(main.hand_asset, 'verify_model', lambda path: model)
    response = session.get(config['hand_model_url'])
    assert response.status_code == 200
    assert 'immutable' in response.headers['Cache-Control']
    assert response.headers['etag'] == '"' + config['hand_model_sha256'] + '"'
    assert engine.calls == 0
    assert len(session.get('/openapi.json').json()['paths']) == 3
