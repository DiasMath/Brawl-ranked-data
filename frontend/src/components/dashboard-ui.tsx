import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Icon size={22} /></span><strong>{title}</strong>
    {children && <p>{children}</p>}</div>;
}

export function Card({ title, sub, icon: Icon, action, children, className = '' }: {
  title: string; sub?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={`card ${className}`}><div className="card-head"><div>
    <h2>{Icon && <Icon size={17} />}{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>;
}

export function Pill({ kind = 'neutral', children }: { kind?: string; children: ReactNode }) {
  return <span className={`pill ${kind}`}><i />{children}</span>;
}
