import { ArrowDownToLine, History, UserRound } from 'lucide-react';
import type { LocalData } from './browser-store';
import { dateTime, number } from './data';

export function Accounts({ tag, data, busy, feedback, onExport }: {
  tag:string; data:LocalData; busy:boolean; feedback:string; onExport:()=>void;
}) {
  return <div className="stack">
    <section className="card account-card"><div className="card-head">
      <div><h2><UserRound size={17}/> Conta monitorada</h2><p>{data.dataset.profile?.name??'Perfil Supercell'} · {tag||'Aguardando servidor'}</p></div>
      <button className="button small subtle" disabled={busy||!tag} onClick={onExport}><ArrowDownToLine size={15}/> Exportar histórico</button>
    </div></section>
    {feedback&&<p className="feedback" role="status">{feedback}</p>}
    <section className="card"><div className="card-head"><div><h2><History size={17}/> Histórico de atualizações</h2>
      <p>Até 100 execuções para {tag}</p></div></div>
      {data.dataset.updates.length?<div className="table-wrap"><table><thead><tr><th>Data e hora</th><th>Status</th><th>Recebidas</th><th>Novas</th><th>Detalhe</th></tr></thead>
        <tbody>{data.dataset.updates.map(u=><tr key={u.started_at}><td>{dateTime(u.started_at)}</td><td><span className={`tag ${u.status==='success'?'confirmed':u.status==='error'?'unavailable':'hypothesis'}`}>
          {u.status==='success'?'Concluída':u.status==='error'?'Falhou':'Em andamento'}</span></td><td>{u.received!==null?number(u.received):'—'}</td>
          <td>{u.added!==null?number(u.added):'—'}</td><td>{u.message||'—'}</td></tr>)}</tbody></table></div>:
        <p className="section-note">A primeira tentativa de sincronização aparecerá aqui.</p>}</section>
  </div>;
}
