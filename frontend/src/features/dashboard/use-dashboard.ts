import { useEffect, useRef, useState } from 'react';
import { emptyFilters, number } from '@/lib/data';
import type { Filters } from '@/lib/data';
import { blankLocal, fromSnapshot, initialBook, loadBook, loadLocal, saveBook, saveLocal } from '@/lib/browser-store';
import type { AccountBook, LocalData, Progress } from '@/lib/browser-store';
import { collectionRequest } from '@/lib/live';
import type { LivePeriod, ServerCollection } from '@/lib/live';
import type { Evidence } from '@/features/matches/match-history';
import type { Section } from './navigation';

export function useDashboard() {
  const [section,setSection]=useState<Section>('overview');
  const [filters,setFilters]=useState<Filters>(emptyFilters);
  const [book,setBook]=useState<AccountBook>(initialBook);
  const [local,setLocal]=useState<LocalData>(()=>blankLocal(initialBook.active));
  const [period,setPeriod]=useState<LivePeriod>('reference');
  const [server,setServer]=useState<ServerCollection|null>(null);
  const [serverError,setServerError]=useState('');
  const refreshServer=useRef<()=>Promise<void>>(async()=>{});
  const serverRevision=useRef('');
  const processing=useRef(false);
  const [sending,setSending]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [rankedOnly,setRankedOnly]=useState(true);
  const [selected,setSelected]=useState<string|null>(null);
  const active=book.accounts.find(a=>a.tag===book.active)??initialBook.accounts[0];
  const data=local.dataset;
  const match=data.matches.find(b=>b.id===selected);

  useEffect(()=>{
    let live=true;
    void loadBook().then(async b=>({ b, d:await loadLocal(b.active) })).then(({b,d})=>{
      if(live){setBook(b);setLocal(d);}
    }).catch(()=>{if(live)setFeedback('O armazenamento do navegador está indisponível.');})
      .finally(()=>{if(live)setReady(true);});
    return ()=>{live=false;};
  },[]);

  function navigate(next:Section){
    setSection(next);setMenuOpen(false);window.scrollTo(0,0);
  }
  async function persist(next:LocalData) { await saveLocal(next);setLocal(next); }
  async function sync() {
    if(sending)return;
    if(!server?.configured){
      navigate('sources');
      return;
    }
    setSending(true);
    try{
      const result=await collectionRequest<{received:number;added:number}>('/api/sync',{
        method:'POST',headers:{'Content-Type':'application/json'},body:'{}',
      });
      await refreshServer.current();
      setFeedback(number(result.added)+' registros novos na coleta do servidor.');
    }catch(e){
      await refreshServer.current();
      setFeedback(e instanceof Error?e.message:'A sincronização falhou.');
    }finally{setSending(false);}
  }

  useEffect(()=>{
    if(!ready||busy)return;
    let cancelled=false;
    let checking=false;
    const controller=new AbortController();
    const refresh=async()=>{
      if(cancelled||checking||document.visibilityState!=='visible')return;
      checking=true;
      try{
        const status=await collectionRequest<ServerCollection>('/api/collection/status',{signal:controller.signal});
        if(cancelled||typeof status.player_tag!=='string'||typeof status.configured!=='boolean')return;
        setServer(status);
        setServerError('');
        if(status.player_tag!==book.active){
          if(processing.current)return;
          const data=await loadLocal(status.player_tag);
          if(cancelled)return;
          const entry=book.accounts.find(a=>a.tag===status.player_tag)??{tag:status.player_tag,name:'Minha conta',hasKey:false};
          const next={active:status.player_tag,accounts:[entry]};
          await saveBook(next);
          if(cancelled)return;
          setBook(next);setLocal(data);setFilters(emptyFilters);setSelected(null);
          return;
        }
        const attempt=status.last_attempt;
        const revision=[status.player_tag,attempt?.id,attempt?.status,attempt?.finished_at].join(':');
        if(status.player_tag!==book.active||!attempt||serverRevision.current===revision||processing.current)return;
        const previous=await loadLocal(book.active);
        const history=await collectionRequest<{run_id:number;snapshot:unknown}>(
          '/api/collection/history?after='+String(previous.serverRunId??0),{signal:controller.signal},
        );
        if(cancelled||processing.current)return;
        processing.current=true;
        try{
          const latest=await loadLocal(book.active);
          if(cancelled)return;
          const merged=fromSnapshot(history.snapshot,latest);
          await persist({...merged,serverRunId:history.run_id});
          serverRevision.current=revision;
        }finally{processing.current=false;}
      }catch(e){
        if(!cancelled)setServerError(e instanceof Error?e.message:'A coleta do servidor está indisponível.');
      }finally{checking=false;}
    };
    refreshServer.current=refresh;
    void refresh();
    const timer=window.setInterval(()=>void refresh(),30000);
    document.addEventListener('visibilitychange',refresh);
    return()=>{cancelled=true;controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[ready,busy,book.active]);
  async function saveProgress(record:Progress){
    if(busy||processing.current)throw new Error('Aguarde a atualização em andamento.');
    setBusy(true);
    try {
      const previous=await loadLocal(book.active);
      await persist({...previous,progress:[...previous.progress,record]});
    } finally {setBusy(false);}
  }
  async function saveEvidence(record:Evidence){
    if(!match)return;
    if(busy||processing.current)throw new Error('Aguarde a atualização em andamento.');
    if(!record.evidence.trim()||(record.rank_label===null&&record.rank_score===null&&record.season===null&&record.bans===null)){
      throw new Error('Informe uma referência e pelo menos um dado observado.');
    }
    setBusy(true);
    try {
    const previous=await loadLocal(book.active);
    const matches=previous.dataset.matches.map(b=>{
      if(b.id!==match.id)return b;
      const next={...b};
      if(record.rank_label!==null&&(b.rank_label===null||b.rank_source)){next.rank_label=record.rank_label;next.rank_reference=record.evidence;next.rank_source='evidência';}
      if(record.rank_score!==null&&(b.rank_score===null||b.score_source)){next.rank_score=record.rank_score;next.score_reference=record.evidence;next.score_source='evidência';}
      if(record.season!==null&&(b.season===null||b.season_source)){next.season=record.season;next.season_reference=record.evidence;next.season_source='evidência';}
      if(record.bans!==null&&(b.bans===null||b.bans_source)){next.bans=record.bans;next.bans_reference=record.evidence;next.bans_source='evidência';}
      if(next.rank_label===b.rank_label&&next.rank_score===b.rank_score&&next.season===b.season&&next.bans===b.bans
        &&next.rank_reference===b.rank_reference&&next.score_reference===b.score_reference&&next.season_reference===b.season_reference) {
        throw new Error('Os campos informados já têm esse valor ou foram confirmados pela API.');
      }
      return next;
    });
    await persist({...previous,dataset:{...previous.dataset,matches}});
    } finally {setBusy(false);}
  }

  return {section, filters, setFilters, book, local, period, setPeriod, server, serverError,
    sending, feedback, setFeedback, ready, busy, menuOpen, setMenuOpen, rankedOnly, setRankedOnly,
    setSelected, active, data, match, navigate, sync, saveProgress, saveEvidence};
}
