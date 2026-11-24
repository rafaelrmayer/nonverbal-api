"""Fixed browser runtime paths. No arbitrary files or request URLs are accepted."""
from pathlib import Path

SDK_VERSION = '0.10.32'
RUNTIME_DIR = Path(__file__).resolve().parent / 'browser-runtime'
RUNTIME_FILES = {
    'vision_bundle.mjs': 'text/javascript',
    'vision_wasm_internal.js': 'text/javascript',
    'vision_wasm_internal.wasm': 'application/wasm',
    'vision_wasm_nosimd_internal.js': 'text/javascript',
    'vision_wasm_nosimd_internal.wasm': 'application/wasm',
    'Apache-2.0.txt': 'text/plain',
    'NOTICE.txt': 'text/plain',
}
