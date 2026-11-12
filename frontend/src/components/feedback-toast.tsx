import { useEffect } from 'react';
import { X } from 'lucide-react';

export function FeedbackToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5500);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return <aside className="feedback-toast">
    <div className="feedback-toast-time" aria-hidden="true"/>
    <span role="status">{message}</span>
    <button className="icon-button" aria-label="Dispensar mensagem" onClick={onDismiss}><X size={15}/></button>
  </aside>;
}
