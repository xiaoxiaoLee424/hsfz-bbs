import { DIMENSIONS, HALF_LIFE_DAYS, INITIAL_WEIGHTS, MODEL_VERSION } from "./config";
import type { Candidate, Similarity } from "./server";
export type Features = number[];
export type LocalEvent = {id:number;board:number;action:string;at:number;vector?:string;text?:string};
export type LocalProfile = {
  version:string; events:LocalEvent[]; sections:number[]; hidden:number[];
  inverse:number[][]; weights:number[]; pending?:{id:number;features:Features};
};
export function emptyProfile(): LocalProfile {
  return {version:MODEL_VERSION,events:[],sections:[],hidden:[],inverse:INITIAL_WEIGHTS.map((_,i)=>INITIAL_WEIGHTS.map((_,j)=>i===j?1:0)),weights:[...INITIAL_WEIGHTS]};
}
export function decodeVector(encoded: string | null): Float32Array | null {
  if(!encoded)return null;
  try {
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    if(bytes.byteLength!==DIMENSIONS*4)return null;
    const vector=new Float32Array(bytes.buffer);
    return vector.every(Number.isFinite)?vector:null;
  } catch { return null; }
}
function tokens(value:string): string[] {
  const lower=value.toLowerCase();
  const latin=lower.match(/[a-z0-9]{2,}/g)??[];
  const chinese=lower.match(/[\u3400-\u9fff]+/g)??[];
  return [...latin,...chinese.flatMap(word=>word.length===1?[word]:Array.from({length:word.length-1},(_,i)=>word.slice(i,i+2)))].slice(0,300);
}
const strengths:Record<string,number>={view:0.2,dwell:0.6,like:1,reply:1.5,bookmark:2};
const dot=(a:ArrayLike<number>,b:ArrayLike<number>)=>{let n=0;for(let i=0;i<a.length;i++)n+=a[i]*b[i];return n;};
const decay=(at:number,now:number)=>Math.exp(-Math.LN2*Math.max(0,now-at)/86400000/HALF_LIFE_DAYS);
/** Ridge LinUCB with a static prior. Sherman-Morrison update, six bounded features, entirely local. */
export function learn(profile:LocalProfile,features:Features,reward:number): LocalProfile {
  if(features.length!==6||features.some(x=>!Number.isFinite(x)))return profile;
  const projected=profile.inverse.map(row=>dot(row,features));
  const denominator=1+dot(features,projected);
  return {...profile,
    inverse:profile.inverse.map((row,i)=>row.map((value,j)=>value-projected[i]*projected[j]/denominator)),
    weights:profile.weights.map((value,i)=>value+Math.max(-1,Math.min(1,reward))*features[i]),
  };
}
export function remember(profile:LocalProfile,event:LocalEvent,now=Date.now()):LocalProfile {
  return {...profile,events:[...profile.events.filter(e=>!(e.id===event.id&&e.action===event.action)&&e.at>now-90*86400000),event].slice(-200)};
}
/** Client recall may fetch older edge targets by ID; the server never weights a user's seeds. */
export function recallIds(edges:Similarity[],profile:LocalProfile,known:Set<number>,now=Date.now()):number[] {
  const weights=new Map<number,number>();
  for(const event of profile.events) {
    const weight=(strengths[event.action]??0)*decay(event.at,now);
    weights.set(event.id,Math.max(weights.get(event.id)??0,weight));
  }
  const scores=new Map<number,number>();
  for(const edge of edges)if(!known.has(edge.similar_id)&&!profile.hidden.includes(edge.similar_id)) {
    scores.set(edge.similar_id,(scores.get(edge.similar_id)??0)+(weights.get(edge.post_id)??0)*Math.max(0,edge.score));
  }
  return [...scores].filter(([,score])=>score>0).sort((a,b)=>b[1]-a[1]||b[0]-a[0]).slice(0,300).map(([id])=>id);
}
export function rankCandidates(candidates:Candidate[],edges:Similarity[],profile:LocalProfile,now=Date.now()) {
  const recent=profile.events.filter(e=>e.at>now-90*86400000);
  // DISTINCT per item: multiple positive actions increase confidence, never duplicate CF seeds.
  const seeds=new Map<number,{weight:number;event:LocalEvent}>();
  for(const event of recent) {
    const weight=(strengths[event.action]??0)*decay(event.at,now);
    if(weight>(seeds.get(event.id)?.weight??0))seeds.set(event.id,{weight,event});
  }
  const user=new Float32Array(DIMENSIONS),boardWeights=new Map<number,number>(),keywordWeights=new Map<string,number>();
  for(const {weight,event} of seeds.values()) {
    const vector=decodeVector(event.vector??null);
    if(vector)for(let i=0;i<DIMENSIONS;i++)user[i]+=weight*vector[i];
    boardWeights.set(event.board,(boardWeights.get(event.board)??0)+weight);
    for(const token of new Set(tokens(event.text??"")))keywordWeights.set(token,(keywordWeights.get(token)??0)+weight);
  }
  const length=Math.sqrt(dot(user,user));if(length)for(let i=0;i<DIMENSIONS;i++)user[i]/=length;
  const keywords=new Map([...keywordWeights].sort((a,b)=>b[1]-a[1]).slice(0,50));
  const documents=candidates.map(post=>tokens(`${post.title} ${post.content}`));
  const df=new Map<string,number>();
  for(const document of documents)for(const term of new Set(document))if(keywords.has(term))df.set(term,(df.get(term)??0)+1);
  const average=documents.reduce((sum,t)=>sum+t.length,0)/Math.max(1,documents.length)||1;
  const cf=new Map<number,number>(),semanticEdges=new Map<number,number>();
  for(const edge of edges) {
    const seed=seeds.get(edge.post_id);if(!seed)continue;
    const target=edge.source==='cf'?cf:semanticEdges;
    target.set(edge.similar_id,(target.get(edge.similar_id)??0)+seed.weight*Math.max(0,edge.score));
  }
  const theta=profile.inverse.map(row=>dot(row,profile.weights));
  const maxBoard=Math.max(1,...boardWeights.values());
  const hidden=new Set(profile.hidden);
  return candidates.flatMap((post,index)=>{
    if(hidden.has(post.id))return [];
    const vector=decodeVector(post.vector);
    const semantic=vector&&length?Math.max(0,dot(user,vector)):1-Math.exp(-(semanticEdges.get(post.id)??0));
    const counts=new Map<string,number>();for(const term of documents[index])counts.set(term,(counts.get(term)??0)+1);
    let keyword=0;
    for(const [term,weight] of keywords) {
      const frequency=counts.get(term)??0;if(!frequency)continue;
      const idf=Math.log(1+(candidates.length-(df.get(term)??0)+0.5)/((df.get(term)??0)+0.5));
      keyword+=weight*idf*frequency*2.2/(frequency+1.2*(0.25+0.75*documents[index].length/average));
    }
    const timestamp=post.created_at.replace(' ','T');
    const created=Date.parse(/[Zz]|[+-]\d\d:\d\d$/.test(timestamp)?timestamp:timestamp+'+08:00');
    const age=Number.isFinite(created)?Math.max(0,now-created)/86400000:90;
    const features=[semantic,1-Math.exp(-(cf.get(post.id)??0)),Math.exp(-age/7),
      Math.min(1,Math.log1p(post.like_count*2+post.reply_count*3+post.views*0.05)/8),
      profile.sections.includes(post.board_id)?1:(boardWeights.get(post.board_id)??0)/maxBoard,
      1-Math.exp(-keyword/10)];
    const uncertainty=Math.sqrt(Math.max(0,dot(features,profile.inverse.map(row=>dot(row,features)))));
    const seen=seeds.has(post.id)?0.08:0;
    const score=dot(theta,features)+0.12*uncertainty-seen+(post.is_pinned?2:0);
    return [{post,features,score}];
  }).sort((a,b)=>b.score-a.score||b.post.id-a.post.id);
}
