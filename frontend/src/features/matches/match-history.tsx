import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Clock3, List, Star, Swords, X } from 'lucide-react';
import { Empty, Pill } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { findMap, MapImage, ModeIcon, ModeLabel, Portrait, RankArt } from '@/components/game';
import { dateTime, durationLabel, modeName, number, resultName, safeLink } from '@/lib/data';
import { ReplayAnnotation } from '@/features/analytics/replay-annotation';
import type { ReplayReview } from '@/lib/coaching';
import type { Battle } from '@/lib/data';
import { matchKd, seriesBans, seriesDuration, seriesRank } from '@/lib/match-series';
import type { MatchElo, MatchSeries } from '@/lib/match-series';

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
        {duration!=null&&<small>{durationLabel(duration)}</small>}</td>
      {showKd&&<td>{kd?`${number(kd.kills)} / ${number(kd.deaths)}`:null}</td>}
      {showRank&&<td>{rankLabel&&<span className="image-label inline-rank">
        <RankArt rank={rankLabel}/><span>{rankLabel}{!rank&&<small>Estimativa · Perfil</small>}</span></span>}</td>}<td><button className="icon-button" aria-label={`Detalhar partida de ${dateTime(b.played_at)}`}
        onClick={() => onOpen(b)}><ChevronRight size={16} /></button></td></tr>;
    }}/>;
}

