import { useEffect, useState } from 'react';
import { dateTime } from '@/lib/data';
import type { ServerCollection } from '@/lib/live';

export function SyncStatus({ server, error, syncing }: {server:ServerCollection|null; error:string; syncing:boolean}) {
  const [now,setNow]=useState<number|null>(null);
  const last=server?.last_success;
  useEffect(()=>{
    if(!last)return;
    const tick=()=>setNow(Date.now());
    tick();
    const timer=window.setInterval(tick,30_000);
    return ()=>window.clearInterval(timer);
  },[last]);
  const failed=server?.last_attempt?.status==='error';
  const running=syncing||server?.last_attempt?.status==='running';
  const interval=server?.interval_seconds??0;
  const late=Boolean(last&&now!==null&&now-Date.parse(last)>(interval>0?interval*3_000:900_000));
  const [label,tone]=running?['Atualizando','running']:error?['Sem conexão','warning']:
    failed?['Falha na coleta','warning']:!last?['Sem atualização','idle']:late?['Coleta atrasada','warning']:['Coleta em dia','ok'];
  return <div className="navbar-sync-status" data-tone={tone} role="status" aria-label={last?`${label}. Última atualização em ${dateTime(last)}`:label}>
    <span><i aria-hidden="true"/>{label}</span>
    {last&&<time dateTime={last}>{dateTime(last)}</time>}
  </div>;
}
