import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FocusEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react';

export function useDataTooltip() {
  const id=useId();
  const [anchor,setAnchor]=useState<Element|null>(null);
  useEffect(()=>{
    if(!anchor)return;
    const close=()=>setAnchor(null);
    window.addEventListener('scroll',close,true);
    window.addEventListener('resize',close);
    return ()=>{
      window.removeEventListener('scroll',close,true);
      window.removeEventListener('resize',close);
    };
  },[anchor]);
  const close=()=>setAnchor(null);
  const trigger=(active:boolean)=>({
    'aria-describedby':active?id:undefined,
    onPointerEnter:(event:PointerEvent<Element>)=>setAnchor(event.currentTarget),
    onPointerLeave:close,
    onFocus:(event:FocusEvent<Element>)=>setAnchor(event.currentTarget),
    onBlur:close,
    onKeyDown:(event:KeyboardEvent<Element>)=>{if(event.key==='Escape')close();},
  });
  function render(content:ReactNode,className='') {
    if(!anchor)return null;
    const rect=anchor.getBoundingClientRect();
    const width=Math.min(278,window.innerWidth-16);
    const above=rect.top>=250;
    const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.left+(rect.width-width)/2));
    return createPortal(<div id={id} role="tooltip" className={`data-tooltip ${className}`} data-above={above}
      style={{left,top:above?rect.top-7:rect.bottom+7}}>{content}</div>,document.body);
  }
  return {anchor,trigger,render,close};
}
