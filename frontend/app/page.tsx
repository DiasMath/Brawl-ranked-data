'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, CalendarDays, ChartColumnIncreasing, ChevronDown, ChevronLeft, ChevronRight, Crosshair, Database,
  FileJson, Filter, FlaskConical, History, LayoutDashboard, List, LockKeyhole, Menu, RefreshCw, ShieldCheck,
  Swords, Target, TrendingUp, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  comparable, dateTime, draftStats, emptyFilters, filtered, localDay, metaFor,
  modeName, normalize, number, percent, resultName, safeLink, stats,
} from './data';
import type { Battle, Dataset, Filters } from './data';
import { blankLocal, downloadSnapshot, fromSnapshot, initialBook, loadBook, loadLocal, saveBook, saveLocal } from './browser-store';
import type { AccountBook, LocalData, Progress } from './browser-store';
import { AccountIcon, brawlers, findMap, MapImage, ModeIcon, ModeLabel, Portrait, RankArt } from './game';
import { Overview, Performance } from './analytics';
import { Progression } from './progression';
import { Accounts } from './accounts';
import { CounterFinder, DraftLab } from './draft-lab';
import { MetaDashboard, MetaRankings, VisualRanking } from './meta-dashboard';
import { CollectorPanel, MetaPeriods } from './collector-panel';
import { collectionRequest, LiveMeta } from './live';
import type { LivePeriod, ServerCollection } from './live';
import publicIndex from '../public/scouting/index.json';

const navigation = [
  { key: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { key: 'progress', label: 'Progressão', icon: TrendingUp },
  { key: 'matches', label: 'Partidas', icon: List },
  { key: 'performance', label: 'Desempenho', icon: ChartColumnIncreasing },
  { key: 'draftlab', label: 'Draft Lab', icon: FlaskConical },
  { key: 'draft', label: 'Picks, bans e counters', icon: Crosshair },
  { key: 'meta', label: 'Meta', icon: Target },
  { key: 'sources', label: 'Contas e dados', icon: Database },
] as const;
type Section = typeof navigation[number]['key'];
const subtitles: Record<Section, string> = {
  overview: 'Rank, forma recente e desempenho da sua conta.',
  progress: 'Troféus, pontos e plano para a próxima divisão.',
  matches: 'Consulte o histórico e abra o mapa, as equipes e os resultados.',
  performance: 'Encontre seus melhores e piores brawlers e mapas.',
  draftlab: 'Monte o draft e explore picks, bans e counters no recorte escolhido.',
  draft: 'Compare picks, bans e confrontos em um só lugar.',
  meta: 'Compare win rate, picks e bans por mapa com os dados da sua conta.',
  sources: 'Acompanhe a conta monitorada e as consultas do servidor.',
};
const columnFilters = [
  ['map_name', 'Mapa', 'Todos os mapas'],
  ['player_brawler', 'Brawler', 'Todos os brawlers'], ['rank_label', 'Rank', 'Todos os ranks'],
  ['season', 'Temporada', 'Todas'],
] as const;
const pageSize = 15;

function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Icon size={22} /></span><strong>{title}</strong>
    {children && <p>{children}</p>}</div>;
}

