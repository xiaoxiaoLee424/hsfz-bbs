"use client";
import { useEffect } from "react";
import { signal, queueView, flushViews, loadProfile, saveProfile } from "@/lib/recommendation/local";
export function ThreadSignals({userId,postId,board,title,content,vector,liked,favorite,replied}: {
  userId:number;postId:number;board:number;title:string;content:string;vector?:string;liked:boolean;favorite:boolean;replied:boolean;
}) {
  useEffect(()=>{
    const event={id:postId,board,at:Date.now(),text:`${title} ${content.slice(0,500)}`,vector};
    signal(userId,{...event,action:'view'},0.2);queueView(postId);
    let visibleMs=0,last=performance.now(),awarded=false;
    const tick=()=>{
      const now=performance.now();if(document.visibilityState==='visible')visibleMs+=Math.min(2000,now-last);last=now;
      if(!awarded&&visibleMs>=15000){awarded=true;signal(userId,{...event,at:Date.now(),action:'dwell'},0.5);}
    };
    const timer=setInterval(tick,1000);
    window.addEventListener('pagehide',flushViews);
    return ()=>{clearInterval(timer);window.removeEventListener('pagehide',flushViews);flushViews();};
  },[userId,postId,board,title,content,vector]);
  useEffect(()=>{
    const event={id:postId,board,at:Date.now(),text:`${title} ${content.slice(0,500)}`,vector};
    let profile=loadProfile(userId);
    // Reconcile removals; a previous like must not survive an unlike on this browser.
    profile={...profile,events:profile.events.filter(e=>e.id!==postId||!['like','bookmark','reply'].includes(e.action)||
      (e.action==='like'&&liked)||(e.action==='bookmark'&&favorite)||(e.action==='reply'&&replied))};
    saveProfile(userId,profile);
    for(const [action,active] of [['like',liked],['bookmark',favorite],['reply',replied]] as const)if(active) {
      if(!profile.events.some(e=>e.id===postId&&e.action===action))signal(userId,{...event,action},1);
    }
  },[userId,postId,board,title,content,vector,liked,favorite,replied]);
  return null;
}
