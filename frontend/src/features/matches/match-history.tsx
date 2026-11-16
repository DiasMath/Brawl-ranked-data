import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Clock3, List, Star, X } from 'lucide-react';
import { Empty, Pill } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { findMap, MapImage, ModeIcon, ModeLabel, Portrait, RankArt } from '@/components/game';
import { dateTime, durationLabel, modeName, number, resultName, safeLink } from '@/lib/data';
import { seasonLabel } from '@/lib/ranked-seasons';
import { ReplayAnnotation } from '@/features/analytics/replay-annotation';
import type { ReplayReview } from '@/lib/coaching';
import type { Battle } from '@/lib/data';
import { matchKd, roundKd, seriesDuration, seriesRank } from '@/lib/match-series';
import type { MatchElo, MatchSeries } from '@/lib/match-series';
import { MatchBans, MatchScoreboard } from './match-scoreboard';

function resultTone(result: Battle['result']) {
  return result === 'victory' ? 'success' : result === 'defeat' ? 'danger' : 'neutral';
}

export function MatchList({ matches, elo, onOpen, compact = false }: {
  matches: MatchSeries[]; elo?:Map<string,MatchElo>; onOpen: (b: Battle) => void; compact?: boolean;
}) {
  if (!matches.length) return <Empty icon={List} title="Nenhuma partida encontrada">Atualize o histórico ou ajuste os filtros do recorte.</Empty>;
  const showKd=matches.some(series=>matchKd(series)!==null);
  const showRank=matches.some(series=>seriesRank(series)||elo?.get(series.id)?.rank);
  return <PagedTable label="Tabela do histórico de partidas" className={compact?'':'match-history-scroll'}
    rows={compact?matches.slice(0,6):matches} showSinglePage={!compact} unit={['partida','partidas']}
    headings={<><th>Data e hora</th><th>Mapa / modo</th><th>Brawler</th><th>Resultado</th>
      {showKd&&<th>K/D</th>}{showRank&&<th>Rank</th>}<th aria-label="Detalhes"/></>} renderRow={series=>{
      const {id,latest:b,result,rounds,wins,losses}=series;
      const kd=matchKd(series);
      const duration=seriesDuration(series);
      const rank=seriesRank(series);
      const estimatedRank=elo?.get(id)?.rank;
      const rankLabel=rank?.rank_label??estimatedRank;
      return <tr key={id}>
      <td>{dateTime(b.played_at)}</td><td><span className="image-label"><ModeIcon mode={b.mode}/><span><strong>{b.map_name ?? '—'}</strong><small>{modeName(b.mode)}</small></span></span></td>
      <td><span className="image-label"><Portrait name={b.player_brawler}/>{b.player_brawler ?? '—'}</span></td><td>
        <Pill kind={resultTone(result)}>{rounds.length>1&&!result?'Resultado em aberto':resultName(result)}</Pill>
        {rounds.length>1&&<small title="Agrupamento inferido a partir do histórico">{wins}–{losses} · {rounds.length} rodadas</small>}
        {b.ranked&&rounds.length===1&&<small>Registro isolado · série não confirmada</small>}
        {duration!=null&&<small>{durationLabel(duration)}</small>}</td>
      {showKd&&<td>{kd?`${number(kd.kills)} / ${number(kd.deaths)}`:null}</td>}
      {showRank&&<td>{rankLabel&&<span className="image-label inline-rank">
        <RankArt rank={rankLabel}/><span>{rankLabel}{!rank&&<small>Estimativa · Perfil</small>}</span></span>}</td>}<td><button className="icon-button" aria-label={`Detalhar partida de ${dateTime(b.played_at)}`}
        onClick={() => onOpen(b)}><ChevronRight size={16} /></button></td></tr>;
    }}/>;
}

