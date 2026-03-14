import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Empty-state message with optional icon and action.
 * @example <EmptyState title="No events yet" description="Create one to get started." />
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="card-shell p-8 text-center">
      {icon && (
        <div className="mb-3 flex justify-center">
          <div className="icon-container-lg">
            {icon}
          </div>
        </div>
      )}
      <p className="text-lg font-semibold text-foreground mb-1">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
