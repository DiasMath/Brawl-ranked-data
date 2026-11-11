import { useContext } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { dateTime, number } from '@/lib/data';
import { LiveMeta, observedDelay } from '@/lib/live';
import type { LivePeriod, ServerCollection } from '@/lib/live';
import type { Battle } from '@/lib/data';

export function MetaPeriods() {
  const { report,period,setPeriod }=useContext(LiveMeta);
  return <div className="periods" aria-label="Janela da meta">
    {([['today','Hoje'],['week','7 dias'],['patch','Desde o patch'],['reference','Histórico 4–5/11']] as [LivePeriod,string][]).filter(([key])=>key==='reference'||Boolean(report?.windows[key])).map(([key,label])=>
      <button key={key} className={period===key?'selected':''} aria-pressed={period===key} onClick={()=>setPeriod(key)}>{label}</button>)}
  </div>;
}

export function CollectorPanel({ battles, onSync, syncing, server, serverError, hasAccount }: {
  battles:Battle[]; onSync:()=>void; syncing:boolean; server:ServerCollection|null; serverError:string; hasAccount:boolean;
}) {
  const delay=observedDelay(battles);
  if(server){
    const automatic=server.interval_seconds>0;
    const retrying=server.retry_until&&Date.parse(server.retry_until)>Date.now();
    const attempt=server.last_attempt;
    const delayed=Boolean(server.last_success && automatic &&
      Date.now()-Date.parse(server.last_success)>server.interval_seconds*3000);
    const failed=attempt?.status==='error';
    const status=failed?'Falha na última coleta':delayed?'Coleta atrasada':
      server.last_success?(automatic?'Coleta em dia':'Última coleta concluída'):'Aguardando coleta';
    return <section className="card collector-panel">
      <div className="card-head"><div><h2><Activity size={17}/> {automatic?'Coleta automática':'Coleta manual'}</h2>
        <p>Servidor · {server.player_tag}{automatic?' · intervalo esperado '+number(server.interval_seconds/60)+' min':''}</p></div>
        <span className={`tag ${server.last_success&&!delayed&&!failed?'confirmed':'hypothesis'}`}>{status}</span></div>
      <div className="collector-controls">
        <button className="button primary" onClick={onSync} disabled={syncing||!server.configured||!!retrying} aria-busy={syncing}>
          <RefreshCw size={15} aria-hidden="true"/>{syncing?'Sincronizando…':'Sincronizar agora'}</button>
      </div>
      <div className="collector-readings">
        <div><span>Última coleta bem-sucedida</span><strong>{dateTime(server.last_success)}</strong></div>
        <div><span>Partida mais recente recebida</span><strong>{dateTime(server.last_battle)}</strong></div>
        <div><span>Última tentativa</span><strong>{dateTime(attempt?.started_at??null)}</strong></div>
        <div><span>Atraso observado</span><strong>{delay.median!==null?`${delay.median} min`:'—'}</strong>
          {delay.count>0&&<small>P90 {delay.p90} min · {number(delay.count)} registros</small>}</div>
      </div>
      {!server.configured&&<p className="section-note">Configure a chave da Supercell nas variáveis do servidor.</p>}
      {delayed&&<p className="section-note">A última coleta está atrasada. Confira as execuções do agendamento.</p>}
      {failed&&<p className="section-note error">{attempt.message}</p>}
      {retrying&&<p className="section-note">Consulta pausada até {dateTime(server.retry_until)} por limite da Supercell.</p>}
      {server.last_possible_gap&&<p className="section-note">Possível lacuna detectada em {dateTime(server.last_possible_gap)}.</p>}
      {serverError&&<p className="feedback" role="status">{serverError}</p>}
    </section>;
  }
  return <section className="card collector-panel">
    <div className="card-head"><div><h2><Activity size={17}/> Coleta</h2>
      <p>{serverError?'Conexão com o servidor indisponível.':hasAccount?'Consultando o servidor de coleta…':'Cadastre uma conta para começar.'}</p></div></div>
    {serverError&&<p className="feedback" role="status">{serverError}</p>}
  </section>;
}
