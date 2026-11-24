// Explicit setup/build step. Original SDK files remain unmodified and are served locally.
import {createRequire} from 'node:module';
import {readFile, mkdir, copyFile, writeFile} from 'node:fs/promises';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const source = dirname(require.resolve('@mediapipe/tasks-vision'));
const meta = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
if (meta.version !== '0.10.32' || meta.license !== 'Apache-2.0') throw new Error('Unexpected browser runtime version or license');
const argument = process.argv.indexOf('--output');
const output = argument === -1 ? join(root, 'app', 'browser-runtime') : resolve(process.argv[argument + 1]);
const target = join(output, meta.version);
await mkdir(target, {recursive:true});
await copyFile(join(source,'vision_bundle.mjs'), join(target,'vision_bundle.mjs'));
for (const name of ['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm']) {
  await copyFile(join(source,'wasm',name), join(target,name));
}
await copyFile(join(root,'licenses','mediapipe-APACHE-2.0.txt'), join(target,'Apache-2.0.txt'));
await writeFile(join(target,'NOTICE.txt'), 'MediaPipe Tasks Vision '+meta.version+'\nPublished by Google / MediaPipe, mediapipe@google.com.\nLicense declared by the original package: Apache-2.0.\nOriginal runtime files copied without modification from @mediapipe/tasks-vision.\nSource: https://www.npmjs.com/package/@mediapipe/tasks-vision/v/'+meta.version+'\nThe pose model is a separate asset; see the project model documentation for its provenance.\n');
console.log('Prepared same-origin browser runtime '+meta.version);
