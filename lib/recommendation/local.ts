import { emptyProfile, learn, remember, type LocalProfile, type LocalEvent } from "./rank";
import { MODEL_VERSION } from "./config";
const key=(userId:number)=>`hsfz-recommendations:${userId}:${MODEL_VERSION}`;
export function loadProfile(userId:number): LocalProfile {
  try {
    const profile=JSON.parse(localStorage.getItem(key(userId))??"null") as LocalProfile;
    if(profile?.version===MODEL_VERSION&&Array.isArray(profile.events)&&profile.events.length<=200&&
      Array.isArray(profile.sections)&&profile.sections.length<=100&&profile.sections.every(id=>Number.isSafeInteger(id)&&id>0)&&
      Array.isArray(profile.hidden)&&profile.hidden.length<=500&&profile.hidden.every(id=>Number.isSafeInteger(id)&&id>0)&&
      Array.isArray(profile.inverse)&&profile.inverse.length===6&&profile.inverse.every(row=>Array.isArray(row)&&row.length===6&&row.every(Number.isFinite))&&
      Array.isArray(profile.weights)&&profile.weights.length===6&&profile.weights.every(Number.isFinite)&&
      profile.events.every(e=>Number.isSafeInteger(e.id)&&e.id>0&&Number.isFinite(e.at)&&Number.isSafeInteger(e.board)&&
        ['view','dwell','like','reply','bookmark'].includes(e.action)&&(!e.text||typeof e.text==='string')&&(!e.vector||typeof e.vector==='string'))&&
      (!profile.pending||(Number.isSafeInteger(profile.pending.id)&&Array.isArray(profile.pending.features)&&profile.pending.features.length===6&&profile.pending.features.every(Number.isFinite))))return profile;
  }catch{}
  return emptyProfile();
}
export function saveProfile(userId:number,profile:LocalProfile) {
  try {localStorage.setItem(key(userId),JSON.stringify(profile));}catch{}
}
export function signal(userId:number,event:LocalEvent,reward=0) {
  let profile=loadProfile(userId);
  profile=remember(profile,event);
  if(profile.pending?.id===event.id&&reward)profile=learn(profile,profile.pending.features,reward);
  saveProfile(userId,profile);
}
let viewQueue=new Set<number>();let timer:ReturnType<typeof setTimeout>|undefined;
export function queueView(id:number) {
  viewQueue.add(id);
  if(!timer)timer=setTimeout(flushViews,4000);
}
export function flushViews() {
  clearTimeout(timer);timer=undefined;
  const postIds=[...viewQueue].slice(0,20);viewQueue=new Set();
  if(postIds.length)void fetch('/api/recommendations/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postIds}),keepalive:true}).catch(()=>{});
}
