import { MODEL_VERSION, DIMENSIONS } from "./config";
let worker: Worker | undefined;
let serial=0;
const pending = new Map<number,{resolve:(value:{vector:number[];version:string})=>void;reject:(reason:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
function failAll() {
  for(const entry of pending.values()) { clearTimeout(entry.timer);entry.reject(new Error("推荐特征暂不可用")); }
  pending.clear();worker?.terminate();worker=undefined;
}
export async function encodePost(title: string, content: string): Promise<{encoded:string;version:string}> {
  worker ??= new Worker(`/recommendation-runtime/encoder.js?v=${MODEL_VERSION}`,{type:"module"});
  worker.onerror=failAll;
  worker.onmessage=event=>{
    const entry=pending.get(event.data.id);if(!entry)return;
    clearTimeout(entry.timer);pending.delete(event.data.id);
    if(event.data.error) entry.reject(new Error(event.data.error));else entry.resolve(event.data);
  };
  const id=++serial;
  const result=await new Promise<{vector:number[];version:string}>((resolve,reject)=>{
    const timer=setTimeout(failAll,60000);pending.set(id,{resolve,reject,timer});
    worker!.postMessage({id,text:`${title.trim()}\n${content.trim().slice(0,6000)}`});
  });
  if(result.version!==MODEL_VERSION || result.vector.length!==DIMENSIONS)throw new Error("推荐模型版本不匹配");
  const bytes=new Uint8Array(new Float32Array(result.vector).buffer);
  return {encoded:btoa(String.fromCharCode(...bytes)),version:result.version};
}
