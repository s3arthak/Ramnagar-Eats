import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

export function EmptyState({ icon, title, copy, action }: { icon?: ReactNode; title: string; copy?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon ?? <Inbox size={30} />}
      <h3>{title}</h3>
      {copy && <p>{copy}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state error-state" role="alert">
      <AlertTriangle size={30} />
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry && (
        <button className="filter" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
