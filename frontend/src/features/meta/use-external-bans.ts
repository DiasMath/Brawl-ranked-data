import { useEffect, useState } from 'react';
import type { DraftMetaRank, ExternalBanSnapshot } from '@/lib/draftmeta';
import { collectionRequest } from '@/lib/live';

export function useExternalBans(map:string,rank:DraftMetaRank,patch:string,enabled=true) {
  const key=JSON.stringify([map,rank,patch]);
  const [read,setRead]=useState<{key:string;snapshot:ExternalBanSnapshot|null;loading:boolean;error:string}|null>(null);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();
    let pending=false,nextAttempt=0;
    const refresh=async()=>{
      if(pending||document.visibilityState==='hidden')return;
      pending=true;
      const params=new URLSearchParams({map,rank});
      if(patch)params.set('patch',patch);
      try{
        const result=await collectionRequest<{snapshot:ExternalBanSnapshot|null}>('/api/meta/bans?'+params,{signal:controller.signal});
        if(controller.signal.aborted)return;
        setRead({key,snapshot:result.snapshot,loading:false,error:''});
        if(!patch&&(!result.snapshot||!result.snapshot.fresh)&&Date.now()>=nextAttempt){
          nextAttempt=Date.now()+300000;
          setRead({key,snapshot:result.snapshot,loading:true,error:''});
          const updated=await collectionRequest<{snapshot:ExternalBanSnapshot}>('/api/meta/bans',{
            signal:controller.signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({map,rank}),
          });
          if(!controller.signal.aborted)setRead({key,snapshot:updated.snapshot,loading:false,error:''});
        }
      }catch(value){if(!controller.signal.aborted)setRead(previous=>({key,snapshot:previous?.key===key?previous.snapshot:null,
        loading:false,error:value instanceof Error?value.message:'Bans externos indisponíveis.'}));}
      finally{pending=false;}
    };
    setRead({key,snapshot:null,loading:true,error:''});
    void refresh();
    const timer=window.setInterval(()=>void refresh(),60000);
    document.addEventListener('visibilitychange',refresh);
    return()=>{controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[key,map,rank,patch,enabled]);
  const current=read?.key===key?read:null;
  return {snapshot:enabled?current?.snapshot??null:null,loading:enabled&&(current?.loading??true),error:current?.error??''};
}
