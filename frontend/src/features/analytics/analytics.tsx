import { useContext, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, Crosshair, Flame, MapPinned, Radio, Swords, Trophy } from 'lucide-react';
import type { Battle, Filters } from '@/lib/data';
import { dateTime, groupStats, localDay, modeName, normalize, number, percent, resultName, stats } from '@/lib/data';
import { AccountIcon, findMap, MapImage, ModeIcon, Portrait, RankArt, TrophyArt } from '@/components/game';
import type { Account, LocalData } from '@/lib/browser-store';
import { progressSeries, progressionWindow, RankGoal, rankProgress, TrendChart } from '@/features/analytics/progression';
import { byId, ordered, publicPicks, usePublicStats } from '@/lib/scouting';
import type { PublicStats, ScoutingRow } from '@/lib/scouting';
import { LiveMeta } from '@/lib/live';

type RankRow = ScoutingRow & { mode?: string | null };

function RankRows({ rows, kind, short = false, publicSetCount, publicUnit='séries' }: {
  rows: RankRow[]; kind: 'brawler'|'map'|'mode'; short?: boolean; publicSetCount?: number; publicUnit?: string;
}) {
  if (!rows.length) return <div className="list-empty"><Swords size={19} /> Aguardando amostra suficiente para este recorte.</div>;
  return <div className="rank-rows">{rows.slice(0,short ? 4 : 16).map((row,i) => <div className="rank-row" key={row.name}>
    <span className="row-number">{String(i+1).padStart(2,'0')}</span>
    {kind === 'map' ? <MapImage map={findMap(row.name,null,row.mode)} /> : kind === 'mode' ? <ModeIcon mode={row.name}/> : <Portrait name={row.name}/>}
    <div><strong>{kind === 'mode' ? modeName(row.name) : row.name}</strong>
      <small>{number(row.games)} {publicSetCount ? publicUnit : 'registros decisivos'}{publicSetCount ? ` · ${percent((row.pickCount??row.games)/(publicSetCount*6))} dos picks` : ''}</small></div>
    <span className="rate-track"><i style={{width:`${row.games?row.wins/row.games*100:0}%`}}/></span><strong className="row-rate">{percent(row.games?row.wins/row.games:null)}</strong>
  </div>)}</div>;
}

function Ranking({ title, rows, kind, short, publicSetCount }: { title: string; rows: RankRow[]; kind: 'brawler'|'map'|'mode'; short?: boolean; publicSetCount?: number }) {
  return <section className="card"><div className="card-head"><div><h2>{kind==='brawler'?<Crosshair size={17}/>:<MapPinned size={17}/>} {title}</h2></div></div>
    <RankRows rows={rows} kind={kind} short={short} publicSetCount={publicSetCount}/></section>;
}

function accountGroups(rows: Battle[], get: (battle: Battle) => string|null, minimum: number): RankRow[] {
  return groupStats(rows,b => [get(b)]).filter(r=>r.decided>=minimum).map(r=>({
    name:r.label,wins:r.wins,games:r.decided,details:[],mode:rows.find(b=>get(b)===r.label)?.mode,
  }));
}

export function PublicSpotlight({ onDraft, onMeta }: { onDraft:()=>void; onMeta:()=>void }) {
  const meta=usePublicStats(null,null);
  const top=ordered(publicPicks(meta.sample)).slice(0,4);
  return <section className="card public-spotlight">
    <div className="card-head"><div><h2><Radio size={17}/> Radar da meta</h2>
      <p>{meta.context ? `${number(meta.context.sets)} ${meta.index?.unit??'séries'} na amostra` : 'Amostra pública de Ranqueado'}</p></div>
      <button className="button small subtle" onClick={onMeta}>Ver meta <ArrowRight size={14}/></button></div>
    <RankRows rows={top} kind="brawler" short publicSetCount={meta.context?.sets} publicUnit={meta.index?.unit}/>
    <div className="spotlight-foot">{meta.index ? <a href={meta.index.url} target="_blank" rel="noreferrer">{meta.index.source} · {meta.index.start.slice(8)}/{meta.index.start.slice(5,7)}–{meta.index.end.slice(8)}/{meta.index.end.slice(5,7)}</a> : <span>Dados externos identificados</span>}
      <button className="text-button" onClick={onDraft}>Abrir Draft Lab <ArrowUpRight size={13}/></button></div>
  </section>;
}

