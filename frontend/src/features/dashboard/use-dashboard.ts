import { useEffect, useRef, useState } from 'react';
import { emptyFilters, number } from '@/lib/data';
import type { Filters } from '@/lib/data';
import { blankLocal, fromSnapshot, initialBook, loadBook, loadLocal, saveBook, saveLocal } from '@/lib/browser-store';
import type { Account, AccountBook, LocalData } from '@/lib/browser-store';
import { collectionRequest } from '@/lib/live';
import type { LivePeriod, ServerCollection, SyncProgress } from '@/lib/live';
import type { ReplayReview, TrainingPlan } from '@/lib/coaching';
import type { Section } from './navigation';

const historyVersion=5;

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
  const firstSync=useRef(new Set<string>());
  const [sending,setSending]=useState(false);
  const [syncProgress,setSyncProgress]=useState<SyncProgress|null>(null);
  const [feedback,setFeedback]=useState('');
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [rankedOnly,setRankedOnly]=useState(true);
  const [selected,setSelected]=useState<string|null>(null);
  const active=book.accounts.find(a=>a.tag===book.active)??{tag:book.active,name:'Minha conta'};
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

  async function applyBook(next:AccountBook, signal?:AbortSignal){
    const switching=next.active!==book.active;
    const data=switching?await loadLocal(next.active):null;
    if(signal?.aborted)return;
    await saveBook(next);
    if(signal?.aborted)return;
    setBook(next);
    if(data){
      setLocal(data);
      setServer(null);
      setFilters(emptyFilters);
      setSelected(null);
      setFeedback('');
      serverRevision.current='';
    }
  }

  async function selectAccount(tag:string){
    if(tag===book.active||!book.accounts.some(a=>a.tag===tag)||busy||sending||processing.current)return;
    setBusy(true);
    try{await applyBook({...book,active:tag});}
    catch{setFeedback('Não foi possível trocar a conta ativa.');}
    finally{setBusy(false);}
  }

  async function saveAccount(tag:string){
    if(busy||sending||processing.current)throw new Error('Aguarde a atualização em andamento.');
    setBusy(true);
    try{
      const saved=await collectionRequest<Account>('/api/accounts',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag}),
      });
      const existing=book.accounts.some(a=>a.tag===saved.tag);
      const accounts=existing?book.accounts.map(a=>a.tag===saved.tag?saved:a):[...book.accounts,saved];
      await applyBook({active:existing&&book.active?book.active:saved.tag,accounts});
      setFeedback('Conta salva.');
    }finally{setBusy(false);}
  }
  async function loadHistory(tag:string, signal?:AbortSignal) {
    const previous=await loadLocal(tag);
    const after=previous.serverHistoryVersion===historyVersion?previous.serverRunId??0:0;
    const params=new URLSearchParams({tag,after:String(after)});
    const history=await collectionRequest<{run_id:number;snapshot:unknown}>(
      '/api/collection/history?'+params,{signal},
    );
    if(signal?.aborted)return;
    const latest=await loadLocal(tag);
    const merged=fromSnapshot(history.snapshot,latest);
    if(signal?.aborted)return;
    const next={...merged,serverRunId:history.run_id,serverHistoryVersion:historyVersion};
    await saveLocal(next);
    if(!signal?.aborted)setLocal(next);
  }

  async function sync() {
    if(sending||busy||processing.current)return;
    if(!book.active||server?.player_tag!==book.active||!server.configured){
      navigate('sources');
      return;
    }
    const tag=book.active;
    firstSync.current.add(tag);
    const params=new URLSearchParams({tag});
    const previousAttempt=server.last_attempt?.id??0;
    const progressController=new AbortController();
    let checkingProgress=false;
    const progressTimer=window.setInterval(async()=>{
      if(checkingProgress||progressController.signal.aborted)return;
      checkingProgress=true;
      try{
        const status=await collectionRequest<ServerCollection>('/api/collection/status?'+params,{signal:progressController.signal});
        const attempt=status.last_attempt;
        if(!progressController.signal.aborted&&status.player_tag===tag&&attempt&&attempt.id>previousAttempt&&attempt.phase){
          setSyncProgress({phase:attempt.phase,processed:attempt.processed??null,total:attempt.received});
        }
      }catch{
        // A solicitação de sincronização informa o resultado final.
      }finally{checkingProgress=false;}
    },1000);
    setSending(true);
    setSyncProgress({phase:'profile',processed:null,total:null});
    setFeedback('');
    let collected=false;
    try{
      const result=await collectionRequest<{received:number;added:number}>('/api/sync?'+params,{
        method:'POST',headers:{'Content-Type':'application/json'},body:'{}',
      });
      collected=true;
      progressController.abort();
      setSyncProgress({phase:'history',processed:result.received,total:result.received});
      await loadHistory(tag);
      setFeedback(`${number(result.received)} partidas recebidas · ${number(result.added)} novas no histórico.`);
    }catch(e){
      setFeedback(collected ? 'Partidas salvas no servidor. Falha ao carregar o histórico no painel.'
        : e instanceof Error?e.message:'A sincronização falhou.');
    }finally{
      progressController.abort();
      window.clearInterval(progressTimer);
      setSyncProgress(null);
      setSending(false);
    }
  }

  useEffect(()=>{
    const tag=book.active;
    if(!ready||busy||sending||processing.current||!tag||server?.player_tag!==tag
      ||!server.configured||server.last_attempt||firstSync.current.has(tag))return;
    void sync();
  },[ready,busy,sending,book.active,server]);

  useEffect(()=>{
    if(!ready||busy||sending)return;
    let cancelled=false;
    let checking=false;
    const controller=new AbortController();
    const refresh=async()=>{
      if(cancelled||checking||document.visibilityState!=='visible')return;
      checking=true;
      try{
        const accounts=await collectionRequest<Account[]>('/api/accounts',{signal:controller.signal});
        if(cancelled||processing.current)return;
        const tag=accounts.some(a=>a.tag===book.active)?book.active:(accounts[0]?.tag??'');
        const next={active:tag,accounts};
        if(JSON.stringify(next)!==JSON.stringify(book)){
          processing.current=true;
          try{await applyBook(next,controller.signal);}
          finally{processing.current=false;}
          setServerError('');
          return;
        }
        if(!tag){
          setServer(null);
          setServerError('');
          return;
        }
        const params=new URLSearchParams({tag});
        const status=await collectionRequest<ServerCollection>('/api/collection/status?'+params,{signal:controller.signal});
        if(cancelled||status.player_tag!==tag)return;
        setServer(status);
        setServerError('');
        const attempt=status.last_attempt;
        const revision=[status.player_tag,attempt?.id,attempt?.status,attempt?.finished_at,status.last_evidence].join(':');
        if(status.player_tag!==book.active||!attempt||serverRevision.current===revision||processing.current)return;
        processing.current=true;
        try{
          await loadHistory(tag,controller.signal);
          if(!cancelled)serverRevision.current=revision;
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
  },[ready,busy,book,sending]);
  async function saveCoaching(change: { review: {id:string; value:ReplayReview} } | { training: TrainingPlan }) {
    if(!book.active) throw new Error('Cadastre uma conta para salvar a análise.');
    if(busy||processing.current) throw new Error('Aguarde a atualização em andamento.');
    processing.current=true;
    setBusy(true);
    try {
      const previous=await loadLocal(book.active);
      if('review' in change){
        if(!previous.dataset.matches.some(row=>row.id===change.review.id)) throw new Error('Partida indisponível.');
        await persist({...previous,reviews:{...previous.reviews,[change.review.id]:change.review.value}});
      }else{
        const now=new Date().toISOString();
        const prior=previous.training?.focus===change.training.focus?previous.training:undefined;
        await persist({...previous,training:{...change.training,startedAt:prior?.startedAt??now,
          completedAt:change.training.completed?(prior?.completedAt??now):undefined}});
      }
    } finally {processing.current=false;setBusy(false);}
  }

  return {section, filters, setFilters, book, local, period, setPeriod, server, serverError,
    sending, syncProgress, feedback, setFeedback, ready, busy, menuOpen, setMenuOpen, rankedOnly, setRankedOnly,
    setSelected, active, data, match, navigate, sync, selectAccount, saveAccount, saveCoaching,
    refreshCollection:()=>refreshServer.current()};
}
