'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronRight, Filter, FlaskConical, History, List, LockKeyhole, Menu, RefreshCw, Settings, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { FeedbackToast } from '@/components/feedback-toast';
import { AccountIcon, brawlers } from '@/components/game';
import { battleSeason, dateTime, emptyFilters, localDay, normalize, number } from '@/lib/data';
import { downloadSnapshot } from '@/lib/browser-store';
import { loadUpdates } from '@/features/collection/update-history';
import { collectionRequest, defaultMetaPeriod, inMetaPeriod, LiveMeta } from '@/lib/live';
import type { LiveReport } from '@/lib/live';
import { Overview, Performance, PublicMeta } from '@/features/analytics/analytics';
import { MapTraining } from '@/features/analytics/map-performance';
import { BrawlerEvolution } from '@/features/analytics/brawler-evolution';
import { ModePerformance } from '@/features/analytics/mode-performance';
import { Progression } from '@/features/analytics/progression';
import { SeasonComparison } from '@/features/analytics/season-comparison';
import { Accounts } from '@/features/collection/accounts';
import { CollectorPanel, MetaPeriods } from '@/features/collection/collector-panel';
import { HistoryCoverage } from '@/features/collection/history-coverage';
import { SupercellCredential } from '@/features/collection/supercell-credential';
import { SyncProgressCard } from '@/features/collection/sync-progress';
import { SyncStatus } from '@/features/collection/sync-status';
import { DraftLab } from '@/features/draft/draft-lab';
import { PersonalDraftStats } from '@/features/draft/personal-draft-stats';
import { DraftTierList } from '@/features/draft/draft-tier-list';
import { useDraftMeta } from '@/features/draft/use-draftmeta';
import { MatchDetail, MatchList } from '@/features/matches/match-history';
import { MetaDashboard, MetaRankings } from '@/features/meta/meta-dashboard';
import { ExternalMeta } from '@/features/meta/external-meta';
import { MetaView } from '@/features/meta/meta-comparison';
import { SampleCollection } from '@/features/meta/sample-collection';
import publicIndex from '@public/scouting/index.json';
import { columnFilters, navigation, subtitles } from './navigation';
import { useDashboard } from './use-dashboard';
import { completedRankedSeries, filteredSeries, matchEloChanges, matchSeries, seriesBattle } from '@/lib/match-series';

