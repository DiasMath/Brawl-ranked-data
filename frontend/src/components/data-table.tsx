import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { number } from '@/lib/data';

export function TableViewport({ label, page, className='', children }: {
  label:string; page?:number; className?:string; children:ReactNode;
}) {
  const viewport=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(viewport.current)viewport.current.scrollTop=0;},[page]);
  return <div ref={viewport} className={`table-wrap ${className}`} role="region" aria-label={label} tabIndex={0}>
    <table>{children}</table>
  </div>;
}

export function TablePager({ label, summary, page, pages, canGoBack, canGoNext, onPrevious, onNext }: {
  label:string; summary?:string; page:number; pages?:number; canGoBack:boolean; canGoNext:boolean;
  onPrevious:()=>void; onNext:()=>void;
}) {
  return <nav className="pager" aria-label={`Paginação · ${label}`}>
    <span>{summary}</span><div>
      <button type="button" className="icon-button" disabled={!canGoBack} aria-label="Página anterior"
        onClick={onPrevious}><ChevronLeft size={17}/></button>
      <span aria-live="polite">{pages===undefined?`Página ${number(page)}`:`${number(page)} / ${number(pages)}`}</span>
      <button type="button" className="icon-button" disabled={!canGoNext} aria-label="Próxima página"
        onClick={onNext}><ChevronRight size={17}/></button>
    </div>
  </nav>;
}

type PagedTableProps<T> = {
  label:string; rows:T[]; headings:ReactNode; renderRow:(row:T)=>ReactNode;
  pageSize?:number; pageKey?:string; className?:string; showSinglePage?:boolean;
  unit?:readonly [singular:string, plural:string];
};

function LocalPages<T>({ label, rows, headings, renderRow, pageSize=15, className, showSinglePage=false,
  unit=['registro','registros'] }: PagedTableProps<T>) {
  const [page,setPage]=useState(1);
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  const current=Math.min(page,pages);
  const start=(current-1)*pageSize;
  return <>
    <TableViewport label={label} page={current} className={className}>
      <thead><tr>{headings}</tr></thead><tbody>{rows.slice(start,start+pageSize).map(renderRow)}</tbody>
    </TableViewport>
    {(pages>1||showSinglePage)&&<TablePager label={label} page={current} pages={pages}
      summary={`${number(rows.length)} ${rows.length===1?unit[0]:unit[1]}`}
      canGoBack={current>1} canGoNext={current<pages} onPrevious={()=>setPage(current-1)} onNext={()=>setPage(current+1)}/>}
  </>;
}

export function PagedTable<T>(props: PagedTableProps<T>) {
  return <LocalPages key={props.pageKey} {...props}/>;
}
