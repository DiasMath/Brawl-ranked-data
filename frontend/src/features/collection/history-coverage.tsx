import { useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { number, percent } from '@/lib/data';
import type { Battle } from '@/lib/data';
import { matchKd, seriesBans, seriesDuration } from '@/lib/match-series';
import type { MatchSeries } from '@/lib/match-series';

const fields: {key:string;label:string;note:string;evidence:(match:MatchSeries)=>Battle|undefined}[] = [
  {key:'duration',label:'Duração total',note:'Duração registrada em todas as rodadas.',
    evidence:match=>seriesDuration(match)!==null?match.latest:undefined},
  {key:'star',label:'Craque',note:'Craque identificado em pelo menos uma rodada.',
    evidence:match=>match.rounds.findLast(round=>round.star_player?.name||round.star_player?.tag)},
  {key:'kd',label:'K/D da partida',note:'Eliminações e mortes oficiais com total disponível.',
    evidence:match=>matchKd(match)?match.latest:undefined},
  {key:'bans',label:'Lista de bans',note:'Lista oficial consistente na série, inclusive vazia.',
    evidence:match=>seriesBans(match)},
];

export function HistoryCoverage({matches,onMatch}: {
  matches:MatchSeries[]; onMatch:(id:string)=>void;
}) {
  const coverage=useMemo(()=>fields.map(field=>{
    let known=0;
    let example:Battle|undefined;
    for(const match of matches){
      const battle=field.evidence(match);
      if(!battle)continue;
      known++;
      if(!example||battle.played_at>example.played_at)example=battle;
    }
    return {...field,known,example};
  }),[matches]);
  return <Card title="Cobertura do histórico" icon={ClipboardCheck} sub={matches.length?
    `${number(matches.length)} ${matches.length===1?'partida ranqueada coletada':'partidas ranqueadas coletadas'} · Rodadas agrupadas por série`:
    'Histórico ranqueado da conta selecionada'}>
    {matches.length>0?<div className="collector-readings history-coverage">
      {coverage.map(({key,label,note,known,example})=><div key={key}>
        <span>{label}</span>
        <strong>{number(known)} de {number(matches.length)}</strong>
        <progress aria-label={label} max={matches.length} value={known}/>
        <small>{percent(known/matches.length)} de cobertura · {note}</small>
        {example&&<button type="button" className="text-button" aria-label={`Ver partida com ${label.toLowerCase()}`}
          onClick={()=>onMatch(example.id)}>Ver partida</button>}
      </div>)}
    </div>:<p className="section-note">A cobertura aparece quando a conta tiver partidas ranqueadas no histórico.</p>}
  </Card>;
}