export function MatchDetail({ match, series, elo, onRound, raw, review, onClose, onReview, seasonInfo }: {
  match: Battle; raw: unknown; review?: ReplayReview; onClose: () => void;
  seasonInfo?: { season: string|null; seasonEstimated: boolean }; series?: MatchSeries; elo?:MatchElo; onRound?: (id: string) => void;
  onReview: (value:ReplayReview) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [roundView, setRoundView] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  const grouped = series && series.rounds.length>1 ? series : null;
  const summary = grouped && !roundView ? grouped : null;
  const displayResult = summary ? summary.result : match.result;
  const duration = summary ? seriesDuration(summary) : match.duration_seconds;
  const kd = summary ? matchKd(summary) : roundKd(match);
  const roundNumber = grouped ? grouped.rounds.findIndex(round=>round.id===match.id)+1 : null;
  const rank=series?seriesRank(series,match):(!match.rank_source?match:undefined);
  const score=match.score_source?null:match.rank_score;
  const calendar=(!match.season||match.season_source)?match.season_by_date:null;
  const seasonLink=calendar&&safeLink(calendar.source_url);
  const star=summary?null:match.star_player?.name??match.star_player?.tag;
  const showElo = match.ranked && (!grouped || summary) ? elo : undefined;
  const fields = [
    { label:'Rank da partida', value:rank?.rank_label ?? elo?.rank, note:rank?.rank_label ? (rank===match?'Histórico da Supercell':'Outra rodada da série') : 'Estimativa · Mesma divisão antes e depois' },
    { label:'Pontos de rank', value:score ?? showElo?.after, note:score!=null?(summary?`Rodada ${roundNumber} · Histórico da Supercell`:'Histórico da Supercell'):
      summary?'Estimativa após a série · Perfil':'Estimativa após a partida · Perfil' },
    { label:'Temporada', value:seasonInfo?seasonInfo.season:seasonLabel((!match.season_source&&match.season)||calendar?.label), note:(seasonInfo?.seasonEstimated??Boolean(calendar))?
      <>Estimativa pela data{seasonLink&&<> · <a href={seasonLink} target="_blank" rel="noreferrer">Calendário</a></>}</>:'Histórico da Supercell' },
  ].filter(field=>field.value!=null);
  return <dialog ref={dialog} className="drawer match-drawer" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="drawer-content"><div className="drawer-head"><div><span className="eyebrow">Histórico de partidas</span>
      <h2>{match.map_name ?? 'Partida'}</h2><p>{modeName(match.mode)} · {dateTime(match.played_at)}</p></div>
      <button className="icon-button" aria-label="Fechar detalhes" onClick={onClose}><X size={21} /></button></div>
    <div className="detail-map"><MapImage map={findMap(match.map_name,match.event_id,match.mode)}/><ModeLabel mode={match.mode}/></div>
    <div className="detail-status"><Pill kind={resultTone(displayResult)}>{summary && !summary.result?'Resultado em aberto':resultName(displayResult)}</Pill>
      <Pill kind={match.ranked ? 'accent' : 'neutral'}>{summary ? 'Série ranqueada' : grouped ? `Rodada ${roundNumber}` : match.ranked ? 'Ranqueado' : match.api_type ?? 'Tipo indisponível'}</Pill>
      {summary&&<strong>{summary.wins}–{summary.losses}</strong>}
      {duration!=null&&<span className="image-label"><Clock3 size={15}/>{durationLabel(duration)} de jogo</span>}
      {!grouped&&<>
      {match.placement!=null&&<span>{number(match.placement)}º lugar</span>}
      {match.trophy_change!=null&&<span>{match.trophy_change>0?'+':''}{match.trophy_change} troféus</span>}</>}</div>
    {grouped&&<section className="match-rounds" aria-label="Rodadas da série">
      <h3>Rodadas da série</h3>
      <p className="muted">Agrupamento inferido pela sequência, pelo mapa e pela composição das equipes.</p>
      <button type="button" className="button subtle" aria-pressed={Boolean(summary)} onClick={()=>{
        if(summary)return;
        setRoundView(false);setRawOpen(false);onRound?.(grouped.latest.id);
      }}><span>Resumo da série</span><span>{grouped.rounds.length} rodadas</span></button>
      {grouped.rounds.map((round,index)=>{
        const active=!summary&&round.id===match.id;
        const kd=roundKd(round);
        return <button type="button" key={round.id} className="button subtle" aria-pressed={active} onClick={()=>{
          if(active||!onRound)return;
          setRoundView(true);setRawOpen(false);onRound(round.id);
        }}>
        <span>Rodada {index+1}<small>{dateTime(round.played_at)}{round.duration_seconds!=null?` · ${durationLabel(round.duration_seconds)}`:''}</small>
          {(round.star_player?.name||round.star_player?.tag)&&<small>Craque · {round.star_player.name??round.star_player.tag}</small>}</span>
        {kd&&<span aria-label="Eliminações e mortes">{kd.kills} / {kd.deaths}</span>}
        <Pill kind={resultTone(round.result)}>{resultName(round.result)}</Pill>
      </button>;})}
    </section>}
    {(kd||star||showElo||(match.ranked&&fields.length>0))&&<dl className="detail-grid">
      {kd&&<div><dt>{summary?'K/D final da série':grouped?'K/D da rodada':'K/D final'}</dt>
        <dd>{number(kd.kills)} / {number(kd.deaths)}<small>{summary?'Soma das rodadas':'Histórico da Supercell'}</small></dd></div>}
      {showElo&&<div><dt>Variação de Elo</dt><dd>{number(showElo.before)} → {number(showElo.after)} ({showElo.after>showElo.before?'+':''}{number(showElo.after-showElo.before)})
        <small>Estimativa por leituras do perfil</small></dd></div>}
      {match.ranked&&fields.map(({label,value,note})=><div key={label}><dt>{label}</dt><dd>
        {typeof value==='number'?number(value):value}<small>{note}</small></dd></div>)}
      {star&&<div><dt>{grouped?'Craque da rodada':'Craque da partida'}</dt><dd className="image-label"><Star size={15}/>{star}</dd></div>}
    </dl>}
    <MatchScoreboard match={match} series={summary??undefined} isRound={Boolean(grouped)}/>
    <MatchBans match={match} series={grouped??undefined} summary={Boolean(summary)}/>
    {raw !== undefined && <div className="actions"><button className="button subtle" onClick={()=>setRawOpen(v=>!v)}>
      <ChevronDown size={16} /> {rawOpen ? 'Ocultar JSON' : 'Ver JSON da API'}{summary&&` · rodada ${roundNumber}`}</button></div>}
    {match.ranked&&<section>{summary&&<p className="muted">Revisão da rodada {roundNumber}</p>}
      <ReplayAnnotation key={match.id} review={review} onSave={onReview}/></section>}
    {rawOpen && raw !== undefined && <pre className="raw">{JSON.stringify(raw, null, 2)}</pre>}
    </div></dialog>;
}
