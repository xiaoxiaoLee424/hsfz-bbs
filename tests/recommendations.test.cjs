const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),ts=require('typescript');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hsfz-rec-test-'));process.env.HSFZ_DATA_DIR=temp;
const root=path.resolve(__dirname,'..'),original=Module._resolveFilename;
Module._resolveFilename=function(s,...args){return original.call(this,s.startsWith('@/')?path.join(root,s.slice(2)):s,...args)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=function(m,f){m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)};
const {db}=require('../lib/db.ts');
const {MODEL_VERSION}=require('../lib/recommendation/config.ts');
const {parseEmbedding,saveEmbedding,refreshSemantic,refreshCollaborative}=require('../lib/recommendation/store.ts');
const {candidatePool,similarityEdges,recordViews}=require('../lib/recommendation/server.ts');
const {initializeRecommendations}=require('../lib/recommendation/schema.ts');
const {emptyProfile,remember,rankCandidates,learn,recallIds}=require('../lib/recommendation/rank.ts');
const users=db.prepare("SELECT id FROM users WHERE status='approved' AND banned=0 LIMIT 3").all();
const {setRecommendationsEnabled,recommendationsEnabled}=require('../lib/experiments.ts');
for(const user of users)setRecommendationsEnabled(user.id,true);
const board=db.prepare("SELECT id FROM boards WHERE slug='study'").get().id;
const post=(title='推荐测试')=>Number(db.prepare("INSERT INTO threads(author_id,board_id,title,content,created_at,last_reply_at) VALUES(?,?,?,'数学与物理讨论',datetime('now','localtime'),datetime('now','localtime'))").run(users[0].id,board,title).lastInsertRowid);
const vector=(axis=0)=>{const v=new Float32Array(512);v[axis]=1;return Buffer.from(v.buffer).toString('base64')};
const put=(id,v=vector())=>db.transaction(()=>saveEmbedding(db,id,parseEmbedding(v,MODEL_VERSION)))();
after(()=>{db.close();fs.rmSync(temp,{recursive:true,force:true})});

test('feedback accepts a preserved public Host behind TLS proxy and rejects cross-origin or oversized bodies',async()=>{
  const {sameOrigin,boundedJson}=require('../lib/recommendation/http.ts');
  const proxied=new Request('http://127.0.0.1:3000/api/recommendations/feedback',{headers:{Host:'forum.example',Origin:'https://forum.example'}});
  assert.equal(sameOrigin(proxied),true);
  assert.equal(sameOrigin(new Request(proxied,{headers:{Host:'forum.example',Origin:'https://evil.example'}})),false);
  assert.equal(sameOrigin(new Request(proxied,{headers:{Host:'forum.example'}})),false);
  const body=new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:'a'.repeat(9000)})});
  await assert.rejects(boundedJson(body));
});

