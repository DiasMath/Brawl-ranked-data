import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, FileJson, List, Swords, X } from 'lucide-react';
import { Empty, Pill } from '@/components/dashboard-ui';
import { findMap, MapImage, ModeIcon, ModeLabel, Portrait, RankArt } from '@/components/game';
import { dateTime, modeName, number, resultName, safeLink } from '@/lib/data';
import { ReplayAnnotation } from '@/features/analytics/replay-annotation';
import type { ReplayReview } from '@/lib/coaching';
import type { Battle } from '@/lib/data';
import { matchKd } from '@/lib/match-series';
import type { MatchElo, MatchSeries } from '@/lib/match-series';

const pageSize = 15;

function resultTone(result: Battle['result']) {
  return result === 'victory' ? 'success' : result === 'defeat' ? 'danger' : 'neutral';
}

export function MatchList({ matches, onOpen, compact = false }: { matches: MatchSeries[]; onOpen: (b: Battle) => void; compact?: boolean }) {
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
  if (!matches.length) return <Empty icon={List} title="Nenhuma partida encontrada">Atualize o histórico ou ajuste os filtros do recorte.</Empty>;
  const visible = compact ? matches.slice(0, 6) : matches.slice(current * pageSize, (current + 1) * pageSize);
  return <><div className="table-wrap"><table><thead><tr><th>Data e hora</th><th>Mapa / modo</th><th>Brawler</th><th>Resultado</th>
    <th>K/D</th><th>Rank</th><th aria-label="Detalhes" /></tr></thead><tbody>{visible.map(series => {
      const {id,latest:b,result,rounds,wins,losses}=series;
      const kd=matchKd(series);
      return <tr key={id}>
      <td>{dateTime(b.played_at)}</td><td><span className="image-label"><ModeIcon mode={b.mode}/><span><strong>{b.map_name ?? '—'}</strong><small>{modeName(b.mode)}</small></span></span></td>
      <td><span className="image-label"><Portrait name={b.player_brawler}/>{b.player_brawler ?? '—'}</span></td><td>
        <Pill kind={resultTone(result)}>{rounds.length>1&&!result?'Resultado em aberto':resultName(result)}</Pill>
        {rounds.length>1&&<small title="Agrupamento inferido a partir do histórico">{wins}–{losses} · {rounds.length} rodadas</small>}</td>
      <td title={kd?'Eliminações / mortes':'Sem registro completo'}>{kd?`${number(kd.kills)} / ${number(kd.deaths)}`:'—'}</td>
      <td>{b.ranked ? b.rank_label ? <span className="image-label inline-rank"><RankArt rank={b.rank_label}/>{b.rank_label}</span> :
        <span className="muted" title="O histórico da API não trouxe o rank desta partida.">Não informado</span> : '—'}</td><td><button className="icon-button" aria-label={`Detalhar partida de ${dateTime(b.played_at)}`}
        onClick={() => onOpen(b)}><ChevronRight size={16} /></button></td></tr>;
    })}</tbody></table></div>
    {!compact && <div className="pager"><span>{number(matches.length)} {matches.length===1?'partida':'partidas'}</span><div>
      <button className="icon-button" disabled={!current} aria-label="Página anterior" onClick={() => setPage(current - 1)}><ChevronLeft size={17} /></button>
      <span>{current + 1} / {Math.ceil(matches.length / pageSize)}</span>
      <button className="icon-button" disabled={(current + 1) * pageSize >= matches.length} aria-label="Próxima página"
        onClick={() => setPage(current + 1)}><ChevronRight size={17} /></button></div></div>}</>;
}

export type Evidence = { rank_label: string|null; rank_score: number|null; season: string|null; bans: string[]|null; evidence:string;
  kills?:number|null; deaths?:number|null; elo_before?:number|null; elo_after?:number|null };
