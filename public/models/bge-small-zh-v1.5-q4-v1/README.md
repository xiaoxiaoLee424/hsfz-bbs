# Local BGE Chinese encoder

Source: [BAAI/bge-small-zh-v1.5](https://huggingface.co/BAAI/bge-small-zh-v1.5), supplied in `../bge-small-zh-v1.5`. Released under the MIT license.

Outputs 512-dimensional, L2-normalized CLS embeddings. Input is the post title and leading body text, truncated to 256 tokens; no retrieval-query instruction is prepended to posts.

`onnx/model_q4.onnx` is 19,211,227 bytes (19.21 MB), below the strict 20,000,000-byte limit. Linear weights use HQQ INT4 blocks of 64; embedding tables use row-wise INT8. Only selected embedding rows are dequantized during inference. The model has no external weight-data sidecar.

Offline artifact preparation exports and quantizes the source weights, checks the ONNX file size and compares Chinese CLS embeddings to the original evaluation-mode model before publishing the artifact atomically. `manifest.json` records its checksum. `validation.json` contains six-sentence sanity results (cosines to FP32 around 0.961–0.968); these are not a retrieval benchmark or an accuracy percentage.

The application loads the model, tokenizer, bundled Transformers.js worker and ONNX WASM assets from its own server. No server inference or external model/CDN download is used.
