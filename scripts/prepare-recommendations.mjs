import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MODEL_VERSION, DIMENSIONS } from '../lib/recommendation/config.ts';
const modelRoot = `public/models/${MODEL_VERSION}`;
const manifest = JSON.parse(readFileSync(`${modelRoot}/manifest.json`,'utf8'));
const model = `${modelRoot}/onnx/model_q4.onnx`;
if (manifest.version !== MODEL_VERSION || manifest.dimensions !== DIMENSIONS || statSync(model).size >= 20_000_000 ||
    createHash('sha256').update(readFileSync(model)).digest('hex') !== manifest.sha256) {
  throw new Error('The local BGE model must match its version/checksum, output dimensions, and stay below 20 MB.');
}
const destination = 'public/recommendation-runtime';
mkdirSync(destination,{recursive:true});
await build({entryPoints:['lib/recommendation/encoder.worker.ts'],outfile:`${destination}/encoder.js`,bundle:true,format:'esm',platform:'browser',minify:true,target:'es2022',define:{'process.env.NODE_ENV':'"production"'}});
for(const file of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm']) {
  cpSync(`node_modules/onnxruntime-web/dist/${file}`,`${destination}/${file}`);
}
