import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

type StatCardProps = {
  title: string;
  value: ReactNode;
  hint: string;
  accent?: 'cyan' | 'amber' | 'coral';
  action?: ReactNode;
  icon?: ReactNode;
};

export function StatCard({ title, value, hint, accent = 'cyan', action, icon }: StatCardProps) {
  return (
    <section className={`stat-card stat-card-pro ${accent}`}>
      <div className="stat-card-head">
        <div className="stat-card-kicker">
          {icon ? <span className="stat-card-icon">{icon}</span> : null}
          <p className="eyebrow">{title}</p>
        </div>
        <span className="stat-card-accent" aria-hidden="true" />
      </div>

      <div className="stat-card-body">
        <h3>{value}</h3>
      </div>

      <div className="stat-card-footer">
        <p className="muted-text stat-card-hint">{hint}</p>
        {action ? (
          <div className="stat-card-action">{action}</div>
        ) : (
          <span className="stat-card-arrow">
            <ArrowUpRight size={14} />
          </span>
        )}
      </div>
    </section>
  );
}
