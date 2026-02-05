'use client';

import { FileX, SearchX, UserPlus, Users, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand-muted)]">
          <Icon className="h-8 w-8 text-[var(--brand)]" />
        </div>
      )}
      
      <h3 className="text-lg font-semibold text-[var(--foreground)]">
        {title}
      </h3>
      
      {description && (
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
          {description}
        </p>
      )}
      
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 btn-primary"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Specialized empty states for common scenarios
export function EmptyCreators({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={Users}
      title="No creators yet"
      description="Get started by adding your first creator to the platform."
      action={{ label: 'Add Creator', onClick: onCreate }}
    />
  );
}

export function EmptyUsers({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={UserPlus}
      title="No users yet"
      description="Add team members to start managing your agency."
      action={{ label: 'Add User', onClick: onCreate }}
    />
  );
}

export function EmptySearch({ query }: { query: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No results found"
      description={`We couldn't find any matches for "${query}". Try adjusting your search.`}
    />
  );
}

export function EmptyData({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={FileX}
      title="No data available"
      description={message || "There's nothing to display at the moment."}
    />
  );
}