const resultMarks={victory:'V',defeat:'D',draw:'E',unknown:'?'};
const dayLabel=(day:string)=>day.slice(8)+'/'+day.slice(5,7);

function RecentForm({matches,onMatch,onHistory}:{matches:Battle[];onMatch:(battle:Battle)=>void;onHistory:()=>void}) {
  const recent=matches.slice(0,12);
  const sample=stats(recent);
  const lead=recent[0]?.result;
  const stop=lead==='victory'||lead==='defeat'?matches.findIndex(b=>b.result!==lead):null;
  const streak=stop===-1?matches.length:stop;
  return <section className="card recent-form"><div className="card-head"><div><h2><Flame size={17}/> Forma recente</h2>
    <p>{recent.length?`Últimos ${recent.length} registros · mais recente à direita`:'Resultados do Ranqueado no recorte'}</p></div>
    <button className="button small subtle" onClick={onHistory}>Histórico <ArrowRight size={14}/></button></div>
    {recent.length?<><div className="recent-results">{[...recent].reverse().map(b=>{
      const key=b.result??'unknown';
      const description=[resultName(b.result),b.player_brawler,b.map_name,dateTime(b.played_at)].filter(Boolean).join(' · ');
      return <button key={b.id} className={key} title={description} aria-label={description} onClick={()=>onMatch(b)}>
        <Portrait name={b.player_brawler}/><span>{resultMarks[key]}</span></button>;
    })}</div>
      <div className="form-stats"><div><strong>{percent(sample.rate)}</strong><small>Win rate · {number(sample.decided)} decisivos</small></div>
        <div><strong>{streak===null?'—':number(streak)+' '+(lead==='victory'?(streak===1?'vitória':'vitórias'):(streak===1?'derrota':'derrotas'))}</strong>
          <small>Sequência no recorte</small></div>
        <div><strong>{number(sample.wins)}V · {number(sample.losses)}D</strong><small>{number(sample.draws)} empates · {number(sample.games-sample.decided-sample.draws)} sem resultado</small></div></div></>:
      <div className="list-empty">Sem partidas ranqueadas no recorte.</div>}
  </section>;
}

function RankedActivity({matches,filters}:{matches:Battle[];filters:Filters}) {
  const latest=filters.end|| (matches[0]?localDay(matches[0].played_at):null);
  const days=latest?Array.from({length:14},(_,i)=>new Date(Date.parse(latest)-(13-i)*86400000).toISOString().slice(0,10))
    .filter(day=>!filters.start||day>=filters.start):[];
  const byDay=new Map<string,Battle[]>();
  for(const battle of matches){
    const key=localDay(battle.played_at);
    if(!days.length||key<days[0]||key>days.at(-1)!)continue;
    const rows=byDay.get(key);
    if(rows)rows.push(battle);else byDay.set(key,[battle]);
  }
  const series=days.map(day=>({day,...stats(byDay.get(day)??[])}));
  const max=Math.max(1,...series.map(s=>s.games));
  const total=series.reduce((n,s)=>n+s.games,0);
  return <section className="card ranked-activity"><div className="card-head"><div><h2><CalendarDays size={17}/> Atividade por dia</h2>
    <p>{days.length?`${dayLabel(days[0])} – ${dayLabel(days.at(-1)!)} · horário de Brasília`:'Ranqueadas por data no histórico da conta'}</p></div>
    {!!total&&<span className="activity-count">{number(total)} registros</span>}</div>
    {total?<><ol className="activity-bars" style={{gridTemplateColumns:`repeat(${series.length},minmax(0,1fr))`}}>
      {series.map((s,i)=>{
        const other=s.games-s.decided;
        return <li key={s.day} title={`${dayLabel(s.day)} · ${s.wins} vitórias, ${s.losses} derrotas, ${other} outros resultados`}
          aria-label={`${dayLabel(s.day)}, ${s.wins} vitórias, ${s.losses} derrotas, ${other} outros resultados`}>
          <div className="activity-plot"><div className="activity-bar" style={{height:`${s.games/max*100}%`}}>
            {s.wins>0&&<i className="victory" style={{flex:s.wins}}/>}
            {s.losses>0&&<i className="defeat" style={{flex:s.losses}}/>}
            {other>0&&<i className="other" style={{flex:other}}/>}</div></div>
          <small>{series.length<8||i%3===0||i===series.length-1?s.day.slice(8):' '}</small></li>;
      })}</ol><div className="activity-legend"><span><i className="victory"/>Vitórias</span>
        <span><i className="defeat"/>Derrotas</span><span><i className="other"/>Empates ou resultado ausente</span></div></>:
      <div className="list-empty">Sem registros nesta janela.</div>}
  </section>;
}

