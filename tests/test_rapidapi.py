import asyncio
import json
import pytest
from app.main import app
from app.rapidapi import RapidAPIGateway
import app.main as main
from tests.test_api import client, png
from tests.test_face import FakeFace
from scripts.rapidapi_smoke import synthetic_samples

SECRET = 'synthetic-gateway-test-value'
HEADERS = {'X-RapidAPI-Proxy-Secret': SECRET}


@pytest.fixture
def gateway(client, monkeypatch):
    session, engine = client
    monkeypatch.setenv('RAPIDAPI_PROXY_SECRET', SECRET)
    monkeypatch.setattr(main, 'FaceEngine', lambda _: FakeFace())
    main.app.state.face_model_available = True
    return session, engine


@pytest.mark.parametrize('method,path', [('GET','/health'),('GET','/v1/models'),('POST','/v1/body/analyze'),('POST','/v1/face/analyze'),('POST','/v1/vocal/analyze')])
def test_gateway_requires_proxy_secret_and_preserves_binary_contract(gateway,method,path):
    session, _ = gateway
    _, wav = synthetic_samples()
    media = 'audio/wav' if 'vocal' in path else 'image/png'
    body = wav if 'vocal' in path else png()
    args = {'content': body, 'headers': {'Content-Type': media}} if method=='POST' else {}
    assert session.request(method,'/rapidapi'+path,**args).status_code == 403
    assert session.request(method,'/rapidapi'+path,headers={'X-RapidAPI-Key':SECRET}).status_code == 403
    public = session.request(method,path,**args)
    headers = {**args.get('headers',{}), **HEADERS}
    proxy = session.request(method,'/rapidapi'+path,content=body if method=='POST' else None,headers=headers)
    assert proxy.status_code == public.status_code == 200
    assert proxy.json() == public.json()
    assert proxy.headers['Cache-Control']=='no-store'
    assert SECRET not in proxy.text


@pytest.mark.parametrize('value',[None,'','   '])
def test_missing_proxy_configuration_fails_closed(gateway,monkeypatch,value):
    session,_ = gateway
    if value is None:monkeypatch.delenv('RAPIDAPI_PROXY_SECRET')
    else:monkeypatch.setenv('RAPIDAPI_PROXY_SECRET',value)
    response=session.get('/rapidapi/health',headers=HEADERS)
    assert response.status_code==503 and response.json()=={'error':'gateway_not_configured'}


@pytest.mark.parametrize('path',['/rapidapi','/rapidapi/','/rapidapi/docs','/rapidapi/openapi.json','/rapidapi/mirror','/rapidapi/demo-assets/demo.mjs','/rapidapi/health/','/rapidapi/rapidapi/health'])
def test_only_allowlisted_api_paths_are_forwarded(gateway,path):
    session,_=gateway
    assert session.get(path,headers=HEADERS).status_code==404


@pytest.mark.parametrize('method,path',[('POST','/health'),('GET','/v1/body/analyze'),('GET','/v1/face/analyze'),('GET','/v1/vocal/analyze')])
def test_wrong_gateway_method_is_not_forwarded(gateway,method,path):
    session,_=gateway
    response=session.request(method,'/rapidapi'+path,headers=HEADERS)
    assert response.status_code==405 and 'Allow' in response.headers


def test_duplicate_and_incorrect_headers_are_rejected(gateway):
    session,_=gateway
    assert session.get('/rapidapi/health',headers=[('X-RapidAPI-Proxy-Secret',SECRET),('X-RapidAPI-Proxy-Secret',SECRET)]).status_code==403
    assert session.get('/rapidapi/health',headers={'X-RapidAPI-Proxy-Secret':'wrong'}).status_code==403


def test_reject_before_reading_uploaded_bytes():
    async def run():
        async def inner(*args):raise AssertionError('Must not reach inference')
        async def receive():raise AssertionError('Must not read body')
        messages=[]
        async def send(message):messages.append(message)
        await RapidAPIGateway(inner)({'type':'http','path':'/rapidapi/v1/vocal/analyze','method':'POST','headers':[]},receive,send)
        assert messages[0]['status'] in (403,503)
    asyncio.run(run())


def test_original_demo_and_openapi_remain_public(gateway):
    session,_=gateway
    for path in ['/','/mirror','/docs','/openapi.json']:
        assert session.get(path).status_code==200
    schema=session.get('/openapi.json').json()
    assert len(schema['paths'])==5
    assert not any(path.startswith('/rapidapi') for path in schema['paths'])
    assert SECRET not in json.dumps(schema)
