from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
import anyio
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from app.images import MAX_BYTES, decode_image, InvalidImage, ImageTooLarge
from app.model_asset import MODEL_SHA256, verify_model
from app import hand_model_asset as hand_asset
from app import face_model_asset as face_asset
from app.browser_assets import SDK_VERSION, RUNTIME_DIR, RUNTIME_FILES
from app.pose import PoseEngine, InvalidModelResult
from app.schemas import BodyResponse, FaceResponse, VocalResponse
from app.vocal import analyze_wav, InvalidAudio, MAX_AUDIO_BYTES
from app.face import FaceEngine

MAX_UPLOAD_SECONDS = 10


@asynccontextmanager
async def lifespan(app):
    app.state.engine = None
    app.state.face_engine = None
    app.state.face_model_path = os.environ.get('FACE_MODEL_PATH', 'models/face_landmarker.task')
    try:
        face_asset.verify_model(app.state.face_model_path)
        app.state.face_model_available = True
    except (OSError, ValueError):
        app.state.face_model_available = False
    app.state.slots = anyio.CapacityLimiter(1)
    path = os.environ.get('POSE_MODEL_PATH', 'models/pose_landmarker_lite.task')
    try:
        app.state.engine = PoseEngine(path)
    except Exception:
        # Fixed message: no paths, image bytes, filenames or request contents in logs.
        logging.getLogger(__name__).warning('Modelo corporal indisponível; confira instalação e hash do asset.')
    yield
    if app.state.face_engine is not None:
        app.state.face_engine.close()
        app.state.face_engine = None
    if app.state.engine is not None:
        app.state.engine.close()
        app.state.engine = None


app = FastAPI(title='Nonverbal API', version='0.1.0', lifespan=lifespan,
              description='Protótipo de observações geométricas corporais em uma imagem. Não infere emoção, intenção, atenção ou diagnóstico. A API HTTP oferece análise corporal e facial por imagem; vídeo e movimentos são processados localmente na demonstração. Áudio WAV recebe medidas acústicas sem transcrição ou interpretação emocional.')

DEMO_DIR = Path(__file__).resolve().parent / 'demo'
app.mount('/demo-assets', StaticFiles(directory=DEMO_DIR), name='demo-assets')


