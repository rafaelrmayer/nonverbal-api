import json
from openapi_spec_validator import validate_spec
from scripts.export_rapidapi import OUTPUT, build_spec, render_spec
from app.rapidapi import GATEWAY_METHODS


def test_import_spec_is_valid_and_current_without_changing_api_contract():
    schema=build_spec()
    validate_spec(schema)
    assert schema['openapi']=='3.0.3'
    assert schema['servers'][0]['url']=='https://nonverbal-api.onrender.com/rapidapi'
    assert set(schema['paths'])==set(GATEWAY_METHODS)
    assert len({operation['operationId'] for path in schema['paths'].values() for operation in path.values()})==5
    assert OUTPUT.read_text()==render_spec()
    for path in ['/v1/body/analyze','/v1/face/analyze']:
        assert set(schema['paths'][path]['post']['requestBody']['content'])=={'image/jpeg','image/png'}
    assert set(schema['paths']['/v1/vocal/analyze']['post']['requestBody']['content'])=={'audio/wav','audio/x-wav'}
    assert 'X-RapidAPI-Proxy-Secret' not in json.dumps(schema)
