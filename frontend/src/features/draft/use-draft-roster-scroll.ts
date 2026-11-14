import { gsap } from 'gsap';
import { useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent, RefObject } from 'react';

type Drag = { id:number; x:number; moved:boolean };

export function useDraftRosterScroll(rail:RefObject<HTMLDivElement|null>, query:string, active:boolean, view:string) {
  const track=useRef<HTMLDivElement>(null);
  const content=useRef<HTMLDivElement>(null);
  const move=useRef<(left:number)=>void>(()=>{});
  const drag=useRef<Drag|null>(null);
  const suppressClick=useRef(false);
  const [scrollEdges,setScrollEdges]=useState({left:false,right:false});

  useLayoutEffect(()=>{
    if(rail.current)rail.current.scrollLeft=0;
  },[rail,query]);

  useLayoutEffect(()=>{
    const viewport=rail.current, width=track.current, strip=content.current;
    if(!viewport||!width||!strip||!active)return;

    let target=viewport.scrollLeft;
    const position={left:target};
    const max=()=>Math.max(0,viewport.scrollWidth-viewport.clientWidth);
    const clamp=(left:number)=>Math.max(0,Math.min(max(),left));

    // Native scroll gives input and scrollbar position. The translated strip catches up to it.
    const paint=()=>{
      const offset=viewport.scrollLeft-clamp(position.left);
      strip.style.transform=offset?`translate3d(${offset}px, 0, 0)`:'';
      strip.style.setProperty('--draft-offset',`${offset}px`);
    };
    const follow=gsap.quickTo(position,'left',{duration:.38,ease:'power3.out',onUpdate:paint});
    const update=()=>{
      const left=viewport.scrollLeft>1, right=max()-viewport.scrollLeft>1;
      setScrollEdges(previous=>previous.left===left&&previous.right===right?previous:{left,right});
      if(target!==viewport.scrollLeft){
        target=viewport.scrollLeft;
        follow(target,position.left);
      }
      paint();
    };
    move.current=(left)=>{
      viewport.scrollLeft=clamp(left);
      update();
    };
    const wheel=(event:WheelEvent)=>{
      if(!event.cancelable||event.ctrlKey||!max()||drag.current?.moved)return;
      const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
      if(!delta)return;
      const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientWidth:1;
      event.preventDefault();
      move.current(viewport.scrollLeft+delta*unit);
    };
    const resize=new ResizeObserver(update);
    resize.observe(viewport);
    resize.observe(width);
    viewport.addEventListener('scroll',update,{passive:true});
    viewport.addEventListener('wheel',wheel,{passive:false});
    update();
    return ()=>{
      resize.disconnect();
      viewport.removeEventListener('scroll',update);
      viewport.removeEventListener('wheel',wheel);
      follow.tween.kill();
      move.current=()=>{};
      drag.current=null;
      suppressClick.current=false;
      strip.style.removeProperty('transform');
      strip.style.removeProperty('--draft-offset');
    };
  },[rail,query,active,view]);

  function startDrag(event:PointerEvent<HTMLDivElement>){
    suppressClick.current=false;
    if(event.pointerType!=='mouse'||event.button!==0)return;
    drag.current={id:event.pointerId,x:event.clientX,moved:false};
  }
  function moveDrag(event:PointerEvent<HTMLDivElement>){
    const current=drag.current;
    if(!current||current.id!==event.pointerId)return;
    if(!(event.buttons&1)){drag.current=null;return;}
    const delta=event.clientX-current.x;
    if(!current.moved&&Math.abs(delta)<5)return;
    if(!current.moved){
      current.moved=true;
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressClick.current=true;
    }
    current.x=event.clientX;
    move.current(event.currentTarget.scrollLeft-delta);
  }
  function stopDrag(event:PointerEvent<HTMLDivElement>){
    if(drag.current?.id===event.pointerId)drag.current=null;
  }
  function stopClick(event:MouseEvent<HTMLDivElement>){
    if(!suppressClick.current||!event.detail)return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current=false;
  }
  function stepRoster(direction:number){
    const viewport=rail.current;
    if(viewport)move.current(viewport.scrollLeft+direction*viewport.clientWidth*.8);
  }

  return {track,content,scrollEdges,stepRoster,dragHandlers:{
    onPointerDown:startDrag,onPointerMove:moveDrag,onPointerUp:stopDrag,onPointerCancel:stopDrag,
    onLostPointerCapture:stopDrag,onPointerLeave:(event:PointerEvent<HTMLDivElement>)=>{
      if(!drag.current?.moved)stopDrag(event);
    },onClickCapture:stopClick,onDragStart:(event:MouseEvent<HTMLDivElement>)=>event.preventDefault(),
  }};
}
