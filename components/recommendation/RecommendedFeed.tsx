"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ThreadRowItem } from "@/components/ThreadList";
import { IconButton } from "@/components/IconAction";
import { emptyProfile, learn, rankCandidates, recallIds, type LocalProfile } from "@/lib/recommendation/rank";
import { loadProfile, saveProfile } from "@/lib/recommendation/local";
import { MODEL_VERSION, RECENT_LIMIT } from "@/lib/recommendation/config";
import type { Candidate, Similarity } from "@/lib/recommendation/server";

type Pool={candidates:Candidate[];edges:Similarity[];version:string};
export function RecommendedFeed({userId,boards,fallback}:{userId:number;boards:{id:number;name:string}[];fallback:ReactNode}) {
  const [pool,setPool]=useState<Pool|null>(null),[profile,setProfile]=useState<LocalProfile>(emptyProfile);
  const [preferences,setPreferences]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0);
  const [backfill,setBackfill]=useState(false),[notice,setNotice]=useState("");
  const [limit,setLimit]=useState(25);
  useEffect(()=>{
    const controller=new AbortController();const local=loadProfile(userId);
    const recent=[...new Set([...local.events].reverse().map(e=>e.id))].slice(0,RECENT_LIMIT);
    void fetch(`/api/recommendations?recent=${recent.join(',')}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('unavailable');
      const data=await response.json() as Pool;
      if(data.version!==MODEL_VERSION)throw new Error('version');
      const recall = recallIds(data.edges,local,new Set(data.candidates.map(post=>post.id)));
      if(recall.length) {
        const response = await fetch(`/api/recommendations?ids=${recall.join(',')}`,{signal:controller.signal});
        if(response.ok) {
          const extra = await response.json() as Pool;
          if(extra.version===MODEL_VERSION)data.candidates.push(...extra.candidates);
        }
      }
      setProfile(local);setPool(data);setError(false);
    }).catch(()=>{if(!controller.signal.aborted)setError(true)});
    return ()=>controller.abort();
  },[userId,reload]);
  const ranked=useMemo(()=>pool?rankCandidates(pool.candidates,pool.edges,profile):[],[pool,profile]);
  const update=(next:LocalProfile)=>{saveProfile(userId,next);setProfile(next);};
  const backfillPosts=async()=>{
    setBackfill(true);setNotice("正在为历史帖子准备推荐…");let count=0,after=0;
    try {
      const {encodePost}=await import('@/lib/recommendation/encoder');
      // Explicit author opt-in only. Browsing never starts the encoder.
      for(let batch=0;batch<10;batch++) {
        const response=await fetch(`/api/recommendations/vectors?after=${after}`);
        if(!response.ok)throw new Error('unavailable');
        const data=await response.json() as {version:string;posts:{id:number;title:string;content:string}[]};
        if(data.version!==MODEL_VERSION)throw new Error('version');
        if(!data.posts.length)break;
        for(const post of data.posts) {
          const {encoded,version}=await encodePost(post.title,post.content);
          const saved=await fetch('/api/recommendations/vectors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId:post.id,vector:encoded,version})});
          if(!saved.ok)throw new Error('save');count++;after=post.id;setNotice(`已准备 ${count} 篇历史帖子。`);
        }
      }
      setNotice(count?`已准备 ${count} 篇历史帖子，可再次运行以继续。`:"历史帖子已准备完毕。");setReload(n=>n+1);
    }catch{setNotice(`已准备 ${count} 篇。暂时无法继续，请稍后重试。`);}
    finally{setBackfill(false);}
  };
  return <div className="recommended-feed">
    <div className="recommendation-controls"><p className="text-xs text-muted" role="status">{error?'暂时无法更新，先看看最新讨论。':pool?'根据你在此设备上的阅读与兴趣推荐。':'正在为你整理讨论…'}</p><div className="flex shrink-0 gap-2">
      {error&&<IconButton icon="refresh" label="重新加载推荐" onClick={()=>setReload(n=>n+1)} />}
      <IconButton icon="menu" label="推荐偏好" active={preferences} onClick={()=>setPreferences(v=>!v)} />
    </div></div>
    {preferences&&<section aria-label="推荐偏好" className="recommendation-preferences"><h2 className="font-semibold">你感兴趣的板块</h2><p className="text-xs text-muted mt-1">只保存在此设备。也会为你保留探索其他话题的机会。</p>
      <div className="recommendation-sections">{boards.map(board=><label key={board.id}><input type="checkbox" checked={profile.sections.includes(board.id)} onChange={event=>update({...profile,sections:event.target.checked?[...profile.sections,board.id]:profile.sections.filter(id=>id!==board.id)})} />{board.name}</label>)}</div>
      <div className="flex gap-2 items-center"><IconButton icon="trash" label="重置此设备的推荐偏好" onClick={()=>{update(emptyProfile());setNotice('已重置此设备的推荐偏好。')}} /><IconButton icon="refresh" label="为我的历史帖子准备推荐" disabled={backfill} onClick={()=>void backfillPosts()} /><span className="text-xs text-muted">为历史帖子准备推荐时需要下载推荐组件。</span></div>
      {notice&&<p role="status" className="text-sm text-muted mt-2">{notice}</p>}
    </section>}
    {pool ? ranked.length ? <div className="thread-list">{ranked.slice(0,limit).map(({post,features})=><div className="recommendation-row" key={post.id} onClickCapture={event=>{
      const target=event.target as HTMLElement;
      if(target.closest(`a[href^="/t/${post.id}"]`)) {
        const next=loadProfile(userId);next.pending={id:post.id,features};saveProfile(userId,next);
      }
    }}><ThreadRowItem t={post} /><div className="recommendation-dismiss"><IconButton icon="close" label={`不感兴趣：${post.title}`} onClick={()=>update({...learn(profile,features,-0.6),hidden:[...profile.hidden,post.id].slice(-500)})} /></div></div>)}</div> : <p className="p-5 text-muted">暂时没有更多推荐，可以在推荐偏好中重新选择板块。</p> : fallback}
    {pool&&ranked.length>limit&&<div className="flex justify-center p-4"><IconButton icon="plus" label="更多推荐" onClick={()=>setLimit(n=>n+25)} /></div>}
  </div>;
}
