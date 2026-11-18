import { useEffect, useState } from 'react';
import { draftMetaMapKey } from '@/lib/draftmeta';
import type { DraftMetaResponse, DraftMetaSnapshot, DraftSuggestionRequest, DraftSuggestionResponse } from '@/lib/draftmeta';
import { collectionRequest } from '@/lib/live';

export function useDraftMeta(map: string, enabled: boolean) {
  const [index,setIndex]=useState<DraftMetaResponse|null>(null);
  const [indexFailed,setIndexFailed]=useState(false);
  const [read,setRead]=useState<{key:string;snapshot:DraftMetaSnapshot|null;failed:boolean}|null>(null);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();
    let pending=false;
    const refresh=async()=>{
      if(pending||document.visibilityState==='hidden')return;
      pending=true;
      try{
        const value=await collectionRequest<DraftMetaResponse>('/api/meta/external?rank=masters',{signal:controller.signal});
        if(!controller.signal.aborted){setIndex({...value,snapshot:value.snapshot?.rank==='masters'?value.snapshot:null});setIndexFailed(false);}
      }catch{if(!controller.signal.aborted)setIndexFailed(true);}
      finally{pending=false;}
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),60000);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[enabled]);
  const patch=index?.snapshot?.patch_date??index?.coverage?.patch_date;
  const pool=index?.coverage?.maps.map(row=>row.name)??[];
  const sourceMap=[...pool,...(index?.saved_maps??[])].find(name=>draftMetaMapKey(name)===draftMetaMapKey(map))??map;
  const key=JSON.stringify([sourceMap,patch,index?.coverage?.updated_at,index?.snapshot?.fetched_at]);
  useEffect(()=>{
    if(!enabled||!sourceMap||!patch)return;
    const controller=new AbortController();
    const params=new URLSearchParams({map:sourceMap,patch,rank:'masters'});
    void collectionRequest<DraftMetaResponse>(`/api/meta/external?${params}`,{signal:controller.signal})
      .then(value=>{
        if(controller.signal.aborted)return;
        const snapshot=value.snapshot;
        setRead({key,snapshot:snapshot?.rank==='masters'&&snapshot.patch_date===patch&&snapshot.map===sourceMap?snapshot:null,failed:false});
      })
      .catch(()=>{if(!controller.signal.aborted)setRead({key,snapshot:null,failed:true});});
    return ()=>controller.abort();
  },[enabled,key,patch,sourceMap]);
  const selected=read?.key===key?read:null;
  const resolvingMap=enabled&&!index&&!indexFailed;
  return {snapshot:map?selected?.snapshot??null:index?.snapshot??null,general:index?.snapshot??null,pool,patch,sourceMap,resolvingMap,
    loading:resolvingMap||Boolean(enabled&&map&&patch&&!selected),
    failed:indexFailed||Boolean(map&&selected?.failed)};
}

export function useDraftSuggestions(request: DraftSuggestionRequest|null) {
  const body=request?JSON.stringify(request):null;
  const [read,setRead]=useState<{body:string;result:DraftSuggestionResponse|null}|null>(null);
  useEffect(()=>{
    if(!body)return;
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      void collectionRequest<DraftSuggestionResponse>('/api/meta/draft-suggest',{
        method:'POST',headers:{'Content-Type':'application/json'},body,signal:controller.signal,
      }).then(result=>{if(!controller.signal.aborted)setRead({body,result});})
        .catch(()=>{if(!controller.signal.aborted)setRead({body,result:null});});
    },600);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[body]);
  const current=body&&read?.body===body?read:null;
  return {result:current?.result??null,loading:Boolean(body&&!current),failed:Boolean(current&&!current.result)};
}
