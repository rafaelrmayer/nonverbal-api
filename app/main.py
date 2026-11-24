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
from app.model_asset import MODEL_SHA256
from app.pose import PoseEngine, InvalidModelResult
from app.schemas import BodyResponse

MAX_UPLOAD_SECONDS = 10


@asynccontextmanager
async def lifespan(app):
    app.state.engine = None
    app.state.slots = anyio.CapacityLimiter(1)
    path = os.environ.get('POSE_MODEL_PATH', 'models/pose_landmarker_lite.task')
    try:
        app.state.engine = PoseEngine(path)
    except Exception:
        # Fixed message: no paths, image bytes, filenames or request contents in logs.
        logging.getLogger(__name__).warning('Modelo corporal indisponível; confira instalação e hash do asset.')
    yield
    if app.state.engine is not None:
        app.state.engine.close()
        app.state.engine = None


app = FastAPI(title='Nonverbal API', version='0.1.0', lifespan=lifespan,
              description='Protótipo de observações geométricas corporais em uma imagem. Não infere emoção, intenção, atenção ou diagnóstico. Sem análise facial, vocal ou temporal nesta versão.')

DEMO_DIR = Path(__file__).resolve().parent / 'demo'
app.mount('/demo-assets', StaticFiles(directory=DEMO_DIR), name='demo-assets')


@app.middleware('http')
async def no_cache(request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    if request.url.path == '/' or request.url.path.startswith('/demo-assets/'):
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Permissions-Policy'] = 'camera=(self), microphone=(), geolocation=()'
        response.headers['Content-Security-Policy'] = (
            "default-src 'none'; script-src 'self'; style-src 'self'; "
            "img-src 'self' blob: data:; media-src 'self' blob: mediastream:; "
            "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        )
    return response


@app.get('/', include_in_schema=False)
def demo():
    return FileResponse(DEMO_DIR / 'index.html')


@app.get('/health', tags=['Health'])
def health(request: Request):
    return {'status': 'ok', 'service': 'nonverbal-api', 'version': '0.1.0',
            'body_model_ready': getattr(request.app.state, 'engine', None) is not None}


@app.get('/v1/models', tags=['Models'])
def models(request: Request):
    return {'models': [{'id': 'mediapipe-pose-landmarker-lite-float16-v1', 'channel': 'body',
                        'ready': getattr(request.app.state, 'engine', None) is not None,
                        'sha256': MODEL_SHA256, 'experimental': True,
                        'returned_landmarks': 22, 'max_detected_poses': 2,
                        'supports': ['single_image_body_landmarks', 'wrist_shoulder_image_relation']}],
            'unsupported_channels': ['facial', 'vocal', 'video'],
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
    media_type = request.headers.get('content-type', '').split(';', 1)[0].strip().lower()
    if media_type not in {'image/jpeg', 'image/png'}:
        raise HTTPException(415, 'Envie bytes JPEG ou PNG com Content-Type correspondente; não envie URL, base64 ou multipart.')
    engine = getattr(request.app.state, 'engine', None)
    if engine is None:
        raise HTTPException(503, 'Modelo corporal indisponível.')
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
                    if size > MAX_BYTES:
                        raise HTTPException(413, 'Imagem excede 2 MiB.')
                    chunks.append(chunk)
        except TimeoutError:
            raise HTTPException(408, 'Tempo máximo de envio da imagem excedido.')
        try:
            return await run_in_threadpool(analyze_image, engine, b''.join(chunks), media_type)
        except ImageTooLarge:
            raise HTTPException(413, 'Imagem excede os limites de bytes ou pixels.')
        except InvalidImage:
            raise HTTPException(422, 'Imagem inválida, incompatível com o Content-Type ou animada.')
        except (InvalidModelResult, RuntimeError, ValueError):
            raise HTTPException(503, 'Não foi possível obter um resultado válido do modelo.')
    finally:
        slots.release()
