import { useContext, useState } from 'react';
import { Ban, ChartNoAxesCombined, Crosshair, MapPinned, Radio, Swords, Trophy } from 'lucide-react';
import { PublicMeta } from '@/features/analytics/analytics';
import { MetaPeriods } from '@/features/collection/collector-panel';
import { findMap, MapImage, ModeIcon, Portrait, roleName } from '@/components/game';
import { LiveMeta } from '@/lib/live';
import { byId, ordered, publicPicks, usePublicStats, wilson } from '@/lib/scouting';
import type { PublicStats } from '@/lib/scouting';
import type { Battle, Filters } from '@/lib/data';
import { dateTime, modeName, normalize, number, percent } from '@/lib/data';

type Metric='win'|'pick'|'ban';
const MIN_TIER_GAMES=30;
type ChartRow={name:string; value:number; detail:string};

function metaLeaders(sample:PublicStats, volume:number, metric:Metric):ChartRow[] {
  const picks=publicPicks(sample);
  if(metric==='ban'){
    if(!sample.banKnown)return [];
    return [...(sample.bans??[])].sort((a,b)=>b[1]-a[1]).flatMap(([id,n])=>{
      const b=byId.get(id);
      return b?[{name:b.name,value:n/sample.banKnown!,detail:`${number(n)} bans · ${number(sample.banKnown!)} registros com lista`}]:[];
    });
  }
  if(metric==='pick')return picks.sort((a,b)=>(b.pickCount??0)-(a.pickCount??0)).map(r=>({
    name:r.name,value:volume?(r.pickCount??0)/(volume*6):0,detail:`${number(r.pickCount??0)} escolhas`,
  }));
  return ordered(picks.filter(r=>r.games>0)).map(r=>({name:r.name,value:r.wins/r.games,detail:`${number(r.games)} resultados decisivos`}));
}

export function VisualRanking({title,rows,limit=5,metric='win',empty,portraits=true}:{
  title:string;rows:ChartRow[];limit?:number;metric?:Metric;empty?:string;portraits?:boolean;
}) {
  const Icon=metric==='ban'?Ban:metric==='pick'?Crosshair:Trophy;
  const shown=rows.slice(0,limit);
  const scale=metric==='win'?1:Math.max(0.01,...shown.map(r=>r.value));
  return <section className="card visual-ranking">
    <div className="card-head"><div><h2><Icon size={17}/>{title}</h2></div></div>
    {shown.length?<ol>{shown.map((row,i)=><li className={`metric-row metric-${metric}`} key={row.name}>
      <span className="row-number">{String(i+1).padStart(2,'0')}</span>
      {portraits&&<Portrait name={row.name}/>}
      <div className="metric-description"><strong>{row.name}</strong><small>{row.detail}</small>
        <span className="rate-track" aria-hidden="true"><i style={{width:`${Math.min(100,row.value/scale*100)}%`}}/></span></div>
      <b>{percent(row.value)}</b>
    </li>)}</ol>:<div className="list-empty">{empty??'Sem dados para este recorte.'}</div>}
  </section>;
}

export function MetaRankings({map='',filters}: {map?:string;filters?:Filters}) {
  const meta=usePublicStats(null,map||null,filters);
  const sample=meta.sample, volume=meta.context?.sets??0;
  const base=sample?metaLeaders(sample,volume,'win'):[];
  const picks=sample?metaLeaders(sample,volume,'pick'):[];
  const bans=sample?metaLeaders(sample,volume,'ban'):[];
  const matchesFilter=(r:ChartRow)=>!filters?.player_brawler||normalize(r.name)===normalize(filters.player_brawler);
  const classes=new Map<string,number>();
  for(const [id,,decisive,pickCount] of sample?.picks??[]){
    const brawler=byId.get(id);
    const role=brawler?roleName(brawler.role):'Outras';
    classes.set(role,(classes.get(role)??0)+(pickCount??decisive));
  }
  const classRows=[...classes].sort((a,b)=>b[1]-a[1]).map(([name,pickCount])=>({
    name,value:volume?pickCount/(volume*6):0,detail:`${number(pickCount)} escolhas`,
  }));
  const allies=(sample?.allies??[]).filter(([a,b,,n])=>a<b&&n>=MIN_TIER_GAMES)
    .sort((a,b)=>wilson(b[2],b[3])-wilson(a[2],a[3])).slice(0,5);
  return <><div className="visual-grid">
    <VisualRanking title="Melhores picks" rows={base.filter(matchesFilter)}/>
    <VisualRanking title="Mais escolhidos" rows={picks.filter(matchesFilter)} metric="pick"/>
    <VisualRanking title="Mais banidos" rows={bans.filter(matchesFilter)} metric="ban"
      empty={sample?.banKnown?'Nenhum ban deste recorte.':'Sem listas explícitas de bans nesta amostra.'}/>
  </div>{!!volume&&<div className="two-col equal">
    <VisualRanking title="Classes mais escolhidas" rows={classRows} metric="pick" limit={7} portraits={false}/>
    <section className="card ally-analysis"><div className="card-head"><div><h2><Swords size={17}/> Duplas de aliados</h2>
      <p>Vitórias observadas quando os dois foram escolhidos na mesma equipe.</p></div></div>
      {allies.length?<ol>{allies.map(([a,b,w,n])=><li key={`${a}:${b}`}><Portrait id={a}/><Portrait id={b}/><div>
        <strong>{byId.get(a)?.name??'Brawler'} + {byId.get(b)?.name??'Brawler'}</strong><small>{number(n)} resultados decisivos</small></div><b>{percent(w/n)}</b></li>)}</ol>:
        <div className="list-empty">Sem duplas com amostra suficiente.</div>}</section>
  </div>}</>;
}

