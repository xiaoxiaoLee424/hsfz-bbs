// Deployment CPU/RAM capacity is unspecified. Encode in the browser to reduce server load;
// the server validates vectors and materializes candidates only through SQLite/SQLite-vec.
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { MODEL_VERSION, MAX_TOKENS } from "./config";
// All assets are same-origin; the browser never contacts a model host or inference API.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.backends.onnx.wasm!.wasmPaths = "/recommendation-runtime/";
// SharedArrayBuffer is unavailable without cross-origin isolation. Two threads where supported.
env.backends.onnx.wasm!.numThreads = globalThis.crossOriginIsolated ? 2 : 1;
const loadEncoder = pipeline as (task:"feature-extraction",model:string,options:object)=>Promise<FeatureExtractionPipeline>;
let encoder: Promise<FeatureExtractionPipeline> | undefined;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{id:number;text:string}>) => {
  queue = queue.then(async () => {
    try {
      encoder ??= loadEncoder("feature-extraction",MODEL_VERSION,{dtype:"q4",device:"wasm",local_files_only:true});
      const model = await encoder;
      model.tokenizer.model_max_length = MAX_TOKENS;
      const output = await model(event.data.text,{pooling:"cls",normalize:true});
      self.postMessage({id:event.data.id,vector:Array.from(output.data as Float32Array),version:MODEL_VERSION});
    } catch {
      encoder=undefined;
      self.postMessage({id:event.data.id,error:"暂时无法准备推荐特征"});
    }
  });
};
