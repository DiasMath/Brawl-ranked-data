import { useState } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { dateTime, number } from '@/lib/data';
import { collectionRequest } from '@/lib/live';
import type { LiveReport } from '@/lib/live';

type SampleResult = { players: number; failed: number; received: number; added: number; report: LiveReport };

export function SampleCollection({ tracking, onCollected, notify }: {
  tracking?: LiveReport['tracking']; onCollected: (report: LiveReport) => void; notify: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  return <section className="card account-card">
    <div className="card-head"><div><h2><Radio size={17}/> Amostra de outros jogadores</h2>
      <p>Consulta manual de até cinco jogadores da classificação global ou de uma tag pública específica.</p></div></div>
    {tracking&&<div className="collector-readings">
      <div><span>Jogadores na fila</span><strong>{number(tracking.queued)}</strong></div>
      <div><span>Perfis consultados</span><strong>{number(tracking.checked)}</strong></div>
      <div><span>Com Elo ≥ {number(tracking.minimum_elo)}</span><strong>{number(tracking.qualified)}</strong></div>
      <div><span>Última rodada da fila</span><strong>{dateTime(tracking.last_run_at)}</strong></div>
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