export function Overview({ local, account, matches, filters, onSettings, onProgress, onDraft, onMeta, onSync, onMatch, onHistory, busy, collectorLinked }: {
  local: LocalData; account: Account; matches: Battle[]; filters: Filters; onSettings:()=>void; onProgress:()=>void; onDraft:()=>void;
  onMeta:()=>void; onSync:()=>void; onMatch:(battle:Battle)=>void; onHistory:()=>void; busy:boolean; collectorLinked:boolean;
}) {
  const rows=progressSeries(local);
  const summary=rankProgress(rows);
  const {current, rank}=summary;
  const trophy=rows.findLast(r=>r.trophies!==null);
  const profile=local.dataset.profile;
  const s=stats(matches);
  const previous=local.dataset.updates.find(r=>r.status==='success');
  const filteredProgress = progressionWindow(rows,filters);
  const trophyRows = filters.season ? progressionWindow(rows,{...filters,season:''}) : filteredProgress;
  const topMaps = ordered(accountGroups(matches,b=>b.map_name,3));
  const topBrawlers = ordered(accountGroups(matches,b=>b.player_brawler,3));
  const orderedMatches = [...matches].sort((a,b)=>Date.parse(b.played_at)-Date.parse(a.played_at));
  return <div className="stack">
    <div className="rank-summary-grid">
      <section className="command-hero overview-hero">
        <div className="hero-info"><div className="hero-profile"><AccountIcon id={profile?.icon_id}/><div><strong>{profile?.name || account.name}</strong><span>{account.tag}</span></div></div>
          <div className="hero-rank"><small>RANQUEADO · ÚLTIMA LEITURA</small><h2>{rank || 'Rank indisponível'}</h2>
            <p>{current ? [current.score!=null?number(current.score)+' pontos':'',dateTime(current.at),current.season,current.rank?'':'divisão de referência'].filter(Boolean).join(' · ')
              : 'Registre sua divisão e acompanhe a subida.'}</p></div>
          {!collectorLinked&&<button className="button small primary" onClick={onSettings} disabled={busy}>Ver status da coleta <ArrowRight size={15}/></button>}
          {collectorLinked&&!current&&<button className="button small primary" onClick={onSync} disabled={busy}>
            {busy?'Sincronizando…':'Sincronizar conta'} <ArrowRight size={15}/></button>}
        </div>
        <div className="hero-art" aria-hidden="true"><img className="hero-portrait one" src="/game/art/16000016.webp" alt=""/>
          <RankArt rank={rank}/><img className="hero-portrait two" src="/game/art/16000025.webp" alt=""/></div>
      </section>
      <RankGoal data={summary} onProgress={onProgress}/>
    </div>
    <div className="overview-metrics">
      <div className="card game-metric"><TrophyArt/><div><small>Troféus da conta</small><strong>{trophy?.trophies != null?number(trophy.trophies):'—'}</strong>
        <span>{trophy?dateTime(trophy.at):'Sem leitura do perfil'}</span></div></div>
      <div className="card game-metric"><span className="game-metric-icon violet"><Swords size={22}/></span><div><small>Ranqueadas no recorte</small>
        <strong>{profile||local.dataset.matches.length?number(s.games):'—'}</strong><span>{previous?'Atualizado '+dateTime(previous.finished_at):'Histórico da conta'}</span></div></div>
      <div className="card game-metric"><span className="game-metric-icon green"><Activity size={22}/></span><div><small>Win rate do recorte</small><strong>{percent(s.rate)}</strong>
        <span>{s.decided?number(s.wins)+' vitórias · '+number(s.losses)+' derrotas':'Vitórias / registros decisivos'}</span></div></div>
      <div className="card game-metric"><span className="game-metric-icon orange"><Crosshair size={22}/></span><div><small>Brawlers usados</small>
        <strong>{s.games?number(new Set(matches.flatMap(b=>b.player_brawler?[normalize(b.player_brawler)]:[])).size):'—'}</strong><span>Picks identificados no recorte</span></div></div>
    </div>
    <div className="two-col equal"><RecentForm matches={orderedMatches} onMatch={onMatch} onHistory={onHistory}/>
      <RankedActivity matches={orderedMatches} filters={filters}/></div>
    <div className="two-col equal"><TrendChart rows={trophyRows} field="trophies" label="Subida de troféus" note="Total da conta por data, independente da temporada"/>
      <TrendChart rows={filteredProgress.filter(row=>!current?.season||normalize(row.season)===normalize(current.season)||filters.season)}
        field="score" label="Pontos do Ranqueado" note={filters.season||current?.season||'Leituras do Elo'}/></div>
    <div className="two-col equal"><Ranking rows={topMaps} kind="map" title="Seus melhores mapas" short/>
      <Ranking rows={topBrawlers} kind="brawler" title="Seus melhores brawlers" short/></div>
    <PublicSpotlight onDraft={onDraft} onMeta={onMeta}/>
  </div>;
}

