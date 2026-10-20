# Local recommendations with SQLite materialization

Recommendations are experimental and **off by default**. Signed-in users can enable **为你推荐** from the **实验功能** menu; the toggle follows the account in SQLite. Disabling restores the ordinary feed, blocks recommendation APIs/model loading, stops interaction capture and removes the account’s stored recommendation interactions. The local interest profile remains on the device for a later opt-in. Latest, reply/like/view sorting, hot and featured feeds remain available. Guests continue to see announcements only.

The supplied scratch document is implemented with the forum's existing `threads` table rather than a second `posts` table. There is no server encoder, personalized request-time scoring, training process, Python service or external recommendation database.

## Why computation runs in the browser

Deployment server specifications (CPU, memory and available capacity) were not provided. Encoding, personal profile updates and ranking therefore run on the client to reduce server load and avoid assuming server inference capacity. This is a deployment constraint, not a benchmark claim that browser computation is universally faster. Server recommendation computation stays in SQLite/`sqlite-vec`; the separate refresh process only orchestrates bounded SQL work. Measure and tune refresh schedules on the actual server before increasing workload limits.

## Runtime boundary

| Work | Where it runs |
| --- | --- |
| Mixed INT4/INT8 BGE encoding at publication | Browser Web Worker, 256 tokens, CLS pooling and L2 normalization |
| Format/dimension/norm/version validation | Constant-size request validation; 512 floats |
| Vector storage, interaction capture, candidate/edge lookup | SQLite; bounded inserts and indexed scans |
| Semantic cosine Top-50 and ItemCF | Separate Node command orchestrating SQLite/`sqlite-vec` statements |
| Profile, keyword matching, recall weighting, fusion and LinUCB | Browser; no profile or bandit parameters uploaded |

The Chinese encoder is **BAAI/bge-small-zh-v1.5**, with **512-dimensional** output and normalized CLS pooling. Offline artifact preparation exports it and applies HQQ INT4 linear weights (block size 64) plus row-wise INT8 embedding tables. The standalone ONNX file is **19,211,227 bytes (19.21 MB)**, below 20,000,000 bytes, with no external weight sidecar. Tokenizer/configuration, checksum, MIT license and the six-Chinese-sentence FP32 comparison are included in `public/models/bge-small-zh-v1.5-q4-v1/`. Cosine agreement in that sanity check is 0.961–0.968; this is not a retrieval benchmark or accuracy guarantee.

`npm run dev` and `npm run build` generate the worker and copy ONNX WASM assets from installed npm packages into the ignored `public/recommendation-runtime/`. Serve `public/` with the deployment. Model, tokenizer and runtime requests remain same-origin; there is no CDN or inference API. Transformers.js is bundled into the same-origin worker by esbuild, not imported from a CDN. Versioned model assets use immutable HTTP caching; the local worker/WASM runtime uses a one-hour cache. The model is lazy-loaded only after opt-in, on posting or an explicit author backfill, and Transformers.js caches it in the browser. Browsing never initializes the encoder. WASM uses two threads when cross-origin isolation supports them, otherwise one; enabling isolation globally is not required.

Transformers.js and the bundler are development dependencies: install build dependencies before building, then retain the generated public assets when pruning production dependencies. The running web server needs `sqlite-vec`, not an installed encoder runtime.

Encoding failure falls back to a normal post without a vector. Retrying an unchanged draft reuses the vector. The post and vector are stored atomically. Invalid vectors are rejected; normalized vectors with another model version go into a seven-day quarantine. Only the configured version enters `vec_posts` or feed responses. Changing the configured version rebuilds the active vector partition. A prior 384-dimensional database is upgraded atomically to a 512-dimensional vector table; incompatible derived vectors and semantic edges are discarded for re-encoding, while threads and account settings are retained. Editing or deleting a post invalidates its vector and semantic edges; deletion also clears interaction and CF references.

## Serving and local ranking

`GET /api/recommendations` requires an approved session and returns at most 1,000 recent posts with current vectors. Up to 100 local seed IDs request their materialized Top-50 edges per source. The browser weights those edges and can retrieve up to 300 additional older targets with `?ids=...`; that endpoint only performs primary-key lookups. Thus the local pool stays at most 1,300 items. No server query scores a user's interests. Anonymous author identity is removed from the JSON projection, and banned/unapproved authors are excluded. No other user's interaction history is returned.

The device profile is keyed by account ID and model version. It retains at most 200 recent signals for 90 days, board choices, up to 500 dismissed posts and a six-dimensional LinUCB state. Storage unavailable/corrupt/version-mismatched profiles fall back to a fresh profile. A ten-day half-life weights views, visible dwell, confirmed likes, replies and bookmarks. The local user vector is normalized; a Top-50 keyword profile uses Latin terms and Chinese bigrams with BM25 candidate matching.

