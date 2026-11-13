import { useState } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { dateTime, number } from '@/lib/data';
import { collectionRequest } from '@/lib/live';
import type { LiveReport } from '@/lib/live';

function storageSize(bytes: number) {
  if(bytes<1024) return `${number(bytes)} B`;
  const scale=bytes<1024**2?1024:1024**2;
  return `${(bytes/scale).toLocaleString('pt-BR',{maximumFractionDigits:1})} ${scale===1024?'KiB':'MiB'}`;
}

type SampleResult = { players: number; failed: number; received: number; added: number; report: LiveReport };

export function SampleCollection({ tracking, diagnostics, onCollected, notify }: {
  tracking?: LiveReport['tracking']; diagnostics?: LiveReport['diagnostics']; onCollected: (report: LiveReport) => void; notify: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const lastRun=diagnostics?.last_run;
  return <section className="card account-card">
    <div className="card-head"><div><h2><Radio size={17}/> Amostra de outros jogadores</h2>
      <p>A consulta manual atualiza Hoje e 7 dias. A fila que verifica o Elo alimenta os recortes por patch e temporada.</p></div></div>
    {tracking&&<div className="collector-readings">
      <div><span>Jogadores na fila</span><strong>{number(tracking.queued)}</strong>
        {tracking.due!=null&&<small>{number(tracking.due)} prontos para consulta</small>}</div>
      <div><span>Perfis consultados</span><strong>{number(tracking.checked)}</strong></div>
      <div><span>Com Elo ≥ {number(tracking.minimum_elo)}</span><strong>{number(tracking.qualified)}</strong></div>
      <div><span>Última rodada da fila</span><strong>{dateTime(tracking.last_run_at)}</strong></div>
    </div>}
    {diagnostics&&<div className="collector-readings">
      <div><span>Banco inteiro</span><strong>{storageSize(diagnostics.database_bytes)}</strong></div>
      <div><span>Amostra competitiva</span><strong>{storageSize(diagnostics.sample_bytes)}</strong>
        <small>{number(diagnostics.sample_records)} registros · {number(diagnostics.played_last_24h)} jogados nas últimas 24 h</small></div>
      <div><span>Partidas das contas</span><strong>{storageSize(diagnostics.account_battle_bytes)}</strong></div>
      <div><span>Última rodada medida</span><strong>{lastRun?`${number(lastRun.added)} novas`:'—'}</strong>
        {lastRun&&<><small>{dateTime(lastRun.finished_at)} · {lastRun.origin==='manual'?'Manual':'Agendada'} · {lastRun.environment==='production'?'Produção':'Desenvolvimento'}</small>
        <small>{number(lastRun.profile_requests)} perfis · {number(lastRun.battlelog_requests)} históricos · {number(lastRun.ranking_requests)} rankings</small>
        <small>{number(lastRun.unique_received)} únicas · {lastRun.status==='ok'?'Concluída':lastRun.status==='partial'?'Parcial':'Falhou'}</small></>}</div>
    </div>}
    <form className="form-grid tracked-account-form" onSubmit={async event => {
      event.preventDefault();
      if (loading) return;
      const tag = String(new FormData(event.currentTarget).get('tag') ?? '').trim();
      setLoading(true);
      try {
        const result = await collectionRequest<SampleResult>('/api/meta/sample', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag }),
        });
        onCollected(result.report);
        const players = result.players === 1 ? '1 jogador consultado' : `${number(result.players)} jogadores consultados`;
        notify(`${players} · ${number(result.received)} ranqueadas na amostra · ${number(result.added)} novas${result.failed ? ` · ${number(result.failed)} falhas` : ''}.`);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Falha ao coletar a amostra.');
      } finally {
        setLoading(false);
      }
    }}>
      <label>Tag pública (opcional)<input name="tag" maxLength={17} placeholder="#TAG" disabled={loading}/></label>
      <div className="actions"><button className="button primary" disabled={loading} aria-busy={loading}>
        <RefreshCw size={15} aria-hidden="true"/>{loading ? 'Coletando amostra…' : 'Atualizar amostra'}
      </button></div>
    </form>
  </section>;
}
