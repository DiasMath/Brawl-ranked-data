import { RefreshCw } from 'lucide-react';
import { number } from '@/lib/data';
import type { SyncProgress } from '@/lib/live';

const labels = {
  profile: 'Consultando o perfil na Supercell…',
  battlelog: 'Buscando as partidas recentes…',
  saving: 'Processando as partidas recebidas…',
  history: 'Carregando o histórico no painel…',
};

export function SyncProgressCard({ progress, account }: { progress: SyncProgress; account: string }) {
  const { phase, processed, total } = progress;
  return <aside className="sync-progress" role="status" aria-live="polite">
    <strong><RefreshCw size={16} aria-hidden="true"/> Sincronizando {account}</strong>
    <span>{labels[phase]}</span>
    {total !== null && <small>{number(processed ?? 0)} de {number(total)} partidas processadas</small>}
    <progress aria-label="Progresso da sincronização" max={total || 1}
      value={total === null ? undefined : total === 0 ? 1 : processed ?? 0}/>
  </aside>;
}