@app.middleware('http')
async def no_cache(request, call_next):
    response = await call_next(request)
    path = request.url.path
    immutable = path.startswith('/browser-runtime/') or path.startswith('/mirror-model/') or path.startswith('/mirror-hand-model/') or path.startswith('/mirror-face-model/')
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable' if immutable and response.status_code == 200 else 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    mirror = path in {'/', '/mirror', '/demo-assets/mirror-worker.js'}
    if path == '/' or path == '/mirror' or path.startswith('/demo-assets/'):
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Permissions-Policy'] = 'camera=(self), microphone=(self), geolocation=()'
        script_policy = "'self' 'wasm-unsafe-eval'" if mirror else "'self'"
        response.headers['Content-Security-Policy'] = (
            f"default-src 'none'; script-src {script_policy}; style-src 'self'; worker-src 'self'; "
            "img-src 'self' blob: data:; media-src 'self' blob: mediastream:; "
            "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        )
    return response


@app.get('/', include_in_schema=False)
def demo():
    return FileResponse(DEMO_DIR / 'index.html')


@app.get('/mirror', include_in_schema=False)
def mirror_demo():
    return FileResponse(DEMO_DIR / 'index.html')


@app.get('/mirror-config', include_in_schema=False)
def mirror_config():
    return {'sdk_version': SDK_VERSION,
            'module_url': f'/browser-runtime/{SDK_VERSION}/vision_bundle.mjs',
            'wasm_root': f'/browser-runtime/{SDK_VERSION}',
            'model_url': f'/mirror-model/{MODEL_SHA256}.task',
            'model_sha256': MODEL_SHA256,
            'hand_model_url': f'/mirror-hand-model/{hand_asset.MODEL_SHA256}.task',
            'hand_model_sha256': hand_asset.MODEL_SHA256,
            'face_model_url': f'/mirror-face-model/{face_asset.MODEL_SHA256}.task',
            'face_model_sha256': face_asset.MODEL_SHA256}


@app.get('/browser-runtime/{version}/{asset}', include_in_schema=False)
def browser_runtime(version: str, asset: str):
    if version != SDK_VERSION or asset not in RUNTIME_FILES:
        raise HTTPException(404, 'Arquivo de execução não encontrado.')
    path = RUNTIME_DIR / SDK_VERSION / asset
    if not path.is_file():
        raise HTTPException(503, 'Runtime local indisponível. Confira a preparação dos assets.')
    return FileResponse(path, media_type=RUNTIME_FILES[asset])


@app.get('/mirror-model/{checksum}.task', include_in_schema=False)
def mirror_model(checksum: str):
    if checksum != MODEL_SHA256:
        raise HTTPException(404, 'Modelo não encontrado.')
    try:
        path = verify_model(os.environ.get('POSE_MODEL_PATH', 'models/pose_landmarker_lite.task'))
    except (OSError, ValueError):
        raise HTTPException(503, 'Asset do modelo local indisponível.')
    return FileResponse(path, media_type='application/octet-stream', headers={'ETag': '"'+MODEL_SHA256+'"'})


@app.get('/mirror-hand-model/{checksum}.task', include_in_schema=False)
def mirror_hand_model(checksum: str):
    if checksum != hand_asset.MODEL_SHA256:
        raise HTTPException(404, 'Modelo não encontrado.')
    try:
        path = hand_asset.verify_model(os.environ.get('HAND_MODEL_PATH', 'models/hand_landmarker.task'))
    except (OSError, ValueError):
        raise HTTPException(503, 'Asset do modelo de mãos indisponível.')
    return FileResponse(path, media_type='application/octet-stream', headers={'ETag': '"'+hand_asset.MODEL_SHA256+'"'})


@app.get('/mirror-face-model/{checksum}.task', include_in_schema=False)
def mirror_face_model(checksum: str):
    if checksum != face_asset.MODEL_SHA256:
        raise HTTPException(404, 'Modelo não encontrado.')
    try:
        path = face_asset.verify_model(os.environ.get('FACE_MODEL_PATH', 'models/face_landmarker.task'))
    except (OSError, ValueError):
        raise HTTPException(503, 'Asset do modelo de rosto indisponível.')
    return FileResponse(path, media_type='application/octet-stream', headers={'ETag': '"'+face_asset.MODEL_SHA256+'"'})


@app.get('/health', tags=['Health'])
def health(request: Request):
    return {'status': 'ok', 'service': 'nonverbal-api', 'version': '0.1.0',
            'body_model_ready': getattr(request.app.state, 'engine', None) is not None,
            'face_model_available': getattr(request.app.state, 'face_model_available', False),
            'face_model_ready': getattr(request.app.state, 'face_engine', None) is not None}


@app.get('/v1/models', tags=['Models'])
def models(request: Request):
    return {'models': [{'id': 'mediapipe-pose-landmarker-lite-float16-v1', 'channel': 'body',
                        'ready': getattr(request.app.state, 'engine', None) is not None,
                        'sha256': MODEL_SHA256, 'experimental': True,
                        'returned_landmarks': 22, 'max_detected_poses': 2,
                        'supports': ['single_image_body_landmarks', 'wrist_shoulder_image_relation']},
                        {'id': 'mediapipe-face-landmarker-float16-v1', 'channel': 'face',
                             'ready': getattr(request.app.state, 'face_engine', None) is not None,
                             'asset_available': getattr(request.app.state, 'face_model_available', False),
                             'sha256': face_asset.MODEL_SHA256, 'experimental': True,
                             'supports': ['single_image_face_contours', 'opening_ratios']}],
            'vocal_algorithm': {'id':'pcm-autocorrelation-v1','supports':['wav_pcm16','rms_dbfs','pitch_periodicity','low_energy_intervals'],'learned_model':False},
            'unsupported_channels': ['video'],
            'notice': 'Disponibilidade técnica não significa validação da interpretação.'}


def analyze_image(engine, data, media_type):
    image, frame = decode_image(data, media_type)
    try:
        return engine.analyze(image, frame)
    finally:
        image.close()


@app.post('/v1/body/analyze', response_model=BodyResponse, tags=['Body'],
          summary='Detectar pontos corporais e observar posição relativa de punhos e ombros',
          responses={413: {'description': 'Mais de 2 MiB ou 4 milhões de pixels'},
                     415: {'description': 'Tipo diferente de JPEG/PNG'},
                     408: {'description': 'Tempo máximo de envio excedido'},
                     422: {'description': 'Imagem inválida, incompatível ou animada'},
                     429: {'description': 'Uma análise já está em andamento'},
                     503: {'description': 'Modelo indisponível ou resultado inválido'}},
          openapi_extra={'requestBody': {'required': True, 'content': {
              media: {'schema': {'type': 'string', 'format': 'binary'}} for media in ['image/jpeg', 'image/png']}}})
async def body(request: Request):
    return await handle_media_request(request, 'body')


@app.post('/v1/face/analyze', response_model=FaceResponse, tags=['Face'],
          summary='Contornos faciais e razões de abertura em uma imagem',
          responses={413:{'description':'Mais de 2 MiB ou 4 milhões de pixels'},415:{'description':'Formato diferente de JPEG/PNG'},
                     408:{'description':'Tempo máximo de envio excedido'},422:{'description':'Imagem inválida ou animada'},
                     429:{'description':'Uma análise corporal ou facial está em andamento'},503:{'description':'Modelo indisponível ou inválido'}},
          openapi_extra={'requestBody': {'required': True, 'content': {
              media: {'schema': {'type': 'string', 'format': 'binary'}} for media in ['image/jpeg', 'image/png']}}})
async def face(request: Request):
    return await handle_media_request(request, 'face')


def analyze_face_image(app, data, media_type):
    # Shared request limiter prevents concurrent loading/inference with either channel.
    image, frame = decode_image(data, media_type)
    try:
        if app.state.face_engine is None:
            app.state.face_engine = FaceEngine(app.state.face_model_path)
        return app.state.face_engine.analyze(image, frame)
    finally:
        image.close()


@app.post('/v1/vocal/analyze', response_model=VocalResponse, tags=['Vocal'],
          summary='Medidas acústicas em WAV PCM16, sem interpretação emocional',
          responses={408:{'description':'Envio excedeu 10 segundos'},413:{'description':'Mais de 8 MiB'},
                     415:{'description':'Tipo diferente de WAV'},422:{'description':'WAV incompatível, inválido ou acima de 30 s'},
                     429:{'description':'Uma análise já está em andamento'}},
          openapi_extra={'requestBody': {'required':True,'content':{media:{'schema':{'type':'string','format':'binary'}} for media in ['audio/wav','audio/x-wav']}}})
async def vocal(request: Request):
    return await handle_media_request(request, 'vocal')


async def handle_media_request(request: Request, channel: str):
    media_type = request.headers.get('content-type', '').split(';', 1)[0].strip().lower()
    allowed = {'audio/wav','audio/x-wav'} if channel=='vocal' else {'image/jpeg','image/png'}
    if media_type not in allowed:
        detail = 'Envie bytes WAV PCM16 com Content-Type audio/wav; não envie URL, base64 ou multipart.' if channel=='vocal' else 'Envie bytes JPEG ou PNG com Content-Type correspondente; não envie URL, base64 ou multipart.'
        raise HTTPException(415, detail)
    engine = getattr(request.app.state, 'engine', None)
    if channel == 'body' and engine is None:
        raise HTTPException(503, 'Modelo corporal indisponível.')
    if channel == 'face' and not getattr(request.app.state, 'face_model_available', False):
        raise HTTPException(503, 'Modelo facial indisponível.')
    slots = request.app.state.slots
    try:
        slots.acquire_nowait()
    except anyio.WouldBlock:
        raise HTTPException(429, 'Uma análise está em andamento. Tente novamente depois.', headers={'Retry-After': '1'})
    try:
        chunks = []
        size = 0
        try:
            with anyio.fail_after(MAX_UPLOAD_SECONDS):
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > (MAX_AUDIO_BYTES if channel=='vocal' else MAX_BYTES):
                        raise HTTPException(413, 'Áudio excede 8 MiB.' if channel=='vocal' else 'Imagem excede 2 MiB.')
                    chunks.append(chunk)
        except TimeoutError:
            raise HTTPException(408, 'Tempo máximo de envio da amostra excedido.')
        try:
            if channel == 'vocal':
                return await run_in_threadpool(analyze_wav, b''.join(chunks))
            if channel == 'face':
                return await run_in_threadpool(analyze_face_image, request.app, b''.join(chunks), media_type)
            return await run_in_threadpool(analyze_image, engine, b''.join(chunks), media_type)
        except InvalidAudio as exc:
            raise HTTPException(422, str(exc))
        except ImageTooLarge:
            raise HTTPException(413, 'Imagem excede os limites de bytes ou pixels.')
        except InvalidImage:
            raise HTTPException(422, 'Imagem inválida, incompatível com o Content-Type ou animada.')
        except (InvalidModelResult, RuntimeError, ValueError, OSError):
            raise HTTPException(503, 'Não foi possível obter um resultado válido do modelo.')
    finally:
        slots.release()
