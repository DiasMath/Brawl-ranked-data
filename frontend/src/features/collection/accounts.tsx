import { useState } from 'react';
import { ArrowDownToLine, History, Plus, UserRound } from 'lucide-react';
import type { Account, LocalData } from '@/lib/browser-store';
import { dateTime, number } from '@/lib/data';

export function Accounts({ tag, accounts, data, busy, feedback, onExport, onSelect, onSave }: {
  tag:string; accounts:Account[]; data:LocalData; busy:boolean; feedback:string; onExport:()=>void;
  onSelect:(tag:string)=>void; onSave:(tag:string)=>Promise<void>;
}) {
  const [adding,setAdding]=useState(false);
  const [error,setError]=useState('');
  const active=accounts.find(a=>a.tag===tag);
  return <div className="stack">
    <section className="card account-card"><div className="card-head">
      <div><h2><UserRound size={17}/> Contas monitoradas</h2><p>O painel sincroniza a conta selecionada.</p></div>
      <button className="button small primary" disabled={busy||adding} onClick={()=>{setAdding(true);setError('');}}>
        <Plus size={15}/> Adicionar jogador</button>
    </div>
      {accounts.length>0&&<ul className="tracked-accounts">
        {accounts.map(a=><li key={a.tag}>
          <div><strong>{a.name}</strong><small>{a.name===a.tag?'Nome disponível após sincronizar':a.tag}</small></div>
          <div className="actions">
            {a.tag===tag?<span className="tag confirmed">Conta ativa</span>:
              <button className="button small subtle" disabled={busy} onClick={()=>onSelect(a.tag)}>Selecionar</button>}
          </div>
        </li>)}
      </ul>}
      {adding&&<form className="form-grid tracked-account-form" onSubmit={async e=>{
        e.preventDefault();
        const values=new FormData(e.currentTarget);
        setError('');
        try{
          await onSave(String(values.get('tag')??''));
          setAdding(false);
        }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a conta.');}
      }}>
        <label>Tag do jogador<input name="tag" required maxLength={17} placeholder="#TAG"/></label>
        <div className="actions"><button className="button primary" disabled={busy}>Salvar jogador</button>
          <button className="button subtle" type="button" disabled={busy} onClick={()=>{setAdding(false);setError('');}}>Cancelar</button></div>
        {error&&<p className="feedback" role="alert">{error}</p>}
      </form>}
    </section>
    {feedback&&<p className="feedback" role="status">{feedback}</p>}
    <section className="card"><div className="card-head"><div><h2><History size={17}/> Histórico de atualizações</h2>
      <p>{active?'Até 100 execuções para '+active.name:'Selecione uma conta monitorada.'}</p></div>
      <button className="button small subtle" disabled={busy||!tag} onClick={onExport}><ArrowDownToLine size={15}/> Exportar histórico</button></div>
      {data.dataset.updates.length?<div className="table-wrap"><table><thead><tr><th>Data e hora</th><th>Status</th><th>Recebidas</th><th>Novas</th><th>Detalhe</th></tr></thead>
        <tbody>{data.dataset.updates.map(u=><tr key={u.started_at}><td>{dateTime(u.started_at)}</td><td><span className={`tag ${u.status==='success'?'confirmed':u.status==='error'?'unavailable':'hypothesis'}`}>
          {u.status==='success'?'Concluída':u.status==='error'?'Falhou':'Em andamento'}</span></td><td>{u.received!==null?number(u.received):'—'}</td>
          <td>{u.added!==null?number(u.added):'—'}</td><td>{u.message||'—'}</td></tr>)}</tbody></table></div>:
        <p className="section-note">A primeira tentativa de sincronização aparecerá aqui.</p>}</section>
  </div>;
}