export function MatchDetail({ match, series, elo, onRound, raw, review, onClose, onReview }: {
  match: Battle; raw: unknown; review?: ReplayReview; onClose: () => void;
  series?: MatchSeries; elo?:MatchElo; onRound?: (id: string) => void;
  onReview: (value:ReplayReview) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rawOpen, setRawOpen] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  const groups = [...new Set(match.players.map(p => p.team_index))];
  const grouped = series && series.rounds.length>1 ? series : null;
  const duration=series?seriesDuration(series):match.duration_seconds;
  const totalKd=grouped?matchKd(grouped):null;
  const rank=series?seriesRank(series,match):(!match.rank_source?match:undefined);
  const bans=series?seriesBans(series,match):(!match.bans_source?match:undefined);
  const score=match.score_source?null:match.rank_score;
  const kd=match.kd&&!match.kd.reference?match.kd:null;
  const calendar=(!match.season||match.season_source)?match.season_by_date:null;
  const seasonLink=calendar&&safeLink(calendar.source_url);
  const star=match.star_player?.name??match.star_player?.tag;
  const fields = [
    { label:'Rank da partida', value:rank?.rank_label ?? elo?.rank, note:rank?.rank_label ? (rank===match?'Histórico da Supercell':'Outra rodada da série') : 'Estimativa · Mesma divisão antes e depois' },
    { label:'Pontos de rank', value:score ?? elo?.after, note:score!=null?'Histórico da Supercell':'Estimativa após a partida · Perfil' },
    { label:'Temporada', value:(!match.season_source&&match.season)||calendar?.label, note:calendar?
      <>Estimativa pela data{seasonLink&&<> · <a href={seasonLink} target="_blank" rel="noreferrer">Calendário</a></>}</>:'Histórico da Supercell' },
    { label:'Bans', value:bans?.bans==null?null:bans.bans.join(', ')||'Sem bans', note:bans===match?'Histórico da Supercell':'Outra rodada da série' },
  ].filter(field=>field.value!=null);
  return <dialog ref={dialog} className="drawer" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="drawer-content"><div className="drawer-head"><div><span className="eyebrow">Histórico de partidas</span>
      <h2>{match.map_name ?? 'Partida'}</h2><p>{modeName(match.mode)} · {dateTime(match.played_at)}</p></div>
      <button className="icon-button" aria-label="Fechar detalhes" onClick={onClose}><X size={21} /></button></div>
    <div className="detail-map"><MapImage map={findMap(match.map_name,match.event_id,match.mode)}/><ModeLabel mode={match.mode}/></div>
    <div className="detail-status"><Pill kind={resultTone(grouped ? grouped.result : match.result)}>{grouped && !grouped.result?'Resultado em aberto':resultName(grouped ? grouped.result : match.result)}</Pill>
      <Pill kind={match.ranked ? 'accent' : 'neutral'}>{grouped ? 'Série ranqueada' : match.ranked ? 'Ranqueado' : match.api_type ?? 'Tipo indisponível'}</Pill>
      {grouped&&<strong>{grouped.wins}–{grouped.losses}</strong>}
      {duration!=null&&<span className="image-label"><Clock3 size={15}/>{durationLabel(duration)} de jogo</span>}
      {!grouped&&<>
      {match.placement!=null&&<span>{number(match.placement)}º lugar</span>}
      {match.trophy_change!=null&&<span>{match.trophy_change>0?'+':''}{match.trophy_change} troféus</span>}</>}</div>
    {grouped&&<section className="match-rounds" aria-label="Rodadas da série">
      <h3>Rodadas da série</h3>
      <p className="muted">Agrupamento inferido pela sequência, pelo mapa e pela composição das equipes.</p>
      {grouped.rounds.map((round,index)=><button type="button" key={round.id} className="button subtle"
        aria-pressed={round.id===match.id} onClick={()=>{
          if(round.id===match.id)return;
          setRawOpen(false);onRound?.(round.id);
        }}>
        <span>Rodada {index+1}<small>{dateTime(round.played_at)}{round.duration_seconds!=null?` · ${durationLabel(round.duration_seconds)}`:''}</small>
          {(round.star_player?.name||round.star_player?.tag)&&<small>Craque · {round.star_player.name??round.star_player.tag}</small>}</span>
        {round.kd&&!round.kd.reference&&<span aria-label="Eliminações e mortes">{round.kd.kills} / {round.kd.deaths}</span>}
        <Pill kind={resultTone(round.result)}>{resultName(round.result)}</Pill>
      </button>)}
    </section>}
    {(totalKd||kd||star||(match.ranked&&(elo||fields.length>0)))&&<dl className="detail-grid">
      {totalKd&&<div><dt>K/D final da série</dt><dd>{number(totalKd.kills)} / {number(totalKd.deaths)}<small>Soma das rodadas</small></dd></div>}
      {kd&&<div><dt>{grouped?'K/D da rodada':'K/D final'}</dt><dd>{number(kd.kills)} / {number(kd.deaths)}<small>Histórico da Supercell</small></dd></div>}
      {match.ranked&&elo&&<div><dt>Variação de Elo</dt><dd>{number(elo.before)} → {number(elo.after)} ({elo.after>elo.before?'+':''}{number(elo.after-elo.before)})
        <small>Estimativa por leituras do perfil</small></dd></div>}
      {match.ranked&&fields.map(({label,value,note})=><div key={label}><dt>{label}</dt><dd>
        {typeof value==='number'?number(value):value}<small>{note}</small></dd></div>)}
      {star&&<div><dt>{grouped?'Craque da rodada':'Craque da partida'}</dt><dd className="image-label"><Star size={15}/>{star}</dd></div>}
    </dl>}
    {groups.length ? groups.map(group => {
      const members = match.players.filter(p => p.team_index === group);
      const hasSelf = members.some(p => p.side === 'self');
      const isOpponent = members.every(p => p.side === 'opponent');
      return <section key={group} className="team"><h3>{hasSelf ? 'Sua equipe' : isOpponent ? 'Equipe adversária' : `Grupo ${group + 1}`}</h3>
        {members.map((p, i) => <div key={i} className="member"><div><strong>{p.player_name ?? 'Jogador'}</strong><small>{p.player_tag ?? '—'}</small></div>
          <div className="image-label"><Portrait name={p.brawler} id={p.brawler_id}/><div><strong>{p.brawler ?? '—'}</strong><small>{p.power !== null ? `Poder ${p.power}` : ''}</small></div></div>{p.side === 'self' && <Pill kind="accent">Você</Pill>}</div>)}</section>;
    }) : <Empty icon={Swords} title="Composição indisponível" />}
    {raw !== undefined && <div className="actions"><button className="button subtle" onClick={()=>setRawOpen(v=>!v)}>
      <ChevronDown size={16} /> {rawOpen ? 'Ocultar JSON' : 'Ver JSON da API'}</button></div>}
    {match.ranked&&<ReplayAnnotation key={match.id} review={review} onSave={onReview}/>}
    {rawOpen && raw !== undefined && <pre className="raw">{JSON.stringify(raw, null, 2)}</pre>}
    </div></dialog>;
}
