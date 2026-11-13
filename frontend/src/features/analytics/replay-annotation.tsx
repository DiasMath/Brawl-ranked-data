import { useState } from 'react';
import { replayTags } from '@/lib/coaching';
import type { ReplayReview, ReplayTag } from '@/lib/coaching';

export function ReplayAnnotation({review,onSave}: {review?:ReplayReview; onSave:(review:ReplayReview)=>Promise<void>}) {
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  return <form className="coaching-form" onSubmit={async event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const tag=String(form.get('observation')) as ReplayTag;
    if(!replayTags.includes(tag)||saving) return;
    setSaving(true);setMessage('');
    try{await onSave({tag,note:String(form.get('note')??'').trim()});setMessage('Revisão salva.');}
    catch(error){setMessage(error instanceof Error?error.message:'Falha ao salvar a revisão.');}
    finally{setSaving(false);}
  }}>
    <label>O que você observou no replay?<select name="observation" required defaultValue={review?.tag??''}>
      <option value="">Selecione uma observação</option>{replayTags.map(tag=><option key={tag}>{tag}</option>)}
    </select></label>
    <label>Anotação opcional<textarea name="note" rows={2} maxLength={500} defaultValue={review?.note??''} placeholder="Ex.: Aos 40 s, avancei sem meu time."/></label>
    <div className="actions"><button className="button small subtle" disabled={saving}>{saving?'Salvando…':'Salvar revisão'}</button>
      {message&&<span role="status" className="muted">{message}</span>}</div>
  </form>;
}
