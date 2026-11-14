import { useEffect, useState } from 'react';
import { draftMetaMapKey } from '@/lib/draftmeta';
import type { DraftMetaResponse, DraftMetaSnapshot } from '@/lib/draftmeta';
import { collectionRequest } from '@/lib/live';

export function useDraftMeta(map: string, enabled: boolean) {
  const [index,setIndex]=useState<DraftMetaResponse|null>(null);
  const [indexFailed,setIndexFailed]=useState(false);
  const [read,setRead]=useState<{key:string;snapshot:DraftMetaSnapshot|null;failed:boolean}|null>(null);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();
    setIndex(null);setIndexFailed(false);setRead(null);
    void collectionRequest<DraftMetaResponse>('/api/meta/external',{signal:controller.signal})
      .then(value=>{if(!controller.signal.aborted)setIndex(value);})
      .catch(()=>{if(!controller.signal.aborted)setIndexFailed(true);});
    return ()=>controller.abort();
  },[enabled]);
  const patch=index?.snapshot?.patch_date??index?.coverage?.patch_date;
  const pool=index?.coverage?.maps.map(row=>row.name)??[];
  const sourceMap=[...pool,...(index?.saved_maps??[])].find(name=>draftMetaMapKey(name)===draftMetaMapKey(map))??map;
  const key=JSON.stringify([sourceMap,patch]);
  useEffect(()=>{
    if(!enabled||!sourceMap||!patch)return;
    const controller=new AbortController();
    const params=new URLSearchParams({map:sourceMap,patch});
    void collectionRequest<DraftMetaResponse>(`/api/meta/external?${params}`,{signal:controller.signal})
      .then(value=>{
        if(controller.signal.aborted)return;
        const snapshot=value.snapshot;
        setRead({key,snapshot:snapshot?.patch_date===patch&&snapshot.map===sourceMap?snapshot:null,failed:false});
      })
      .catch(()=>{if(!controller.signal.aborted)setRead({key,snapshot:null,failed:true});});
    return ()=>controller.abort();
  },[enabled,key,patch,sourceMap]);
  const selected=read?.key===key?read:null;
  return {snapshot:map?selected?.snapshot??null:index?.snapshot??null,pool,patch,
    loading:enabled&&((!index&&!indexFailed)||Boolean(map&&patch&&!selected)),
    failed:indexFailed||Boolean(map&&selected?.failed)};
}