export function Performance({ rows, filters }: { rows: Battle[]; filters: Filters }) {
  const maps = accountGroups(rows,b=>b.map_name,3);
  const brawlers = accountGroups(rows,b=>b.player_brawler,3);
  const scope = [filters.map_name,filters.mode && modeName(filters.mode)].filter(Boolean).join(' · ');
  return <div className="stack">
    <div className="performance-note">Ordenação considera a taxa de vitória e o tamanho da amostra. Mínimo de 3 registros decisivos por item.{scope?' Recorte: '+scope+'.':''}</div>
    <div className="two-col equal"><Ranking rows={ordered(brawlers)} kind="brawler" title="Melhores brawlers"/>
      <Ranking rows={ordered(brawlers,true)} kind="brawler" title="Piores brawlers"/></div>
    <div className="two-col equal"><Ranking rows={ordered(maps)} kind="map" title="Melhores mapas"/>
      <Ranking rows={ordered(maps,true)} kind="map" title="Piores mapas"/></div>
  </div>;
}

function TableComparison({ publicSample, setCount, own, brawler, unit }: {
  publicSample: PublicStats; setCount: number; own: Battle[]; brawler: string; unit:string;
}) {
  const [order,setOrder]=useState<'win'|'pick'|'ban'>('win');
  const banById=new Map(publicSample.bans??[]);
  const banKnown=publicSample.banKnown??0;
  const banByName=new Map([...banById.entries()].flatMap(([id,n])=>byId.has(id)?[[normalize(byId.get(id)!.name),n] as const]:[]));
  const rows=publicPicks(publicSample);
  for(const [id] of banById){
    const name=byId.get(id)?.name;
    if(name&&!rows.some(r=>normalize(r.name)===normalize(name)))rows.push({name,wins:0,games:0,pickCount:0,details:[]});
  }
  const selected=rows.filter(r=>!brawler||normalize(r.name)===normalize(brawler));
  const accounts=new Map(accountGroups(own,b=>b.player_brawler,1).map(row=>[normalize(row.name),row]));
  const display=order==='win'?ordered(selected):selected.sort((a,b)=>order==='pick'?
    (b.pickCount??0)-(a.pickCount??0) : (banByName.get(normalize(b.name))??0)-(banByName.get(normalize(a.name))??0));
  return <>
    <div className="meta-table-options"><span>Ordenar por</span><select className="standalone" aria-label="Ordenar a meta" value={order} onChange={e=>setOrder(e.target.value as typeof order)}>
      <option value="win">Melhores picks · win rate e amostra</option><option value="pick">Pick rate</option><option value="ban" disabled={!banKnown}>Ban rate</option></select>
      <span>{banKnown?`${number(banKnown)} de ${number(setCount)} registros com bans explícitos`:'Ban rate indisponível nesta fonte'}</span></div>
    <div className="table-wrap"><table><thead><tr><th>Brawler</th><th>Win rate</th><th>Amostra · {unit}</th><th>Pick rate</th><th>Ban rate</th>
      <th>Win rate · conta</th><th>Registros da conta</th></tr></thead><tbody>{display.map(r=>{
        const a=accounts.get(normalize(r.name));
        return <tr key={r.name}><td><span className="image-label"><Portrait name={r.name}/>{r.name}</span></td><td>{percent(r.games?r.wins/r.games:null)}</td>
          <td>{number(r.games)}{r.games>0&&r.games<30&&<small>Amostra pequena</small>}</td>
          <td>{percent(setCount?(r.pickCount??0)/(setCount*6):null)}</td>
          <td>{percent(banKnown?(banByName.get(normalize(r.name))??0)/banKnown:null)}</td>
          <td>{percent(a?a.wins/a.games:null)}</td><td>{a?number(a.games):'—'}</td></tr>;
      })}</tbody></table>{!display.length&&<p className="section-note">Sem observações para este recorte.</p>}</div>
  </>;
}

