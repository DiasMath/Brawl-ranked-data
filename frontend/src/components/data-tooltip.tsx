import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FocusEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react';

function TooltipCard({ id, anchor, className, children }: {
  id: string; anchor: Element; className: string; children: ReactNode;
}) {
  const ref=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const card=ref.current;
    if(!card)return;
    const viewport=document.documentElement;
    const place=()=>{
      const width=viewport.clientWidth||window.innerWidth;
      const height=viewport.clientHeight||window.innerHeight;
      const margin=8, gap=7;
      card.style.width=`${Math.min(278,width-2*margin)}px`;
      card.style.maxHeight=`${height-2*margin}px`;
      const {width:w,height:h}=card.getBoundingClientRect();
      const rect=anchor.getBoundingClientRect();
      const clamp=(value:number,size:number,limit:number)=>Math.max(margin,Math.min(limit-size-margin,value));
      let x=rect.left+(rect.width-w)/2;
      let y=rect.top-gap-h;
      if(y<margin){
        y=rect.bottom+gap;
        if(y+h>height-margin){
          if(rect.right+gap+w<=width-margin)x=rect.right+gap;
          else if(rect.left-gap-w>=margin)x=rect.left-gap-w;
          y=rect.top+(rect.height-h)/2;
        }
      }
      card.style.left=`${clamp(x,w,width)}px`;
      card.style.top=`${clamp(y,h,height)}px`;
      card.style.visibility='visible';
    };
    place();
    const resize=new ResizeObserver(place);
    resize.observe(card);
    return ()=>resize.disconnect();
  },[anchor]);
  return <div ref={ref} id={id} role="tooltip" className={`data-tooltip ${className}`}>{children}</div>;
}

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
    return createPortal(<TooltipCard id={id} anchor={anchor} className={className}>{content}</TooltipCard>,document.body);
  }
  return {anchor,trigger,render,close};
}