function TierList({ sample, brawler, chooseMap=false }: { sample: PublicStats | null; brawler: string; chooseMap?: boolean }) {
  const eligible=ordered(publicPicks(sample).filter(row=>row.games>=MIN_TIER_GAMES));
  const tiers=['S','A','B','C'].map((label,index)=>({label, rows:eligible.filter((row,rank)=>
    (rank/eligible.length<.15?0:rank/eligible.length<.4?1:rank/eligible.length<.75?2:3)===index &&
    (!brawler||normalize(brawler)===normalize(row.name)))}));
  return <section className="card meta-tier-list">
    <div className="card-head"><div><h2><Trophy size={17}/> Tier list</h2>
      <p>Faixas relativas ao recorte, ordenadas pela taxa de vitória com ajuste pela amostra. Mínimo de {MIN_TIER_GAMES} resultados decisivos por brawler.</p></div></div>
    {tiers.some(tier=>tier.rows.length)?tiers.filter(tier=>tier.rows.length).map(tier=><div key={tier.label} className="tier-row">
      <strong className={`tier-letter tier-${tier.label}`}>{tier.label}</strong>
      <ul>{tier.rows.map(row=><li key={row.name}><Portrait name={row.name}/><div><strong>{row.name}</strong>
        <small>{percent(row.wins/row.games)} · {number(row.games)} decisivos</small></div></li>)}</ul>
    </div>):<div className="list-empty">{chooseMap?'Selecione um mapa para ver a tier list.':'Amostra insuficiente para classificar neste recorte.'}</div>}
  </section>;
}

