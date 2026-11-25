"""Five explicit calls using synthetic media. Credentials are read only from env."""
import json
import os
from io import BytesIO
import wave
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler
from PIL import Image


def synthetic_samples():
    png = BytesIO()
    with Image.new('RGB', (256, 256), 'white') as image:
        image.save(png, format='PNG')
    wav = BytesIO()
    with wave.open(wav, 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(b'\x00\x00' * 16000)
    return png.getvalue(), wav.getvalue()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        return None


def main():
    host = os.environ.get('NONVERBAL_RAPIDAPI_HOST', '')
    key = os.environ.get('NONVERBAL_RAPIDAPI_KEY', '')
    if not key.strip() or not host.endswith('.p.rapidapi.com') or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-.' for c in host):
        raise SystemExit('Configure NONVERBAL_RAPIDAPI_HOST e NONVERBAL_RAPIDAPI_KEY. Nenhum valor será impresso.')
    opener = build_opener(NoRedirect)
    png, wav = synthetic_samples()
    calls = [('GET', '/health', None, None), ('GET', '/v1/models', None, None),
             ('POST', '/v1/body/analyze', png, 'image/png'), ('POST', '/v1/face/analyze', png, 'image/png'),
             ('POST', '/v1/vocal/analyze', wav, 'audio/wav')]
    for method, path, body, media in calls:
        headers = {'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host}
        if media:
            headers['Content-Type'] = media
        request = Request('https://' + host + path, data=body, headers=headers, method=method)
        try:
            with opener.open(request, timeout=90) as response:
                result = json.loads(response.read(4*1024*1024))
                assert response.status == 200 and isinstance(result, dict)
            if path == '/health':
                assert result.get('status') == 'ok' and result.get('service') == 'nonverbal-api'
            elif path == '/v1/models':
                assert isinstance(result.get('models'), list) and result.get('vocal_algorithm', {}).get('id') == 'pcm-autocorrelation-v1'
            elif path == '/v1/body/analyze':
                assert result.get('status') == 'no_pose' and not result.get('landmarks')
            elif path == '/v1/face/analyze':
                assert result.get('status') == 'no_face' and not result.get('landmarks')
            else:
                assert result.get('channel') == 'vocal' and result.get('pitch_median_hz') is None and result.get('rms_dbfs') == -120
        except HTTPError as exc:
            raise SystemExit(f'{method} {path}: HTTP {exc.code}. Confira o gateway e o segredo no painel; não publique credenciais.') from None
        except (URLError, TimeoutError, ValueError, AssertionError):
            raise SystemExit(f'{method} {path}: resposta ausente ou diferente do contrato esperado; nenhum dado de credencial foi impresso.') from None
        print(f'200 {method} {path}: contrato sintético conferido')
    print('Cinco chamadas concluídas. Isto não comprova cotas, disponibilidade contínua ou precisão em dados reais.')


if __name__ == '__main__':
    main()
