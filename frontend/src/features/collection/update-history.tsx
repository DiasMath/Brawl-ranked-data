import { useEffect, useState } from 'react';
import { ArrowDownToLine, History } from 'lucide-react';
import { TablePager, TableViewport } from '@/components/data-table';
import { dateTime, durationLabel, number } from '@/lib/data';
import type { Update } from '@/lib/data';
import { collectionRequest } from '@/lib/live';

type UpdateFilters = { status?:Update['status']; origin?:NonNullable<Update['origin']> };
export type UpdatePage = {
  rows:Update[]; next_cursor:number|null;
  filters?: { status:Update['status']|null; origin:Update['origin'] };
};

export async function loadUpdates(tag:string, options:UpdateFilters & {before?:number|null; limit?:number; signal?:AbortSignal}={}) {
  const params=new URLSearchParams({tag});
  if(options.before!=null)params.set('before',String(options.before));
  if(options.limit!=null)params.set('limit',String(options.limit));
  if(options.status)params.set('status',options.status);
  if(options.origin)params.set('origin',options.origin);
  const page=await collectionRequest<UpdatePage>('/api/collection/updates?'+params,{signal:options.signal});
  if((options.status&&page.filters?.status!==options.status)||(options.origin&&page.filters?.origin!==options.origin)){
    throw new Error('O servidor ainda não oferece filtros para o histórico.');
  }
  return page;
}

function updateDuration(update:Update) {
  if(!update.finished_at)return '—';
  const elapsed=Date.parse(update.finished_at)-Date.parse(update.started_at);
  if(!Number.isFinite(elapsed)||elapsed<0)return '—';
  return elapsed<1000?'< 1 s':durationLabel(Math.floor(elapsed/1000));
}

export function UpdateHistory({tag, name, revision, busy, onExport}: {
  tag:string; name?:string; revision:string; busy:boolean; onExport:()=>void;
}) {
  const [cursors,setCursors]=useState<(number|null)[]>([null]);
  const [status,setStatus]=useState<Update['status']|''>('');
  const [origin,setOrigin]=useState<NonNullable<Update['origin']>|''>('');
  const [attempt,setAttempt]=useState(0);
  const [result,setResult]=useState<{key:string; data?:UpdatePage; error?:string}>();
  const page=cursors.length;
  const before=cursors[page-1];
  const refresh=before===null?revision:'';
  const key=JSON.stringify([tag,before,refresh,attempt,status,origin]);
  useEffect(()=>{
    if(!tag)return;
    const controller=new AbortController();
    loadUpdates(tag,{before,status:status||undefined,origin:origin||undefined,signal:controller.signal}).then(data=>{
      if(!controller.signal.aborted)setResult({key,data});
    }).catch(error=>{
      if(!controller.signal.aborted)setResult({key,error:error instanceof Error?error.message:'Não foi possível consultar as atualizações.'});
    });
    return ()=>controller.abort();
  },[tag,before,key,status,origin]);
  const current=result?.key===key?result:undefined;
  const rows=current?.data?.rows??[];
  const next=current?.data?.next_cursor;
  const label='Histórico de atualizações';
  return <section className="card">
    <div className="card-head"><div><h2><History size={17}/> {label}</h2>
      <p>{name?`Execuções de ${name} · Mais recentes primeiro`:'Selecione uma conta monitorada.'}</p></div>
      <button className="button small subtle" disabled={busy||!tag} onClick={onExport}><ArrowDownToLine size={15}/> Exportar histórico</button>
    </div>
    {tag&&<div className="counter-controls">
      <label>Status da coleta<select value={status} onChange={event=>{
        setStatus(event.target.value as typeof status);setCursors([null]);
      }}>
        <option value="">Todos os status</option><option value="success">Concluídas</option>
        <option value="error">Com falha</option><option value="running">Em andamento</option>
      </select></label>
      <label>Origem da coleta<select value={origin} onChange={event=>{
        setOrigin(event.target.value as typeof origin);setCursors([null]);
      }}>
        <option value="">Todas as origens</option><option value="manual">Manual</option><option value="scheduled">Agendada</option>
      </select></label>
    </div>}
    {tag&&!current&&<p className="section-note" role="status">Carregando atualizações…</p>}
    {current?.error&&<div className="section-note" role="alert">{current.error}{' '}
      <button className="text-button" onClick={()=>setAttempt(value=>value+1)}>Tentar novamente</button></div>}
    {current?.data&&!rows.length&&<p className="section-note">{status||origin?'Nenhuma execução com esses filtros.':
      page===1?'A primeira tentativa de sincronização aparecerá aqui.':'Nenhuma atualização nesta página.'}</p>}
    {rows.length>0&&<TableViewport label={label} page={page} className="update-history-table">
      <thead><tr><th>Data e hora</th><th>Origem</th><th>Status</th><th>Duração</th><th>Recebidas</th><th>Novas</th><th>Detalhe</th></tr></thead>
      <tbody>{rows.map(u=><tr key={u.id}><td>{dateTime(u.started_at)}</td><td>{u.origin==='manual'?'Manual':u.origin==='scheduled'?'Agendada':'—'}</td><td>
        <span className={`tag ${u.status==='success'?'confirmed':u.status==='error'?'unavailable':'hypothesis'}`}>
          {u.status==='success'?'Concluída':u.status==='error'?'Falhou':'Em andamento'}</span></td>
        <td>{updateDuration(u)}</td><td>{u.received!==null?number(u.received):'—'}</td>
        <td>{u.added!==null?number(u.added):'—'}</td><td>{u.message||'—'}</td></tr>)}</tbody>
    </TableViewport>}
    {(page>1||next!=null)&&<TablePager label={label} page={page}
      summary={rows.length?`${number(rows.length)} nesta página`:undefined} canGoBack={page>1} canGoNext={next!=null}
      onPrevious={()=>setCursors(items=>items.slice(0,-1))} onNext={()=>{if(next!=null)setCursors(items=>[...items,next]);}}/>}
  </section>;
}