Initial fusion weights are semantic **0.40**, ItemCF **0.20**, freshness **0.14**, heat **0.10**, board affinity **0.10** and keywords **0.06**. All features are bounded. LinUCB uses a ridge prior, a 6×6 inverse matrix, Sherman–Morrison feedback updates and an uncertainty bonus. Opening a recommendation, 15 seconds of visible reading, positive actions and “not interested” update the local policy. Pinned posts receive a priority boost. Results stay stable while reading, changing on the next feed visit or a deliberate preference change.

Cold start uses freshness, heat and uncertainty until interests accumulate. **推荐偏好** lets users choose boards locally, reset this device's profile, or explicitly encode their own historical posts (up to 80 per run; repeat to continue). Existing unencoded posts remain eligible through the nonsemantic signals. Historical backfill is author-only and runs in the browser; there is no automatic encoder work during browsing. If the feed API fails, the server-rendered recent discussion list remains usable.

Views are deduplicated locally and batched to a same-origin authenticated endpoint, with an hourly SQLite upsert per user/post. The endpoint cannot accept strong actions. SQLite triggers derive likes, replies and bookmarks from committed forum operations for opted-in accounts; unlike/unfavorite removes those current signals. CF counts distinct users per item pair, requires two shared users, emits both directions and retains Top-50 per item. It uses a 90-day window and at most 200 distinct strong items per user to bound the self-join. The expensive join writes TEMP storage before an atomic publication transaction, so it does not hold the main database write lock throughout the join. WAL still permits only one writer; full refreshes should run off-peak.

## Running materialization

Use Node **22.18+** (verified with Node 24), the same data directory as the application, and the installed `sqlite-vec` platform package. Run the app once to initialize its schema. No Python or separate DB service is needed.

```sh
# One bounded incremental batch (20 vectors); CF also refreshes if a week has elapsed.
npm run recommendations:refresh

# Drain a complete semantic rebuild and force an ItemCF refresh.
npm run recommendations:refresh -- --full --cf

# Separate supervised process: incremental work each minute,
# a full semantic refresh daily at 03:00 UTC, and ItemCF weekly.
npm run recommendations:worker
```

Set `HSFZ_DATA_DIR` for a nondefault database location. Run one supervised refresh worker per database. The web process does not start a background timer or compute similarities during requests. The worker is supplied, not installed as an operating-system service by this change. A scheduler can instead invoke the one-shot commands at the desired times. All connections that mutate the recommendation-enabled schema must load `sqlite-vec`; the app and refresh command do so automatically before schema changes.

`recommendation_jobs` records durations, row counts and completion times; the command prints the five latest runs and pending-vector count. Full-refresh and request-scale latency should be measured on the deployment hardware; the scratch document's 100k-vector latency estimates are not treated as measured guarantees. Above roughly 100k–200k posts, or when refresh windows become unacceptable, re-evaluate storage. This implementation retains SQLite as requested.

## Verification

- `npm test`: nine recommendation tests on disposable SQLite databases. Covers cosine and ItemCF materialization, deduplication, symmetric recall, Top-50 limits, version quarantine, invalidation, anonymous exports, indexed candidates, local negative feedback/bandit updates, account opt-in/out and a 384-to-512 migration preserving real thread/account data.
- `npm run build`: generates the same-origin encoder/WASM assets, validates the model size/checksum and compiles the existing upstream interface with the recommendation hooks. The changed recommendation modules pass ESLint. The unchanged upstream main has existing full-repository lint errors in admin/profile tab components, avatar/theme effects and an internal anchor; the separate interface PR addresses them.
- Independent branch browser smoke checks cover authentication, the account menu, opt-in/out, actual ranked results and 320/390/768/1440 pixel layouts.
- The complete integrated app passes 28 backend/editor tests and 20 browser scenarios, including actual ONNX inference: 512 finite unit values, Chinese semantic discrimination, 256-token truncation, same-origin requests across page/worker network sessions, lazy loading, author-only ingestion, input/CSRF rejection, vector-bearing publication and the refresh command. Optional browser drivers, visual tools and screenshots remain local; they are not deployable app dependencies.

The recommendation switch has a 52×30 pixel track in a 60×44 pixel hit target, an accessible stable name, checked state, pending feedback and keyboard focus. Integrated visual inspection at 390/768/1440 pixels reported no failures. A single setting retains its natural height rather than stretching to fill the desktop. Toolbar and compact action overflow is covered by the separate interface PR.

Implementation references: [sqlite-vec Node loading](https://alexgarcia.xyz/sqlite-vec/js.html), [cosine KNN](https://alexgarcia.xyz/sqlite-vec/features/knn.html), [Transformers.js local models](https://huggingface.co/docs/transformers.js/custom_usage), and the [BGE model card](https://huggingface.co/BAAI/bge-small-zh-v1.5).


## Model artifact preparation

The quantized artifact is included; normal app builds never execute Python. Offline quantization tools, original checkpoints and local virtual environments are deliberately excluded from Git. The artifact manifest records the version, dimensions, quantization format, size, license and SHA-256 checksum. Validation compares normalized CLS output against evaluation-mode FP32 embeddings on six Chinese sentences; it is a sanity check rather than a retrieval benchmark.
