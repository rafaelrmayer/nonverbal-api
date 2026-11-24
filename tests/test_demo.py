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
    for asset in ['demo.mjs', 'demo-core.mjs', 'demo.css']:
        response = session.get('/demo-assets/' + asset)
        assert response.status_code == 200
        assert response.headers['X-Content-Type-Options'] == 'nosniff'
    assert session.get('/demo-assets/main.py').status_code == 404
    assert session.get('/demo-assets/%2e%2e/main.py').status_code == 404
