import { useRef } from 'react';
import type { ReactNode } from 'react';
import { BarChart3, Crosshair, Search, TrendingUp } from 'lucide-react';

const tabs = [
  {key:'summary',label:'Resumo',icon:BarChart3},
  {key:'draft',label:'Draft',icon:Crosshair},
  {key:'review',label:'Revisão',icon:Search},
  {key:'evolution',label:'Evolução',icon:TrendingUp},
] as const;

export type PerformanceTab = typeof tabs[number]['key'];

export function PerformanceTabs({ value,onChange,panels }: {
  value:PerformanceTab; onChange:(tab:PerformanceTab)=>void; panels:Record<PerformanceTab,ReactNode>;
}) {
  const buttons = useRef<(HTMLButtonElement|null)[]>([]);
  return <div className="performance-workspace">
    <div className="performance-tabs" role="tablist" aria-label="Análises de desempenho">
      {tabs.map(({key,label,icon:Icon},index)=><button key={key} type="button" role="tab" ref={node=>{buttons.current[index]=node;}}
        id={`performance-tab-${key}`} aria-controls={`performance-panel-${key}`} aria-selected={value===key}
        tabIndex={value===key?0:-1} onClick={()=>onChange(key)} onKeyDown={event=>{
          const last=tabs.length-1;
          const next=event.key==='Home'?0:event.key==='End'?last:event.key==='ArrowRight'?(index+1)%tabs.length:
            event.key==='ArrowLeft'?(index+last)%tabs.length:null;
          if(next===null)return;
          event.preventDefault();
          onChange(tabs[next].key);
          buttons.current[next]?.focus();
        }}><Icon size={16} aria-hidden="true"/>{label}</button>)}
    </div>
    {tabs.map(({key})=><div key={key} className="stack" role="tabpanel" hidden={key!==value} tabIndex={0}
      id={`performance-panel-${key}`} aria-labelledby={`performance-tab-${key}`}>
      {key===value&&panels[key]}
    </div>)}
  </div>;
}
