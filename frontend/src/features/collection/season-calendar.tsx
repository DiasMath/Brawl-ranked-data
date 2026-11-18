import { useEffect, useState } from 'react';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { dateTime } from '@/lib/data';
import type { RankedSeason } from '@/lib/data';
import { collectionRequest } from '@/lib/live';

const localInput=(value:string)=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
}).format(new Date(value)).replace(' ','T');

export function SeasonCalendar({ onSaved,notify }: {onSaved:()=>Promise<void>;notify:(message:string)=>void}) {
  const [rows,setRows]=useState<RankedSeason[]>([]);
  const [selected,setSelected]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    void collectionRequest<{seasons:RankedSeason[]}>('/api/seasons',{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted){setRows(result.seasons);setError('');}})
      .catch(()=>{if(!controller.signal.aborted)setError('Calendário indisponível. Confira se o backend está atualizado.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[]);
  const season=rows.find(row=>row.id===selected)??rows.find(row=>Date.parse(row.ends_at)>Date.now())??rows.at(-1);
  const gaps=rows.slice(1).filter((row,index)=>row.starts_at!==rows[index].ends_at);
  return <Card title="Calendário de temporadas" icon={CalendarClock} sub="Datas em Brasília. Ajustar um início também ajusta o fim da temporada anterior.">
    {loading?<p className="section-note" role="status">Carregando calendário…</p>:rows.length>0&&<>
      <PagedTable label="Calendário de temporadas" rows={rows} pageSize={5} unit={['temporada','temporadas']}
        headings={<><th>Temporada</th><th>Início</th><th>Fim</th><th>Calendário</th></>}
        renderRow={row=><tr key={row.id}><th scope="row">{row.label}</th><td>{dateTime(row.starts_at)}</td><td>{dateTime(row.ends_at)}</td>
          <td>{row.date_only?'Estimado':'Ajustado'}<small><a href={row.source_url} target="_blank" rel="noreferrer">Fonte</a></small></td></tr>}/>
      {!!gaps.length&&<p className="section-note error">Há intervalos sem cobertura ou sobrepostos entre temporadas. Ajuste os horários antes de comparar resultados.</p>}
      <details><summary>Ajustar início de temporada</summary>
        <p className="section-note">O horário provisório é um corte de relatório. Use o horário mostrado no jogo ou uma fonte que confirme o reset para ajustar.</p>
        <label>Temporada<select value={season?.id??''} disabled={saving} onChange={event=>setSelected(event.target.value)}>
          {rows.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
        </select></label>
        {season&&<form key={JSON.stringify(season)} className="form-grid tracked-account-form" onSubmit={async event=>{
          event.preventDefault();
          if(saving)return;
          const form=new FormData(event.currentTarget);
          setSaving(true);setError('');
          try{
            const startsAt=new Date(String(form.get('start'))+':00-03:00').toISOString();
            const result=await collectionRequest<{seasons:RankedSeason[]}>('/api/seasons',{
              method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                id:season.id,label:form.get('label'),starts_at:startsAt,source_url:form.get('source'),date_only:form.has('estimated'),
              }),
            });
            setRows(result.seasons);
            await onSaved();
            notify('Calendário salvo. Os filtros e o histórico serão reclassificados pelo novo corte.');
          }catch(value){setError(value instanceof Error?value.message:'Falha ao salvar o calendário.');}
          finally{setSaving(false);}
        }}>
          <label>Nome ou número<input name="label" required maxLength={100} defaultValue={season.label}/></label>
          <label>Início em Brasília<input name="start" type="datetime-local" required defaultValue={localInput(season.starts_at)}/></label>
          <label>Fonte do calendário<input name="source" type="url" required maxLength={400} defaultValue={season.source_url}/></label>
          <label className="checkbox"><input name="estimated" type="checkbox" defaultChecked={season.date_only}/> Corte estimado</label>
          <div className="actions"><button className="button primary" disabled={saving} aria-busy={saving}><RefreshCw size={15}/>{saving?'Salvando…':'Salvar calendário'}</button></div>
        </form>}
      </details>
    </>}
    {error&&<p className="section-note error" role="alert">{error}</p>}
  </Card>;
}