export function MetaDashboard({filters,matches,onMap}:{
  filters:Filters;matches:Battle[];onMap:(map:string)=>void;
}) {
  const [tab,setTab]=useState<'overview'|'map'|'top'>('overview');
  const [metric,setMetric]=useState<Metric>('win');
  const {period,report,setPeriod}=useContext(LiveMeta);
  const meta=usePublicStats(null,filters.map_name||null,filters);
  const contexts=meta.index?.contexts.filter(c=>c.map&&c.sets)??[];
  const volume=meta.context?.sets??0;
  const sample=meta.sample;
  const latest=meta.context?.latest??meta.index?.latest;
  const window=period==='reference'?null:report?.windows[period];
  const previous=report?.windows.previous_patch;
  const previousMap=previous?.contexts.find(c=>normalize(c.map)===normalize(filters.map_name));
  const hasPreviousTier=publicPicks(previousMap?.sample??null).some(r=>r.games>=MIN_TIER_GAMES&&
    (!filters.player_brawler||normalize(r.name)===normalize(filters.player_brawler)));
  const historicalComparison=period==='patch'&&(!sample||!publicPicks(sample).some(r=>r.games>=MIN_TIER_GAMES&&(!filters.player_brawler||normalize(r.name)===normalize(filters.player_brawler))));
  const showMap=(map:string)=>{onMap(map);setTab('map');};
  return <div className="stack meta-dashboard">
    <div className="meta-toolbar">
      <nav className="view-tabs" aria-label="Visualizações da Meta">
        {([['overview','Visão geral'],['map','Por mapa'],['top','Top 10']] as const).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
      </nav>
      <MetaPeriods/>
    </div>
    {window?.source_url&&<section className="card meta-period-summary">
      <div className="card-head"><div><h2>{window.label}</h2><p>{window.start} a {window.end} · Horário de Brasília</p></div>
        <a href={window.source_url} target="_blank" rel="noreferrer">Fonte do período</a></div>
      {window.date_only&&<p className="section-note">{period==='season'?'Consolidado com limites conservadores por data. Pode incluir partidas de mais de um patch.':'Horário do balanceamento ainda sem confirmação. A janela de transição foi excluída das tier lists por patch.'}</p>}
    </section>}
    {tab==='overview'&&<>
      <div className="meta-kpis">
        <section className="card"><Radio size={19}/><small>Amostra</small><strong>{meta.context?number(volume):'—'}</strong><span>{meta.index?.unit??'séries'} no recorte</span></section>
        <section className="card"><MapPinned size={19}/><small>Mapas na fonte</small><strong>{meta.index?number(contexts.length):'—'}</strong><span>{filters.map_name||'Todos os mapas'}</span></section>
        <section className="card"><Ban size={19}/><small>Cobertura de bans</small><strong>{sample?.banKnown&&volume?percent(sample.banKnown/volume):'—'}</strong><span>{sample?.banKnown?number(sample.banKnown)+' listas explícitas':'Listas não disponíveis'}</span></section>
        <section className="card"><ChartNoAxesCombined size={19}/><small>Período da fonte</small><strong className="date-kpi">{meta.index?`${meta.index.start.slice(8)}/${meta.index.start.slice(5,7)} – ${meta.index.end.slice(8)}/${meta.index.end.slice(5,7)}`:'—'}</strong>
          <span>{latest?'Última partida '+dateTime(latest):window?'Coleta própria':'Histórico anterior ao patch de 11/11'}</span></section>
      </div>
      <TierList sample={sample} brawler={filters.player_brawler}/>
      {historicalComparison&&<section className="card meta-period-summary"><div className="card-head">
        <div><h2>Referência do patch anterior</h2><p>{hasPreviousTier&&previousMap?`${previous?.label} · ${number(previousMap.sets)} registros da coleta`:'EliF77 · Ranqueado · séries decisivas de 4–5/11'}</p></div>
        <button className="button small subtle" onClick={()=>setPeriod(hasPreviousTier?'previous_patch':'reference')}>Ver referência</button>
      </div></section>}
    </>}
    {tab==='map'&&<>
      <section className="card meta-maps"><div className="card-head"><div><h2><MapPinned size={17}/> Mapas com dados</h2><p>Os mapas abaixo têm mais registros na janela selecionada.</p></div></div>
        {contexts.length?<div className="meta-map-grid">{[...contexts].sort((a,b)=>b.sets-a.sets).slice(0,6).map(c=><button key={c.key}
          aria-pressed={normalize(filters.map_name)===normalize(c.map)} onClick={()=>showMap(c.map!)}>
          <MapImage map={findMap(c.map)}/><span><strong>{c.map}</strong><small><ModeIcon mode={c.mode}/>{modeName(c.mode)}</small></span><b>{number(c.sets)}</b>
        </button>)}</div>:<div className="list-empty">Nenhum mapa disponível nesta janela.</div>}</section>
      <TierList sample={filters.map_name?sample:null} brawler={filters.player_brawler} chooseMap={!filters.map_name}/>
      <PublicMeta filters={filters} matches={matches}/>
    </>}
    {tab==='top'&&<div className="stack">
      <div className="view-tabs" aria-label="Métrica do Top 10">{([['win','Melhores picks'],['pick','Pick rate'],['ban','Ban rate']] as const).map(([id,label])=>
        <button key={id} aria-pressed={metric===id} onClick={()=>setMetric(id)}>{label}</button>)}</div>
      <VisualRanking title={metric==='win'?'Top 10 · Melhores picks':metric==='pick'?'Top 10 · Mais escolhidos':'Top 10 · Mais banidos'}
        metric={metric} limit={10} rows={sample?metaLeaders(sample,volume,metric).filter(r=>!filters.player_brawler||normalize(r.name)===normalize(filters.player_brawler)):[]}
        empty={metric==='ban'?'Nenhuma lista de bans disponível para este recorte.':undefined}/>
    </div>}
    {(window?.minimum_elo!=null||period==='competitive')&&<p className="section-note">Partidas observadas em históricos de jogadores com Elo de pelo menos {number(window?.minimum_elo??report?.tracking?.minimum_elo??8250)} no perfil consultado.</p>}
    {tab!=='map'&&meta.index&&<p className="section-note">Melhores picks consideram taxa de vitória e tamanho da amostra. Pick rate usa os espaços de escolha.
      {' '}<a href={meta.index.url} target="_blank" rel="noreferrer">{meta.index.source}</a></p>}
  </div>;
}