export default function Dashboard() {
  const {section, filters, setFilters, book, local, period, setPeriod, server, serverError,
    sending, syncProgress, feedback, setFeedback, ready, busy, menuOpen, setMenuOpen, rankedOnly, setRankedOnly,
    setSelected, active, data, match, navigate, sync, selectAccount, saveAccount, saveCoaching, refreshCollection} = useDashboard();
  const dismissFeedback=useCallback(()=>setFeedback(''),[setFeedback]);
  const [report,setReport]=useState<LiveReport|null>(null);
  const [draftTarget,setDraftTarget]=useState<{map:string;season?:string;revision:number}>({map:'',revision:0});
  const [trainingTarget,setTrainingTarget]=useState<{tag:string;map:string;brawler:string}>();
  const [metaSource,setMetaSource]=useState<'external'|'own'>('external');
  const [exporting,setExporting]=useState(false);
  function openDraft(map:string, season?:string) {
    setDraftTarget(target=>({map,season,revision:target.revision+1}));
    navigate('draftlab');
  }
  async function exportHistory() {
    setExporting(true);
    try {
      const {rows}=await loadUpdates(book.active,{limit:100});
      downloadSnapshot({...local,dataset:{...local.dataset,updates:rows}});
    } catch(error) {
      setFeedback(error instanceof Error?error.message:'Não foi possível exportar o histórico.');
    } finally {
      setExporting(false);
    }
  }
  const draftTier=useDraftMeta(filters.map_name,section==='draft');
  const metaRevision=useRef(0);
  const firstMetaRead=useRef(true);
  const changePeriod=(value: typeof period)=>{firstMetaRead.current=false;setPeriod(value);};
  const loadMeta=(section==='meta'&&metaSource==='own')||section==='draft'||section==='draftlab';
  useEffect(()=>{
    if(!loadMeta)return;
    const controller=new AbortController();
    let pending=false;
    const refresh=async()=>{
      if(pending||controller.signal.aborted||document.visibilityState!=='visible')return;
      pending=true;
      const revision=metaRevision.current;
      try{
        const data=await collectionRequest<LiveReport>('/api/meta/sample',{signal:controller.signal});
        if(controller.signal.aborted||metaRevision.current!==revision)return;
        setReport(data);
        if(firstMetaRead.current){
          setPeriod(defaultMetaPeriod(data));
          firstMetaRead.current=false;
        }
      }catch{
        // A referência histórica fica disponível durante falhas de leitura.
      }finally{pending=false;}
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),60_000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[loadMeta]);
  const metaFilters={...filters,start:'',end:'',rank_label:'',season:period==='reference'?filters.season:''};
  const series=useMemo(()=>matchSeries(data.matches),[data.matches]);
  const rankedHistory=useMemo(()=>series.filter(match=>match.latest.ranked),[series]);
  const elo=useMemo(()=>matchEloChanges(series,local.progress),[series,local.progress]);
  const historySeries=section==='matches'?filteredSeries(series,data.matches,filters,rankedOnly,elo):[];
  const rankedSeries=section==='overview'||section==='performance'?filteredSeries(series,data.matches,filters,true,elo):[];
  const performanceHistory=useMemo(()=>rankedHistory.filter(completedRankedSeries),[rankedHistory]);
  const performanceSeries=section==='performance'?rankedSeries.filter(completedRankedSeries):[];
  const performanceRows=performanceSeries.map(seriesBattle);
  const incompletePerformance=section==='performance'?rankedSeries.length-performanceSeries.length:0;
  const comparisonIds=useMemo(()=>new Set(section==='performance'?filteredSeries(performanceHistory,data.matches,{
    ...emptyFilters,map_name:filters.map_name,mode:filters.mode,rank_label:filters.rank_label,
  },true,elo).map(match=>match.id):[]),[section,performanceHistory,data.matches,filters.map_name,filters.mode,filters.rank_label,elo]);
  const selectedSeries=match&&series.find(item=>item.rounds.some(round=>round.id===match.id));
  const metaMatches=(section==='draft'||section==='meta')?filteredSeries(rankedHistory,data.matches,metaFilters,true,elo):[];
  const metaAccount=metaMatches.map(seriesBattle);
  const recentDrafts=metaMatches.filter(({latest})=>inMetaPeriod(latest.played_at,period,report)&&
    latest.players.some(p=>p.side==='ally')&&latest.players.some(p=>p.side==='opponent'));
  const accountHistory=useMemo(()=>rankedHistory.map(seriesBattle),[rankedHistory]);
  const current=navigation.find(item=>item.key===section)!;
  const filtersVisible=!['sources','draftlab'].includes(section)&&!(section==='meta'&&metaSource==='external');
  const progressFilters={...emptyFilters,start:filters.start,end:filters.end,season:filters.season};
  const countFilters=Object.values(section==='meta'||section==='draft'?metaFilters:section==='progress'?progressFilters:filters).filter(Boolean).length;
  const dateError=Boolean(filters.start&&filters.end&&filters.end<filters.start);
  const commonPublic=section==='meta'||section==='draft';
  const available=useMemo(()=>Object.fromEntries(columnFilters.map(([key])=>{
    const source=section==='matches'&&rankedOnly?data.matches.filter(b=>b.ranked):data.matches;
    const values=commonPublic?[]:source.map(b=>key==='season'?battleSeason(b):key==='rank_label'&&b.rank_source?null:b[key]);
    if(key==='rank_label'&&(section==='matches'||section==='overview')){
      for(const reading of elo.values())if(reading.rank)values.push(reading.rank);
    }
    if(commonPublic){
      const live=period==='reference'?null:report?.windows[period];
      if(key==='map_name')values.push(...(period==='reference'?publicIndex.contexts:live?.contexts??[]).map(c=>c.map));
      if(key==='season'&&period==='reference')values.push(publicIndex.season);
      if(key==='player_brawler'){
        const observed=new Set(live?.contexts.find(c=>!c.map&&!c.mode)?.sample.picks.map(([id])=>id));
        values.push(...brawlers.filter(b=>period==='reference'||observed.has(b.id)).map(b=>b.name));
      }
    }
    if(key==='season'&&section==='progress')values.push(data.profile?.season??null,...local.progress.filter(p=>p.method==='api').map(p=>p.season));
    return [key,[...new Map(values.filter((v):v is string=>Boolean(v)).map(v=>[normalize(v),v])).values()].sort((a,b)=>a.localeCompare(b,'pt-BR'))];
  })),[data,local.progress,section,rankedOnly,commonPublic,period,report,elo]);

  return <LiveMeta.Provider value={{report,period,setPeriod:changePeriod}}><div className={`shell lab-shell ${section==='draftlab'?'draft-shell':''}`}>
    {menuOpen&&<button className="mobile-scrim" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}/>}
    <aside className={`sidebar ${menuOpen?'open':''}`}>
      <button className="brand" onClick={()=>navigate('overview')}><span className="logo"><ShieldCheck size={23}/></span>
        <span><strong>Brawl Ranked Data</strong><small>CENTRAL COMPETITIVA</small></span></button>
      <div className="sidebar-content">
        {[[0,4,'Minha conta'],[4,7,'Competitivo'],[7,8,'Configurações']].map(([from,to,title])=><div className="nav-group" key={String(title)}>
          <div className="nav-label">{String(title)}</div>
          <nav aria-label={String(title)}>{navigation.slice(Number(from),Number(to)).map(({key,label,icon:Icon})=>
            <button key={key} className={`nav-item ${section===key?'active':''}`} aria-current={section===key?'page':undefined}
              onClick={()=>navigate(key)} aria-label={label} title={label}><Icon size={17}/><span>{label}</span>{section===key&&<ChevronRight className="nav-arrow" size={15}/>}</button>)}</nav>
        </div>)}
      </div>
      <div className="sidebar-bottom"><div className="privacy"><span><LockKeyhole size={15}/></span><div><strong>Painel privado</strong><small>Coleta no servidor</small></div></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar compact-topbar">
        <div className="page-title"><button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={()=>setMenuOpen(true)}><Menu size={20}/></button>
          <div><div className="eyebrow"><span/> Brawl Stars / Ranqueado</div><h1>{current.label}</h1></div>
          <p>{subtitles[section]}</p></div>
        <div className="top-actions">
          {book.accounts.length>0&&<div className="account-switcher"><AccountIcon id={data.profile?.icon_id}/>
            <select aria-label="Conta ativa" value={book.active} disabled={busy||sending||!ready}
              onChange={e=>void selectAccount(e.target.value)}>
              {book.accounts.map(a=><option key={a.tag} value={a.tag}>{a.tag===book.active||a.tag===a.name?a.name:a.name+' · '+a.tag}</option>)}
            </select></div>}
          {section!=='draftlab'&&<>{!!book.active&&<SyncStatus server={server?.player_tag===book.active?server:null} error={serverError} syncing={sending}/>}
            <button className="button small subtle navbar-sync" onClick={()=>void sync()}
            disabled={busy||!ready||sending} aria-busy={sending} aria-label={sending?'Sincronizando conta':'Sincronizar conta'}>
            <RefreshCw size={14} aria-hidden="true"/><span>{sending?'Sincronizando…':'Sincronizar'}</span></button></>}
          <button className="button small top-button" onClick={()=>navigate('sources')} aria-label="Gerenciar contas"><Settings size={15}/><span>Contas</span></button></div>
      </header>
      <main className={`main compact-main ${section==='draftlab'?'draft-main':''}`}>
        {filtersVisible&&<section className="card filters" aria-label="Filtros de análise">
          <div className="filters-head"><h2><Filter size={16}/> Filtros {countFilters>0&&<span>{countFilters}</span>}</h2>
            <div className="actions">{!commonPublic&&(section==='overview'||section==='progress'?[1,7,30]:[1]).map(days=><button key={days} className="text-button" onClick={()=>{
              const end=localDay(new Date().toISOString());
              const start=new Date(Date.parse(end)-(days-1)*86400000).toISOString().slice(0,10);
              setFilters({...filters,start,end});
            }}>{days===1?'Hoje':days+' dias'}</button>)}
              <button className="text-button" onClick={()=>setFilters(emptyFilters)} disabled={!countFilters}>Limpar filtros</button></div></div>
          <div className={`filter-fields ${section==='progress'?'progress-filters':commonPublic?'map-filters':''}`}>{!commonPublic&&<fieldset><legend><CalendarDays size={13}/> Período</legend>
            <div className="date-fields"><input aria-label="Data inicial" type="date" value={filters.start} onChange={e=>setFilters({...filters,start:e.target.value})}/>
              <span>–</span><input aria-label="Data final" type="date" value={filters.end} onChange={e=>setFilters({...filters,end:e.target.value})}/></div></fieldset>}
            {columnFilters.filter(([key])=>section==='progress'?key==='season':
              (!commonPublic||(key!=='rank_label'&&(key!=='season'||period==='reference')))&&
              (!['rank_label','season'].includes(key)||!!available[key].length||!!filters[key])).map(([key,label,placeholder])=><label key={key}>{label}
              <select value={filters[key]} disabled={!available[key].length&&!filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value,mode:''})}>
                <option value="">{!available[key].length&&key==='rank_label'?'Rank da partida indisponível':placeholder}</option>
                {filters[key]&&!available[key].includes(filters[key])&&<option value={filters[key]}>{filters[key]}</option>}
                {available[key].map(v=><option key={v} value={v}>{v}</option>)}</select></label>)}</div>
          {dateError&&!commonPublic&&<p className="section-note error" role="alert">A data final deve ser igual ou posterior à data inicial.</p>}
        </section>}
        {section==='overview'&&<Overview local={local} account={active} matches={rankedSeries} elo={elo} historyCount={series.length} filters={filters}
          busy={busy||!ready||sending} syncing={sending} onSettings={()=>navigate('sources')} onProgress={()=>navigate('progress')} onDraft={()=>navigate('draftlab')} onMeta={()=>navigate('meta')} onSync={()=>void sync()} onMatch={b=>setSelected(b.id)} onHistory={()=>navigate('matches')} collectorLinked={!!server?.configured}/>}
        {section==='progress'&&<Progression key={book.active} local={local} filters={progressFilters}
          matches={filteredSeries(series,data.matches,progressFilters,true,elo)} elo={elo}/>}
        {section==='matches'&&<Card title="Histórico de partidas" icon={List} sub={`${number(historySeries.length)} no recorte · ${number(series.length)} no histórico${historySeries[0]?' · Mais recente '+dateTime(historySeries[0].latest.played_at):''} · Horário de Brasília`}
          action={<label className="switch-label"><input type="checkbox" checked={rankedOnly} onChange={e=>setRankedOnly(e.target.checked)}/> Só ranqueadas</label>}>
          <MatchList key={JSON.stringify([filters,rankedOnly])} matches={historySeries} elo={elo} onOpen={b=>setSelected(b.id)}/></Card>}
        {section==='performance'&&<div className="stack" key={`performance:${book.active}`}>
          {incompletePerformance>0&&<p className="section-note">
            {number(incompletePerformance)} {incompletePerformance===1?'registro ficou':'registros ficaram'} fora do Desempenho neste recorte por falta de confirmação do resultado da série. Consulte em Partidas.
          </p>}
          <SeasonComparison matches={performanceHistory} calendar={data.ranked_seasons??[]} exportedAt={data.exported_at}
            allowed={comparisonIds} brawler={filters.player_brawler}/>
          <ModePerformance matches={performanceSeries}/>
          <BrawlerEvolution key={JSON.stringify([filters.season,filters.player_brawler,filters.map_name,filters.rank_label])}
            matches={filteredSeries(performanceHistory,data.matches,{
              ...emptyFilters,map_name:filters.map_name,mode:filters.mode,rank_label:filters.rank_label,
            },true,elo)} initialSeason={filters.season} initialBrawler={filters.player_brawler} mapFilter={filters.map_name}
            onDraft={openDraft} onMatch={setSelected}
            onTrain={(map,brawler)=>setTrainingTarget({tag:book.active,map,brawler})}/>
          <MapTraining rows={performanceRows} history={performanceHistory} elo={elo} accountName={active.name}
            selectedMap={filters.map_name} reviews={local.reviews??{}} plan={local.training} archivedPlans={local.trainingHistory}
            seed={trainingTarget?.tag===book.active?trainingTarget:undefined}
            onOpen={setSelected} onReview={(id,value)=>saveCoaching({review:{id,value}})}
            onPlan={async training=>{await saveCoaching({training});setTrainingTarget(undefined);}}
            onDraft={openDraft}/>
          <Performance rows={performanceRows}/>
        </div>}
        <div className="draft-surface" hidden={section!=='draftlab'}>
          <DraftLab active={section==='draftlab'} key={`${book.active}:${draftTarget.revision}`} matches={rankedHistory}
            profile={data.profile} defaultMap={draftTarget.map||filters.map_name} defaultSeason={draftTarget.season??filters.season}
            defaultSource={draftTarget.season===undefined?'draftmeta':'account'}/>
        </div>
        {section==='draft'&&<div className="stack">
          <MetaPeriods/>
          <MetaRankings map={filters.map_name} filters={metaFilters}/>
          <PublicMeta filters={metaFilters} matches={metaAccount}/>
          <PersonalDraftStats key={book.active} matches={rankedHistory} filters={metaFilters} imported={local.matchups}/>
          <DraftTierList meta={draftTier}/>
          <Card title="Drafts recentes" icon={History} sub="Composições dos registros ranqueados."
            action={<button className="button small subtle" onClick={()=>navigate('draftlab')}><FlaskConical size={15}/> Abrir Draft Lab</button>}>
            <MatchList matches={recentDrafts} elo={elo} compact onOpen={b=>setSelected(b.id)}/>
          </Card>
        </div>}
        {section==='meta'&&<div className="stack">
          <div className="view-tabs" aria-label="Fonte da meta">
            <button aria-pressed={metaSource==='external'} onClick={()=>setMetaSource('external')}>DraftMeta</button>
            <button aria-pressed={metaSource==='own'} onClick={()=>setMetaSource('own')}>Coleta própria e histórico</button>
          </div>
          {metaSource==='external'?<ExternalMeta matches={data.player_tag===active.tag?accountHistory:[]} accountName={active.name}/>:<><MetaDashboard filters={metaFilters} matches={metaAccount}
            onMap={map_name=>setFilters({...filters,map_name})}/>
          <SampleCollection tracking={report?.tracking} diagnostics={report?.diagnostics} notify={setFeedback} onCollected={sample=>{
            metaRevision.current++;
            if(firstMetaRead.current) setPeriod(defaultMetaPeriod(sample));
            firstMetaRead.current=false;
            setReport(sample);
          }}/>{data.meta.length>0&&<MetaView data={{...data,matches:accountHistory}} filters={metaFilters}/>}</>}</div>}
        {section==='sources'&&<div className="stack">
          <CollectorPanel server={server} serverError={serverError} battles={data.matches} onSync={()=>void sync()} syncing={sending} hasAccount={!!book.active}/>
          <HistoryCoverage matches={data.player_tag===book.active?rankedHistory:[]} onMatch={setSelected}/>
          <SupercellCredential onSaved={()=>void refreshCollection()}/>
          <Accounts tag={book.active} accounts={book.accounts}
            revision={JSON.stringify([server?.last_attempt?.id,server?.last_attempt?.status,server?.last_attempt?.finished_at])}
            busy={busy||sending||!ready||exporting}
            onSelect={tag=>void selectAccount(tag)} onSave={saveAccount} onExport={()=>void exportHistory()}/></div>}
        {section!=='draftlab'&&<footer><span><ShieldCheck size={15}/> Brawl Ranked Data</span><span>Projeto de fãs independente · Arte Supercell · <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer">Política de fãs</a> · <a href="https://github.com/Brawlify/CDN" target="_blank" rel="noreferrer">Brawlify</a></span></footer>}
      </main>
    </div>
    {(syncProgress||feedback)&&<div className="dashboard-toasts">
      {syncProgress&&<SyncProgressCard progress={syncProgress} account={active.name}/>}
      {feedback&&<FeedbackToast key={feedback} message={feedback} onDismiss={dismissFeedback}/>}
    </div>}
    {match&&<MatchDetail key={selectedSeries?.id??match.id} match={match} series={selectedSeries} elo={selectedSeries&&elo.get(selectedSeries.id)} onRound={setSelected}
      raw={local.raw[match.id]} review={local.reviews?.[match.id]} onClose={()=>setSelected(null)}
      onReview={value=>saveCoaching({review:{id:match.id,value}})}/>}
  </div></LiveMeta.Provider>;
}