function Card({ title, sub, icon: Icon, action, children, className = '' }: {
  title: string; sub?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={`card ${className}`}><div className="card-head"><div>
    <h2>{Icon && <Icon size={17} />}{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>;
}

function Pill({ kind = 'neutral', children }: { kind?: string; children: ReactNode }) {
  return <span className={`pill ${kind}`}><i />{children}</span>;
}

function resultTone(result: Battle['result']) {
  return result === 'victory' ? 'success' : result === 'defeat' ? 'danger' : 'neutral';
}

function MatchList({ matches, onOpen, compact = false }: { matches: Battle[]; onOpen: (b: Battle) => void; compact?: boolean }) {
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
  if (!matches.length) return <Empty icon={List} title="Nenhuma partida encontrada">Atualize o histórico ou ajuste os filtros do recorte.</Empty>;
  const visible = compact ? matches.slice(0, 6) : matches.slice(current * pageSize, (current + 1) * pageSize);
  return <><div className="table-wrap"><table><thead><tr><th>Data e hora</th><th>Mapa / modo</th><th>Brawler</th><th>Resultado</th>
    <th>Rank</th><th aria-label="Detalhes" /></tr></thead><tbody>{visible.map(b => <tr key={b.id}>
      <td>{dateTime(b.played_at)}</td><td><span className="image-label"><ModeIcon mode={b.mode}/><span><strong>{b.map_name ?? '—'}</strong><small>{modeName(b.mode)}</small></span></span></td>
      <td><span className="image-label"><Portrait name={b.player_brawler}/>{b.player_brawler ?? '—'}</span></td><td><Pill kind={resultTone(b.result)}>{resultName(b.result)}</Pill></td>
      <td>{b.rank_label?<span className="image-label inline-rank"><RankArt rank={b.rank_label}/>{b.rank_label}</span>:'—'}</td><td><button className="icon-button" aria-label={`Detalhar partida de ${dateTime(b.played_at)}`}
        onClick={() => onOpen(b)}><ChevronRight size={16} /></button></td></tr>)}</tbody></table></div>
    {!compact && <div className="pager"><span>{number(matches.length)} registros</span><div>
      <button className="icon-button" disabled={!current} aria-label="Página anterior" onClick={() => setPage(current - 1)}><ChevronLeft size={17} /></button>
      <span>{current + 1} / {Math.ceil(matches.length / pageSize)}</span>
      <button className="icon-button" disabled={(current + 1) * pageSize >= matches.length} aria-label="Próxima página"
        onClick={() => setPage(current + 1)}><ChevronRight size={17} /></button></div></div>}</>;
}

type Evidence = { rank_label: string|null; rank_score: number|null; season: string|null; bans: string[]|null; evidence:string };
function MatchDetail({ match, raw, onClose, onChange }: { match: Battle; raw: unknown; onClose: () => void; onChange: (record:Evidence) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  async function saveEvidence(form: FormData) {
    const value = (key: string) => String(form.get(key) ?? '').trim();
    setSaving(true);
    try {
      await onChange({
        rank_label: value('rank') || null, rank_score: value('score') ? Number(value('score')) : null,
        season: value('season') || null, bans: form.get('noBans') ? [] : (value('bans') ? value('bans').split(',').map(s => s.trim()).filter(Boolean) : null),
        evidence: value('source'),
      });
      setEvidenceOpen(false);
      setFeedback('Evidência registrada.');
    } catch (error) { setFeedback((error as Error).message); }
    finally { setSaving(false); }
  }
  const groups = [...new Set(match.players.map(p => p.team_index))];
  return <dialog ref={dialog} className="drawer" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="drawer-content"><div className="drawer-head"><div><span className="eyebrow">Histórico de partidas</span>
      <h2>{match.map_name ?? 'Partida'}</h2><p>{modeName(match.mode)} · {dateTime(match.played_at)}</p></div>
      <button className="icon-button" aria-label="Fechar detalhes" onClick={onClose}><X size={21} /></button></div>
    <div className="detail-map"><MapImage map={findMap(match.map_name,match.event_id,match.mode)}/><ModeLabel mode={match.mode}/></div>
    <div className="detail-status"><Pill kind={resultTone(match.result)}>{resultName(match.result)}</Pill>
      <Pill kind={match.ranked ? 'accent' : 'neutral'}>{match.ranked ? 'Ranqueado' : match.api_type ?? 'Tipo indisponível'}</Pill>
      {match.duration_seconds !== null && <span>{match.duration_seconds}s</span>}
      {match.trophy_change!=null&&<span>{match.trophy_change>0?'+':''}{match.trophy_change} troféus</span>}</div>
    <dl className="detail-grid">
      <div><dt>Rank</dt><dd>{match.rank_label ?? 'Indisponível'}{match.rank_source && <small>Evidência · {match.rank_reference}</small>}</dd></div>
      <div><dt>Pontos de rank</dt><dd>{match.rank_score === null ? 'Indisponível' : number(match.rank_score)}{match.score_source && <small>Evidência · {match.score_reference}</small>}</dd></div>
      <div><dt>Temporada</dt><dd>{match.season ?? 'Indisponível'}{match.season_source && <small>Evidência · {match.season_reference}</small>}</dd></div>
      <div><dt>Bans</dt><dd>{match.bans === null ? 'Indisponível' : match.bans.join(', ') || 'Nenhum registrado'}{match.bans_source && <small>Evidência · {match.bans_reference}</small>}</dd></div>
    </dl>
    {groups.length ? groups.map(group => {
      const members = match.players.filter(p => p.team_index === group);
      const hasSelf = members.some(p => p.side === 'self');
      const isOpponent = members.every(p => p.side === 'opponent');
      return <section key={group} className="team"><h3>{hasSelf ? 'Sua equipe' : isOpponent ? 'Equipe adversária' : `Grupo ${group + 1}`}</h3>
        {members.map((p, i) => <div key={i} className="member"><div><strong>{p.player_name ?? 'Jogador'}</strong><small>{p.player_tag ?? '—'}</small></div>
          <div className="image-label"><Portrait name={p.brawler} id={p.brawler_id}/><div><strong>{p.brawler ?? '—'}</strong><small>{p.power !== null ? `Poder ${p.power}` : ''}</small></div></div>{p.side === 'self' && <Pill kind="accent">Você</Pill>}</div>)}</section>;
    }) : <Empty icon={Swords} title="Composição indisponível" />}
    {feedback && <p className="feedback" role="status">{feedback}</p>}
    <div className="actions">
      {match.ranked && <button className="button subtle" onClick={() => setEvidenceOpen(v => !v)}><FileJson size={16} /> Registrar evidência</button>}
      {raw !== undefined && <button className="button subtle" onClick={()=>setRawOpen(v=>!v)}><ChevronDown size={16} /> {rawOpen ? 'Ocultar JSON' : 'Ver JSON da API'}</button>}
    </div>
    {evidenceOpen && <form className="evidence-form" onSubmit={event => { event.preventDefault(); void saveEvidence(new FormData(event.currentTarget)); }}>
      <p className="muted">Preencha somente campos verificáveis em uma captura ou registro. Campos da API têm prioridade.</p>
      <label>Rank observado<input name="rank" maxLength={60} /></label>
      <label>Pontos de rank<input name="score" type="number" min={0} max={2147483647} /></label>
      <label>Temporada<input name="season" maxLength={100} /></label>
      <label>Bans separados por vírgulas<input name="bans" /></label>
      <label className="checkbox"><input name="noBans" type="checkbox" /> A evidência confirma ausência de bans</label>
      <label>Referência da evidência<input name="source" required minLength={3} maxLength={400} /></label>
      <button className="button primary" disabled={saving}>Salvar evidência</button>
    </form>}
    {rawOpen && raw !== undefined && <pre className="raw">{JSON.stringify(raw, null, 2)}</pre>}
    </div></dialog>;
}

function MetaView({ data, filters }: { data: Dataset; filters: Filters }) {
  const rows = metaFor(data.meta, filters);
  return <Card title="Sua conta × meta" icon={Target} sub="Win rate calculado sobre vitórias e derrotas no período e recorte de cada fonte.">
    {rows.length ? <div className="table-wrap"><table><thead><tr><th>Brawler / recorte</th><th>Sua taxa / n</th><th>Meta / n</th><th>Diferença</th>
      <th>Pick / ban da meta</th><th>Fonte</th></tr></thead><tbody>{rows.map(row => {
      const s = stats(comparable(data.matches, row)); const rate = row.wins / row.games;
      const delta = s.rate === null ? null : (s.rate - rate) * 100;
      return <tr key={row.id}><td><strong>{row.brawler}</strong><small>{[row.map_name, row.mode && modeName(row.mode), row.rank_label, row.season].filter(Boolean).join(' · ') || 'Geral'}</small></td>
        <td>{percent(s.rate)} / {number(s.decided)}</td><td>{percent(rate)} / {number(row.games)}</td>
        <td>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`}</td>
        <td>{percent(row.pick_total ? row.pick_count! / row.pick_total : null)} / {percent(row.ban_total ? row.ban_count! / row.ban_total : null)}</td>
        <td><a href={safeLink(row.source_url)} target="_blank" rel="noreferrer">{row.source_name}</a><small>{row.period_start} → {row.period_end}</small></td></tr>;
    })}</tbody></table></div> : <Empty icon={Target} title="Meta indisponível neste recorte">As observações externas aparecem quando estiverem disponíveis neste recorte.</Empty>}
    {rows.length > 0 && <p className="section-note"><Pill kind="accent">Hipótese</Pill> Diferenças observadas podem refletir amostra, estratégia ou seleção da fonte. A comparação é descritiva.</p>}
  </Card>;
}

export default function Dashboard() {
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

  const metaFilters={...filters,start:'',end:''};
  const ranked=useMemo(()=>filtered(data.matches,filters,true),[data.matches,filters]);
  const metaAccount=filtered(data.matches,metaFilters,true);
  const shownMatches=useMemo(()=>rankedOnly?ranked:filtered(data.matches,filters,false),[data.matches,filters,ranked,rankedOnly]);
  const draft=draftStats(ranked);
  const current=navigation.find(item=>item.key===section)!;
  const filtersVisible=!['sources','draftlab'].includes(section);
  const progressFilters={...emptyFilters,start:filters.start,end:filters.end,season:filters.season};
  const countFilters=Object.values(section==='meta'||section==='draft'?metaFilters:section==='progress'?progressFilters:filters).filter(Boolean).length;
  const dateError=Boolean(filters.start&&filters.end&&filters.end<filters.start);
  const commonPublic=section==='meta'||section==='draft';
  const available=useMemo(()=>Object.fromEntries(columnFilters.map(([key])=>{
    const source=section==='matches'&&!rankedOnly?data.matches:data.matches.filter(b=>b.ranked);
    const values=source.map(b=>b[key]);
    if(commonPublic){
      values.push(...data.meta.map(m=>key==='player_brawler'?m.brawler:m[key]));
      if(key==='map_name')values.push(...publicIndex.contexts.map(c=>c.map));
      if(key==='season')values.push(publicIndex.season);
      if(key==='player_brawler')values.push(...brawlers.map(b=>b.name));
    }
    if(key==='season')values.push(...local.progress.map(p=>p.season));
    if(key==='rank_label')values.push(...local.progress.map(p=>p.rank));
    return [key,[...new Map(values.filter((v):v is string=>Boolean(v)).map(v=>[normalize(v),v])).values()].sort((a,b)=>a.localeCompare(b,'pt-BR'))];
  })),[data,local.progress,section,rankedOnly,commonPublic]);

  return <LiveMeta.Provider value={{report:null,period,setPeriod}}><div className={`shell lab-shell ${section==='draftlab'?'draft-shell':''}`}>
    {menuOpen&&<button className="mobile-scrim" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}/>}
    <aside className={`sidebar ${menuOpen?'open':''}`}>
      <button className="brand" onClick={()=>navigate('overview')}><span className="logo"><ShieldCheck size={23}/></span>
        <span><strong>Brawl Ranked Lab</strong><small>CENTRAL COMPETITIVA</small></span></button>
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
        <div className="top-actions"><span className="account-tag"><span className="account-dot"/>{book.active}</span>
          {section!=='draftlab'&&<button className="button small subtle navbar-sync" onClick={()=>void sync()} disabled={busy||!ready||sending} aria-label="Sincronizar conta">
            <RefreshCw size={14} className={sending?'spin':''}/><span>Sincronizar</span></button>}
          <button className="button small top-button" onClick={()=>navigate('sources')}><AccountIcon id={data.profile?.icon_id}/><span>Contas</span></button></div>
      </header>
      <main className={`main compact-main ${section==='draftlab'?'draft-main':''}`}>
        {section!=='sources'&&feedback&&<p className="feedback page-feedback" role="status">{feedback}<button className="icon-button" aria-label="Dispensar mensagem" onClick={()=>setFeedback('')}><X size={15}/></button></p>}
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
            {columnFilters.filter(([key])=>section!=='progress'||key==='season').map(([key,label,placeholder])=><label key={key}>{label}
              <select value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value,mode:''})}>
                <option value="">{placeholder}</option>{filters[key]&&!available[key].includes(filters[key])&&<option value={filters[key]}>{filters[key]}</option>}
                {available[key].map(v=><option key={v} value={v}>{v}</option>)}</select></label>)}</div>
          {dateError&&!commonPublic&&<p className="section-note error" role="alert">A data final deve ser igual ou posterior à data inicial.</p>}
        </section>}
        {section==='overview'&&<Overview local={local} account={active} matches={ranked} filters={filters}
          busy={busy||!ready||sending} onSettings={()=>navigate('sources')} onProgress={()=>navigate('progress')} onDraft={()=>navigate('draftlab')} onMeta={()=>navigate('meta')} onSync={()=>void sync()} onMatch={b=>setSelected(b.id)} onHistory={()=>navigate('matches')} collectorLinked={!!server?.configured}/>}
        {section==='progress'&&<Progression key={book.active} local={local} filters={progressFilters}
          matches={filtered(data.matches,progressFilters,true)} onSave={saveProgress}/>}
        {section==='matches'&&<Card title="Histórico de partidas" icon={List} sub={`Horário de Brasília · ${shownMatches.length?'Partida mais recente '+dateTime(shownMatches[0].played_at):'Sem registros neste recorte'}`}
          action={<label className="switch-label"><input type="checkbox" checked={rankedOnly} onChange={e=>setRankedOnly(e.target.checked)}/> Só ranqueadas</label>}>
          <MatchList key={JSON.stringify([filters,rankedOnly])} matches={shownMatches} onOpen={b=>setSelected(b.id)}/></Card>}
        {section==='performance'&&<Performance rows={ranked} filters={filters}/>}
        <div className="draft-surface" hidden={section!=='draftlab'}>
          <DraftLab key={book.active} matches={data.matches.filter(b=>b.ranked)} profile={data.profile} defaultMap={filters.map_name}/>
        </div>
        {section==='draft'&&<div className="stack">
          <MetaPeriods/>
          <MetaRankings map={filters.map_name} filters={metaFilters}/>
          <CounterFinder matches={metaAccount} mode="" map={filters.map_name} filters={metaFilters} imported={local.matchups}/>
          <div className="two-col equal">
            <VisualRanking title="Meus picks" metric="pick"
              rows={draft.picks?draft.rows.filter(r=>r.picks>0).map(r=>({name:r.label,value:r.picks/draft.picks,detail:number(r.picks)+' picks próprios'})):[]}
              empty="Sincronize a conta para ver seus picks."/>
            <VisualRanking title="Bans observados na minha conta" metric="ban"
              rows={draft.drafts?draft.rows.filter(r=>r.bans>0).sort((a,b)=>b.bans-a.bans)
                .map(r=>({name:r.label,value:r.bans/draft.drafts,detail:number(r.bans)+' em '+number(draft.drafts)+' listas'})):[]}
              empty={draft.drafts?'Nenhum ban registrado nas listas conhecidas.':'Sem listas explícitas no histórico da conta.'}/>
          </div>
          <Card title="Drafts recentes" icon={History} sub="Composições dos registros ranqueados."
            action={<button className="button small subtle" onClick={()=>navigate('draftlab')}><FlaskConical size={15}/> Abrir Draft Lab</button>}>
            <MatchList matches={ranked.filter(b=>b.players.some(p=>p.side==='ally')&&b.players.some(p=>p.side==='opponent'))} compact onOpen={b=>setSelected(b.id)}/>
          </Card>
        </div>}
        {section==='meta'&&<div className="stack"><MetaDashboard filters={metaFilters} matches={metaAccount}
          onMap={map_name=>setFilters({...filters,map_name})}/>{data.meta.length>0&&<MetaView data={data} filters={metaFilters}/>}</div>}
        {section==='sources'&&<div className="stack">
          <CollectorPanel server={server} serverError={serverError} battles={data.matches} onSync={()=>void sync()} syncing={sending}/>
          <Accounts tag={book.active} data={local} busy={busy||!ready} feedback={feedback} onExport={()=>downloadSnapshot(local)}/></div>}
        {section!=='draftlab'&&<footer><span><ShieldCheck size={15}/> Brawl Ranked Lab</span><span>Projeto de fãs independente · Arte Supercell · <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer">Política de fãs</a> · <a href="https://github.com/Brawlify/CDN" target="_blank" rel="noreferrer">Brawlify</a></span></footer>}
      </main>
    </div>
    {match&&<MatchDetail key={match.id} match={match} raw={local.raw[match.id]} onClose={()=>setSelected(null)} onChange={saveEvidence}/>}
  </div></LiveMeta.Provider>;
}