export function MatchDetail({ match, series, elo, onRound, raw, review, onClose, onChange, onReview }: {
  match: Battle; raw: unknown; review?: ReplayReview; onClose: () => void;
  series?: MatchSeries; elo?:MatchElo; onRound?: (id: string) => void;
  onChange: (record:Evidence) => Promise<void>; onReview: (value:ReplayReview) => Promise<void>;
}) {
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
    const count = (key:string) => value(key)===''?null:Number(value(key));
    const kills=count('kills'), deaths=count('deaths'), before=count('before'), after=count('after');
    if ((kills===null)!==(deaths===null)||(before===null)!==(after===null)) {
      setFeedback('Preencha os dois valores de K/D ou os dois valores de Elo.');return;
    }
    setSaving(true);
    try {
      await onChange({
        rank_label: value('rank') || null, rank_score: value('score') ? Number(value('score')) : null,
        season: value('season') || null, bans: form.get('noBans') ? [] : (value('bans') ? value('bans').split(',').map(s => s.trim()).filter(Boolean) : null),
        evidence: value('source'), kills, deaths, elo_before:before, elo_after:after,
      });
      setEvidenceOpen(false);
      setFeedback('Evidência registrada.');
    } catch (error) { setFeedback((error as Error).message); }
    finally { setSaving(false); }
  }
  const groups = [...new Set(match.players.map(p => p.team_index))];
  const grouped = series && series.rounds.length>1 ? series : null;
  const totalKd=grouped?matchKd(grouped):null;
  const fields = [
    { label:'Rank da partida', value:match.rank_label, reference:match.rank_reference },
    { label:'Pontos de rank', value:match.rank_score === null ? null : number(match.rank_score), reference:match.score_reference },
    { label:'Temporada', value:match.season, reference:match.season_reference },
    { label:'Bans', value:match.bans === null ? null : match.bans.join(', ') || 'Sem bans', reference:match.bans_reference },
  ];
  return <dialog ref={dialog} className="drawer" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="drawer-content"><div className="drawer-head"><div><span className="eyebrow">Histórico de partidas</span>
      <h2>{match.map_name ?? 'Partida'}</h2><p>{modeName(match.mode)} · {dateTime(match.played_at)}</p></div>
      <button className="icon-button" aria-label="Fechar detalhes" onClick={onClose}><X size={21} /></button></div>
    <div className="detail-map"><MapImage map={findMap(match.map_name,match.event_id,match.mode)}/><ModeLabel mode={match.mode}/></div>
    <div className="detail-status"><Pill kind={resultTone(grouped ? grouped.result : match.result)}>{grouped && !grouped.result?'Resultado em aberto':resultName(grouped ? grouped.result : match.result)}</Pill>
      <Pill kind={match.ranked ? 'accent' : 'neutral'}>{grouped ? 'Série ranqueada' : match.ranked ? 'Ranqueado' : match.api_type ?? 'Tipo indisponível'}</Pill>
      {grouped&&<strong>{grouped.wins}–{grouped.losses}</strong>}
      {!grouped&&<>
      {match.duration_seconds !== null && <span>{match.duration_seconds}s</span>}
      {match.placement!=null&&<span>{number(match.placement)}º lugar</span>}
      {match.trophy_change!=null&&<span>{match.trophy_change>0?'+':''}{match.trophy_change} troféus</span>}</>}</div>
    {grouped&&<section className="match-rounds" aria-label="Rodadas da série">
      <h3>Rodadas da série</h3>
      <p className="muted">Agrupamento inferido pela sequência, pelo mapa e pela composição das equipes.</p>
      {grouped.rounds.map((round,index)=><button type="button" key={round.id} className="button subtle"
        aria-pressed={round.id===match.id} onClick={()=>{
          if(round.id===match.id)return;
          setRawOpen(false);setEvidenceOpen(false);setFeedback('');onRound?.(round.id);
        }} disabled={saving}>
        <span>Rodada {index+1}<small>{dateTime(round.played_at)}{round.duration_seconds!=null?` · ${round.duration_seconds}s`:''}</small></span>
        {round.kd&&<span aria-label="Eliminações e mortes">{round.kd.kills} / {round.kd.deaths}</span>}
        <Pill kind={resultTone(round.result)}>{resultName(round.result)}</Pill>
      </button>)}
    </section>}
    <dl className="detail-grid">
      {grouped&&<div><dt>K/D final da série</dt><dd>{totalKd?`${number(totalKd.kills)} / ${number(totalKd.deaths)}`:'—'}
        <small>{totalKd?'Soma das rodadas':'Sem registro completo das rodadas'}</small></dd></div>}
      <div><dt>{grouped?'K/D da rodada':'K/D final'}</dt><dd>{match.kd?`${number(match.kd.kills)} / ${number(match.kd.deaths)}`:'—'}
        <small>{match.kd?(match.kd.reference?'Evidência · '+match.kd.reference:'Histórico da Supercell'):'Eliminações e mortes não informadas'}</small></dd></div>
      {match.ranked&&<div><dt>Variação de Elo</dt><dd>{elo?`${number(elo.before)} → ${number(elo.after)} (${elo.after>elo.before?'+':''}${number(elo.after-elo.before)})`:'—'}
        <small>{elo?(elo.reference?'Evidência · '+elo.reference:'Estimativa por leituras do perfil'):'Sem leitura isolada desta partida'}</small></dd></div>}
      {match.ranked && fields.map(({label,value,reference}) => {
        const calendar = label === 'Temporada' && value === null ? match.season_by_date : null;
        const source = calendar ? safeLink(calendar.source_url) : undefined;
        return <div key={label}><dt>{label}</dt><dd>{value ?? calendar?.label ?? 'Não informado'}
          <small>{reference ? 'Evidência · '+reference : value !== null ? 'Histórico da Supercell' : calendar ?
            <>{'Estimativa pela data'}{source && <> · <a href={source} target="_blank" rel="noreferrer">Calendário</a></>}</> :
            'Campo ausente no histórico da API'}</small></dd></div>;
      })}
      {(match.star_player?.name||match.star_player?.tag)&&<div><dt>{grouped?'Craque da rodada':'Craque da partida'}</dt><dd>{match.star_player.name??match.star_player.tag}</dd></div>}
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
      <button className="button subtle" onClick={() => setEvidenceOpen(v => !v)}><FileJson size={16} /> Registrar evidência</button>
      {raw !== undefined && <button className="button subtle" onClick={()=>setRawOpen(v=>!v)}><ChevronDown size={16} /> {rawOpen ? 'Ocultar JSON' : 'Ver JSON da API'}</button>}
    </div>
    {evidenceOpen && <form className="evidence-form" onSubmit={event => { event.preventDefault(); void saveEvidence(new FormData(event.currentTarget)); }}>
      <p className="muted">Use a tela de resultado ou o replay como referência. {grouped?'Registre o K/D da rodada selecionada e o Elo da série inteira.':''}</p>
      <div className="evidence-pair">
        <label>Eliminações<input name="kills" type="number" min={0} max={2147483647} defaultValue={match.kd?.kills} disabled={!!match.kd&&!match.kd.reference}/></label>
        <label>Mortes<input name="deaths" type="number" min={0} max={2147483647} defaultValue={match.kd?.deaths} disabled={!!match.kd&&!match.kd.reference}/></label>
      </div>
      {match.ranked&&<>
      <div className="evidence-pair">
        <label>Elo antes da partida<input name="before" type="number" min={0} max={2147483647} defaultValue={match.elo_evidence?.before}/></label>
        <label>Elo depois da partida<input name="after" type="number" min={0} max={2147483647} defaultValue={match.elo_evidence?.after}/></label>
      </div>
      <label>Rank observado<input name="rank" maxLength={60} /></label>
      <label>Pontos de rank<input name="score" type="number" min={0} max={2147483647} /></label>
      <label>Temporada<input name="season" maxLength={100} /></label>
      <label>Lista completa de bans, separados por vírgulas<input name="bans" maxLength={3000} /></label>
      <label className="checkbox"><input name="noBans" type="checkbox" /> A evidência confirma ausência de bans</label>
      </>}
      <label>Referência da evidência<input name="source" required minLength={3} maxLength={400} /></label>
      <button className="button primary" disabled={saving}>Salvar evidência</button>
    </form>}
    {match.ranked&&<ReplayAnnotation key={match.id} review={review} onSave={onReview}/>}
    {rawOpen && raw !== undefined && <pre className="raw">{JSON.stringify(raw, null, 2)}</pre>}
    </div></dialog>;
}
