"""Export a deterministic OpenAPI 3.0.3 import file; never embeds proxy secrets."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
from app.main import app
from app.rapidapi import GATEWAY_METHODS

OUTPUT = Path(__file__).resolve().parents[1] / 'docs/rapidapi/openapi.json'


def compatible(value):
    if isinstance(value, list):
        return [compatible(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: compatible(item) for key, item in value.items() if key not in {'propertyNames', '$schema', 'jsonSchemaDialect'}}
    if 'const' in result:
        result['enum'] = [result.pop('const')]
    for key, limit in [('exclusiveMinimum', 'minimum'), ('exclusiveMaximum', 'maximum')]:
        number = result.get(key)
        if isinstance(number, (int, float)) and not isinstance(number, bool):
            result[limit] = number
            result[key] = True
    choices = result.get('anyOf')
    if choices and any(choice == {'type': 'null'} for choice in choices):
        others = [choice for choice in choices if choice != {'type': 'null'}]
        result.pop('anyOf')
        result['nullable'] = True
        if len(others) == 1:
            if '$ref' in others[0]:
                result['allOf'] = others
            else:
                result.update(others[0])
        else:
            result['anyOf'] = others
    return result


def build_spec():
    schema = deepcopy(app.openapi())
    schema['paths'] = {path: {method.lower(): schema['paths'][path][method.lower()]} for path, method in GATEWAY_METHODS.items()}
    schema['servers'] = [{'url': 'https://nonverbal-api.onrender.com/rapidapi', 'description': 'Origem protegida para o gateway RapidAPI'}]
    operations = {'/health': 'getHealth', '/v1/models': 'listModels', '/v1/body/analyze': 'analyzeBody', '/v1/face/analyze': 'analyzeFace', '/v1/vocal/analyze': 'analyzeVocal'}
    for path, method in GATEWAY_METHODS.items():
        schema['paths'][path][method.lower()]['operationId'] = operations[path]
    schema['info']['description'] = ('API experimental para pontos corporais/faciais em JPEG/PNG e medidas acústicas em WAV PCM16. '
        'Sem inferência de emoções, intenções, identidade ou diagnóstico. Vídeo e mãos detalhadas pertencem à demonstração local; não são endpoints HTTP. '
        'Uma análise por processo; limites de imagem 2 MiB/4 MP e WAV 8 MiB/30 s. As cotas de assinatura são configuradas no RapidAPI.')
    schema = compatible(schema)
    schema['openapi'] = '3.0.3'
    # The server always returns exactly these three keys; OAS 3.0 lacks propertyNames.
    schema['components']['schemas']['FaceResponse']['properties']['measures'] = {
        'type': 'object', 'required': ['mouth', 'leftEye', 'rightEye'], 'additionalProperties': False,
        'properties': {key: {'$ref': '#/components/schemas/OpeningMeasure'} for key in ['mouth', 'leftEye', 'rightEye']}}
    return schema


def render_spec():
    return json.dumps(build_spec(), ensure_ascii=False, indent=2) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    content = render_spec()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text() != content:
            parser.exit(1, 'OpenAPI desatualizado: execute python -m scripts.export_rapidapi\n')
        print('OpenAPI RapidAPI confere com o contrato atual.')
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(content)
        print('OpenAPI RapidAPI exportado para docs/rapidapi/openapi.json')
