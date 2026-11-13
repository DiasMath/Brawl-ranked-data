import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, FileJson, List, Swords, X } from 'lucide-react';
import { Empty, Pill } from '@/components/dashboard-ui';
import { findMap, MapImage, ModeIcon, ModeLabel, Portrait, RankArt } from '@/components/game';
import { dateTime, modeName, number, resultName } from '@/lib/data';
import { ReplayAnnotation } from '@/features/analytics/replay-annotation';
import type { ReplayReview } from '@/lib/coaching';
import type { Battle } from '@/lib/data';

const pageSize = 15;

function resultTone(result: Battle['result']) {
  return result === 'victory' ? 'success' : result === 'defeat' ? 'danger' : 'neutral';
}

export function MatchList({ matches, onOpen, compact = false }: { matches: Battle[]; onOpen: (b: Battle) => void; compact?: boolean }) {
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

export type Evidence = { rank_label: string|null; rank_score: number|null; season: string|null; bans: string[]|null; evidence:string };
export function MatchDetail({ match, raw, review, onClose, onChange, onReview }: {
  match: Battle; raw: unknown; review?: ReplayReview; onClose: () => void;
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
      {match.placement!=null&&<span>{number(match.placement)}º lugar</span>}
      {match.trophy_change!=null&&<span>{match.trophy_change>0?'+':''}{match.trophy_change} troféus</span>}</div>
    <dl className="detail-grid">
      <div><dt>Rank</dt><dd>{match.rank_label ?? 'Indisponível'}{match.rank_source && <small>Evidência · {match.rank_reference}</small>}</dd></div>
      <div><dt>Pontos de rank</dt><dd>{match.rank_score === null ? 'Indisponível' : number(match.rank_score)}{match.score_source && <small>Evidência · {match.score_reference}</small>}</dd></div>
      <div><dt>Temporada</dt><dd>{match.season ?? 'Indisponível'}{match.season_source && <small>Evidência · {match.season_reference}</small>}</dd></div>
      <div><dt>Bans</dt><dd>{match.bans === null ? 'Indisponível' : match.bans.join(', ') || 'Nenhum registrado'}{match.bans_source && <small>Evidência · {match.bans_reference}</small>}</dd></div>
      {(match.star_player?.name||match.star_player?.tag)&&<div><dt>Craque da partida</dt><dd>{match.star_player.name??match.star_player.tag}</dd></div>}
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
      <label>Lista completa de bans, separados por vírgulas<input name="bans" /></label>
      <label className="checkbox"><input name="noBans" type="checkbox" /> A evidência confirma ausência de bans</label>
      <label>Referência da evidência<input name="source" required minLength={3} maxLength={400} /></label>
      <button className="button primary" disabled={saving}>Salvar evidência</button>
    </form>}
    {match.ranked&&<ReplayAnnotation review={review} onSave={onReview}/>}
    {rawOpen && raw !== undefined && <pre className="raw">{JSON.stringify(raw, null, 2)}</pre>}
    </div></dialog>;
}
