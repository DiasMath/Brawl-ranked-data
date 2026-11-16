import type { LucideIcon } from 'lucide-react';

type Indicator = { label:string; value:string; detail?:string; tone?:'win'|'loss'; icon?:LucideIcon };

export function PerformanceKpis({ label, items }: { label:string; items:Indicator[] }) {
  return <dl className="performance-kpis" aria-label={label}>
    {items.map(({label,value,detail,tone,icon:Icon})=><div key={label} data-tone={tone}>
      <dt>{Icon&&<Icon aria-hidden="true" size={14}/>}<span>{label}</span></dt>
      <dd><strong>{value}</strong>{detail&&<small>{detail}</small>}</dd>
    </div>)}
  </dl>;
}
