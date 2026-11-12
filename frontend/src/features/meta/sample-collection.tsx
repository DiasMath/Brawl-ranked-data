import { useState } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { number } from '@/lib/data';
import { collectionRequest } from '@/lib/live';
import type { LiveReport } from '@/lib/live';

type SampleResult = { players: number; failed: number; received: number; added: number; report: LiveReport };

export function SampleCollection({ onCollected, notify }: { onCollected: (report: LiveReport) => void; notify: (message: string) => void }) {
  const [loading, setLoading] = useState(false);
  return <section className="card account-card">
    <div className="card-head"><div><h2><Radio size={17}/> Amostra de outros jogadores</h2>
      <p>Consulte até cinco jogadores da classificação global ou informe uma tag pública específica.</p></div></div>
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