test('embedding validation rejects wrong dimensions, NaN, infinity, zero norm and invalid versions; mismatches quarantine',()=>{
  for(const v of ['bad',Buffer.alloc(1536).toString('base64'),Buffer.alloc(100).toString('base64')])assert.throws(()=>parseEmbedding(v,MODEL_VERSION));
  for(const value of [NaN,Infinity]){const v=new Float32Array(512);v[0]=value;assert.throws(()=>parseEmbedding(Buffer.from(v.buffer).toString('base64'),MODEL_VERSION));}
  assert.throws(()=>parseEmbedding(vector(),'../unsafe'));
  const id=post();db.transaction(()=>saveEmbedding(db,id,parseEmbedding(vector(),'old-model')))();
  assert.equal(db.prepare('SELECT 1 FROM vec_posts WHERE post_id=?').get(id),undefined);
  assert.ok(db.prepare('SELECT 1 FROM vector_quarantine WHERE post_id=?').get(id));
  put(id);assert.equal(db.prepare('SELECT 1 FROM vector_quarantine WHERE post_id=?').get(id),undefined);
  assert.equal(db.prepare('SELECT length(embedding) n FROM post_vectors WHERE post_id=?').get(id).n,2048);
});
test('semantic materialization uses cosine, excludes self/negative edges and maintains bounded reverse neighbors',()=>{
  const a=post(),b=post(),c=post();put(a);put(b);put(c,vector(1));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM item_similarity').get().n,0,'posting never computes scores');
  refreshSemantic(db,100);
  const edges=similarityEdges([a]);assert.ok(edges.some(e=>e.similar_id===b&&e.score>0.999));
  assert.ok(!edges.some(e=>e.similar_id===a||e.similar_id===c));
  assert.ok(similarityEdges([b]).some(e=>e.similar_id===a));
  for(let i=0;i<55;i++)put(post());refreshSemantic(db,100);
  assert.ok(db.prepare("SELECT COUNT(*) n FROM item_similarity WHERE post_id=? AND source='vec'").get(a).n<=50);
  assert.equal(db.prepare("SELECT post_id FROM item_similarity WHERE source='vec' GROUP BY post_id HAVING COUNT(*)>50").get(),undefined);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM recommendation_dirty').get().n,0);
});
test('ItemCF counts each user once, requires two users, emits both directions and reflects unlikes',()=>{
  db.exec('DELETE FROM user_interactions; DELETE FROM item_similarity;');
  const a=post(),b=post(),c=post();
  for(const user of users.slice(0,2))for(const id of [a,b]) {
    db.prepare('INSERT INTO thread_likes(user_id,thread_id) VALUES(?,?)').run(user.id,id);
    db.prepare('INSERT INTO thread_favorites(user_id,thread_id) VALUES(?,?)').run(user.id,id);
  }
  db.prepare('INSERT INTO thread_likes(user_id,thread_id) VALUES(?,?)').run(users[0].id,c);
  refreshCollaborative(db);
  assert.equal(similarityEdges([a]).find(e=>e.similar_id===b&&e.source==='cf').score,1);
  assert.equal(similarityEdges([b]).find(e=>e.similar_id===a&&e.source==='cf').score,1);
  assert.ok(!similarityEdges([a]).some(e=>e.similar_id===c));
  db.prepare('DELETE FROM thread_likes WHERE user_id=? AND thread_id=?').run(users[1].id,b);
  db.prepare('DELETE FROM thread_favorites WHERE user_id=? AND thread_id=?').run(users[1].id,b);
  refreshCollaborative(db);assert.ok(!similarityEdges([a]).some(e=>e.similar_id===b));
});
test('edits/deletion invalidate vectors and edges; model changes rebuild the current partition only',()=>{
  const a=post(),b=post();put(a);put(b);refreshSemantic(db,100);
  db.prepare("UPDATE threads SET title='已修改' WHERE id=?").run(a);
  assert.equal(db.prepare('SELECT 1 FROM post_vectors WHERE post_id=?').get(a),undefined);
  assert.equal(db.prepare('SELECT 1 FROM recommendation_dirty WHERE post_id=?').get(a),undefined);
  assert.ok(!similarityEdges([b]).some(e=>e.similar_id===a));
  put(a);db.prepare("UPDATE post_vectors SET model_version='old-model' WHERE post_id=?").run(a);
  db.prepare("UPDATE recommendation_meta SET value='old-model' WHERE key='active-model'").run();
  initializeRecommendations(db);
  assert.equal(db.prepare('SELECT 1 FROM vec_posts WHERE post_id=?').get(a),undefined);
  assert.ok(db.prepare('SELECT 1 FROM vec_posts WHERE post_id=?').get(b));
  db.prepare('DELETE FROM threads WHERE id=?').run(b);
  assert.equal(db.prepare('SELECT 1 FROM vec_posts WHERE post_id=?').get(b),undefined);
  assert.equal(db.prepare('SELECT 1 FROM post_vectors WHERE post_id=?').get(b),undefined);
});
test('candidate exports hide anonymous identity, never export private interactions, and bound indexed scans',()=>{
  const id=post('匿名测试');db.prepare('UPDATE threads SET anonymous=1 WHERE id=?').run(id);
  const pool=candidatePool();const anon=pool.find(p=>p.id===id);
  assert.equal(anon.author_id,0);assert.equal(anon.author_username,'');assert.equal(anon.author_avatar,'');
  assert.ok(pool.length<=1000);assert.ok(!('user_id' in anon));
  recordViews(users[0].id,[id,id,999999]);recordViews(users[0].id,[id]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_interactions WHERE user_id=? AND post_id=? AND action=1').get(users[0].id,id).n,1);
  const plan=db.prepare('EXPLAIN QUERY PLAN SELECT id FROM threads ORDER BY created_at DESC,id DESC LIMIT 1000').all();
  assert.ok(plan.some(row=>row.detail.includes('recommendation_time')));
});
test('local fusion handles cold start, semantic and CF recall, sections, negatives and bounded bandit learning',()=>{
  const base=candidatePool()[0],now=Date.now();
  const a={...base,id:9001,is_pinned:0,board_id:1,title:'physics orbit',content:'space physics orbital mechanics',vector:vector(),created_at:'2026-10-20 12:00:00'};
  const b={...a,id:9002,board_id:2,title:'music piano',content:'classical piano concert',vector:vector(1)};
  let local=emptyProfile();assert.equal(rankCandidates([a,b],[],local,now).length,2);
  local=remember(local,{id:8999,board:1,action:'bookmark',at:now,vector:vector(),text:'physics orbit space'});
  let ranked=rankCandidates([a,b],[],local,now);assert.equal(ranked[0].post.id,a.id);
  assert.ok(ranked[0].features[0]>0.99);assert.ok(ranked[0].features[5]>0);
  const cf=rankCandidates([a,b],[{post_id:8999,similar_id:b.id,score:1,source:'cf'}],local,now);
  assert.ok(cf.find(x=>x.post.id===b.id).features[1]>0.8);
  assert.deepEqual(recallIds([{post_id:8999,similar_id:123,score:1,source:'cf'}],local,new Set([a.id,b.id]),now),[123]);
  const learned=learn(local,ranked[0].features,1);assert.notDeepEqual(learned.inverse,local.inverse);
  for(let i=0;i<200;i++)local=learn(local,ranked[0].features,1);
  assert.ok(local.weights.every(Number.isFinite));assert.ok(local.inverse.flat().every(Number.isFinite));
  local.hidden=[a.id];assert.deepEqual(rankCandidates([a,b],[],local,now).map(x=>x.post.id),[b.id]);
  local=remember(local,{id:9000,board:2,action:'view',at:now-91*86400000});
  local=remember(local,{id:9003,board:2,action:'view',at:now});assert.ok(!local.events.some(e=>e.id===9000));
});


test('Experimental recommendation opt-in persists, stops recording when off, and preserves forum actions',()=>{
 const user=users[2].id,id=post();
 setRecommendationsEnabled(user,false);assert.equal(recommendationsEnabled(user),false);
 recordViews(user,[id]);
 db.prepare('INSERT INTO thread_likes(user_id,thread_id) VALUES(?,?)').run(user,id);
 assert.equal(db.prepare('SELECT 1 FROM user_interactions WHERE user_id=? AND post_id=?').get(user,id),undefined);
 setRecommendationsEnabled(user,true);assert.equal(recommendationsEnabled(user),true);
 assert.ok(db.prepare('SELECT 1 FROM user_interactions WHERE user_id=? AND post_id=? AND action=2').get(user,id));
 setRecommendationsEnabled(user,false);
 assert.equal(db.prepare('SELECT 1 FROM user_interactions WHERE user_id=?').get(user),undefined);
 assert.ok(db.prepare('SELECT 1 FROM thread_likes WHERE user_id=? AND thread_id=?').get(user,id));
});


test('384-dimensional databases migrate derived vectors atomically without losing threads or account settings',async()=>{
 const {spawnSync}=require('node:child_process');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hsfz-rec-upgrade-'));
 try {
  await db.backup(path.join(folder,'bbs.db'));
  const legacy=new (require('better-sqlite3'))(path.join(folder,'bbs.db'));require('sqlite-vec').load(legacy);
  const count=legacy.prepare('SELECT COUNT(*) n FROM threads').get().n;
  legacy.exec(`DROP TRIGGER recommendation_thread_deleted;DROP TRIGGER recommendation_thread_edited;
   DROP TABLE vec_posts;DROP TABLE post_vectors;
   CREATE TABLE post_vectors(post_id INTEGER PRIMARY KEY,embedding BLOB CHECK(length(embedding) = 1536),model_version TEXT,updated_at INTEGER DEFAULT 0);
   CREATE VIRTUAL TABLE vec_posts USING vec0(post_id INTEGER PRIMARY KEY,embedding FLOAT[384] distance_metric=cosine);`);
  legacy.prepare("INSERT INTO post_vectors VALUES(1,?,'minilm-l6-v2-int8-v1',0)").run(Buffer.alloc(1536));legacy.close();
  const code=`const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),path=require('node:path');
   const root=${JSON.stringify(root)},resolve=Module._resolveFilename;
   Module._resolveFilename=function(s,...args){return resolve.call(this,s.startsWith('@/')?path.join(root,s.slice(2)):s,...args)};
   require.extensions['.ts']=function(m,f){m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f)};
   const {db}=require(path.join(root,'lib/db.ts'));
   console.log(JSON.stringify({threads:db.prepare('SELECT COUNT(*) n FROM threads').get().n,vectors:db.prepare('SELECT COUNT(*) n FROM post_vectors').get().n,
    schema:db.prepare("SELECT sql FROM sqlite_master WHERE name='vec_posts'").get().sql,enabled:db.prepare('SELECT COUNT(*) n FROM user_experiments WHERE recommendations_enabled=1').get().n}));db.close();`;
  const child=spawnSync(process.execPath,['-e',code],{encoding:'utf8',cwd:root,env:{...process.env,HSFZ_DATA_DIR:folder}});
  assert.equal(child.status,0,child.stderr);const result=JSON.parse(child.stdout.trim());
  assert.equal(result.threads,count);assert.equal(result.vectors,0);assert.match(result.schema,/FLOAT\[512\]/);assert.ok(result.enabled>0);
 }finally{fs.rmSync(folder,{recursive:true,force:true})}
});