export function PublicMeta({ filters, matches }: { filters: Filters; matches: Battle[] }) {
  const {report,period}=useContext(LiveMeta);
  const meta=usePublicStats(null,filters.map_name||null,filters);
  const aligned=meta.index?matches.filter(b=>{
    const day=localDay(b.played_at);
    return day>=meta.index!.start&&day<=meta.index!.end&&
      (period!=='patch'||!report?.patchSince||b.played_at>=report.patchSince);
  }):[];
  const historical=period==='reference';
  const last=meta.context?.latest??meta.index?.latest;
  return <section className="card"><div className="card-head"><div><h2><Radio size={17}/> Meta por mapa</h2><p>{meta.context?
    `${number(meta.context.sets)} ${meta.index?.unit??'séries'} · ${meta.context.map||'Todos os mapas'}${last?' · Última partida '+dateTime(last):''}`:
    'Win rate, pick rate e ban rate por brawler'}</p></div>
    <span className={`tag ${historical?'hypothesis':'confirmed'}`}>{historical?'Pré-patch de 11/11':'Amostra da coleta'}</span></div>
    {meta.sample&&meta.context&&meta.context.sets>0?<TableComparison key={period+':'+filters.map_name} publicSample={meta.sample}
      setCount={meta.context.sets} own={aligned} brawler={filters.player_brawler} unit={meta.index?.unit??'séries'}/>:
      <div className="list-empty"><Trophy size={18}/>{meta.loading?'Carregando amostra…':period==='patch'&&!report?.patchSince
        ?'O recorte deste patch está indisponível.':'Sem partidas coletadas para o período e filtros atuais.'}</div>}
    {!historical&&period!=='patch'&&<p className="section-note">Janela por data de Brasília. Pode incluir partidas de antes e depois de um balanceamento no mesmo dia.</p>}
    {meta.index&&<div className="scout-foot"><a href={meta.index.url} target="_blank" rel="noreferrer">{meta.index.source}</a>
      {' · '+meta.index.start+' a '+meta.index.end+' · Pick rate por espaço de escolha. Ban rate por registro com lista explícita.'}</div>}
    {!historical&&<p className="section-note">A coleta própria é uma amostra de jogadores de ranking de troféus e participantes encontrados nos battle logs. <a href="https://brawlhub.gg/meta/" target="_blank" rel="noreferrer">Consultar referência externa no BrawlHub</a></p>}
  </section>;
}
